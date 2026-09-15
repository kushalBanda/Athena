import { beforeAll, describe, expect, it } from "vitest";
import { renderDiff } from "../src/modes/interactive/components/diff.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

describe("renderDiff row tint", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("wraps added lines in the toolSuccessBg tint alongside the fg color", () => {
		const rendered = renderDiff(" 1 unchanged\n+2 new line");
		const lines = rendered.split("\n");
		const addedLine = lines[1];
		expect(addedLine).toContain(theme.getBgAnsi("toolSuccessBg"));
		expect(addedLine).toContain(theme.getFgAnsi("toolDiffAdded"));
	});

	it("wraps removed lines in the toolErrorBg tint alongside the fg color", () => {
		const rendered = renderDiff("-1 old line\n 2 unchanged");
		const lines = rendered.split("\n");
		const removedLine = lines[0];
		expect(removedLine).toContain(theme.getBgAnsi("toolErrorBg"));
		expect(removedLine).toContain(theme.getFgAnsi("toolDiffRemoved"));
	});

	it("leaves context lines without any background tint", () => {
		const rendered = renderDiff(" 1 context only");
		expect(rendered).not.toContain(theme.getBgAnsi("toolSuccessBg"));
		expect(rendered).not.toContain(theme.getBgAnsi("toolErrorBg"));
	});

	it("tints both sides of a single-line modification", () => {
		const rendered = renderDiff("-1 before\n+1 after");
		const lines = rendered.split("\n");
		expect(lines[0]).toContain(theme.getBgAnsi("toolErrorBg"));
		expect(lines[1]).toContain(theme.getBgAnsi("toolSuccessBg"));
	});
});
