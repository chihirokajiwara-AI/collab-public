import { join } from "node:path";
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

// Our trusted preload lives under out/preload/ in the app directory.
const TRUSTED_PRELOAD_DIR = join(__dirname, "..", "preload");

function isTrustedPreload(preloadPath: string | undefined): boolean {
  if (!preloadPath) return false;
  // Normalize and check that the preload is within our app's preload directory
  const resolved = join(preloadPath);
  return resolved.startsWith(TRUSTED_PRELOAD_DIR);
}

/**
 * Attaches security handlers to the given WebContents:
 * - will-attach-webview: enforces nodeIntegration:false, contextIsolation:true,
 *   sandbox:true. Strips preloads ONLY for untrusted (external) webviews.
 *   Internal webviews (terminal, viewer, graph) keep their trusted preload.
 * - setWindowOpenHandler: denies all new window requests
 */
export function setupWebviewSecurity(webContents: WebContents): void {
  webContents.on(
    "will-attach-webview",
    (_event, webPreferences, _params) => {
      // Only strip preload if it's NOT our own trusted preload.
      // Internal webviews (terminal, viewer, graph) need the preload
      // to communicate with the main process via IPC.
      if (!isTrustedPreload(webPreferences.preload)) {
        delete webPreferences.preload;
      }

      // Always enforce strict sandboxing.
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
    },
  );

  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
