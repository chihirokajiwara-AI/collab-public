import type { Session, WebContents } from "electron";

const BLOCKED_PROTOCOLS = ["javascript:", "data:", "file:", "blob:"];

/**
 * Deny all permission requests for the given session.
 */
export function setupPermissionHandler(sess: Session): void {
  sess.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

/**
 * Returns true if the URL is allowed to navigate to.
 * Blocks javascript:, data:, file:, and blob: protocols.
 */
export function isNavigationAllowed(url: string): boolean {
  const lower = url.toLowerCase();
  return !BLOCKED_PROTOCOLS.some((proto) => lower.startsWith(proto));
}

/**
 * Attaches security handlers to the given WebContents:
 * - will-attach-webview: strips foreign preloads and enforces
 *   nodeIntegration:false, contextIsolation:true, sandbox:true
 * - setWindowOpenHandler: denies all new window requests
 */
export function setupWebviewSecurity(webContents: WebContents): void {
  webContents.on(
    "will-attach-webview",
    (_event, webPreferences, _params) => {
      // Strip any preload script that wasn't set by us (foreign preloads).
      // Legitimate preloads are set after this handler runs via IPC.
      delete webPreferences.preload;

      // Enforce strict sandboxing regardless of what the renderer requested.
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
    },
  );

  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
