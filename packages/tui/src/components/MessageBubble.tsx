import { Box, Text } from "ink";
import type { Message } from "../types.js";
import { Markdown } from "./Markdown.js";
import { ThinkingDot } from "./ThinkingDot.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  if (message.role === "system") {
    return (
      <Box marginBottom={1}>
        <Text color="#888899" dimColor>
          {"  "}
          {message.content}
        </Text>
      </Box>
    );
  }

  const label = message.role === "user" ? "you" : "athena";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="#00D9FF">
        {label}
      </Text>
      {message.content ? <Markdown content={message.content} /> : null}
      {message.toolCalls?.map((tc) => (
        <ToolCallBlock key={tc.id} toolCall={tc} />
      ))}
      {message.streaming && !message.content && <ThinkingDot />}
    </Box>
  );
}
