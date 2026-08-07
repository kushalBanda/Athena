import { type Tracer, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID } from "@opentelemetry/semantic-conventions/incubating";
import { type ObservabilityConfig, isTelemetryConfigured } from "./config.js";

const TRACER_NAME = "athena";
const SERVICE_NAME = "athena-cli";

// service.instance.id required alongside service.name for New Relic's APM & Services view.
const SERVICE_INSTANCE_ID = crypto.randomUUID();

let activeProvider: NodeTracerProvider | undefined;

export function initTelemetry(config: ObservabilityConfig): void {
  if (!isTelemetryConfigured(config) || !config.otlpEndpoint) return;

  try {
    const exporter = new OTLPTraceExporter({
      url: config.otlpEndpoint,
      ...(config.otlpHeaders !== undefined ? { headers: config.otlpHeaders } : {}),
    });

    const provider = new NodeTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_INSTANCE_ID]: SERVICE_INSTANCE_ID,
      }),
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });

    provider.register();
    activeProvider = provider;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`athena: failed to initialize observability, continuing without it: ${message}`);
  }
}

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!activeProvider) return;
  const provider = activeProvider;
  activeProvider = undefined;

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  try {
    await Promise.race([provider.shutdown(), timeout]);
  } catch {}
}
