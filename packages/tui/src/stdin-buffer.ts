import { EventEmitter } from "events";

const ESC = "\x1b";
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

function isCompleteSequence(data: string): "complete" | "incomplete" | "not-escape" {
  if (!data.startsWith(ESC)) {
    return "not-escape";
  }

  if (data.length === 1) {
    return "incomplete";
  }

  const afterEsc = data.slice(1);

  if (afterEsc.startsWith("[")) {
    if (afterEsc.startsWith("[M")) {
      return data.length >= 6 ? "complete" : "incomplete";
    }
    return isCompleteCsiSequence(data);
  }

  if (afterEsc.startsWith("]")) {
    return isCompleteOscSequence(data);
  }

  if (afterEsc.startsWith("P")) {
    return isCompleteDcsSequence(data);
  }

  if (afterEsc.startsWith("_")) {
    return isCompleteApcSequence(data);
  }

  if (afterEsc.startsWith("O")) {
    return afterEsc.length >= 2 ? "complete" : "incomplete";
  }

  if (afterEsc.length === 1) {
    return "complete";
  }

  return "complete";
}

function isCompleteCsiSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}[`)) {
    return "complete";
  }

  if (data.length < 3) {
    return "incomplete";
  }

  const payload = data.slice(2);

  const lastChar = payload[payload.length - 1]!;
  const lastCharCode = lastChar.charCodeAt(0);

  if (lastCharCode >= 0x40 && lastCharCode <= 0x7e) {
    if (payload.startsWith("<")) {
      const mouseMatch = /^<\d+;\d+;\d+[Mm]$/.test(payload);
      if (mouseMatch) {
        return "complete";
      }
      if (lastChar === "M" || lastChar === "m") {
        const parts = payload.slice(1, -1).split(";");
        if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
          return "complete";
        }
      }

      return "incomplete";
    }

    return "complete";
  }

  return "incomplete";
}

/** OSC sequences: ESC ] ... ST (ESC \ or BEL). */
function isCompleteOscSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}]`)) {
    return "complete";
  }

  if (data.endsWith(`${ESC}\\`) || data.endsWith("\x07")) {
    return "complete";
  }

  return "incomplete";
}

/** DCS sequences: ESC P ... ESC \ (e.g. XTVersion responses). */
function isCompleteDcsSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}P`)) {
    return "complete";
  }

  if (data.endsWith(`${ESC}\\`)) {
    return "complete";
  }

  return "incomplete";
}

/** APC sequences: ESC _ ... ESC \ (e.g. Kitty graphics responses). */
function isCompleteApcSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}_`)) {
    return "complete";
  }

  if (data.endsWith(`${ESC}\\`)) {
    return "complete";
  }

  return "incomplete";
}

function parseUnmodifiedKittyPrintableCodepoint(sequence: string): number | undefined {
  const match = sequence.match(/^\x1b\[(\d+)(?::\d*)?(?::\d+)?u$/);
  if (!match) return undefined;

  const codepoint = parseInt(match[1]!, 10);
  return codepoint >= 32 ? codepoint : undefined;
}

function extractCompleteSequences(buffer: string): { sequences: string[]; remainder: string } {
  const sequences: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    const remaining = buffer.slice(pos);

    if (remaining.startsWith(ESC)) {
      let seqEnd = 1;
      while (seqEnd <= remaining.length) {
        const candidate = remaining.slice(0, seqEnd);
        const status = isCompleteSequence(candidate);

        if (status === "complete") {
          // WezTerm sends ESC press as raw '\x1b' + release as CSI-u, concatenated.
          // Emit only the first ESC so the rest isn't mistaken for plain text.
          if (candidate === "\x1b\x1b") {
            const nextChar = remaining[seqEnd];
            if (
              nextChar === "[" || // CSI
              nextChar === "]" || // OSC
              nextChar === "O" || // SS3
              nextChar === "P" || // DCS
              nextChar === "_" // APC
            ) {
              sequences.push(ESC);
              pos += 1;
              break;
            }
          }
          sequences.push(candidate);
          pos += seqEnd;
          break;
        } else if (status === "incomplete") {
          seqEnd++;
        } else {
          sequences.push(candidate);
          pos += seqEnd;
          break;
        }
      }

      if (seqEnd > remaining.length) {
        return { sequences, remainder: remaining };
      }
    } else {
      sequences.push(remaining[0]!);
      pos++;
    }
  }

  return { sequences, remainder: "" };
}

