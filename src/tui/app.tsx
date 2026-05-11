import React from "react";
import { useInput } from "ink";
import { Layout } from "./components/layout.js";
import { useBrowserState } from "./hooks/use-browser-state.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";
import type { FlowwebConfig } from "../core/config.js";

interface AppProps {
  config?: FlowwebConfig;
  socketPath?: string;
}

export function App({ config, socketPath }: AppProps) {
  const { state, setMessage, setPages, setSessionStatus } = useBrowserState();
  const clientRef = React.useRef<DaemonClient | null>(null);
  const pagesRef = React.useRef(state.pages);
  const activePageIdRef = React.useRef(state.activePageId);

  // Keep refs in sync with state for useInput closure
  pagesRef.current = state.pages;
  activePageIdRef.current = state.activePageId;

  // Connect to daemon on mount
  React.useEffect(() => {
    let mounted = true;
    const sp = socketPath ?? getDaemonSocketPath();

    const handlers: ClientApi = {
      pagesChanged(pages, activePageId) {
        if (!mounted) return;
        setPages(pages, activePageId);
        setMessage(`Pages: ${pages.length} | Active: ${activePageId ?? "none"}`);
      },
      sessionStatusChanged(status) {
        if (!mounted) return;
        setSessionStatus(status as "disconnected" | "connecting" | "connected" | "error");
      },
    };

    async function connect() {
      try {
        // Try connecting to an existing daemon first
        setSessionStatus("connecting", "Connecting to daemon...");
        const client = await DaemonClient.connect(sp, handlers);
        if (!mounted) {
          client.destroy();
          return;
        }
        clientRef.current = client;
        setSessionStatus("connected", "Connected to daemon");
      } catch {
        // No existing daemon — spawn a new one
        if (!mounted) return;
        if (!config) {
          setSessionStatus("error", "No config provided and no daemon running");
          return;
        }

        try {
          setSessionStatus("connecting", "Starting daemon...");
          const { client } = await DaemonClient.spawn(config, handlers);
          if (!mounted) {
            client.destroy();
            return;
          }
          clientRef.current = client;
          setSessionStatus("connected", "Daemon started");
        } catch (err) {
          if (!mounted) return;
          setSessionStatus("error", `Failed to start daemon: ${String(err)}`);
        }
      }
    }

    connect();

    return () => {
      mounted = false;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [config, socketPath, setPages, setMessage, setSessionStatus]);

  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
      return;
    }

    const client = clientRef.current;
    if (!client) return;

    // Ctrl+1-9: switch to page by index
    if (key.ctrl) {
      const numMatch = input.match(/^[1-9]$/);
      if (numMatch) {
        const index = parseInt(numMatch[0], 10) - 1;
        const pages = pagesRef.current;
        if (index < pages.length) {
          client.remote.switchToPage(pages[index].id);
        }
        return;
      }

      // Ctrl+[: previous page
      if (input === "[") {
        const pages = pagesRef.current;
        const activeId = activePageIdRef.current;
        if (pages.length > 1 && activeId) {
          const currentIndex = pages.findIndex((p) => p.id === activeId);
          const prevIndex = currentIndex <= 0 ? pages.length - 1 : currentIndex - 1;
          client.remote.switchToPage(pages[prevIndex].id);
        }
        return;
      }

      // Ctrl+]: next page
      if (input === "]") {
        const pages = pagesRef.current;
        const activeId = activePageIdRef.current;
        if (pages.length > 1 && activeId) {
          const currentIndex = pages.findIndex((p) => p.id === activeId);
          const nextIndex = currentIndex >= pages.length - 1 ? 0 : currentIndex + 1;
          client.remote.switchToPage(pages[nextIndex].id);
        }
        return;
      }

      // Ctrl+W: close current page
      if (input === "w") {
        const activeId = activePageIdRef.current;
        if (activeId) {
          client.remote.closePage(activeId);
        }
        return;
      }
    }
  });

  return (
    <Layout
      sessionStatus={state.sessionStatus}
      pages={state.pages}
      activePageId={state.activePageId}
      message={state.message}
      onSwitchPage={(pageId) => {
        clientRef.current?.remote.switchToPage(pageId);
      }}
    />
  );
}
