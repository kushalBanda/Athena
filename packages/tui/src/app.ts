import { TuiAltScreen } from "./tui-alt-screen.ts";
import { matchesKey } from "./keys.ts";
import type { Component, TUI } from "./tui.ts";
import type { Terminal } from "./terminal.ts";
import { ProcessTerminal } from "./terminal.ts";
import { VStack } from "./components/v-stack.ts";
import { Box } from "./components/box.ts";
import { Transcript } from "./components/transcript.ts";
import { Header } from "./components/header.ts";
import { StatusBar } from "./components/status-bar.ts";
import { Welcome } from "./components/welcome.ts";
import { Editor } from "./components/editor.ts";
import { Input } from "./components/input.ts";
import { SelectList, type SelectItem } from "./components/select-list.ts";
import {
  WorkingStatusIndicator,
  RetryStatusIndicator,
  CompactionStatusIndicator,
} from "./components/status-indicator.ts";
import { defaultTheme } from "./theme.ts";
import type { AgentStatus, AppState, Message, PickerOption } from "./app-types.ts";
import { CombinedAutocompleteProvider, type SlashCommand } from "./autocomplete.ts";

const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "list available commands" },
  { name: "model", description: "switch model (opens picker)" },
  { name: "provider", description: "switch provider (opens picker)" },
  { name: "effort", description: "switch reasoning effort (opens picker)" },
  { name: "status", description: "show current provider + model" },
  { name: "clear", description: "clear chat history, start a new session" },
  { name: "compact", description: "manually compact the session context" },
  { name: "resume", description: "pick a previous session to resume" },
  { name: "skills", description: "list loaded skills (name, description, path)" },
  { name: "context-config", description: "toggle CLAUDE.md loading and claude skill loading" },
  { name: "init", description: "generate CLAUDE.md for this repo" },
  { name: "reload", description: "reload skills and custom commands" },
  { name: "exit", description: "quit athena" },
  { name: "quit", description: "quit athena" },
];

/** The public surface `packages/cli`'s adapter.ts wires the agent loop's callbacks into. */
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
  setCustomCommands: (commands: { name: string; description: string }[]) => void;
  pickFromList: (
    title: string,
    options: readonly (string | PickerOption)[],
    opts?: { onToggle?: (value: string) => readonly (string | PickerOption)[] },
  ) => Promise<string | null>;
  promptForText: (title: string, opts?: { mask?: boolean }) => Promise<string | null>;
}

export interface TuiAppOptions {
  initialState: Partial<AppState>;
  onUserMessage?: (msg: string, callbacks: AgentCallbacks) => Promise<void>;
  onReady?: (callbacks: AgentCallbacks) => void;
  onRecallQueued?: () => void;
  onCtrlC?: () => void;
  /** Injectable terminal, primarily for tests (e.g. VirtualTerminal). Defaults to ProcessTerminal. */
  terminal?: Terminal;
}

/**
 * Titled overlay wrapper that delegates input to the inner component — a plain VStack has no
 * handleInput, so the wrapped SelectList/Input would be unreachable by the keyboard.
 * Known gap: no `focused` field, so Input's hardware cursor positioning stays inactive here.
 */
class TitledOverlay implements Component {
  constructor(
    private readonly title: string,
    private readonly inner: Component,
  ) {}

  render(width: number): string[] {
    return [defaultTheme.text.accent(this.title), "", ...this.inner.render(width)];
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}

function toSelectItems(options: readonly (string | PickerOption)[]): SelectItem[] {
  return options.map((o) =>
    typeof o === "string"
      ? { value: o, label: o }
      : {
          value: o.value,
          label: o.label,
          ...(o.hint !== undefined ? { description: o.hint } : {}),
        },
  );
}

const DEFAULT_STATE: AppState = {
  messages: [],
  status: { kind: "ready" },
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
  customCommands: [],
};

/** Root composition: owns `AppState` and exposes it to callers through `AgentCallbacks`. */
export class TuiApp {
  private readonly state: AppState;
  private readonly ui: TUI;
  private readonly transcript: Transcript;
  private readonly header: Header;
  private readonly statusBar: StatusBar;
  private readonly welcome: Welcome;
  private readonly editor: Editor;
  private statusIndicator:
    | WorkingStatusIndicator
    | RetryStatusIndicator
    | CompactionStatusIndicator
    | null = null;
  private readonly statusRegion: VStack;
  private readonly onUserMessage: TuiAppOptions["onUserMessage"];
  // Known gap: stored but not yet bound to any editor keystroke.
  private readonly onRecallQueuedCb: TuiAppOptions["onRecallQueued"];
  private readonly onCtrlC: TuiAppOptions["onCtrlC"];
  private exitResolve: (() => void) | null = null;

