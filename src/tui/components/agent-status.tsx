import React from "react";
import { Text } from "ink";

interface AgentStatusProps {
  status: "idle" | "thinking" | "executing" | "error";
  error: string | null;
  loadedSkills: Array<{ name: string; description: string }>;
  ready: boolean;
}

export function AgentStatus({ status, error, loadedSkills, ready }: AgentStatusProps) {
  if (!ready) {
    return <Text dimColor>Agent not loaded (no API key?)</Text>;
  }

  const statusColor =
    status === "error" ? "red"
    : status === "thinking" ? "yellow"
    : "green";

  return (
    <Text>
      <Text color={statusColor}>●</Text>
      {" "}Agent: {status}
      {" | "}Skills: {loadedSkills.length}
      {error ? <Text color="red"> | {error}</Text> : null}
    </Text>
  );
}
