import { app, BrowserWindow, shell, nativeTheme } from "electron";
import { spawn, ChildProcess } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as http from "http";
import * as net from "net";

// ESM n'a pas __dirname — on le reconstitue depuis import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// process.defaultApp est défini quand Electron est lancé via `electron .` (dev).
// Undefined = binaire packagé par electron-builder (prod).
const isDev =
  (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp === true ||
  process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let serverPort = 9000;

// ── Port discovery ──────────────────────────────────────────────────────────

function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(preferred, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on("error", () => {
      const fallback = net.createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const port = (fallback.address() as net.AddressInfo).port;
        fallback.close(() => resolve(port));
      });
    });
  });
}

// ── Server readiness polling ─────────────────────────────────────────────────

function waitForServer(port: number, maxMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;

    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode !== undefined && res.statusCode < 500) {
          resolve();
        } else {
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
      } else {
        setTimeout(attempt, 600);
      }
    };

    attempt();
  });
}

// ── Next.js standalone server (prod only) ───────────────────────────────────

async function startNextServer(): Promise<void> {
  if (isDev) return; // En dev, next dev tourne séparément sur port 9000.

  serverPort = await findFreePort(9000);

  // .next/standalone/ est copié dans Resources par electron-builder.
  const serverScript = join(
    process.resourcesPath,
    ".next",
    "standalone",
    "server.js",
  );

  const env = {
    ...process.env,
    PORT: String(serverPort),
    HOSTNAME: "127.0.0.1",
    NEXTAUTH_URL: `http://127.0.0.1:${serverPort}`,
    NODE_ENV: "production",
  };

  nextServer = spawn(process.execPath, [serverScript], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    cwd: join(process.resourcesPath, ".next", "standalone"),
  });

  nextServer.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[next] ${d}`),
  );
  nextServer.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[next] ${d}`),
  );
  nextServer.on("error", (err: Error) =>
    console.error("[electron] Échec du serveur Next.js :", err),
  );
}

// ── BrowserWindow ────────────────────────────────────────────────────────────

function createWindow(): void {
  nativeTheme.themeSource = "dark";

  mainWindow = new BrowserWindow({
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
      preload: join(__dirname, "preload.js"),
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
    if (isDev) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });

  // Liens externes → navigateur système. Liens localhost → fenêtre Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    const isLocal =
      target.startsWith("http://localhost:") ||
      target.startsWith("http://127.0.0.1:");
    if (isLocal) return { action: "allow" };
    void shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    await startNextServer();
    if (!isDev) await waitForServer(serverPort);
    createWindow();
  } catch (err) {
    console.error("[electron] Démarrage échoué :", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  nextServer?.kill("SIGTERM");
});
