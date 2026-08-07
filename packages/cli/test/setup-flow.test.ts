import { describe, expect, it } from "bun:test";
import { nextStepAfterAuth, resolveNewRelicPreset } from "../src/setup.js";

describe("nextStepAfterAuth", () => {
  it("goes to the observability step after the provider step (no-key provider, e.g. ollama)", () => {
    expect(nextStepAfterAuth("provider")).toBe("observability");
  });

  it("goes to the observability step after the key step (key-requiring provider)", () => {
    expect(nextStepAfterAuth("key")).toBe("observability");
  });
});

describe("resolveNewRelicPreset", () => {
  it("resolves the US endpoint by default region", () => {
    const result = resolveNewRelicPreset("nr-test-key", "us");
    expect(result).toEqual({
      otlpEndpoint: "https://otlp.nr-data.net:4318/v1/traces",
      otlpHeaders: { "api-key": "nr-test-key" },
    });
  });

  it("resolves the EU endpoint", () => {
    const result = resolveNewRelicPreset("nr-test-key", "eu");
    expect(result).toEqual({
      otlpEndpoint: "https://otlp.eu01.nr-data.net:4318/v1/traces",
      otlpHeaders: { "api-key": "nr-test-key" },
    });
  });
});
