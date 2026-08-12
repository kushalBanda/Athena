import type { Message } from "../app-types.ts";
import type { AthenaTheme } from "../theme.ts";
import type { Component, TUI } from "../tui.ts";
import { AssistantMessageComponent } from "./assistant-message.ts";
import { Markdown, type MarkdownTheme } from "./markdown.ts";
import { Spacer } from "./spacer.ts";
import { ToolCallComponent } from "./tool-call.ts";
import { UserMessageComponent } from "./user-message.ts";
import { VStack } from "./v-stack.ts";

const ROLE_LABEL: Record<"system", string> = {
  system: "System",
};

function formatPlainMessage(message: Message): string {
  // Timing messages ("Crunched for Ns") are a short status note, not a labeled section —
  // render the content as-is, no "**Timing:**" heading.
  if (message.role === "timing") return message.content ?? "";
  const parts = [`**${ROLE_LABEL.system}:**`];
  if (message.content) parts.push(message.content);
  return parts.join("\n\n");
}

interface AssistantEntry {
  kind: "assistant";
  component: AssistantMessageComponent | undefined;
}

interface PlainEntry {
  kind: "plain";
  component: Markdown;
}

interface UserEntry {
  kind: "user";
  component: UserMessageComponent;
}

type Entry = AssistantEntry | PlainEntry | UserEntry;

/**
 * Prints messages top-to-bottom with no internal scroll — under `TuiMainScreen`,
 * the real terminal's own scrollback is the only "scroll" this needs.
 *
 * Tool calls are tracked by *tool call id*, not by parent message id: the agent
 * loop reports a pending call and its result as two separate `Message`s (see
 * `cli/adapter.ts`'s `onToolCall`/`onToolResult`), so keying components by
 * message id would render two boxes per call instead of one that updates in
 * place — this is the fix for that.
 */
export class Transcript implements Component {
  private readonly stack: VStack;
  private readonly entries = new Map<string, Entry>();
  private readonly messages = new Map<string, Message>();
  private readonly toolCallComponents = new Map<string, ToolCallComponent>();
  private readonly markdownTheme: MarkdownTheme;
  private readonly athenaTheme: AthenaTheme;

  constructor(_ui: TUI, markdownTheme: MarkdownTheme, athenaTheme: AthenaTheme) {
    this.markdownTheme = markdownTheme;
    this.athenaTheme = athenaTheme;
    this.stack = new VStack([]);
  }

  setMessages(messages: Message[]): void {
    this.stack.clear();
    this.entries.clear();
    this.messages.clear();
    this.toolCallComponents.clear();
    for (const m of messages) this.appendMessage(m);
  }

  appendMessage(message: Message): void {
    this.messages.set(message.id, message);

    if (message.role === "user") {
      const component = new UserMessageComponent(
        message.content ?? "",
        this.markdownTheme,
        this.athenaTheme,
      );
      this.entries.set(message.id, { kind: "user", component });
      this.stack.addChild(component);
      return;
    }

    if (message.role === "assistant") {
      const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
      let component: AssistantMessageComponent | undefined;
      if (message.content) {
        component = new AssistantMessageComponent(
          message.content,
          this.markdownTheme,
          hasToolCalls,
        );
        this.stack.addChild(component);
      }
      this.entries.set(message.id, { kind: "assistant", component });
      this.upsertToolCalls(message);
      return;
    }

    // Two blank lines between the preceding result and "Crunched for Ns" — spacing below
    // it stays whatever the next message naturally adds, untouched.
    if (message.role === "timing") this.stack.addChild(new Spacer(2));
    const component = new Markdown(formatPlainMessage(message), 0, 0, this.markdownTheme);
    this.entries.set(message.id, { kind: "plain", component });
    this.stack.addChild(component);
  }

  updateMessage(id: string, patch: Partial<Omit<Message, "id">>): void {
    const entry = this.entries.get(id);
    const prior = this.messages.get(id);
    if (!entry || !prior) return;
    const merged: Message = { ...prior, ...patch, id };
    this.messages.set(id, merged);

    if (entry.kind === "user") {
      // User messages aren't streamed/edited today; rebuild is the simplest correct path
      // if that ever changes (avoids UserMessageComponent needing a setText method for
      // a case that doesn't occur in practice).
      return;
    }

    if (entry.kind === "assistant") {
      const hasToolCalls = (merged.toolCalls?.length ?? 0) > 0;
      if (merged.content) {
        if (entry.component) {
          entry.component.setText(merged.content, hasToolCalls);
        } else {
          const component = new AssistantMessageComponent(
            merged.content,
            this.markdownTheme,
            hasToolCalls,
          );
          entry.component = component;
          this.stack.addChild(component);
        }
      }
      this.upsertToolCalls(merged);
      return;
    }

    entry.component.setText(formatPlainMessage(merged));
  }

  /** Creates or updates one `ToolCallComponent` per tool call id, never duplicating a box. */
  private upsertToolCalls(message: Message): void {
    for (const call of message.toolCalls ?? []) {
      const existing = this.toolCallComponents.get(call.id);
      if (existing) {
        existing.update(call, this.athenaTheme);
      } else {
        const component = new ToolCallComponent(call, this.markdownTheme, this.athenaTheme);
        this.toolCallComponents.set(call.id, component);
        this.stack.addChild(component);
      }
    }
  }

  render(width: number): string[] {
    return this.stack.render(width);
  }

  invalidate(): void {
    this.stack.invalidate?.();
  }
}
