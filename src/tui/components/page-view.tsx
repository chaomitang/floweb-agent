import React from "react";
import { Box, Text } from "ink";
import type { PageInfo } from "../../core/types.js";

interface PageViewProps {
  activePage: PageInfo | null;
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
}

export function PageView({ activePage, sessionStatus }: PageViewProps) {
  if (!activePage) {
    let message: string;
    switch (sessionStatus) {
      case "disconnected":
        message = "No browser session active";
        break;
      case "connecting":
        message = "Connecting to browser...";
        break;
      case "error":
        message = "Browser session error";
        break;
      default:
        message = "No pages open";
    }

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
        <Text dimColor>{message}</Text>
      </Box>
    );
  }

  const statusText = sessionStatus === "connected" ? "active" : sessionStatus;

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
          Page: {activePage.url}
        </Text>
      </Box>
      <Box flexDirection="column" marginY={1}>
        <Text>Title: {activePage.title}</Text>
        <Text>URL: {activePage.url}</Text>
        <Text>
          Status: {statusText}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[No snapshot available yet]</Text>
      </Box>
    </Box>
  );
}
