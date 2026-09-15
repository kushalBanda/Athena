import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalAthenaExperimental = process.env.ATHENA_EXPERIMENTAL;

	afterEach(() => {
		if (originalAthenaExperimental === undefined) {
			delete process.env.ATHENA_EXPERIMENTAL;
		} else {
			process.env.ATHENA_EXPERIMENTAL = originalAthenaExperimental;
		}
	});

	it("returns false when ATHENA_EXPERIMENTAL is unset", () => {
		delete process.env.ATHENA_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when ATHENA_EXPERIMENTAL is empty", () => {
		process.env.ATHENA_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when ATHENA_EXPERIMENTAL is set to 1", () => {
		process.env.ATHENA_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when ATHENA_EXPERIMENTAL is set to 0", () => {
		process.env.ATHENA_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when ATHENA_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.ATHENA_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});
