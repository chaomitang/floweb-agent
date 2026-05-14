import React from "react";
import { Box } from "ink";
import { Header } from "./header.js";
import { ChatPanel } from "./chat-panel.js";
import { BrowserPanel } from "./browser-panel.js";
import { InputBar } from "./input-bar.js";
import { StatusBar } from "./status-bar.js";
import { AgentStatus } from "./agent-status.js";
import type { PageInfo } from "../../core/types.js";
import type { ActionLogEntry, ChatMessage } from "../hooks/use-browser-state.js";
export type FocusPanel = "chat" | "browser";

interface LayoutProps {
  sessionName: string;
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  messages: ChatMessage[];
  streamingContent?: string;
  pendingMessage?: string | null;
  actionLog?: ActionLogEntry[];
  focusPanel: FocusPanel;
  onSubmit: (text: string) => void;
  agentReady: boolean;
  agentStatus: "idle" | "thinking" | "executing" | "error";
  agentError: string | null;
  loadedSkills: Array<{ name: string; description: string }>;
  onSwitchPage: (pageId: string) => void;
}

export function Layout({
  sessionName,
  sessionStatus,
  pages,
  activePageId,
  messages,
  streamingContent,
  pendingMessage,
  actionLog,
  focusPanel,
  onSubmit,
  agentReady,
  agentStatus,
  agentError,
  loadedSkills,
  onSwitchPage,
}: LayoutProps) {
  return (
    <Box flexDirection="column">
      <Header sessionName={sessionName} />
      {focusPanel === "chat" ? (
        <ChatPanel
          messages={messages}
          streamingContent={streamingContent}
          pendingMessage={pendingMessage}
        />
      ) : (
        <BrowserPanel
          sessionName={sessionName}
          sessionStatus={sessionStatus}
          pages={pages}
          activePageId={activePageId}
          onSwitchPage={onSwitchPage}
          actionLog={actionLog}
          isFocused
        />
      )}
      <InputBar onSubmit={onSubmit} />
      <Box flexDirection="row" justifyContent="space-between">
        <StatusBar
          focusPanel={focusPanel}
          agentStatus={agentStatus}
          hasPending={pendingMessage != null}
        />
        <AgentStatus
          status={agentStatus}
          error={agentError}
          loadedSkills={loadedSkills}
          ready={agentReady}
        />
      </Box>
    </Box>
  );
}
