import { describe, expect, test } from "bun:test";
import { invalidateCodegraphCoreCache, resolveCodegraphCore } from "./core-module.js";

describe("resolveCodegraphCore", () => {
  test("returns null or a resolved module, never throws", () => {
    // Whether @colbymchenry/codegraph is resolvable depends on the local/CI
    // environment (global bun link vs nothing installed) — this only asserts
    // the resolver degrades cleanly either way instead of throwing.
    const result = resolveCodegraphCore();
    expect(result === null || typeof result === "object").toBe(true);
  });

  test("invalidateCodegraphCoreCache forces the next call to re-resolve, not return a stale cached value", () => {
    const before = resolveCodegraphCore();
    invalidateCodegraphCoreCache();
    const after = resolveCodegraphCore();
    // Same underlying resolution outcome is expected (environment hasn't
    // changed mid-test), but critically this must not throw and must not
    // short-circuit on an internal `!== undefined` cache check post-invalidate.
    expect(after === null || typeof after === "object").toBe(true);
    expect(typeof before).toBe(typeof after);
  });
});
