import { readFile, writeFile, rename, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import * as crypto from "node:crypto";
import { COLLAB_DIR } from "./paths";

interface TileState {
  id: string;
  type: "term" | "note" | "code" | "image" | "graph" | "browser";
  x: number;
  y: number;
  width: number;
  height: number;
  filePath?: string;
  folderPath?: string;
  url?: string | null;
  workspacePath?: string;
  ptySessionId?: string;
  zIndex: number;
}

interface CanvasState {
  version: 1;
  tiles: TileState[];
  viewport: {
    panX: number;
    panY: number;
    zoom: number;
  };
}

export function workspaceHash(wsPath: string): string {
  return createHash("sha256").update(wsPath).digest("hex").slice(0, 16);
}

function stateFileForWorkspace(wsPath: string): string {
  return join(COLLAB_DIR, "workspaces", workspaceHash(wsPath), "canvas-state.json");
}

export async function migrateGlobalState(wsPath: string): Promise<void> {
  const globalFile = join(COLLAB_DIR, "canvas-state.json");
  const migratedFile = globalFile + ".migrated";
  const perWsFile = stateFileForWorkspace(wsPath);

  if (existsSync(globalFile) && !existsSync(perWsFile)) {
    const perWsDir = dirname(perWsFile);
    if (!existsSync(perWsDir)) {
      await mkdir(perWsDir, { recursive: true });
    }
    await copyFile(globalFile, perWsFile);
    await rename(globalFile, migratedFile);
  }
}

export async function loadState(workspacePath: string): Promise<CanvasState | null> {
  if (!workspacePath) return null;
  const stateFile = stateFileForWorkspace(workspacePath);
  try {
    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw) as CanvasState;
    if (state.version !== 1) return null;
    return state;
  } catch {
    return null;
  }
}

export async function saveState(workspacePath: string, state: CanvasState): Promise<void> {
  if (!workspacePath) return;
  const stateFile = stateFileForWorkspace(workspacePath);
  const stateDir = dirname(stateFile);
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }
  const tmp = join(
    tmpdir(),
    `canvas-state-${crypto.randomUUID()}.json`,
  );
  const json = JSON.stringify(state, null, 2);
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, stateFile);
}
