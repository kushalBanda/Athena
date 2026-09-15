import type { TUI } from "@kushalbanda/tui";
import { beforeAll, describe, expect, it } from "vitest";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

function createFakeTui(): TUI {
	return { requestRender: () => {} } as unknown as TUI;
}

describe("ToolExecutionComponent border stripe", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("uses a muted stripe while pending, with no full-line background wash", () => {
		const component = new ToolExecutionComponent(
			"unknown_tool",
			"call-1",
			{ foo: "bar" },
			{},
			undefined,
			createFakeTui(),
			process.cwd(),
		);
		const rendered = component.render(60).join("\n");
		expect(rendered).toContain(theme.getFgAnsi("muted"));
		expect(rendered).not.toContain(theme.getBgAnsi("toolPendingBg"));
	});

	it("switches the stripe to success color once a non-error result lands", () => {
		const component = new ToolExecutionComponent(
			"unknown_tool",
			"call-2",
			{ foo: "bar" },
			{},
			undefined,
			createFakeTui(),
			process.cwd(),
		);
		component.updateResult({ content: [{ type: "text", text: "ok" }], isError: false });
		const rendered = component.render(60).join("\n");
		expect(rendered).toContain(theme.getFgAnsi("success"));
		expect(rendered).not.toContain(theme.getBgAnsi("toolSuccessBg"));
	});

	it("switches the stripe to error color once an error result lands", () => {
		const component = new ToolExecutionComponent(
			"unknown_tool",
			"call-3",
			{ foo: "bar" },
			{},
			undefined,
			createFakeTui(),
			process.cwd(),
		);
		component.updateResult({ content: [{ type: "text", text: "boom" }], isError: true });
		const rendered = component.render(60).join("\n");
		expect(rendered).toContain(theme.getFgAnsi("error"));
		expect(rendered).not.toContain(theme.getBgAnsi("toolErrorBg"));
	});
});
