import { describe, test, expect } from "bun:test";
import { withOptionalFields } from "./pty";

// withOptionalFields is a small merge helper used at 4 call sites in this
// file (createSession, reconnectSession x2, discoverSessions) to fold
// optional fields (like cwdGuestPath) into a return object -- skipping only
// keys whose value is `undefined`, while still assigning falsy-but-defined
// values such as null, false, 0, and "". It had zero test coverage.
describe("withOptionalFields", () => {
  test("omits a field whose value is undefined", () => {
    const base = { a: 1 };
    const result = withOptionalFields(base, { b: undefined });
    expect(result).toEqual({ a: 1 });
    expect("b" in result).toBe(false);
  });

  test("assigns fields with null, false, 0, and '' values", () => {
    const base = { a: 1 } as Record<string, unknown>;
    const result = withOptionalFields(base, {
      nullField: null,
      falseField: false,
      zeroField: 0,
      emptyStringField: "",
    });
    expect(result).toEqual({
      a: 1,
      nullField: null,
      falseField: false,
      zeroField: 0,
      emptyStringField: "",
    });
  });

  test("preserves base properties not mentioned in fields", () => {
    const base = { a: 1, b: 2 };
    const result = withOptionalFields(base, { c: 3 });
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  test("overrides a same-named property already in base", () => {
    const base = { a: 1 };
    const result = withOptionalFields(base, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  test("leaves base unchanged when fields is empty", () => {
    const base = { a: 1, b: 2 };
    const result = withOptionalFields(base, {});
    expect(result).toEqual({ a: 1, b: 2 });
    expect(Object.keys(result)).toEqual(["a", "b"]);
  });

  test("mutates and returns the same base object reference", () => {
    const base = { a: 1 };
    const result = withOptionalFields(base, { b: 2 });
    expect(result).toBe(base);
  });
});
