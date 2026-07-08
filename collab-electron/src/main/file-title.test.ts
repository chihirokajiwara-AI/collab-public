import { describe, test, expect } from "bun:test";
import { sanitizeFileTitle } from "./file-title";

describe("sanitizeFileTitle", () => {
  test("strips illegal filesystem characters", () => {
    expect(sanitizeFileTitle('a<b>c:d"e/f\\g|h?i*j')).toBe("abcdefghij");
  });

  test("strips control characters", () => {
    expect(sanitizeFileTitle("title\x00\x1f")).toBe("title");
  });

  test("strips a trailing dot and trims whitespace", () => {
    expect(sanitizeFileTitle("  My Note.  ")).toBe("My Note");
  });

  test("neutralizes path traversal attempts (slashes stripped, cannot escape dir)", () => {
    const result = sanitizeFileTitle("../../etc/passwd");
    // Slashes are stripped entirely, so join(dir, result) in fsRename can
    // never resolve outside the original directory.
    expect(result).toBe("....etcpasswd");
    expect(result).not.toContain("/");
  });

  test("neutralizes an absolute-path-style title", () => {
    const result = sanitizeFileTitle("/etc/passwd");
    expect(result).toBe("etcpasswd");
    expect(result).not.toContain("/");
  });

  test("returns empty string for a title made entirely of illegal characters", () => {
    // The fs:rename handler treats this as "Title cannot be empty".
    expect(sanitizeFileTitle('<>:"/\\|?*')).toBe("");
  });

  test("collapses to empty after stripping a lone trailing dot with only whitespace", () => {
    expect(sanitizeFileTitle("   .   ")).toBe("");
  });

  test("leaves an ordinary title unchanged", () => {
    expect(sanitizeFileTitle("Meeting Notes 2026-07-08")).toBe(
      "Meeting Notes 2026-07-08",
    );
  });
});
