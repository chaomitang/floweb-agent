import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../hooks/use-browser-state.js";

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingContent?: string;
  pendingMessage?: string | null;
}

function rolePrefix(role: ChatMessage["role"]): string {
  switch (role) {
    case "user":
      return "user";
    case "system":
      return "system";
    case "agent":
      return "agent";
    case "tool":
      return "···";
  }
}

export function ChatPanel({ messages, streamingContent, pendingMessage }: ChatPanelProps) {
  const chatMessages = messages;

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Chat</Text>
        <Text dimColor> ({chatMessages.length})</Text>
      </Box>
      {chatMessages.map((msg, i) => (
        <Box key={i} flexDirection="row">
          {msg.role === "user" && <Text color="green">[{rolePrefix(msg.role)}] </Text>}
          {msg.role === "system" && <Text dimColor>[{rolePrefix(msg.role)}] </Text>}
          {msg.role === "agent" && <Text color="yellow">[{rolePrefix(msg.role)}] </Text>}
          {msg.role === "tool" && <Text dimColor>[{rolePrefix(msg.role)}] </Text>}
          {msg.role === "tool" ? (
            <Text dimColor>{msg.content}</Text>
          ) : (
            <Text>{msg.content}</Text>
          )}
        </Box>
      ))}
      {streamingContent ? (
        <Box flexDirection="row">
          <Text color="yellow" dimColor>[agent] </Text>
          <Text dimColor>{streamingContent}</Text>
        </Box>
      ) : null}
      {pendingMessage ? (
        <Box flexDirection="row">
          <Text color="green" dimColor>[user] </Text>
          <Text dimColor>(pending) {pendingMessage}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
