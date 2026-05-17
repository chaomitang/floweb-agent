import { useState, useCallback } from "react";
import type { PageInfo } from "@/core/types.js";

export interface ChatMessage {
  role: "user" | "system" | "agent" | "tool";
  content: string;
  timestamp: string;
}

export interface ActionLogEntry {
  type: "navigate" | "snapshot" | "diff" | "click" | "type" | "press" | "close" | "switch" | "observe" | "evaluate" | "exec" | "hover" | "scroll" | "summary";
  detail: string;
  timestamp: string;
  role?: "user" | "agent";
}

export interface BrowserState {
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  message: string;
  sessionName: string;
  messages: ChatMessage[];
  streamingContent: string;
  pendingMessage: string | null;
  actionLog: ActionLogEntry[];
}

export function useBrowserState() {
  const [state, setState] = useState<BrowserState>({
    sessionStatus: "disconnected",
    pages: [],
    activePageId: null,
    message: "Ready",
    sessionName: "default",
    messages: [
      {
        role: "system",
        content: "Welcome to Floweb! Type a command or URL to get started.",
        timestamp: new Date().toISOString(),
      },
    ],
    streamingContent: "",
    pendingMessage: null,
    actionLog: [],
  });

  const setMessage = useCallback((message: string) => {
    setState((prev) => ({ ...prev, message }));
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "timestamp">) => {
    setState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { ...msg, timestamp: new Date().toISOString() },
      ],
    }));
  }, []);

  const addAction = useCallback((action: Omit<ActionLogEntry, "timestamp">) => {
    setState((prev) => ({
      ...prev,
      actionLog: [
        ...prev.actionLog.slice(-299),
        { ...action, timestamp: new Date().toISOString() },
      ],
    }));
  }, []);

  const setSessionStatus = useCallback(
    (sessionStatus: BrowserState["sessionStatus"], message?: string) => {
      setState((prev) => ({
        ...prev,
        sessionStatus,
        message: message ?? prev.message,
      }));
    },
    [],
  );

  const setPages = useCallback((pages: PageInfo[], activePageId: string | null) => {
    setState((prev) => ({
      ...prev,
      pages,
      activePageId,
      sessionStatus: pages.length > 0 ? "connected" : prev.sessionStatus,
    }));
  }, []);

  const setPendingMessage = useCallback((pendingMessage: string | null) => {
    setState((prev) => ({ ...prev, pendingMessage }));
  }, []);

  return {
    state,
    setState,
    setMessage,
    addMessage,
    addAction,
    setSessionStatus,
    setPages,
    setPendingMessage,
  };
}
