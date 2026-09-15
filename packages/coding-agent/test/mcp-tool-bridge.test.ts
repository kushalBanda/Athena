import { describe, expect, it } from "vitest";
import { mcpToolName } from "../src/core/mcp/tool-bridge.ts";

describe("mcpToolName", () => {
	it("prefixes the tool name with the server name", () => {
		expect(mcpToolName("myserver", "search")).toBe("myserver_search");
	});

	it("does not double-prefix when the tool name already starts with the server name", () => {
		expect(mcpToolName("codegraph", "codegraph_explore")).toBe("codegraph_explore");
	});

	it("does not double-prefix when the tool name equals the server name", () => {
		expect(mcpToolName("codegraph", "codegraph")).toBe("codegraph");
	});

	it("sanitizes non-alphanumeric characters in both parts", () => {
		expect(mcpToolName("my server!", "do thing")).toBe("my_server__do_thing");
	});
});
