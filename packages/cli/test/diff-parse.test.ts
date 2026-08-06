import { describe, expect, it } from "bun:test";
import { parseUnifiedDiff } from "../src/diff-parse.js";

const SAMPLE = `Index: /tmp/a.txt
===================================================================
--- /tmp/a.txt
+++ /tmp/a.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2x
 line3
`;

describe("parseUnifiedDiff", () => {
  it("strips headers and keeps content lines", () => {
    const lines = parseUnifiedDiff(SAMPLE);
    expect(lines).toEqual([
      { type: "ctx", text: "line1" },
      { type: "del", text: "line2" },
      { type: "add", text: "line2x" },
      { type: "ctx", text: "line3" },
    ]);
  });

  it("handles multi-hunk diffs", () => {
    const multiHunk = `Index: a.txt
===================================================================
--- a.txt
+++ a.txt
@@ -1,2 +1,2 @@
 a
-b
+B
@@ -10,2 +10,2 @@
 x
-y
+Y
`;
    const lines = parseUnifiedDiff(multiHunk);
    expect(lines).toEqual([
      { type: "ctx", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "ctx", text: "x" },
      { type: "del", text: "y" },
      { type: "add", text: "Y" },
    ]);
  });

  it("returns empty array for empty patch", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
