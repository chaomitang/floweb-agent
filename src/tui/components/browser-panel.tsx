import React from "react";
import { Box, Text } from "ink";
import type { PageInfo } from "../../core/types.js";
import type { ActionLogEntry } from "../hooks/use-browser-state.js";

interface BrowserPanelProps {
  sessionName: string;
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  onSwitchPage: (pageId: string) => void;
  actionLog?: ActionLogEntry[];
  isFocused?: boolean;
}

function shortLabel(page: PageInfo): string {
  if (page.title && page.title !== "Loading...") {
    return page.title.length > 30 ? page.title.slice(0, 28) + "..." : page.title;
  }
  try {
    const host = new URL(page.url).hostname;
    return host.length > 30 ? host.slice(0, 28) + "..." : host;
  } catch {
    return page.url.length > 30 ? page.url.slice(0, 28) + "..." : page.url;
  }
}

function roleColor(role?: string): string | undefined {
  if (role === "agent") return "yellow";
  if (role === "user") return "green";
  return undefined;
}

function isResult(a: ActionLogEntry): boolean {
  return a.type === "snapshot" || a.type === "diff" || a.type === "exec" || a.type === "evaluate" || a.type === "observe" || a.type === "summary";
}

export function BrowserPanel({
  sessionName,
  sessionStatus,
  pages,
  activePageId,
  actionLog,
  isFocused,
}: BrowserPanelProps) {
  const activePage = pages.find((p) => p.id === activePageId) ?? null;
  const actions = actionLog ?? [];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Row 1: session + tabs */}
      <Box flexDirection="row">
        <Text bold color={isFocused ? "cyan" : undefined}>Browser</Text>
        <Text dimColor> [{sessionName}] [{sessionStatus}]</Text>
        <Text> Tabs ({pages.length}): </Text>
        {pages.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          <Text>
            {pages.map((p, i) => {
              const prefix = i > 0 ? " | " : "";
              const marker = p.id === activePageId ? "▶" : "";
              return `${prefix}${marker}${shortLabel(p)}`;
            })}
          </Text>
        )}
      </Box>

      {/* Row 2: active page info */}
      <Box flexDirection="row">
        <Text dimColor>Active: </Text>
        {activePage ? (
          <>
            <Text>{activePage.url}</Text>
            <Text dimColor> — </Text>
            <Text dimColor>{activePage.title || "Loading..."}</Text>
          </>
        ) : (
          <Text dimColor>No active page</Text>
        )}
      </Box>

      {/* Activity log */}
      {actions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>── Activity ({actions.length}) ──</Text>
          {actions.map((a, i) => {
            const lines = a.detail.split("\n");
            const color = roleColor(a.role);
            const result = isResult(a);
            const prefix = result ? "  " : actionPrefix(a);
            const contPad = " ".repeat(prefix.length);
            return (
              <Box key={i} flexDirection="column">
                {lines.map((line, j) => (
                  <Box key={j} flexDirection="row">
                    <Text color={color}>{j === 0 ? prefix : contPad}</Text>
                    <Text>{line.slice(0, 120)}</Text>
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}

function actionPrefix(a: ActionLogEntry): string {
  const role = a.role === "agent" ? "agent" : "user";
  const action = actionName(a.type);
  return `[${role}] ${action} `;
}

function actionName(type: ActionLogEntry["type"]): string {
  switch (type) {
    case "navigate": return "navigate";
    case "snapshot": return "snapshot";
    case "diff":     return "diff";
    case "click":    return "click";
    case "type":     return "type";
    case "press":    return "press";
    case "close":    return "close";
    case "switch":   return "switch";
    case "observe":  return "observe";
    case "evaluate": return "evaluate";
    case "exec":     return "exec";
    case "hover":    return "hover";
    case "scroll":   return "scroll";
    case "summary":  return "summary";
  }
}
