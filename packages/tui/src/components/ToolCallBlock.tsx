import React from "react";
import { Box, Text } from "ink";
import type { ToolCall } from "../types.js";

interface Props {
  toolCall: ToolCall;
}

function badge(status: ToolCall["status"]) {
  if (status === "ok") return <Text color="#00FF9F"> OK</Text>;
  if (status === "err") return <Text color="#FF4E6A"> ERR</Text>;
  return <Text color="#555566"> …</Text>;
}

export function ToolCallBlock({ toolCall }: Props) {
  const args = toolCall.args.length > 40 ? `${toolCall.args.slice(0, 40)}…` : toolCall.args;
  const detail = toolCall.summary ?? args;

  return (
    <Box>
      <Text color="#555566">│ </Text>
      <Text bold color="#DDDDEE">{toolCall.name}</Text>
      <Text color="#555566">  {detail}</Text>
      {badge(toolCall.status)}
    </Box>
  );
}
