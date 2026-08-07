import { Box, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import React, { useState } from "react";
import { setApiKey, setOtlpHeaders } from "./auth.js";
import { saveObservabilityConfig } from "./config.js";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", needsKey: true },
  { id: "gemini", label: "Google Gemini", needsKey: true },
  { id: "azure", label: "Azure OpenAI", needsKey: true },
  { id: "ollama", label: "Ollama (local, no key)", needsKey: false },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface SetupResult {
  provider: ProviderId;
  cancelled: boolean;
}

export type SetupStep =
  | "provider"
  | "key"
  | "observability"
  | "observability-preset"
  | "observability-new-relic-key"
  | "observability-new-relic-region"
  | "observability-custom-endpoint"
  | "observability-custom-headers"
  | "done";

export function nextStepAfterAuth(_current: "provider" | "key"): SetupStep {
  return "observability";
}

type NewRelicRegion = "us" | "eu";

const NEW_RELIC_ENDPOINTS: Record<NewRelicRegion, string> = {
  us: "https://otlp.nr-data.net:4318/v1/traces",
  eu: "https://otlp.eu01.nr-data.net:4318/v1/traces",
};

export function resolveNewRelicPreset(
  licenseKey: string,
  region: NewRelicRegion,
): { otlpEndpoint: string; otlpHeaders: Record<string, string> } {
  return {
    otlpEndpoint: NEW_RELIC_ENDPOINTS[region],
    otlpHeaders: { "api-key": licenseKey },
  };
}

interface SetupState {
  step: SetupStep;
  idx: number;
}

function SetupApp({ onDone }: { onDone: (result: SetupResult) => void }) {
  const { exit } = useApp();
  const [state, setState] = useState<SetupState>({ step: "provider", idx: 0 });
  const [keyValue, setKeyValue] = useState("");
  const [obsChoice, setObsChoice] = useState<0 | 1>(1); // 0 = enable, 1 = skip (default: skip)
  const [presetChoice, setPresetChoice] = useState<0 | 1>(0); // 0 = New Relic, 1 = Custom
  const [regionChoice, setRegionChoice] = useState<0 | 1>(0); // 0 = US, 1 = EU
  const [nrKeyValue, setNrKeyValue] = useState("");
  const [customEndpointValue, setCustomEndpointValue] = useState("");
  const [customHeaderValue, setCustomHeaderValue] = useState("");
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({});

  const selected = PROVIDERS[state.idx]!;

  const finish = () => {
    setState((s) => ({ ...s, step: "done" }));
    onDone({ provider: selected.id, cancelled: false });
    exit();
  };

  useInput((input, key) => {
    if (
      state.step !== "provider" &&
      state.step !== "observability" &&
      state.step !== "observability-preset" &&
      state.step !== "observability-new-relic-region"
    )
      return;

    if (state.step === "provider") {
      if (key.upArrow || input === "k") {
        setState((s) => ({ ...s, idx: (s.idx - 1 + PROVIDERS.length) % PROVIDERS.length }));
        return;
      }
      if (key.downArrow || input === "j") {
        setState((s) => ({ ...s, idx: (s.idx + 1) % PROVIDERS.length }));
        return;
      }
      if (key.return) {
        if (!selected.needsKey) {
          setState((s) => ({ ...s, step: nextStepAfterAuth("provider") }));
        } else {
          setState((s) => ({ ...s, step: "key" }));
        }
        return;
      }
      if (input === "q" || key.escape) {
        onDone({ provider: selected.id, cancelled: true });
        exit();
      }
      return;
    }

    if (input === "q" || key.escape) {
      saveObservabilityConfig({ enabled: false });
      finish();
      return;
    }

    if (state.step === "observability") {
      if (key.upArrow || key.downArrow || input === "k" || input === "j") {
        setObsChoice((c) => (c === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        if (obsChoice === 0) {
          setState((s) => ({ ...s, step: "observability-preset" }));
        } else {
          saveObservabilityConfig({ enabled: false });
          finish();
        }
      }
      return;
    }

    if (state.step === "observability-preset") {
      if (key.upArrow || key.downArrow || input === "k" || input === "j") {
        setPresetChoice((c) => (c === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        setState((s) => ({
          ...s,
          step:
            presetChoice === 0 ? "observability-new-relic-key" : "observability-custom-endpoint",
        }));
      }
      return;
    }

    if (state.step === "observability-new-relic-region") {
      if (key.upArrow || key.downArrow || input === "k" || input === "j") {
        setRegionChoice((c) => (c === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        const { otlpEndpoint, otlpHeaders } = resolveNewRelicPreset(
          nrKeyValue,
          regionChoice === 0 ? "us" : "eu",
        );
        saveObservabilityConfig({ enabled: true, otlpEndpoint, backendPreset: "new-relic" });
        setOtlpHeaders(otlpHeaders);
        finish();
      }
      return;
    }
  });

  const handleKeySubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setApiKey(selected.id, trimmed);
    setState((s) => ({ ...s, step: nextStepAfterAuth("key") }));
  };

  const handleNrKeySubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setNrKeyValue(trimmed);
    setState((s) => ({ ...s, step: "observability-new-relic-region" }));
  };

  const handleCustomEndpointSubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setCustomEndpointValue(trimmed);
    setState((s) => ({ ...s, step: "observability-custom-headers" }));
  };

  const handleCustomHeaderSubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      saveObservabilityConfig({
        enabled: true,
        otlpEndpoint: customEndpointValue,
        backendPreset: "custom",
      });
      setOtlpHeaders(customHeaders);
      finish();
      return;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      setCustomHeaderValue("");
      return;
    }
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!name) {
      setCustomHeaderValue("");
      return;
    }
    setCustomHeaders((h) => ({ ...h, [name]: value }));
    setCustomHeaderValue("");
  };

  if (state.step === "provider") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— choose a provider to get started</Text>
        </Box>
        <Box flexDirection="column">
          {PROVIDERS.map((p, i) =>
            i === state.idx ? (
              <Text key={p.id} color="green" bold>
                {`▶ ${p.label}`}
              </Text>
            ) : (
              <Text key={p.id} dimColor>
                {`  ${p.label}`}
              </Text>
            ),
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑ ↓ navigate · Enter select · q quit</Text>
        </Box>
      </Box>
    );
  }

  if (state.step === "key") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— {selected.label}</Text>
        </Box>
        <Box>
          <Text>API key: </Text>
          <TextInput value={keyValue} onChange={setKeyValue} onSubmit={handleKeySubmit} mask="*" />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Saved to ~/.config/athena/auth.json (mode 600)</Text>
        </Box>
      </Box>
    );
  }

  if (state.step === "observability") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— enable observability?</Text>
        </Box>
        <Box flexDirection="column">
          <Text {...(obsChoice === 0 ? { color: "green" as const } : {})} bold={obsChoice === 0}>
            {`${obsChoice === 0 ? "▶ " : "  "}Enable`}
          </Text>
          <Text {...(obsChoice === 1 ? { color: "green" as const } : {})} bold={obsChoice === 1}>
            {`${obsChoice === 1 ? "▶ " : "  "}Skip`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑ ↓ toggle · Enter select</Text>
        </Box>
      </Box>
    );
  }

  if (state.step === "observability-preset") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— choose an observability backend</Text>
        </Box>
        <Box flexDirection="column">
          <Text
            {...(presetChoice === 0 ? { color: "green" as const } : {})}
            bold={presetChoice === 0}
          >
            {`${presetChoice === 0 ? "▶ " : "  "}New Relic`}
          </Text>
          <Text
            {...(presetChoice === 1 ? { color: "green" as const } : {})}
            bold={presetChoice === 1}
          >
            {`${presetChoice === 1 ? "▶ " : "  "}Custom (any OTLP/HTTP backend)`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑ ↓ toggle · Enter select</Text>
        </Box>
      </Box>
    );
  }

  if (state.step === "observability-new-relic-key") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— New Relic license key</Text>
        </Box>
        <Box>
          <Text>License key: </Text>
          <TextInput
            value={nrKeyValue}
            onChange={setNrKeyValue}
            onSubmit={handleNrKeySubmit}
            mask="*"
          />
        </Box>
      </Box>
    );
  }

  if (state.step === "observability-new-relic-region") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— New Relic region</Text>
        </Box>
        <Box flexDirection="column">
          <Text
            {...(regionChoice === 0 ? { color: "green" as const } : {})}
            bold={regionChoice === 0}
          >
            {`${regionChoice === 0 ? "▶ " : "  "}US`}
          </Text>
          <Text
            {...(regionChoice === 1 ? { color: "green" as const } : {})}
            bold={regionChoice === 1}
          >
            {`${regionChoice === 1 ? "▶ " : "  "}EU`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑ ↓ toggle · Enter select</Text>
        </Box>
      </Box>
    );
  }

  if (state.step === "observability-custom-endpoint") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— custom OTLP/HTTP traces endpoint</Text>
        </Box>
        <Box>
          <Text>Endpoint URL: </Text>
          <TextInput
            value={customEndpointValue}
            onChange={setCustomEndpointValue}
            onSubmit={handleCustomEndpointSubmit}
          />
        </Box>
      </Box>
    );
  }

  if (state.step === "observability-custom-headers") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            athena{" "}
          </Text>
          <Text dimColor>— headers (name: value, submit empty when done)</Text>
        </Box>
        <Box>
          <Text>Header: </Text>
          <TextInput
            value={customHeaderValue}
            onChange={setCustomHeaderValue}
            onSubmit={handleCustomHeaderSubmit}
          />
        </Box>
        {Object.keys(customHeaders).length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            {Object.keys(customHeaders).map((name) => (
              <Text key={name} dimColor>{`  ${name}: ***`}</Text>
            ))}
          </Box>
        ) : null}
      </Box>
    );
  }

  // step === "done" — flashes briefly before TUI starts
  return (
    <Box paddingX={2} paddingY={1}>
      <Text color="green">✓ </Text>
      <Text>{selected.label} configured — starting athena…</Text>
    </Box>
  );
}

export function runSetup(): Promise<SetupResult> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(React.createElement(SetupApp, { onDone: resolve }));
    waitUntilExit()
      .then(() => resolve({ provider: "anthropic", cancelled: true }))
      .catch(() => resolve({ provider: "anthropic", cancelled: true }));
  });
}
