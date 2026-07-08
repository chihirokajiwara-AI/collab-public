import { describe, test, expect } from "bun:test";
import type { Session } from "electron";
import { isNavigationAllowed, setupPermissionHandler } from "./security";

// isNavigationAllowed guards the will-navigate handler in index.ts against
// javascript:/data:/file:/blob: navigations reaching internal webContents
// (terminal-tile/viewer-tile/graph-tile/shell/settings) that carry preload
// scripts with privileged IPC bridge access. It had zero test coverage
// despite being the security boundary for that handler.
describe("isNavigationAllowed", () => {
  test("blocks javascript: URLs", () => {
    expect(isNavigationAllowed("javascript:alert(1)")).toBe(false);
  });

  test("blocks data: URLs", () => {
    expect(isNavigationAllowed("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });

  test("blocks file: URLs", () => {
    expect(isNavigationAllowed("file:///etc/passwd")).toBe(false);
  });

  test("blocks blob: URLs", () => {
    expect(isNavigationAllowed("blob:https://example.com/uuid")).toBe(false);
  });

  test("blocks protocols case-insensitively", () => {
    expect(isNavigationAllowed("JavaScript:alert(1)")).toBe(false);
    expect(isNavigationAllowed("DATA:text/html,x")).toBe(false);
    expect(isNavigationAllowed("File:///etc/passwd")).toBe(false);
    expect(isNavigationAllowed("BLOB:https://example.com/uuid")).toBe(false);
  });

  test("allows http:// URLs", () => {
    expect(isNavigationAllowed("http://example.com")).toBe(true);
  });

  test("allows https:// URLs", () => {
    expect(isNavigationAllowed("https://example.com/path?query=1")).toBe(
      true,
    );
  });

  test("allows the app's internal collab-file:// scheme", () => {
    // collab-file:// is the custom scheme registered via protocol.handle
    // for internal file access -- it must not match any blocked prefix.
    expect(isNavigationAllowed("collab-file:///workspace/note.md")).toBe(
      true,
    );
  });

  test("allows relative/empty-protocol-looking strings", () => {
    expect(isNavigationAllowed("/relative/path")).toBe(true);
    expect(isNavigationAllowed("")).toBe(true);
    expect(isNavigationAllowed("about:blank")).toBe(true);
  });

  test("matches by prefix, not substring — a blocked protocol appearing mid-URL is allowed", () => {
    expect(
      isNavigationAllowed("https://example.com/redirect?url=javascript:alert(1)"),
    ).toBe(true);
  });
});

// setupPermissionHandler guards every session created for main-window and
// webview webContents. Electron auto-grants camera/mic/geolocation/etc
// permission requests unless setPermissionRequestHandler is set explicitly
// — this was previously dead code (zero call sites) despite existing.
describe("setupPermissionHandler", () => {
  function makeMockSession() {
    let registeredHandler:
      | ((
          webContents: unknown,
          permission: string,
          callback: (granted: boolean) => void,
          details: unknown,
        ) => void)
      | null = null;

    const sess = {
      setPermissionRequestHandler(handler: typeof registeredHandler) {
        registeredHandler = handler;
      },
    } as unknown as Session;

    return {
      sess,
      getHandler: () => registeredHandler,
    };
  }

  test("registers a permission request handler on the session", () => {
    const { sess, getHandler } = makeMockSession();
    setupPermissionHandler(sess);
    expect(getHandler()).not.toBeNull();
  });

  test("denies the request via callback(false)", () => {
    const { sess, getHandler } = makeMockSession();
    setupPermissionHandler(sess);

    const handler = getHandler();
    expect(handler).not.toBeNull();

    let grantedResult: boolean | undefined;
    handler?.({}, "media", (granted) => {
      grantedResult = granted;
    }, {});

    expect(grantedResult).toBe(false);
  });

  test("denies regardless of webContents/permission/details values", () => {
    const { sess, getHandler } = makeMockSession();
    setupPermissionHandler(sess);

    const handler = getHandler();
    const results: boolean[] = [];
    for (const permission of ["camera", "geolocation", "notifications", "unknown"]) {
      handler?.({ id: 1 }, permission, (granted) => results.push(granted), {
        requestingUrl: "https://example.com",
      });
    }

    expect(results).toEqual([false, false, false, false]);
  });
});
