import { Box, Text } from "ink";
import type { Message } from "../types.js";
import { Markdown } from "./Markdown.js";
import { ThinkingDot } from "./ThinkingDot.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

interface Props {
  message: Message;
}

const COLORS = {
  marker: "#DDDDEE",
  muted: "#888899",
} as const;

export function MessageBubble({ message }: Props) {
  if (message.role === "system") {
    return (
      <Box marginBottom={1}>
        <Text color={COLORS.muted} dimColor>
          {"  "}
          {message.content}
        </Text>
      </Box>
    );
  }

  if (message.role === "timing") {
    return (
      <Box marginBottom={1}>
        <Text color={COLORS.muted}>* {message.content}</Text>
      </Box>
    );
  }

  const marker = message.role === "user" ? ">" : "●";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={COLORS.marker}>{marker} </Text>
        <Box flexGrow={1} flexDirection="column">
          {message.content ? <Markdown content={message.content} /> : null}
          {message.streaming && !message.content && <ThinkingDot />}
        </Box>
      </Box>
      {message.toolCalls?.map((tc) => (
        <ToolCallBlock key={tc.id} toolCall={tc} />
      ))}
    </Box>
  );
}