  constructor(options: TuiAppOptions) {
    this.state = { ...DEFAULT_STATE, ...options.initialState };
    this.onUserMessage = options.onUserMessage;
    this.onRecallQueuedCb = options.onRecallQueued;
    this.onCtrlC = options.onCtrlC;

    const terminal = options.terminal ?? new ProcessTerminal();
    this.ui = new TuiAltScreen(terminal);

    this.transcript = new Transcript(this.ui, {
      heading: (s) => defaultTheme.text.accent(s),
      link: (s) => defaultTheme.text.accent(s),
      linkUrl: (s) => defaultTheme.text.muted(s),
      code: (s) => defaultTheme.text.accent(s),
      codeBlock: (s) => s,
      codeBlockBorder: (s) => defaultTheme.border(s),
      quote: (s) => defaultTheme.text.muted(s),
      quoteBorder: (s) => defaultTheme.border(s),
      hr: (s) => defaultTheme.border(s),
      listBullet: (s) => defaultTheme.text.accent(s),
      bold: (s) => s,
      italic: (s) => s,
      strikethrough: (s) => s,
      underline: (s) => s,
    });
    this.transcript.setMessages(this.state.messages);

    this.header = new Header(this.state.cwd);
    this.statusBar = new StatusBar(this.statusBarState());
    this.welcome = new Welcome(this.state.cwd);
    this.statusRegion = new VStack([this.statusBar]);

    this.editor = new Editor(this.ui, {
      borderColor: defaultTheme.border,
      selectList: {
        selectedPrefix: (s) => defaultTheme.text.accent(s),
        selectedText: (s) => defaultTheme.text.primary(s),
        description: (s) => defaultTheme.text.muted(s),
        scrollInfo: (s) => defaultTheme.text.muted(s),
        noMatch: (s) => defaultTheme.text.muted(s),
      },
    });
    this.editor.onSubmit = (text: string) => {
      this.editor.setText("");
      void this.handleSubmit(text);
    };
    this.refreshAutocompleteProvider();

    this.ui.setFocus(this.editor);
    this.setLayoutRootByMessages();

    this.ui.addInputListener((data: string) => {
      // matchesKey (not a literal byte check) is required here: the terminal negotiates the
      // Kitty keyboard protocol at startup (terminal.ts), so modern terminals (Kitty, iTerm2,
      // Ghostty, WezTerm) send ctrl+c/ctrl+d as a CSI-u escape sequence, not the raw \x03/\x04
      // control byte — a literal-byte comparison silently never matches on those terminals.
      if (matchesKey(data, "ctrl+d")) {
        // ctrl+d — exit
        this.stop();
        return { consume: true };
      }
      if (matchesKey(data, "ctrl+c")) {
        // raw mode disables ISIG, so this never arrives as SIGINT; the caller (cli's
        // handleSigint) owns abort-current-turn / double-press-to-exit semantics.
        this.onCtrlC?.();
        return { consume: true };
      }
      return undefined;
    });

    options.onReady?.(this.callbacks());
  }

  private refreshAutocompleteProvider(): void {
    const commands: SlashCommand[] = [
      ...BUILTIN_SLASH_COMMANDS,
      ...this.state.customCommands.filter(
        (c) => !BUILTIN_SLASH_COMMANDS.some((b) => b.name === c.name),
      ),
    ];
    this.editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(commands, this.state.cwd, null),
    );
  }

  private setLayoutRootByMessages(): void {
    // VStack has no "replace child at index", so rebuild the root to swap Welcome/Transcript.
    const first = this.state.messages.length === 0 ? this.welcome : this.transcript;
    (this.ui as unknown as { setLayoutRoot: (c: unknown) => void }).setLayoutRoot(
      new VStack([
        first,
        new Box(0, 0),
        this.header,
        this.statusRegion,
        new Box(0, 0),
        this.editor,
      ]),
    );
  }

  private statusBarState() {
    return {
      model: this.state.model,
      effort: this.state.effort,
      inputTokens: this.state.inputTokens,
      outputTokens: this.state.outputTokens,
      cacheReadTokens: this.state.cacheReadTokens,
      cacheWriteTokens: this.state.cacheWriteTokens,
      cwd: this.state.cwd,
      ...(this.state.contextLimit !== undefined ? { contextLimit: this.state.contextLimit } : {}),
      ...(this.state.costUsd !== undefined ? { costUsd: this.state.costUsd } : {}),
      status: this.state.status,
    };
  }

  private swapStatusIndicator(
    next: WorkingStatusIndicator | RetryStatusIndicator | CompactionStatusIndicator | null,
  ): void {
    this.statusIndicator?.stop();
    this.statusIndicator = next;
    this.statusRegion.clear();
    this.statusRegion.addChild(this.statusBar);
    if (next) this.statusRegion.addChild(next);
  }

