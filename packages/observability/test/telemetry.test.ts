import { afterEach, describe, expect, it } from "bun:test";
import { trace } from "@opentelemetry/api";
import { getTracer, initTelemetry, shutdownTelemetry } from "../src/index.js";

describe("initTelemetry — disabled", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    trace.disable();
  });

  it("does not register a global tracer provider when enabled is false", () => {
    initTelemetry({ enabled: false });
    const tracer = getTracer();
    const span = tracer.startSpan("test-span");
    expect(span.spanContext().spanId).toBe("0000000000000000");
    span.end();
  });

  it("does not register a global tracer provider when enabled is true but no otlpEndpoint is set", () => {
    initTelemetry({ enabled: true });
    const tracer = getTracer();
    const span = tracer.startSpan("test-span");
    expect(span.spanContext().spanId).toBe("0000000000000000");
    span.end();
  });
});

describe("initTelemetry — enabled", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    trace.disable();
  });

  it("registers a real tracer provider when enabled with an otlpEndpoint", () => {
    initTelemetry({
      enabled: true,
      otlpEndpoint: "https://example.com/v1/traces",
      otlpHeaders: { "api-key": "test-key" },
    });
    const tracer = getTracer();
    const span = tracer.startSpan("test-span");
    expect(span.spanContext().spanId).not.toBe("0000000000000000");
    span.end();
  });
});

describe("shutdownTelemetry", () => {
  afterEach(() => {
    trace.disable();
  });

  it("resolves cleanly even when telemetry was never initialized", async () => {
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  it("resolves after a real provider is shut down", async () => {
    initTelemetry({ enabled: true, otlpEndpoint: "https://example.com/v1/traces" });
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });
});
