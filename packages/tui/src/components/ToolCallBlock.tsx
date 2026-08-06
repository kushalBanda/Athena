import React from "react";
import { Box, Text } from "ink";
import type { DiffLine, ToolCall } from "../types.js";

interface Props {
  toolCall: ToolCall;
}

function badge(status: ToolCall["status"]) {
  if (status === "ok") return <Text color="#00FF9F"> OK</Text>;
  if (status === "err") return <Text color="#FF4E6A"> ERR</Text>;
  return <Text color="#555566"> …</Text>;
}

const DIFF_LINE_CAP = 6;

function diffLineColors(type: DiffLine["type"]): { gutter: string; text: string } {
  if (type === "add") return { gutter: "#00FF9F", text: "#DDDDEE" };
  if (type === "del") return { gutter: "#FF4E6A", text: "#555566" };
  return { gutter: "#555566", text: "#888899" };
}

function DiffBlock({ diff }: { diff: DiffLine[] }) {
  const shown = diff.slice(0, DIFF_LINE_CAP);
  const remaining = diff.length - shown.length;

  return (
    <Box flexDirection="column">
      {shown.map((line, i) => {
        const { gutter, text } = diffLineColors(line.type);
        return (
          <Box key={i}>
            <Text color="#555566">│ </Text>
            <Text color={gutter}>│ </Text>
            <Text color={text}>{line.text}</Text>
          </Box>
        );
      })}
      {remaining > 0 && (
        <Box>
          <Text color="#555566">│ </Text>
          <Text color="#444455">[+{remaining} more lines]</Text>
        </Box>
      )}
    </Box>
  );
}

export function ToolCallBlock({ toolCall }: Props) {
  const args = toolCall.args.length > 40 ? `${toolCall.args.slice(0, 40)}…` : toolCall.args;
  const detail = toolCall.summary ?? args;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="#555566">│ </Text>
        <Text bold color="#DDDDEE">{toolCall.name}</Text>
        <Text color="#555566">  {detail}</Text>
        {badge(toolCall.status)}
      </Box>
      {toolCall.diff && toolCall.diff.length > 0 && <DiffBlock diff={toolCall.diff} />}
    </Box>
  );
}
