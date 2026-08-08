import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface Props {
  title: string;
  mask?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextPrompt({ title, mask = false, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const handleSubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#00D9FF"
      paddingX={1}
      marginX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color="#00D9FF">
          {title}
        </Text>
      </Box>
      <Box>
        <Text>{"> "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          {...(mask ? { mask: "*" } : {})}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter submit · Esc cancel</Text>
      </Box>
    </Box>
  );
}
