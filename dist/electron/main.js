"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_child_process = require("child_process");
var import_path = require("path");
var http = __toESM(require("http"));
var net = __toESM(require("net"));
var isDev = process.defaultApp === true || process.env.NODE_ENV === "development";
var mainWindow = null;
var nextServer = null;
var serverPort = 9001;
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
function waitForServer(port, maxMs = 3e4) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode !== void 0 && res.statusCode < 500) {
          resolve();
        } else {
          scheduleRetry();
        }
      });
      req.on("error", scheduleRetry);
      req.setTimeout(2e3, () => {
        req.destroy();
        scheduleRetry();
      });
    };
    const scheduleRetry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Le serveur Next.js n'a pas d\xE9marr\xE9 en ${maxMs}ms`));
      } else {
        setTimeout(attempt, 600);
      }
    };
    attempt();
  });
}
async function startNextServer() {
  if (isDev) return;
  serverPort = await findFreePort(9001);
  const serverScript = (0, import_path.join)(
    process.resourcesPath,
    ".next",
    "standalone",
    "server.js"
  );
  const env = {
    ...process.env,
    PORT: String(serverPort),
    HOSTNAME: "127.0.0.1",
    NEXTAUTH_URL: `http://127.0.0.1:${serverPort}`,
    NODE_ENV: "production"
  };
  nextServer = (0, import_child_process.spawn)(process.execPath, [serverScript], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    cwd: (0, import_path.join)(process.resourcesPath, ".next", "standalone")
  });
  nextServer.stdout?.on(
    "data",
    (d) => process.stdout.write(`[next] ${d}`)
  );
  nextServer.stderr?.on(
    "data",
    (d) => process.stderr.write(`[next] ${d}`)
  );
  nextServer.on(
    "error",
    (err) => console.error("[electron] \xC9chec du serveur Next.js :", err)
  );
}
function createWindow() {
  import_electron.nativeTheme.themeSource = "dark";
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    // macOS : cache la barre de titre, garde les traffic lights intégrés.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: "#000000",
    show: false,
    // Affiché seulement quand prêt (évite le flash blanc).
    webPreferences: {
      preload: (0, import_path.join)(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  const url = isDev ? "http://localhost:9001" : `http://127.0.0.1:${serverPort}`;
  void mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    const isLocal = target.startsWith("http://localhost:") || target.startsWith("http://127.0.0.1:");
    if (isLocal) return { action: "allow" };
    void import_electron.shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(async () => {
  try {
    await startNextServer();
    if (!isDev) await waitForServer(serverPort);
    createWindow();
  } catch (err) {
    console.error("[electron] D\xE9marrage \xE9chou\xE9 :", err);
    import_electron.app.quit();
  }
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
import_electron.app.on("activate", () => {
  if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
import_electron.app.on("before-quit", () => {
  nextServer?.kill("SIGTERM");
});
