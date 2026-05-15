import React from "react";
import { Text } from "ink";

interface AgentStatusProps {
  status: "idle" | "thinking" | "executing" | "error";
  observing: boolean;
  error: string | null;
  loadedSkills: Array<{ name: string; description: string }>;
  ready: boolean;
}

export function AgentStatus({ status, observing, error, loadedSkills, ready }: AgentStatusProps) {
  if (!ready) {
    return <Text dimColor>Agent not loaded (no API key?)</Text>;
  }

  const statusColor =
    status === "error" ? "red"
    : status === "thinking" || status === "executing" ? "yellow"
    : "green";

  const modeLabel = observing ? "observing" : "chat";
  const modeIcon = observing ? "👁" : "💬";

  return (
    <Text>
      <Text color={statusColor}>{modeIcon}</Text>
      {" "}Agent: {status} ({modeLabel})
      {" | "}Skills: {loadedSkills.length}
      {error ? <Text color="red"> | {error}</Text> : null}
    </Text>
  );
}
