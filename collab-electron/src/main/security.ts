import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Session, WebContents } from "electron";

const BLOCKED_PROTOCOLS = ["javascript:", "data:", "file:", "blob:"];

/**
 * Returns true if a session's storagePath indicates a browser-tile partition
 * (persist:ws-<hash>, set by tile-manager.js when creating a <webview> for
 * external browsing). Session has no public `.partition` property, so this
 * infers identity from storagePath's directory name instead — Electron maps
 * `persist:<name>` to `<userData>/Partitions/<name>` (verified empirically
 * against Electron 40.10.3; session.defaultSession and non-persist/in-memory
 * sessions have no `Partitions` segment at all).
 */
export function isWorkspaceTileStoragePath(storagePath: string | null): boolean {
  if (!storagePath) return false;
  return basename(storagePath).startsWith("ws-");
}

/**
 * Deny all permission requests (camera/mic/geolocation/notifications/etc)
 * for the given session. Electron auto-grants every permission request by
 * default unless setPermissionRequestHandler is set explicitly, so this
 * must be wired into every session we create (see web-contents-created in
 * index.ts).
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
 * Attaches a will-attach-webview lockdown to the given WebContents: for
 * browser tiles (partition starts with "persist:ws-"), strips preloads and
 * enforces strict sandbox. For internal webviews (terminal, viewer, graph —
 * no partition or empty partition), preserves preloads so IPC communication
 * works.
 *
 * Does NOT touch setWindowOpenHandler — index.ts's own web-contents-created
 * handler already implements window-open policy (allow browser-tile popups,
 * forward external links to the OS browser, deny everything else); a
 * blanket deny here would silently override that and break browser-tile
 * popups since Electron keeps only the last-registered handler.
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
}
