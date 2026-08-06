import React, { type ReactNode } from "react";
import { Box, Static } from "ink";
import type { Message } from "../types.js";
import { MessageBubble } from "./MessageBubble.js";
import { ThinkingDot } from "./ThinkingDot.js";

interface Props {
  header: ReactNode;
  messages: Message[];
  thinking: boolean;
}

type StaticItem = { kind: "header" } | { kind: "message"; message: Message };

/**
 * Finalized messages (and the header) are flushed once via <Static> so they
 * land in the terminal's real scrollback instead of being repainted (and
 * clipped by the fixed-height frame) on every streaming token — that repaint
 * is what broke manual scrolling while a response was still streaming in.
 * The header is item zero so it stays pinned above the message log forever,
 * instead of being redrawn underneath it every frame.
 */
export function ChatView({ header, messages, thinking }: Props) {
  const lastMessage = messages[messages.length - 1];
  const activeMessage = lastMessage?.streaming ? lastMessage : undefined;
  const settledMessages = activeMessage ? messages.slice(0, -1) : messages;

  const staticItems: StaticItem[] = [
    { kind: "header" },
    ...settledMessages.map((message) => ({ kind: "message" as const, message })),
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={staticItems}>
        {(item) =>
          item.kind === "header" ? (
            <Box key="header" flexDirection="column">
              {header}
            </Box>
          ) : (
            <MessageBubble key={item.message.id} message={item.message} />
          )
        }
      </Static>
      {activeMessage && <MessageBubble key={activeMessage.id} message={activeMessage} />}
      {thinking && <ThinkingDot />}
    </Box>
  );
}
