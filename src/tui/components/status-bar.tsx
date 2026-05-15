import React from "react";
import { Box, Text } from "ink";
import type { FocusPanel } from "./layout.js";

interface StatusBarProps {
  focusPanel?: FocusPanel;
  agentStatus?: "idle" | "thinking" | "executing" | "error";
  hasPending?: boolean;
}

function escHint(agentStatus?: string, hasPending?: boolean): string {
  if (hasPending) return "Esc: cancel pending";
  if (agentStatus === "thinking" || agentStatus === "executing") return "Esc: interrupt";
  return "";
}

export function StatusBar({ focusPanel, agentStatus, hasPending }: StatusBarProps) {
  const esc = escHint(agentStatus, hasPending);

  return (
    <Box paddingX={1} flexDirection="row">
      <Text dimColor>Tab: {focusPanel === "chat" ? "Browser" : "Chat"}</Text>
      {esc ? (
        <>
          <Text dimColor> | </Text>
          <Text dimColor>{esc}</Text>
        </>
      ) : null}
    </Box>
  );
}
