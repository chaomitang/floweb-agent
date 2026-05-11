import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  message: string;
  pageCount?: number;
  activeTabIndex?: number;
}

export function StatusBar({
  message,
  pageCount = 0,
  activeTabIndex = 0,
}: StatusBarProps) {
  return (
    <Box paddingX={1} flexDirection="row">
      <Text dimColor>{message}</Text>
      {pageCount > 0 && (
        <>
          <Text dimColor> | </Text>
          <Text dimColor>
            Tab {activeTabIndex}/{pageCount}
          </Text>
        </>
      )}
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+1-9: switch tab</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+[/]: prev/next</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Ctrl+W: close</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Esc: quit</Text>
    </Box>
  );
}
