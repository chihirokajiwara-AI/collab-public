// Kept dependency-free (no electron import) so it can be unit tested without
// mocking Electron's ipcMain — see file-title.test.ts.

// Strips characters illegal in filenames (and a trailing dot, which Windows
// disallows) from a user-provided title before it is used to build a new
// filename. Notably strips "/" and "\" rather than preserving them, which is
// what prevents a crafted title from escaping the target directory when the
// result is later passed to path.join().
export function sanitizeFileTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\.\s*$/, "")
    .trim();
}
