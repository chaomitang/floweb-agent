import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  sessionName?: string;
}

export function Header({ sessionName }: HeaderProps) {
  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      flexDirection="column"
    >
      <Box justifyContent="center">
        <Text bold color="blue">
          Floweb v0.1.0 -- TUI Browser Automation
        </Text>
      </Box>
      {sessionName && (
        <Box justifyContent="center">
          <Text dimColor>Session: {sessionName}</Text>
        </Box>
      )}
    </Box>
  );
}
