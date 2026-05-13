import { useState, useCallback } from "react";
import type { PageInfo } from "../../core/types.js";

export interface ChatMessage {
  role: "user" | "system" | "agent";
  content: string;
  timestamp: string;
}

export interface BrowserState {
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  message: string;
  sessionName: string;
  messages: ChatMessage[];
  streamingContent: string;
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
        content: "Welcome to Flowweb! Type a command or URL to get started.",
        timestamp: new Date().toISOString(),
      },
    ],
    streamingContent: "",
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

  return {
    state,
    setState,
    setMessage,
    addMessage,
    setSessionStatus,
    setPages,
  };
}
