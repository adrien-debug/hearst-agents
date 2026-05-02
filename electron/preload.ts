import { contextBridge } from "electron";

/**
 * Preload — bridge IPC renderer ↔ main process.
 *
 * Exposé via contextBridge sous window.hearstBridge.
 * Node integration désactivée côté renderer : rien de Node n'est accessible
 * directement. Tout passe par ce contrat explicite.
 *
 * À compléter lors de la migration du driver OAuth popup
 * (setPopupDriver → BrowserWindow Electron) et des raccourcis OS-level.
 */

contextBridge.exposeInMainWorld("hearstBridge", {
  /** true quand le renderer tourne dans Electron (false en browser web). */
  isElectron: true,
  /** Plateforme hôte : "darwin" | "win32" | "linux" */
  platform: process.platform,
});
