import { describe, test, expect } from "bun:test";
import { isPathWithinDirectory } from "./workspace-graph";

// isPathWithinDirectory is a path-containment boundary check used in 4 call
// sites (workspace-graph.ts and workspace-graph-python.ts) to decide whether
// a resolved import target is allowed to be linked into the workspace graph.
// It had zero test coverage despite being the same class of security-relevant
// check as @collab/shared/path-utils's workspaceRootMatch (which does have
// tests). No electron dependency here, so this is a plain unit test.
describe("isPathWithinDirectory", () => {
  test("returns true when the path equals the directory itself", () => {
    expect(isPathWithinDirectory("/workspace", "/workspace")).toBe(true);
  });

  test("returns true for a direct child path", () => {
    expect(
      isPathWithinDirectory("/workspace/note.md", "/workspace"),
    ).toBe(true);
  });

  test("returns true for a deeply nested descendant path", () => {
    expect(
      isPathWithinDirectory(
        "/workspace/a/b/c/note.md",
        "/workspace",
      ),
    ).toBe(true);
  });

  test("returns false for a sibling directory with a shared name prefix", () => {
    // "/workspace-other" starts with "/workspace" as a string, but is not
    // inside it -- relative() must be used, not startsWith().
    expect(
      isPathWithinDirectory("/workspace-other/note.md", "/workspace"),
    ).toBe(false);
  });

  test("returns false for a parent directory", () => {
    expect(isPathWithinDirectory("/", "/workspace")).toBe(false);
  });

  test("returns false for a completely unrelated absolute path", () => {
    expect(isPathWithinDirectory("/etc/passwd", "/workspace")).toBe(false);
  });

  test("returns false for a path-traversal attempt out of the directory", () => {
    expect(
      isPathWithinDirectory(
        "/workspace/../outside/note.md",
        "/workspace",
      ),
    ).toBe(false);
  });

  test("returns true for a traversal attempt that stays inside the directory", () => {
    expect(
      isPathWithinDirectory(
        "/workspace/a/../b/note.md",
        "/workspace",
      ),
    ).toBe(true);
  });
});