export type StdinBufferOptions = {
  /** Max wait for sequence completion before flushing incomplete (default 10ms). */
  timeout?: number;
};

export type StdinBufferEventMap = {
  data: [string];
  paste: [string];
};

/** Buffers stdin, emitting complete sequences; handles escapes split across chunks. */
export class StdinBuffer extends EventEmitter<StdinBufferEventMap> {
  private buffer: string = "";
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;
  private pasteMode: boolean = false;
  private pasteBuffer: string = "";
  private pendingKittyPrintableCodepoint: number | undefined;

  constructor(options: StdinBufferOptions = {}) {
    super();
    this.timeoutMs = options.timeout ?? 10;
  }

  public process(data: string | Buffer): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    // Single byte > 127 becomes ESC + (byte - 128), for parseKeypress compatibility.
    let str: string;
    if (Buffer.isBuffer(data)) {
      if (data.length === 1 && data[0]! > 127) {
        const byte = data[0]! - 128;
        str = `\x1b${String.fromCharCode(byte)}`;
      } else {
        str = data.toString();
      }
    } else {
      str = data;
    }

    if (str.length === 0 && this.buffer.length === 0) {
      this.emitDataSequence("");
      return;
    }

    this.buffer += str;

    if (this.pasteMode) {
      this.pasteBuffer += this.buffer;
      this.buffer = "";

      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);

        this.pasteMode = false;
        this.pasteBuffer = "";
        this.pendingKittyPrintableCodepoint = undefined;

        this.emit("paste", pastedContent);

        if (remaining.length > 0) {
          this.process(remaining);
        }
      }
      return;
    }

    const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START);
    if (startIndex !== -1) {
      if (startIndex > 0) {
        const beforePaste = this.buffer.slice(0, startIndex);
        const result = extractCompleteSequences(beforePaste);
        for (const sequence of result.sequences) {
          this.emitDataSequence(sequence);
        }
      }

      this.pendingKittyPrintableCodepoint = undefined;
      this.buffer = this.buffer.slice(startIndex + BRACKETED_PASTE_START.length);
      this.pasteMode = true;
      this.pasteBuffer = this.buffer;
      this.buffer = "";

      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);

        this.pasteMode = false;
        this.pasteBuffer = "";
        this.pendingKittyPrintableCodepoint = undefined;

        this.emit("paste", pastedContent);

        if (remaining.length > 0) {
          this.process(remaining);
        }
      }
      return;
    }

    const result = extractCompleteSequences(this.buffer);
    this.buffer = result.remainder;

    for (const sequence of result.sequences) {
      this.emitDataSequence(sequence);
    }

    if (this.buffer.length > 0) {
      this.timeout = setTimeout(() => {
        const flushed = this.flush();

        for (const sequence of flushed) {
          this.emitDataSequence(sequence);
        }
      }, this.timeoutMs);
    }
  }

  private emitDataSequence(sequence: string): void {
    const rawCodepoint = sequence.length === 1 ? sequence.codePointAt(0) : undefined;
    if (rawCodepoint !== undefined && rawCodepoint === this.pendingKittyPrintableCodepoint) {
      this.pendingKittyPrintableCodepoint = undefined;
      return;
    }

    this.pendingKittyPrintableCodepoint = parseUnmodifiedKittyPrintableCodepoint(sequence);
    this.emit("data", sequence);
  }

  flush(): string[] {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length === 0) {
      return [];
    }

    const sequences = [this.buffer];
    this.buffer = "";
    this.pendingKittyPrintableCodepoint = undefined;
    return sequences;
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.buffer = "";
    this.pasteMode = false;
    this.pasteBuffer = "";
    this.pendingKittyPrintableCodepoint = undefined;
  }

  getBuffer(): string {
    return this.buffer;
  }

  destroy(): void {
    this.clear();
  }
}
