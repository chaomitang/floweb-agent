import React from "react";
import { Box, Text } from "ink";

export function MainArea() {
  return (
    <Box
      flexGrow={1}
      borderStyle="round"
      borderColor="green"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text bold color="green">
          Welcome to Flowweb!
        </Text>
      </Box>
      <Text>
        A TypeScript TUI browser automation tool. Use this interface to control
        Playwright browsers from your terminal.
      </Text>
    </Box>
  );
}
