import React from "react";
import { render } from "ink";
import { PassThrough } from "stream";

// Strip ANSI escape codes so assertions can match plain text
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "");
}

// Fake stdin that satisfies Ink's raw-mode check without a real TTY
function makeFakeStdin() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  const s = stdin as unknown as Record<string, unknown>;
  s.isTTY = true;
  s.setRawMode = () => stdin;
  s.ref = () => stdin;
  s.unref = () => stdin;
  return stdin;
}

export function renderToString(node: React.ReactElement, waitMs = 50): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("error", reject);

    const { unmount } = render(node, {
      stdout: output as unknown as NodeJS.WriteStream,
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
