import { describe, expect, it } from "vitest";
import { normalizeStdioCommand } from "../src/core/mcp/client.ts";

describe("normalizeStdioCommand", () => {
	it("accepts a single argv array", () => {
		expect(normalizeStdioCommand({ command: ["npx", "@playwright/mcp@latest"] })).toEqual({
			command: "npx",
			args: ["@playwright/mcp@latest"],
		});
	});

	it("accepts the Claude Desktop / Cursor / VS Code command + args shape", () => {
		expect(normalizeStdioCommand({ command: "npx", args: ["@playwright/mcp@latest"] })).toEqual({
			command: "npx",
			args: ["@playwright/mcp@latest"],
		});
	});

	it("merges trailing argv entries with a separate args array, if both are given", () => {
		expect(normalizeStdioCommand({ command: ["npx", "-y"], args: ["@playwright/mcp@latest"] })).toEqual({
			command: "npx",
			args: ["-y", "@playwright/mcp@latest"],
		});
	});
});
