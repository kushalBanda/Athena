import React, { useCallback, useRef, useState } from "react";
import { Box, useApp } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { ChatView } from "./components/ChatView.js";
import { InputBox } from "./components/InputBox.js";
import { Picker } from "./components/Picker.js";
import type { AppState, Message } from "./types.js";

export interface AgentCallbacks {
  addMessage: (m: Message) => void;
  updateMessage: (id: string, patch: Partial<Omit<Message, "id">>) => void;
  setModel: (model: string) => void;
  addTokens: (input: number, output: number) => void;
  clearMessages: () => void;
  /** Opens a fuzzy-searchable picker; resolves to the chosen option, or null if cancelled. */
  pickFromList: (title: string, options: string[]) => Promise<string | null>;
}

interface Props {
  initialState?: Partial<AppState>;
  onUserMessage?: (msg: string, callbacks: AgentCallbacks) => Promise<void>;
}

const DEFAULT_STATE: AppState = {
  messages: [],
  thinking: false,
  model: "claude-opus-5",
  cwd: process.cwd(),
  inputTokens: 0,
  outputTokens: 0,
  picker: null,
};

export function App({ initialState, onUserMessage }: Props) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ ...DEFAULT_STATE, ...initialState });
  const pickerResolveRef = useRef<((value: string | null) => void) | null>(null);

  const pickFromList = useCallback((title: string, options: string[]): Promise<string | null> => {
    return new Promise((resolve) => {
      pickerResolveRef.current = resolve;
      setState((s) => ({ ...s, picker: { title, options } }));
    });
  }, []);

  const resolvePicker = useCallback((value: string | null) => {
    const resolve = pickerResolveRef.current;
    pickerResolveRef.current = null;
    setState((s) => ({ ...s, picker: null }));
    resolve?.(value);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setState((s) => ({ ...s, messages: [...s.messages, msg] }));
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Omit<Message, "id">>) => {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }, []);

  const callbacks: AgentCallbacks = {
    addMessage,
    updateMessage,
    setModel: (model) => setState((s) => ({ ...s, model })),
    addTokens: (input, output) =>
      setState((s) => ({ ...s, inputTokens: s.inputTokens + input, outputTokens: s.outputTokens + output })),
    clearMessages: () => setState((s) => ({ ...s, messages: [] })),
    pickFromList,
  };

  const handleSubmit = useCallback(
    async (text: string) => {
      if (text === "/exit" || text === "/quit") {
        exit();
        return;
      }
      if (text === "/clear") {
        setState((s) => ({ ...s, messages: [] }));
        return;
      }

      // show user message for non-slash or slash commands (slash cmds show their own system reply)
      const isSlash = text.startsWith("/");
      if (!isSlash) {
        addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      }

      if (onUserMessage) {
        setState((s) => ({ ...s, thinking: true }));
        try {
          await onUserMessage(text, callbacks);
        } finally {
          setState((s) => ({ ...s, thinking: false }));
        }
      }
    },
    [addMessage, onUserMessage, exit],
  );

  return (
    <Box flexDirection="column">
      <StatusBar
        model={state.model}
        cwd={state.cwd}
        inputTokens={state.inputTokens}
        outputTokens={state.outputTokens}
      />
      <ChatView messages={state.messages} thinking={state.thinking} />
      {state.picker && (
        <Picker
          title={state.picker.title}
          options={state.picker.options}
          onSelect={(value) => resolvePicker(value)}
          onCancel={() => resolvePicker(null)}
        />
      )}
      <InputBox onSubmit={handleSubmit} disabled={state.thinking || state.picker !== null} />
    </Box>
  );
}
