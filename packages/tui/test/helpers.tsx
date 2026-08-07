import React from "react";
import { render } from "ink";
import { PassThrough } from "stream";

export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "");
}

function makeFakeStdin() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  const s = stdin as unknown as Record<string, unknown>;
  s.isTTY = true;
  s.setRawMode = () => stdin;
  s.ref = () => stdin;
  s.unref = () => stdin;
  return stdin;
}

function makeFakeStdout(output: PassThrough, columns = 200): NodeJS.WriteStream {
  const s = output as unknown as Record<string, unknown>;
  s.columns = columns;
  return output as unknown as NodeJS.WriteStream;
}

export function renderToString(node: React.ReactElement, waitMs = 50): Promise<string> {
  return renderToStringAtWidth(node, 200, waitMs);
}

export function renderToStringAtWidth(
  node: React.ReactElement,
  columns: number,
  waitMs = 50,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("error", reject);

    const { unmount } = render(node, {
      stdout: makeFakeStdout(output, columns),
      stdin: makeFakeStdin(),
      debug: true,
      patchConsole: false,
    });

    setTimeout(() => {
      unmount();
      resolve(stripAnsi(Buffer.concat(chunks).toString()));
    }, waitMs);
  });
}

export interface InteractiveHandle {
  /** Sends raw bytes to the fake stdin, as if typed/pasted by a user. */
  type: (input: string) => Promise<void>;
  /** Returns the most recently rendered frame, ANSI stripped. */
  frame: () => string;
  unmount: () => void;
}

export function renderInteractive(node: React.ReactElement): InteractiveHandle {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));

  const stdin = makeFakeStdin();
  const { unmount } = render(node, {
    stdout: makeFakeStdout(output),
    stdin,
    debug: true,
    patchConsole: false,
  });

  return {
    type: (input: string) =>
      new Promise((resolve) => {
        (stdin as unknown as PassThrough).write(Buffer.from(input));
        setTimeout(resolve, 20);
      }),
    frame: () => stripAnsi(chunks[chunks.length - 1]?.toString() ?? ""),
    unmount,
  };
}
