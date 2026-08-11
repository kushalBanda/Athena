import type { Component, TUI } from "../tui.ts";
import type { DiffLine, Message, ToolCall } from "../app-types.ts";
import { Markdown, type MarkdownTheme } from "./markdown.ts";
import { ScrollView } from "./scroll-view.ts";
import { VStack } from "./v-stack.ts";

const DIFF_LINE_CAP = 6;

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "You",
  assistant: "Athena",
  system: "System",
  timing: "Timing",
};

const STATUS_BADGE: Record<ToolCall["status"], string> = {
  pending: "⏳",
  ok: "✓",
  err: "✗",
};

function diffPrefix(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

function formatToolCall(call: ToolCall): string {
  const lines = [
    `${STATUS_BADGE[call.status]} \`${call.name}\`${call.summary ? ` — ${call.summary}` : ""}`,
  ];
  if (call.diff && call.diff.length > 0) {
    const capped = call.diff.slice(0, DIFF_LINE_CAP);
    const diffText = capped.map((d) => `${diffPrefix(d.type)}${d.text}`).join("\n");
    lines.push("```diff", diffText, "```");
    if (call.diff.length > DIFF_LINE_CAP) {
      lines.push(`_…${call.diff.length - DIFF_LINE_CAP} more lines_`);
    }
  }
  return lines.join("\n");
}

function formatMessage(message: Message): string {
  const parts = [`**${ROLE_LABEL[message.role]}:**`];
  if (message.content) parts.push(message.content);
  for (const call of message.toolCalls ?? []) parts.push(formatToolCall(call));
  return parts.join("\n\n");
}

export class Transcript implements Component {
  private readonly stack: VStack;
  private readonly scrollView: ScrollView;
  private readonly blocks = new Map<string, Markdown>();
  private readonly messages = new Map<string, Message>();
  private readonly theme: MarkdownTheme;

  constructor(_ui: TUI, theme: MarkdownTheme) {
    this.theme = theme;
    this.stack = new VStack([]);
    this.scrollView = new ScrollView(this.stack);
  }

  setMessages(messages: Message[]): void {
    this.stack.clear();
    this.blocks.clear();
    this.messages.clear();
    for (const m of messages) this.appendMessage(m);
  }

  appendMessage(message: Message): void {
    this.messages.set(message.id, message);
    const block = new Markdown(formatMessage(message), 0, 0, this.theme);
    this.blocks.set(message.id, block);
    this.stack.addChild(block);
  }

  updateMessage(id: string, patch: Partial<Omit<Message, "id">>): void {
    const block = this.blocks.get(id);
    const prior = this.messages.get(id);
    if (!block || !prior) return;
    const merged: Message = { ...prior, ...patch, id };
    this.messages.set(id, merged);
    block.setText(formatMessage(merged));
  }

  render(width: number): string[] {
    return this.scrollView.render(width);
  }

  invalidate(): void {
    this.scrollView.invalidate();
  }

  scrollToEnd(): void {
    this.scrollView.scrollToEnd();
  }
}
