import React from "react";
import { Box } from "ink";
import { MessageBubble } from "./MessageBubble.js";
import { ThinkingDot } from "./ThinkingDot.js";
import type { Message } from "../types.js";

interface Props {
  messages: Message[];
  thinking: boolean;
}

export function ChatView({ messages, thinking }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {thinking && <ThinkingDot />}
    </Box>
  );
}
