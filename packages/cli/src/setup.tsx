import React, { useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { setApiKey } from "./auth.js";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)",   needsKey: true  },
  { id: "gemini",    label: "Google Gemini",         needsKey: true  },
  { id: "azure",     label: "Azure OpenAI",           needsKey: true  },
  { id: "ollama",    label: "Ollama (local, no key)", needsKey: false },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface SetupResult {
  provider: ProviderId;
  /** true when user quit without completing */
  cancelled: boolean;
}

interface SetupState {
  step: "provider" | "key" | "done";
  idx: number;
}

function SetupApp({ onDone }: { onDone: (result: SetupResult) => void }) {
  const { exit } = useApp();
  const [state, setState] = useState<SetupState>({ step: "provider", idx: 0 });
  const [keyValue, setKeyValue] = useState("");

  const selected = PROVIDERS[state.idx]!;

  useInput((input, key) => {
    if (state.step !== "provider") return;

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
        setState((s) => ({ ...s, step: "done" }));
        onDone({ provider: selected.id, cancelled: false });
        exit();
      } else {
        setState((s) => ({ ...s, step: "key" }));
      }
      return;
    }
    if (input === "q" || key.escape) {
      onDone({ provider: selected.id, cancelled: true });
      exit();
    }
  });

  const handleKeySubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setApiKey(selected.id, trimmed);
    setState((s) => ({ ...s, step: "done" }));
    onDone({ provider: selected.id, cancelled: false });
    exit();
  };

  if (state.step === "provider") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">athena </Text>
          <Text dimColor>— choose a provider to get started</Text>
        </Box>
        <Box flexDirection="column">
          {PROVIDERS.map((p, i) =>
            i === state.idx ? (
              <Text key={p.id} color="green" bold>{"▶ " + p.label}</Text>
            ) : (
              <Text key={p.id} dimColor>{"  " + p.label}</Text>
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
          <Text bold color="cyan">athena </Text>
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
