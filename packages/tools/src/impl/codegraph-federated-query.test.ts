import { describe, expect, test } from "bun:test";
import { MAX_FEDERATED_REPOS } from "../codegraph/federated-query.js";
import { CodegraphFederatedQueryTool } from "./codegraph-federated-query.js";

describe("CodegraphFederatedQueryTool", () => {
  test("reports no matches when no repos have an index", async () => {
    const tool = new CodegraphFederatedQueryTool();
    const result = await tool.execute(
      {
        query: "foo",
        repoPaths: ["/tmp/athena-nonexistent-repo-a", "/tmp/athena-nonexistent-repo-b"],
      },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBe(false);
    expect(result.content).toContain("No matches found");
  });

  test("rejects invalid input via schema validation", async () => {
    const tool = new CodegraphFederatedQueryTool();
    const result = await tool.execute(
      { query: "foo", repoPaths: [] },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBe(true);
  });

  test("rejects repoPaths beyond MAX_FEDERATED_REPOS via schema validation", async () => {
    const tool = new CodegraphFederatedQueryTool();
    const tooMany = Array.from({ length: MAX_FEDERATED_REPOS + 1 }, (_, i) => `/repo-${i}`);
    const result = await tool.execute(
      { query: "foo", repoPaths: tooMany },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBe(true);
  });

  test("toToolDef exposes the correct tool name and schema", () => {
    const tool = new CodegraphFederatedQueryTool();
    const def = tool.toToolDef();
    expect(def.name).toBe("codegraph_federated_query");
  });
});
