import React from "react";
import { Text } from "ink";
import type { InteractionMode } from "../../agent/types.js";

interface AgentStatusProps {
  status: "idle" | "thinking" | "executing" | "error";
  mode: InteractionMode;
  error: string | null;
  loadedSkills: string[];
  ready: boolean;
}

export function AgentStatus({ status, mode, error, loadedSkills, ready }: AgentStatusProps) {
  if (!ready) {
    return (
      <Text dimColor>
        Agent not loaded (no API key?)
      </Text>
    );
  }

  const statusColor =
    status === "error" ? "red"
    : status === "thinking" ? "yellow"
    : status === "executing" ? "cyan"
    : "green";

  return (
    <Text>
      <Text color={statusColor}>●</Text>
      {" "}Agent: {status}
      {" | "}Mode: {mode === "dialogue" ? "💬" : "👁"}
      {" | "}Skills: {loadedSkills.length}
      {error ? (
        <Text color="red"> | {error}</Text>
      ) : null}
    </Text>
  );
}
