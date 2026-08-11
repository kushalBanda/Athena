import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { setKittyProtocolActive } from "./keys.ts";
import { isNativeModifierPressed } from "./native-modifiers.ts";
import { StdinBuffer } from "./stdin-buffer.ts";

const cjsRequire = createRequire(import.meta.url);

const TERMINAL_PROGRESS_KEEPALIVE_MS = 1000;
const TERMINAL_PROGRESS_ACTIVE_SEQUENCE = "\x1b]9;4;3\x07";
const TERMINAL_PROGRESS_CLEAR_SEQUENCE = "\x1b]9;4;0\x07";
const APPLE_TERMINAL_SHIFT_ENTER_SEQUENCE = "\x1b[13;2u";
const DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS = 7;
const KEYBOARD_PROTOCOL_RESPONSE_FRAGMENT_TIMEOUT_MS = 150;
const KITTY_KEYBOARD_PROTOCOL_QUERY = `\x1b[>${DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS}u\x1b[?u\x1b[c`;

export type KeyboardProtocolNegotiationSequence =
  | { type: "kitty-flags"; flags: number }
  | { type: "device-attributes" };

export function parseKeyboardProtocolNegotiationSequence(
  sequence: string,
): KeyboardProtocolNegotiationSequence | undefined {
  const kittyFlags = sequence.match(/^\x1b\[\?(\d+)u$/);
  if (kittyFlags) {
    return { type: "kitty-flags", flags: Number.parseInt(kittyFlags[1]!, 10) };
  }
  if (/^\x1b\[\?[\d;]*c$/.test(sequence)) {
    return { type: "device-attributes" };
  }
  return undefined;
}

function isKeyboardProtocolNegotiationSequencePrefix(sequence: string): boolean {
  return sequence === "\x1b[" || /^\x1b\[\?[\d;]*$/.test(sequence);
}

export function isAppleTerminalSession(): boolean {
  return process.platform === "darwin" && process.env.TERM_PROGRAM === "Apple_Terminal";
}

export function normalizeAppleTerminalInput(
  data: string,
  isAppleTerminal: boolean,
  isShiftPressed: boolean,
): string {
  if (isAppleTerminal && data === "\r" && isShiftPressed)
    return APPLE_TERMINAL_SHIFT_ENTER_SEQUENCE;
  return data;
}

/** Minimal terminal interface for TUI. */
export interface Terminal {
  // Start the terminal with input and resize handlers
  start(onInput: (data: string) => void, onResize: () => void): void;

  // Stop the terminal and restore state
  stop(): void;

  /** Drain stdin before exit so Kitty key releases don't leak to the parent shell. */
  drainInput(maxMs?: number, idleMs?: number): Promise<void>;

  // Write output to terminal
  write(data: string): void;

  // Get terminal dimensions
  get columns(): number;
  get rows(): number;

  // Whether Kitty keyboard protocol is active
  get kittyProtocolActive(): boolean;

  // Cursor positioning (relative to current position)
  moveBy(lines: number): void; // Move cursor up (negative) or down (positive) by N lines

  // Cursor visibility
  hideCursor(): void; // Hide the cursor
  showCursor(): void; // Show the cursor

  // Clear operations
  clearLine(): void; // Clear current line
  clearFromCursor(): void; // Clear from cursor to end of screen
  clearScreen(): void; // Clear entire screen and move cursor to (0,0)

  // Title operations
  setTitle(title: string): void; // Set terminal window title

  // Progress indicator (OSC 9;4)
  setProgress(active: boolean): void;
}

/** Real terminal using process.stdin/stdout. */
export class ProcessTerminal implements Terminal {
  // Fields are `T | undefined`, not `field?: T`: they are reset to undefined at runtime.
  private wasRaw = false;
  private inputHandler: ((data: string) => void) | undefined;
  private resizeHandler: (() => void) | undefined;
  private _kittyProtocolActive = false;
  private _modifyOtherKeysActive = false;
  private keyboardProtocolPushed = false;
  private keyboardProtocolNegotiationBuffer = "";
  private keyboardProtocolBufferFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private stdinBuffer: StdinBuffer | undefined;
  private stdinDataHandler: ((data: string) => void) | undefined;
  private progressInterval: ReturnType<typeof setInterval> | undefined;
  private writeLogPath = (() => {
    const env = process.env.PI_TUI_WRITE_LOG || "";
    if (!env) return "";
    try {
      if (fs.statSync(env).isDirectory()) {
        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
        return path.join(env, `tui-${ts}-${process.pid}.log`);
      }
    } catch {
      // Not an existing directory - use as-is (file path)
    }
    return env;
  })();

  get kittyProtocolActive(): boolean {
    return this._kittyProtocolActive;
  }

  get modifyOtherKeysActive(): boolean {
    return this._modifyOtherKeysActive;
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.inputHandler = onInput;
    this.resizeHandler = onResize;

    this.wasRaw = process.stdin.isRaw || false;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    // Enable bracketed paste mode - terminal will wrap pastes in \x1b[200~ ... \x1b[201~
    process.stdout.write("\x1b[?2004h");

    process.stdout.on("resize", this.resizeHandler);

    // Dimensions can be stale after suspend/resume: SIGWINCH is lost while stopped.
    if (process.platform !== "win32") {
      process.kill(process.pid, "SIGWINCH");
    }

    // Must run AFTER setRawMode(true), which resets console mode flags.
    this.enableWindowsVTInput();

    this.queryAndEnableKittyProtocol();
  }

  /** Split batched input into single sequences so matchesKey/isKeyRelease work. */
  private setupStdinBuffer(): void {
    this.stdinBuffer = new StdinBuffer({ timeout: 10 });

    this.stdinBuffer.on("data", (sequence) => {
      const negotiationSequence = this.readKeyboardProtocolNegotiationSequence(sequence);
      if (negotiationSequence === "pending") {
        this.scheduleKeyboardProtocolNegotiationBufferFlush();
        return; // Wait briefly for the rest of a split Kitty response.
      }
      if (this.handleKeyboardProtocolNegotiationSequence(negotiationSequence)) {
        return;
      }

      this.forwardInputSequence(sequence);
    });

    // Re-wrap paste content with bracketed paste markers for the editor.
    this.stdinBuffer.on("paste", (content) => {
      if (this.inputHandler) {
        this.inputHandler(`\x1b[200~${content}\x1b[201~`);
      }
    });

    this.stdinDataHandler = (data: string) => {
      this.stdinBuffer!.process(data);
    };
  }

  // Flags must be requested before querying. The trailing DA query is a sentinel:
  // DA arriving before a Kitty response triggers the modifyOtherKeys fallback.
  private queryAndEnableKittyProtocol(): void {
    this.setupStdinBuffer();
    process.stdin.on("data", this.stdinDataHandler!);
    this.keyboardProtocolPushed = true;
    this.clearKeyboardProtocolNegotiationBuffer();
    process.stdout.write(KITTY_KEYBOARD_PROTOCOL_QUERY);
  }

  private handleKeyboardProtocolNegotiationSequence(
    negotiationSequence: KeyboardProtocolNegotiationSequence | undefined,
  ): boolean {
    if (!negotiationSequence) return false;
    this.clearKeyboardProtocolNegotiationBuffer();
    if (negotiationSequence.type === "kitty-flags") {
      if (negotiationSequence.flags !== 0) {
        this.disableModifyOtherKeys();
        if (!this._kittyProtocolActive) {
          this._kittyProtocolActive = true;
          setKittyProtocolActive(true);
        }
      } else {
        this.enableModifyOtherKeys();
      }
      return true;
    }

    if (!this._kittyProtocolActive) {
      this.enableModifyOtherKeys();
    }
    return true;
  }

  private readKeyboardProtocolNegotiationSequence(
    sequence: string,
  ): KeyboardProtocolNegotiationSequence | "pending" | undefined {
    if (this.keyboardProtocolNegotiationBuffer) {
      const bufferedSequence = this.keyboardProtocolNegotiationBuffer + sequence;
      const negotiationSequence = parseKeyboardProtocolNegotiationSequence(bufferedSequence);
      if (negotiationSequence) {
        this.clearKeyboardProtocolNegotiationBuffer();
        return negotiationSequence;
      }
      if (isKeyboardProtocolNegotiationSequencePrefix(bufferedSequence)) {
        this.setKeyboardProtocolNegotiationBuffer(bufferedSequence);
        return "pending";
      }
      this.flushKeyboardProtocolNegotiationBufferAsInput();
    }

    const negotiationSequence = parseKeyboardProtocolNegotiationSequence(sequence);
    if (negotiationSequence) return negotiationSequence;
    if (isKeyboardProtocolNegotiationSequencePrefix(sequence)) {
      this.setKeyboardProtocolNegotiationBuffer(sequence);
      return "pending";
    }
    return undefined;
  }

  private setKeyboardProtocolNegotiationBuffer(sequence: string): void {
    this.clearKeyboardProtocolNegotiationBufferFlushTimer();
    this.keyboardProtocolNegotiationBuffer = sequence;
  }

  private clearKeyboardProtocolNegotiationBuffer(): void {
    this.clearKeyboardProtocolNegotiationBufferFlushTimer();
    this.keyboardProtocolNegotiationBuffer = "";
  }

  private flushKeyboardProtocolNegotiationBufferAsInput(): void {
    if (!this.keyboardProtocolNegotiationBuffer) return;
    const sequence = this.keyboardProtocolNegotiationBuffer;
    this.clearKeyboardProtocolNegotiationBuffer();
    this.forwardInputSequence(sequence);
  }

  private scheduleKeyboardProtocolNegotiationBufferFlush(): void {
    if (!this.keyboardProtocolNegotiationBuffer || this.keyboardProtocolBufferFlushTimer) return;
    this.keyboardProtocolBufferFlushTimer = setTimeout(() => {
      this.keyboardProtocolBufferFlushTimer = undefined;
      this.flushKeyboardProtocolNegotiationBufferAsInput();
    }, KEYBOARD_PROTOCOL_RESPONSE_FRAGMENT_TIMEOUT_MS);
  }

  private clearKeyboardProtocolNegotiationBufferFlushTimer(): void {
    if (!this.keyboardProtocolBufferFlushTimer) return;
    clearTimeout(this.keyboardProtocolBufferFlushTimer);
    this.keyboardProtocolBufferFlushTimer = undefined;
  }

  private forwardInputSequence(sequence: string): void {
    if (!this.inputHandler) return;
    const isAppleTerminal = sequence === "\r" && isAppleTerminalSession();
    const input = normalizeAppleTerminalInput(
      sequence,
      isAppleTerminal,
      isAppleTerminal && isNativeModifierPressed("shift"),
    );
    this.inputHandler(input);
  }

  private enableModifyOtherKeys(): void {
    if (this._kittyProtocolActive || this._modifyOtherKeysActive) return;
    process.stdout.write("\x1b[>4;2m");
    this._modifyOtherKeysActive = true;
  }

  private disableModifyOtherKeys(): void {
    if (!this._modifyOtherKeysActive) return;
    process.stdout.write("\x1b[>4;0m");
    this._modifyOtherKeysActive = false;
  }

  // Without ENABLE_VIRTUAL_TERMINAL_INPUT, libuv drops modifiers and Shift+Tab is plain \t.
  private enableWindowsVTInput(): void {
    if (process.platform !== "win32") return;
    try {
      const arch = process.arch;
      if (arch !== "x64" && arch !== "arm64") return;

      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      const nativePath = path.join(
        "native",
        "win32",
        "prebuilds",
        `win32-${arch}`,
        "win32-console-mode.node",
      );
      const candidates = [
        path.join(moduleDir, "..", nativePath),
        path.join(moduleDir, nativePath),
        path.join(path.dirname(process.execPath), nativePath),
      ];
      for (const modulePath of candidates) {
        try {
          const helper = cjsRequire(modulePath) as { enableVirtualTerminalInput?: () => boolean };
          helper.enableVirtualTerminalInput?.();
          return;
        } catch {
          // Try the next packaging location.
        }
      }
    } catch {
      // Native helper not available — Shift+Tab won't be distinguishable from Tab.
    }
  }

  async drainInput(maxMs = 1000, idleMs = 50): Promise<void> {
    const shouldDisableKittyProtocol = this.keyboardProtocolPushed || this._kittyProtocolActive;
    this.clearKeyboardProtocolNegotiationBuffer();
    if (shouldDisableKittyProtocol) {
      // Disable Kitty first so late key releases emit no new escape sequences.
      process.stdout.write("\x1b[<u");
      this.keyboardProtocolPushed = false;
      this._kittyProtocolActive = false;
      setKittyProtocolActive(false);
    }
    this.disableModifyOtherKeys();

    const previousHandler = this.inputHandler;
    this.inputHandler = undefined;

    let lastDataTime = Date.now();
    const onData = () => {
      lastDataTime = Date.now();
    };

    process.stdin.on("data", onData);
    const endTime = Date.now() + maxMs;

    try {
      while (true) {
        const now = Date.now();
        const timeLeft = endTime - now;
        if (timeLeft <= 0) break;
        if (now - lastDataTime >= idleMs) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(idleMs, timeLeft)));
      }
    } finally {
      process.stdin.removeListener("data", onData);
      this.inputHandler = previousHandler;
    }
  }

  stop(): void {
    if (this.clearProgressInterval()) {
      process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
    }

    // Disable bracketed paste mode
    process.stdout.write("\x1b[?2004l");

    const shouldDisableKittyProtocol = this.keyboardProtocolPushed || this._kittyProtocolActive;
    this.clearKeyboardProtocolNegotiationBuffer();

    // Disable Kitty keyboard protocol if not already done by drainInput()
    if (shouldDisableKittyProtocol) {
      process.stdout.write("\x1b[<u");
      this.keyboardProtocolPushed = false;
      this._kittyProtocolActive = false;
      setKittyProtocolActive(false);
    }
    this.disableModifyOtherKeys();

    if (this.stdinBuffer) {
      this.stdinBuffer.destroy();
      this.stdinBuffer = undefined;
    }

    if (this.stdinDataHandler) {
      process.stdin.removeListener("data", this.stdinDataHandler);
      this.stdinDataHandler = undefined;
    }
    this.inputHandler = undefined;
    if (this.resizeHandler) {
      process.stdout.removeListener("resize", this.resizeHandler);
      this.resizeHandler = undefined;
    }

    // Pause stdin so buffered Ctrl+D isn't re-interpreted after raw mode ends.
    process.stdin.pause();

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(this.wasRaw);
    }
  }

  write(data: string): void {
    process.stdout.write(data);
    if (this.writeLogPath) {
      try {
        fs.appendFileSync(this.writeLogPath, data, { encoding: "utf8" });
      } catch {
        // Ignore logging errors
      }
    }
  }

  get columns(): number {
    return process.stdout.columns || Number(process.env.COLUMNS) || 80;
  }

  get rows(): number {
    return process.stdout.rows || Number(process.env.LINES) || 24;
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      process.stdout.write(`\x1b[${lines}B`);
    } else if (lines < 0) {
      process.stdout.write(`\x1b[${-lines}A`);
    }
  }

  hideCursor(): void {
    process.stdout.write("\x1b[?25l");
  }

  showCursor(): void {
    process.stdout.write("\x1b[?25h");
  }

  clearLine(): void {
    process.stdout.write("\x1b[K");
  }

  clearFromCursor(): void {
    process.stdout.write("\x1b[J");
  }

  clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H"); // Clear screen and move to home (1,1)
  }

  setTitle(title: string): void {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }

  setProgress(active: boolean): void {
    if (active) {
      process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
      if (!this.progressInterval) {
        this.progressInterval = setInterval(() => {
          process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
        }, TERMINAL_PROGRESS_KEEPALIVE_MS);
      }
    } else {
      this.clearProgressInterval();
      process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
    }
  }

  private clearProgressInterval(): boolean {
    if (!this.progressInterval) return false;
    clearInterval(this.progressInterval);
    this.progressInterval = undefined;
    return true;
  }
}
