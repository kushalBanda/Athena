import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodegraphQueryTool } from "../src/impl/codegraph-query.js";

describe("CodegraphQueryTool", () => {
  it("errors when no .codegraph/index.db exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "athena-codegraph-"));
    try {
      const tool = new CodegraphQueryTool();
      const result = await tool.execute({ query: "how does loop.ts work" }, { workingDir: dir });
      expect(result.isError).toBe(true);
      expect(result.content).toContain("No CodeGraph index found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid input", async () => {
    const tool = new CodegraphQueryTool();
    const result = await tool.execute({}, { workingDir: "." });
    expect(result.isError).toBe(true);
  });
});
