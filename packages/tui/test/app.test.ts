import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { TuiApp, type AgentCallbacks } from "../src/app.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

async function makeApp(): Promise<{
  app: TuiApp;
  terminal: VirtualTerminal;
  callbacks: AgentCallbacks;
}> {
  const terminal = new VirtualTerminal(80, 24);
  let callbacks!: AgentCallbacks;
  const app = new TuiApp({
    initialState: { cwd: "/tmp/project", model: "claude-sonnet-5" },
    terminal,
    onReady: (cb) => {
      callbacks = cb;
    },
  });
  void app.start();
  await terminal.waitForRender();
  return { app, terminal, callbacks };
}

function screenText(terminal: VirtualTerminal): string {
  return stripVTControlCharacters(terminal.getViewport().join("\n"));
}

describe("TuiApp", () => {
  it("shows the welcome screen before any messages exist", async () => {
    const { app, terminal } = await makeApp();
    assert.ok(screenText(terminal).includes("Welcome to Athena"));
    app.stop();
  });

  it("state transition: retrying status shows the retry indicator, ready clears it", async () => {
    const { app, terminal, callbacks } = await makeApp();

    callbacks.setStatus({
      kind: "retrying",
      attempt: 1,
      maxAttempts: 3,
      delayMs: 2000,
      reason: "rate limited",
    });
    await terminal.waitForRender();
    assert.ok(screenText(terminal).includes("rate limited"));

    callbacks.setStatus({ kind: "ready" });
    await terminal.waitForRender();
    assert.ok(!screenText(terminal).includes("rate limited"));

    app.stop();
  });

  it("appending a message replaces the welcome screen with the transcript", async () => {
    const { app, terminal, callbacks } = await makeApp();
    callbacks.addMessage({ id: "1", role: "user", content: "hello there" });
    await terminal.waitForRender();
    const text = screenText(terminal);
    assert.ok(text.includes("hello there"));
    assert.ok(!text.includes("Welcome to Athena"));
    app.stop();
  });

  it("renders a tool call with a diff via addMessage", async () => {
    const { app, terminal, callbacks } = await makeApp();
    callbacks.addMessage({
      id: "1",
      role: "assistant",
      toolCalls: [
        {
          id: "tc1",
          name: "write_file",
          args: "{}",
          status: "ok",
          diff: [
            { type: "add", text: "new line" },
            { type: "del", text: "old line" },
          ],
        },
      ],
    });
    await terminal.waitForRender();
    const text = screenText(terminal);
    assert.ok(text.includes("write_file"));
    assert.ok(text.includes("new line"));
    assert.ok(text.includes("old line"));
    app.stop();
  });
});
