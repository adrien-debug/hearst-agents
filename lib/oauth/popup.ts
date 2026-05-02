/**
 * Abstraction du popup OAuth — injectable pour Electron.
 *
 * En web : wraps window.open (comportement actuel).
 * En Electron : le main process injecte un driver BrowserWindow via
 * setPopupDriver() dans le preload script avant le premier render.
 */

export interface PopupHandle {
  navigate(url: string): void;
  close(): void;
  focus(): void;
  readonly closed: boolean;
}

class WebPopupHandle implements PopupHandle {
  constructor(private readonly win: Window) {}
  navigate(url: string) { this.win.location.href = url; }
  close() { this.win.close(); }
  focus() { this.win.focus(); }
  get closed() { return this.win.closed; }
}

export interface PopupDriver {
  open(): PopupHandle | null;
}

const POPUP_FEATURES = "width=480,height=720,left=200,top=100,resizable=yes,scrollbars=yes";

let _driver: PopupDriver = {
  open: () => {
    if (typeof window === "undefined") return null;
    const win = window.open("about:blank", "hearst-oauth", POPUP_FEATURES);
    return win ? new WebPopupHandle(win) : null;
  },
};

export function setPopupDriver(driver: PopupDriver): void {
  _driver = driver;
}

export function openOAuthPopup(): PopupHandle | null {
  return _driver.open();
}
