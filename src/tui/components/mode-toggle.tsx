import React from "react";
import { Text } from "ink";
import type { InteractionMode } from "../../agent/types.js";

interface ModeToggleProps {
  mode: InteractionMode;
  onToggle: (mode: InteractionMode) => void;
  ready: boolean;
}

export function ModeToggle({ mode, onToggle, ready }: ModeToggleProps) {
  if (!ready) return null;

  return (
    <Text>
      Mode:{" "}
      <Text
        bold={mode === "dialogue"}
        color={mode === "dialogue" ? "green" : undefined}
      >
        dialogue
      </Text>
      {" / "}
      <Text
        bold={mode === "observation"}
        color={mode === "observation" ? "cyan" : undefined}
      >
        observation
      </Text>
      {" (Ctrl+T to toggle)"}
    </Text>
  );
}
