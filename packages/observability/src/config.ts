export interface ObservabilityConfig {
  enabled: boolean;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
}

export function isTelemetryConfigured(config: ObservabilityConfig): boolean {
  return config.enabled && !!config.otlpEndpoint;
}
