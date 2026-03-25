import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  // preload can arrive as file:// URL or plain path — normalize both
  let resolved: string;
  try {
    resolved = preloadPath.startsWith("file://")
      ? fileURLToPath(preloadPath)
      : join(preloadPath);
  } catch {
    return false;
  }
  return resolved.startsWith(TRUSTED_PRELOAD_DIR);
}

/**
 * Attaches security handlers to the given WebContents:
 * - will-attach-webview: for browser tiles (partition starts with "persist:ws-"),
 *   strips preloads and enforces strict sandbox. For internal webviews
 *   (terminal, viewer, graph — no partition or empty partition),
 *   preserves preloads so IPC communication works.
 * - setWindowOpenHandler: denies all new window requests
 */
export function setupWebviewSecurity(webContents: WebContents): void {
  webContents.on(
    "will-attach-webview",
    (_event, webPreferences, params) => {
      const partition = params.partition || "";
      const isBrowserTile = partition.startsWith("persist:ws-");

      if (isBrowserTile) {
        // External content — full lockdown
        delete webPreferences.preload;
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
      }
      // Internal webviews (terminal, viewer, graph) — keep preload intact,
      // they already have contextIsolation:true via the preload bridge.
      // nodeIntegration is already false by default in Electron 40.
    },
  );

  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
