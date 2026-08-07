import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, useApp } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { TopBar } from "./components/TopBar.js";
import { Welcome } from "./components/Welcome.js";
import { ChatView } from "./components/ChatView.js";
import { InputBox } from "./components/InputBox.js";
import { Picker } from "./components/Picker.js";
import { getGitInfo } from "./git-info.js";
import { walkFiles } from "./lib/file-walk.js";
import { expandMentions } from "./lib/expand-mentions.js";
import type { AgentStatus, AppState, Message } from "./types.js";

export interface AgentCallbacks {
  addMessage: (m: Message) => void;
  updateMessage: (id: string, patch: Partial<Omit<Message, "id">>) => void;
  setModel: (model: string) => void;
  addTokens: (input: number, output: number) => void;
  setStatus: (status: AgentStatus) => void;
  setContextLimit: (limit: number) => void;
  addCost: (usd: number) => void;
  clearMessages: () => void;
  setCtrlCArmed: (armed: boolean) => void;
  pickFromList: (title: string, options: string[]) => Promise<string | null>;
}

interface Props {
  initialState?: Partial<AppState>;
  onUserMessage?: (msg: string, callbacks: AgentCallbacks) => Promise<void>;
  onReady?: (callbacks: AgentCallbacks) => void;
}

const READY: AgentStatus = { kind: "ready" };

const DEFAULT_STATE: AppState = {
  messages: [],
  status: READY,
  model: "claude-opus-5",
  cwd: process.cwd(),
  inputTokens: 0,
  outputTokens: 0,
  picker: null,
  ctrlCArmed: false,
};

export function App({ initialState, onUserMessage, onReady }: Props) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ ...DEFAULT_STATE, ...initialState });
  const [gitInfo] = useState(() => getGitInfo(state.cwd));
  const [initialModel] = useState(() => state.model);
  const [mentionCandidates, setMentionCandidates] = useState<string[]>([]);
  const pickerResolveRef = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    walkFiles(state.cwd)
      .then(setMentionCandidates)
      .catch(() => setMentionCandidates([]));
  }, []);

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
    setStatus: (status) => setState((s) => ({ ...s, status })),
    setContextLimit: (limit) => setState((s) => ({ ...s, contextLimit: limit })),
    addCost: (usd) => setState((s) => ({ ...s, costUsd: (s.costUsd ?? 0) + usd })),
    clearMessages: () => setState((s) => ({ ...s, messages: [] })),
    setCtrlCArmed: (armed) => setState((s) => ({ ...s, ctrlCArmed: armed })),
    pickFromList,
  };

  useEffect(() => {
    onReady?.(callbacks);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (text === "/exit" || text === "/quit") {
        exit();
        return;
      }
      const isSlash = text.startsWith("/");
      if (!isSlash) {
        addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      }

      if (onUserMessage) {
        try {
          const expanded = isSlash ? text : await expandMentions(text, state.cwd);
          await onUserMessage(expanded, callbacks);
        } finally {
          setState((s) => (s.status.kind === "ready" ? s : { ...s, status: READY }));
        }
      }
    },
    [addMessage, onUserMessage, exit, state.cwd],
  );

  const header = (
    <Box flexDirection="column" borderStyle="round" borderColor="#3A3F52">
      <TopBar cwd={state.cwd} git={gitInfo} />
      <Welcome model={initialModel} cwd={state.cwd} />
    </Box>
  );

  return (
    <Box flexDirection="column">
      <ChatView header={header} messages={state.messages} thinking={state.status.kind !== "ready"} />
      {state.picker && (
        <Picker
          title={state.picker.title}
          options={state.picker.options}
          onSelect={(value) => resolvePicker(value)}
          onCancel={() => resolvePicker(null)}
        />
      )}
      <InputBox
        onSubmit={handleSubmit}
        disabled={state.status.kind !== "ready" || state.picker !== null}
        mentionCandidates={mentionCandidates}
      />
      <StatusBar
        model={state.model}
        cwd={state.cwd}
        inputTokens={state.inputTokens}
        outputTokens={state.outputTokens}
        status={state.status}
        ctrlCArmed={state.ctrlCArmed}
        {...(state.contextLimit !== undefined ? { contextLimit: state.contextLimit } : {})}
        {...(state.costUsd !== undefined ? { costUsd: state.costUsd } : {})}
      />
    </Box>
  );
}
