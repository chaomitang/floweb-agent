import React from "react";
import { Box, Text } from "ink";
import type { FocusPanel } from "./layout.js";

interface StatusBarProps {
  focusPanel?: FocusPanel;
}

export function StatusBar({ focusPanel }: StatusBarProps) {
  return (
    <Box paddingX={1} flexDirection="row">
      <Text dimColor>Tab: {focusPanel === "chat" ? "Browser" : "Chat"}</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+1-9: tab</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+[/]: prev/next</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+W: close</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+T: mode</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Esc: quit</Text>
    </Box>
  );
}
