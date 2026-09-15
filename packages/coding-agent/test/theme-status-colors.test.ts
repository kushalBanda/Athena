import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getResolvedThemeColors, loadThemeFromPath } from "../src/modes/interactive/theme/theme.ts";

describe("status-line segment colors", () => {
	it("dark.json resolves statusModel/statusPath/statusBranch", () => {
		const colors = getResolvedThemeColors("dark");
		expect(colors.statusModel).toBe("#8fb0a8");
		expect(colors.statusPath).toBe("#8fae7a");
		expect(colors.statusBranch).toBe("#b58fc2");
	});

	it("light.json resolves statusModel/statusPath/statusBranch", () => {
		const colors = getResolvedThemeColors("light");
		expect(colors.statusModel).toBe("#3f7a72");
		expect(colors.statusPath).toBe("#3f7a3f");
		expect(colors.statusBranch).toBe("#7a3f7a");
	});

	describe("backward compatibility with custom themes missing the new keys", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "athena-theme-status-"));
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("falls back to muted when a custom theme predates the status colors", () => {
			const legacyTheme = {
				name: "legacy",
				colors: {
					accent: "#ffffff",
					border: "#ffffff",
					borderAccent: "#ffffff",
					borderMuted: "#ffffff",
					success: "#00ff00",
					error: "#ff0000",
					warning: "#ffff00",
					muted: "#123456",
					dim: "#666666",
					text: "#ffffff",
					thinkingText: "#ffffff",
					selectedBg: "#000000",
					userMessageBg: "#000000",
					userMessageText: "#ffffff",
					customMessageBg: "#000000",
					customMessageText: "#ffffff",
					customMessageLabel: "#ffffff",
					toolPendingBg: "#000000",
					toolSuccessBg: "#000000",
					toolErrorBg: "#000000",
					toolTitle: "#ffffff",
					toolOutput: "#ffffff",
					mdHeading: "#ffffff",
					mdLink: "#ffffff",
					mdLinkUrl: "#ffffff",
					mdCode: "#ffffff",
					mdCodeBlock: "#ffffff",
					mdCodeBlockBorder: "#ffffff",
					mdQuote: "#ffffff",
					mdQuoteBorder: "#ffffff",
					mdHr: "#ffffff",
					mdListBullet: "#ffffff",
					toolDiffAdded: "#00ff00",
					toolDiffRemoved: "#ff0000",
					toolDiffContext: "#ffffff",
					syntaxComment: "#ffffff",
					syntaxKeyword: "#ffffff",
					syntaxFunction: "#ffffff",
					syntaxVariable: "#ffffff",
					syntaxString: "#ffffff",
					syntaxNumber: "#ffffff",
					syntaxType: "#ffffff",
					syntaxOperator: "#ffffff",
					syntaxPunctuation: "#ffffff",
					thinkingOff: "#ffffff",
					thinkingMinimal: "#ffffff",
					thinkingLow: "#ffffff",
					thinkingMedium: "#ffffff",
					thinkingHigh: "#ffffff",
					thinkingXhigh: "#ffffff",
					bashMode: "#00ff00",
					// statusModel / statusPath / statusBranch intentionally omitted
				},
			};

			mkdirSync(tempDir, { recursive: true });
			const themePath = join(tempDir, "legacy.json");
			writeFileSync(themePath, JSON.stringify(legacyTheme));

			const theme = loadThemeFromPath(themePath, "truecolor");
			expect(theme.getFgAnsi("statusModel")).toBe(theme.getFgAnsi("muted"));
			expect(theme.getFgAnsi("statusPath")).toBe(theme.getFgAnsi("muted"));
			expect(theme.getFgAnsi("statusBranch")).toBe(theme.getFgAnsi("muted"));
		});
	});
});