  private applyStatus(status: AgentStatus): void {
    this.state.status = status;
    this.statusBar.update(this.statusBarState());
    if (status.kind === "thinking" || status.kind === "tool") {
      this.swapStatusIndicator(new WorkingStatusIndicator(this.ui));
    } else if (status.kind === "retrying") {
      this.swapStatusIndicator(
        new RetryStatusIndicator(
          this.ui,
          status.attempt,
          status.maxAttempts,
          status.delayMs,
          status.reason,
        ),
      );
    } else if (status.kind === "compacting") {
      this.swapStatusIndicator(new CompactionStatusIndicator(this.ui));
    } else {
      this.swapStatusIndicator(null);
    }
    this.ui.requestRender();
  }

  private async handleSubmit(text: string): Promise<void> {
    if (!text.trim()) return;
    await this.onUserMessage?.(text, this.callbacks());
  }

  private callbacks(): AgentCallbacks {
    return {
      addMessage: (m: Message) => {
        this.state.messages.push(m);
        if (this.state.messages.length === 1) this.setLayoutRootByMessages();
        this.transcript.appendMessage(m);
        this.transcript.scrollToEnd();
        this.ui.requestRender();
      },
      updateMessage: (id: string, patch: Partial<Omit<Message, "id">>) => {
        const msg = this.state.messages.find((m) => m.id === id);
        if (msg) Object.assign(msg, patch);
        this.transcript.updateMessage(id, patch);
        this.ui.requestRender();
      },
      setModel: (model: string) => {
        this.state.model = model;
        this.statusBar.update(this.statusBarState());
        this.ui.requestRender();
      },
      setEffort: (effort: string | undefined) => {
        this.state.effort = effort;
        this.statusBar.update(this.statusBarState());
        this.ui.requestRender();
      },
      addTokens: (input: number, output: number, cacheRead = 0, cacheWrite = 0) => {
        this.state.inputTokens += input;
        this.state.outputTokens += output;
        this.state.cacheReadTokens += cacheRead;
        this.state.cacheWriteTokens += cacheWrite;
        this.statusBar.update(this.statusBarState());
        this.ui.requestRender();
      },
      setStatus: (status: AgentStatus) => this.applyStatus(status),
      setContextLimit: (limit: number) => {
        this.state.contextLimit = limit;
        this.statusBar.update(this.statusBarState());
        this.ui.requestRender();
      },
      addCost: (usd: number) => {
        this.state.costUsd = (this.state.costUsd ?? 0) + usd;
        this.statusBar.update(this.statusBarState());
        this.ui.requestRender();
      },
      clearMessages: () => {
        this.state.messages = [];
        this.transcript.setMessages([]);
        this.setLayoutRootByMessages();
        this.ui.requestRender();
      },
      setCtrlCArmed: (armed: boolean) => {
        this.state.ctrlCArmed = armed;
      },
      setQueuedMessages: (messages: string[]) => {
        this.state.queuedMessages = messages;
        this.ui.requestRender();
      },
      setCustomCommands: (commands: { name: string; description: string }[]) => {
        this.state.customCommands = commands;
        this.refreshAutocompleteProvider();
      },
      pickFromList: (title, options, opts) => this.showPicker(title, options, opts),
      promptForText: (title, opts) => this.showTextPrompt(title, opts),
    };
  }

  private showPicker(
    title: string,
    options: readonly (string | PickerOption)[],
    _opts?: { onToggle?: (value: string) => readonly (string | PickerOption)[] },
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const list = new SelectList(toSelectItems(options), 8, {
        selectedPrefix: (s) => defaultTheme.text.accent(s),
        selectedText: (s) => defaultTheme.text.primary(s),
        description: (s) => defaultTheme.text.muted(s),
        scrollInfo: (s) => defaultTheme.text.muted(s),
        noMatch: (s) => defaultTheme.text.muted(s),
      });
      const box = new TitledOverlay(title, list);
      const handle = this.ui.showOverlay(box, { anchor: "center" });
      list.onSelect = (item) => {
        handle.hide();
        resolve(item.value);
      };
      list.onCancel = () => {
        handle.hide();
        resolve(null);
      };
    });
  }

  private showTextPrompt(title: string, opts?: { mask?: boolean }): Promise<string | null> {
    // Known gap: `Input` has no mask mode, so `opts.mask` is accepted but not honored yet.
    void opts?.mask;
    return new Promise((resolve) => {
      const input = new Input();
      const box = new TitledOverlay(title, input);
      const handle = this.ui.showOverlay(box, { anchor: "center" });
      input.onSubmit = (value: string) => {
        handle.hide();
        resolve(value);
      };
      input.onEscape = () => {
        handle.hide();
        resolve(null);
      };
    });
  }

  start(): Promise<void> {
    this.ui.start();
    return new Promise((resolve) => {
      this.exitResolve = resolve;
    });
  }

  stop(): void {
    this.ui.stop();
    this.exitResolve?.();
    this.exitResolve = null;
  }
}
