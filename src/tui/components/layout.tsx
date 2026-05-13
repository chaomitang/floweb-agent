import React from "react";
import { Box } from "ink";
import { Header } from "./header.js";
import { ChatPanel } from "./chat-panel.js";
import { BrowserPanel } from "./browser-panel.js";
import { InputBar } from "./input-bar.js";
import { StatusBar } from "./status-bar.js";
import { AgentStatus } from "./agent-status.js";
import type { PageInfo } from "../../core/types.js";
import type { ChatMessage } from "../hooks/use-browser-state.js";
import type { InteractionMode } from "../../agent/types.js";

export type FocusPanel = "chat" | "browser";

interface LayoutProps {
  sessionName: string;
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  messages: ChatMessage[];
  streamingContent?: string;
  focusPanel: FocusPanel;
  onSubmit: (text: string) => void;
  agentReady: boolean;
  agentStatus: "idle" | "thinking" | "executing" | "error";
  agentMode: InteractionMode;
  agentError: string | null;
  loadedSkills: string[];
  onSwitchPage: (pageId: string) => void;
}

export function Layout({
  sessionName,
  sessionStatus,
  pages,
  activePageId,
  messages,
  streamingContent,
  focusPanel,
  onSubmit,
  agentReady,
  agentStatus,
  agentMode,
  agentError,
  loadedSkills,
  onSwitchPage,
}: LayoutProps) {
  return (
    <Box flexDirection="column">
      <Header sessionName={sessionName} />
      {focusPanel === "chat" ? (
        <ChatPanel messages={messages} streamingContent={streamingContent} />
      ) : (
        <BrowserPanel
          sessionName={sessionName}
          sessionStatus={sessionStatus}
          pages={pages}
          activePageId={activePageId}
          onSwitchPage={onSwitchPage}
          isFocused
        />
      )}
      <InputBar onSubmit={onSubmit} />
      <Box flexDirection="row" justifyContent="space-between">
        <StatusBar focusPanel={focusPanel} />
        <AgentStatus
          status={agentStatus}
          mode={agentMode}
          error={agentError}
          loadedSkills={loadedSkills}
          ready={agentReady}
        />
      </Box>
    </Box>
  );
}
