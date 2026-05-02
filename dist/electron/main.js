"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path_1 = require("path");
const http = __importStar(require("http"));
const net = __importStar(require("net"));
// process.defaultApp est défini quand Electron est lancé via `electron .` (dev).
// Undefined = binaire packagé par electron-builder (prod).
const isDev = process.defaultApp === true ||
    process.env.NODE_ENV === "development";
let mainWindow = null;
let nextServer = null;
let serverPort = 9000;
// ── Port discovery ──────────────────────────────────────────────────────────
function findFreePort(preferred) {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.listen(preferred, "127.0.0.1", () => {
            const port = s.address().port;
            s.close(() => resolve(port));
        });
        s.on("error", () => {
            const fallback = net.createServer();
            fallback.listen(0, "127.0.0.1", () => {
                const port = fallback.address().port;
                fallback.close(() => resolve(port));
            });
        });
    });
}
// ── Server readiness polling ─────────────────────────────────────────────────
function waitForServer(port, maxMs = 30_000) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + maxMs;
        const attempt = () => {
            const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
                res.resume();
                if (res.statusCode !== undefined && res.statusCode < 500) {
                    resolve();
                }
                else {
                    scheduleRetry();
                }
            });
            req.on("error", scheduleRetry);
            req.setTimeout(2000, () => {
                req.destroy();
                scheduleRetry();
            });
        };
        const scheduleRetry = () => {
            if (Date.now() > deadline) {
                reject(new Error(`Le serveur Next.js n'a pas démarré en ${maxMs}ms`));
            }
            else {
                setTimeout(attempt, 600);
            }
        };
        attempt();
    });
}
// ── Next.js standalone server (prod only) ───────────────────────────────────
async function startNextServer() {
    if (isDev)
        return; // En dev, next dev tourne séparément sur port 9000.
    serverPort = await findFreePort(9000);
    // .next/standalone/ est copié dans Resources par electron-builder.
    const serverScript = (0, path_1.join)(process.resourcesPath, ".next", "standalone", "server.js");
    const env = {
        ...process.env,
        PORT: String(serverPort),
        HOSTNAME: "127.0.0.1",
        NEXTAUTH_URL: `http://127.0.0.1:${serverPort}`,
        NODE_ENV: "production",
    };
    nextServer = (0, child_process_1.spawn)(process.execPath, [serverScript], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: (0, path_1.join)(process.resourcesPath, ".next", "standalone"),
    });
    nextServer.stdout?.on("data", (d) => process.stdout.write(`[next] ${d}`));
    nextServer.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));
    nextServer.on("error", (err) => console.error("[electron] Échec du serveur Next.js :", err));
}
// ── BrowserWindow ────────────────────────────────────────────────────────────
function createWindow() {
    electron_1.nativeTheme.themeSource = "dark";
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        // macOS : cache la barre de titre, garde les traffic lights intégrés.
        titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
        trafficLightPosition: { x: 16, y: 14 },
        backgroundColor: "#000000",
        show: false, // Affiché seulement quand prêt (évite le flash blanc).
        webPreferences: {
            preload: (0, path_1.join)(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
    });
    const url = isDev
        ? "http://localhost:9000"
        : `http://127.0.0.1:${serverPort}`;
    void mainWindow.loadURL(url);
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
        if (isDev)
            mainWindow?.webContents.openDevTools({ mode: "detach" });
    });
    // Liens externes → navigateur système. Liens localhost → fenêtre Electron.
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
        const isLocal = target.startsWith("http://localhost:") ||
            target.startsWith("http://127.0.0.1:");
        if (isLocal)
            return { action: "allow" };
        void electron_1.shell.openExternal(target);
        return { action: "deny" };
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(async () => {
    try {
        await startNextServer();
        if (!isDev)
            await waitForServer(serverPort);
        createWindow();
    }
    catch (err) {
        console.error("[electron] Démarrage échoué :", err);
        electron_1.app.quit();
    }
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
electron_1.app.on("before-quit", () => {
    nextServer?.kill("SIGTERM");
});
