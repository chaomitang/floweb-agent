import React, { useState, useCallback } from "react";
import { Box, Text, useWindowSize } from "ink";
import TextInput from "ink-text-input";

interface InputBarProps {
  onSubmit: (text: string) => void;
}

export function InputBar({ onSubmit }: InputBarProps) {
  const { columns } = useWindowSize();
  const width = columns || 80;
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
      setValue("");
    },
    [onSubmit],
  );

  return (
    <Box flexDirection="column">
      <Text color="cyan">{"─".repeat(width)}</Text>
      <Box height={1} alignItems="center">
        <Text color="green">{"> "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          focus={true}
          showCursor={true}
          placeholder="Type a command or message..."
        />
      </Box>
      <Text color="cyan">{"─".repeat(width)}</Text>
    </Box>
  );
}
