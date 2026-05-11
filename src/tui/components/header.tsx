import React from "react";
import { Box, Text } from "ink";

export function Header() {
  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      justifyContent="center"
    >
      <Text bold color="blue">
        Flowweb v0.1.0 -- TUI Browser Automation
      </Text>
    </Box>
  );
}
