"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("hearstBridge", {
  /** true quand le renderer tourne dans Electron (false en browser web). */
  isElectron: true,
  /** Plateforme hôte : "darwin" | "win32" | "linux" */
  platform: process.platform
});
