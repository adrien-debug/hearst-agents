// electron/main.ts
import { app, BrowserWindow, shell, nativeTheme } from "electron";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as http from "http";
import * as net from "net";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var isDev = process.defaultApp === true || process.env.NODE_ENV === "development";
var mainWindow = null;
var nextServer = null;
var serverPort = 9e3;
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
  serverPort = await findFreePort(9e3);
  const serverScript = join(
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
  nextServer = spawn(process.execPath, [serverScript], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    cwd: join(process.resourcesPath, ".next", "standalone")
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
    show: false,
    // Affiché seulement quand prêt (évite le flash blanc).
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  const url = isDev ? "http://localhost:9000" : `http://127.0.0.1:${serverPort}`;
  void mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    const isLocal = target.startsWith("http://localhost:") || target.startsWith("http://127.0.0.1:");
    if (isLocal) return { action: "allow" };
    void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(async () => {
  try {
    await startNextServer();
    if (!isDev) await waitForServer(serverPort);
    createWindow();
  } catch (err) {
    console.error("[electron] D\xE9marrage \xE9chou\xE9 :", err);
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
