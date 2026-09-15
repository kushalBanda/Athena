import { describe, expect, it } from "vitest";
import { getAthenaUserAgent } from "../src/utils/athena-user-agent.ts";

describe("getAthenaUserAgent", () => {
	it("formats the user agent expected by athena.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getAthenaUserAgent("1.2.3");

		expect(userAgent).toBe(`athena/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^athena\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
