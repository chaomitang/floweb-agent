import { useState, useCallback } from "react";
import type { PageInfo } from "../../core/types.js";

export interface BrowserState {
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  message: string;
}

export function useBrowserState() {
  const [state, setState] = useState<BrowserState>({
    sessionStatus: "disconnected",
    pages: [],
    activePageId: null,
    message: "Ready",
  });

  const setMessage = useCallback((message: string) => {
    setState((prev) => ({ ...prev, message }));
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
    setSessionStatus,
    setPages,
  };
}
