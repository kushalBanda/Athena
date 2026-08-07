import { describe, expect, it } from "bun:test";
import { isTelemetryConfigured } from "../src/config.js";

describe("isTelemetryConfigured", () => {
  it("is false when disabled, even with an endpoint", () => {
    expect(
      isTelemetryConfigured({ enabled: false, otlpEndpoint: "https://example.com/v1/traces" }),
    ).toBe(false);
  });

  it("is false when enabled but no endpoint is set", () => {
    expect(isTelemetryConfigured({ enabled: true })).toBe(false);
  });

  it("is false when enabled with an empty-string endpoint", () => {
    expect(isTelemetryConfigured({ enabled: true, otlpEndpoint: "" })).toBe(false);
  });

  it("is true when enabled with a non-empty endpoint", () => {
    expect(
      isTelemetryConfigured({ enabled: true, otlpEndpoint: "https://example.com/v1/traces" }),
    ).toBe(true);
  });
});
