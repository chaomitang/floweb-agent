import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  sessionName?: string;
}

export function Header({ sessionName }: HeaderProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="center">
        <Text bold color="blue">
          Floweb v0.1.0 -- TUI Browser Automation
        </Text>
        {sessionName && (
          <Text dimColor>  Session: {sessionName}</Text>
        )}
      </Box>
    </Box>
  );
}
