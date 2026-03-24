import { ipcMain, type BrowserWindow } from "electron";
import * as canvasPersistence from "./canvas-persistence";

interface IpcContext {
  mainWindow: () => BrowserWindow | null;
  getActiveWorkspacePath: () => string | null;
  getWorkspaceConfig: (path: string) => any;
  fileFilter: () => any | null;
  forwardToWebview: (
    target: string,
    channel: string,
    ...args: unknown[]
  ) => void;
  trackEvent: (
    name: string,
    props?: Record<string, unknown>,
  ) => void;
}

export function registerCanvasHandlers(
  ctx: IpcContext,
): void {
  let pendingDragPaths: string[] = [];

  // Canvas persistence (per-workspace)
  ipcMain.handle(
    "canvas:load-state",
    async () => {
      const wsPath = ctx.getActiveWorkspacePath();
      if (!wsPath) return null;
      await canvasPersistence.migrateGlobalState(wsPath);
      return canvasPersistence.loadState(wsPath);
    },
  );

  ipcMain.handle(
    "canvas:save-state",
    async (_event, state) => {
      const wsPath = ctx.getActiveWorkspacePath();
      if (!wsPath) return;
      return canvasPersistence.saveState(wsPath, state);
    },
  );

  ipcMain.handle(
    "canvas:workspace-hash",
    () => {
      const wsPath = ctx.getActiveWorkspacePath();
      if (!wsPath) return "default";
      return canvasPersistence.workspaceHash(wsPath);
    },
  );

  // Canvas pinch forwarding
  ipcMain.on(
    "canvas:forward-pinch",
    (_event, deltaY: number) => {
      ctx
        .mainWindow()
        ?.webContents.send("canvas:pinch", deltaY);
    },
  );

  // Cross-webview drag-and-drop
  ipcMain.on(
    "drag:set-paths",
    (_event, paths: string[]) => {
      pendingDragPaths = paths;
      ctx.forwardToWebview(
        "viewer",
        "nav-drag-active",
        true,
      );
    },
  );

  ipcMain.on("drag:clear-paths", () => {
    pendingDragPaths = [];
    ctx.forwardToWebview(
      "viewer",
      "nav-drag-active",
      false,
    );
  });

  ipcMain.handle("drag:get-paths", () => {
    const paths = pendingDragPaths;
    pendingDragPaths = [];
    return paths;
  });
}
