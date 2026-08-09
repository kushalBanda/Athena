import { Box, useApp, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatView } from "./components/ChatView.js";
import { InputBox } from "./components/InputBox.js";
import { Picker } from "./components/Picker.js";
import { StatusBar } from "./components/StatusBar.js";
import { TextPrompt } from "./components/TextPrompt.js";
import { TopBar } from "./components/TopBar.js";
import { Welcome } from "./components/Welcome.js";
import { getGitInfo } from "./git-info.js";
import { expandMentions } from "./lib/expand-mentions.js";
import { walkFiles } from "./lib/file-walk.js";
import type { AgentStatus, AppState, Message, PickerOption } from "./types.js";

export interface AgentCallbacks {
  addMessage: (m: Message) => void;
  updateMessage: (id: string, patch: Partial<Omit<Message, "id">>) => void;
  setModel: (model: string) => void;
  setEffort: (effort: string | undefined) => void;
  addTokens: (input: number, output: number, cacheRead?: number, cacheWrite?: number) => void;
  setStatus: (status: AgentStatus) => void;
  setContextLimit: (limit: number) => void;
  addCost: (usd: number) => void;
  clearMessages: () => void;
  setCtrlCArmed: (armed: boolean) => void;
  setQueuedMessages: (messages: string[]) => void;
  pickFromList: (
    title: string,
    options: readonly (string | PickerOption)[],
    opts?: { onToggle?: (value: string) => readonly (string | PickerOption)[] },
  ) => Promise<string | null>;
  promptForText: (title: string, opts?: { mask?: boolean }) => Promise<string | null>;
}

interface Props {
  initialState?: Partial<AppState>;
  onUserMessage?: (msg: string, callbacks: AgentCallbacks) => Promise<void>;
  onReady?: (callbacks: AgentCallbacks) => void;
  onRecallQueued?: () => void;
}

const READY: AgentStatus = { kind: "ready" };

const DEFAULT_STATE: AppState = {
  messages: [],
  status: READY,
  model: "claude-opus-5",
  effort: undefined,
  cwd: process.cwd(),
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  picker: null,
  textPrompt: null,
  ctrlCArmed: false,
  queuedMessages: [],
};

export function App({ initialState, onUserMessage, onReady, onRecallQueued }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<AppState>({ ...DEFAULT_STATE, ...initialState });
  const [gitInfo] = useState(() => getGitInfo(state.cwd));
  const [mentionCandidates, setMentionCandidates] = useState<string[]>([]);
  const [clearEpoch, setClearEpoch] = useState(0);
  const pickerResolveRef = useRef<((value: string | null) => void) | null>(null);
  const textPromptResolveRef = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    walkFiles(state.cwd)
      .then(setMentionCandidates)
      .catch(() => setMentionCandidates([]));
  }, []);

  const pickFromList = useCallback(
    (
      title: string,
      options: readonly (string | PickerOption)[],
      opts?: { onToggle?: (value: string) => readonly (string | PickerOption)[] },
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        pickerResolveRef.current = resolve;
        setState((s) => ({ ...s, picker: { title, options, ...(opts?.onToggle ? { onToggle: opts.onToggle } : {}) } }));
      });
    },
    [],
  );

  const resolvePicker = useCallback((value: string | null) => {
    const resolve = pickerResolveRef.current;
    pickerResolveRef.current = null;
    setState((s) => ({ ...s, picker: null }));
    resolve?.(value);
  }, []);

  const togglePickerOption = useCallback((value: string) => {
    setState((s) => {
      if (!s.picker?.onToggle) return s;
      return { ...s, picker: { ...s.picker, options: s.picker.onToggle(value) } };
    });
  }, []);

  const promptForText = useCallback(
    (title: string, opts?: { mask?: boolean }): Promise<string | null> => {
      return new Promise((resolve) => {
        textPromptResolveRef.current = resolve;
        setState((s) => ({ ...s, textPrompt: { title, mask: opts?.mask ?? false } }));
      });
    },
    [],
  );

  const resolveTextPrompt = useCallback((value: string | null) => {
    const resolve = textPromptResolveRef.current;
    textPromptResolveRef.current = null;
    setState((s) => ({ ...s, textPrompt: null }));
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
    setEffort: (effort) => setState((s) => ({ ...s, effort })),
    addTokens: (input, output, cacheRead = 0, cacheWrite = 0) =>
      setState((s) => ({
        ...s,
        inputTokens: s.inputTokens + input,
        outputTokens: s.outputTokens + output,
        cacheReadTokens: s.cacheReadTokens + cacheRead,
        cacheWriteTokens: s.cacheWriteTokens + cacheWrite,
      })),
    setStatus: (status) => setState((s) => ({ ...s, status })),
    setContextLimit: (limit) => setState((s) => ({ ...s, contextLimit: limit })),
    addCost: (usd) => setState((s) => ({ ...s, costUsd: (s.costUsd ?? 0) + usd })),
    clearMessages: () => {
      stdout?.write("\x1Bc");
      setClearEpoch((e) => e + 1);
      setState((s) => ({ ...s, messages: [] }));
    },
    setCtrlCArmed: (armed) => setState((s) => ({ ...s, ctrlCArmed: armed })),
    setQueuedMessages: (messages) => setState((s) => ({ ...s, queuedMessages: messages })),
    pickFromList,
    promptForText,
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
        } catch (err) {
          setState((s) => (s.status.kind === "ready" ? s : { ...s, status: READY }));
          throw err;
        }
      }
    },
    [addMessage, onUserMessage, exit, state.cwd],
  );

  const handleRecallQueued = useCallback(() => {
    onRecallQueued?.();
  }, [onRecallQueued]);

  const header = (
    <Box flexDirection="column" borderStyle="round" borderColor="#3A3F52">
      <TopBar cwd={state.cwd} git={gitInfo} />
      <Welcome cwd={state.cwd} />
    </Box>
  );

  return (
    <Box flexDirection="column">
      <ChatView
        key={clearEpoch}
        header={header}
        messages={state.messages}
        thinking={state.status.kind !== "ready"}
      />
      {state.picker && (
        <Picker
          title={state.picker.title}
          options={state.picker.options}
          onSelect={(value) => resolvePicker(value)}
          onCancel={() => resolvePicker(null)}
          {...(state.picker.onToggle ? { onToggle: togglePickerOption } : {})}
        />
      )}
      {state.textPrompt && (
        <TextPrompt
          title={state.textPrompt.title}
          mask={state.textPrompt.mask}
          onSubmit={(value) => resolveTextPrompt(value)}
          onCancel={() => resolveTextPrompt(null)}
        />
      )}
      <InputBox
        onSubmit={handleSubmit}
        disabled={state.picker !== null || state.textPrompt !== null}
        mentionCandidates={mentionCandidates}
        queuedMessages={state.queuedMessages}
        onRecallQueued={handleRecallQueued}
      />
      <StatusBar
        model={state.model}
        {...(state.effort !== undefined ? { effort: state.effort } : {})}
        cwd={state.cwd}
        inputTokens={state.inputTokens}
        outputTokens={state.outputTokens}
        cacheReadTokens={state.cacheReadTokens}
        cacheWriteTokens={state.cacheWriteTokens}
        status={state.status}
        ctrlCArmed={state.ctrlCArmed}
        {...(state.contextLimit !== undefined ? { contextLimit: state.contextLimit } : {})}
        {...(state.costUsd !== undefined ? { costUsd: state.costUsd } : {})}
      />
    </Box>
  );
}
