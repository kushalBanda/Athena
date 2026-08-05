import { Box, Static } from "ink";
import type { Message } from "../types.js";
import { MessageBubble } from "./MessageBubble.js";
import { ThinkingDot } from "./ThinkingDot.js";

interface Props {
  messages: Message[];
  thinking: boolean;
}

/**
 * Finalized messages are flushed once via <Static> so they land in the
 * terminal's real scrollback instead of being repainted (and clipped by the
 * fixed-height frame) on every streaming token — that repaint is what broke
 * manual scrolling while a response was still streaming in.
 */
export function ChatView({ messages, thinking }: Props) {
  const lastMessage = messages[messages.length - 1];
  const activeMessage = lastMessage?.streaming ? lastMessage : undefined;
  const settledMessages = activeMessage ? messages.slice(0, -1) : messages;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={settledMessages}>
        {(msg) => <MessageBubble key={msg.id} message={msg} />}
      </Static>
      {activeMessage && <MessageBubble key={activeMessage.id} message={activeMessage} />}
      {thinking && <ThinkingDot />}
    </Box>
  );
}
