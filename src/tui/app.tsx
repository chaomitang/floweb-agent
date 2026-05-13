import React from "react";
import { useInput } from "ink";
import { Layout } from "./components/layout.js";
import type { FocusPanel } from "./components/layout.js";
import { useBrowserState } from "./hooks/use-browser-state.js";
import { createCommandExecutor } from "./hooks/use-command-input.js";
import { useAgent } from "./hooks/use-agent.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";
import type { FlowwebConfig } from "../core/config.js";
import { getConfigPath } from "../core/config.js";

interface AppProps {
  config?: FlowwebConfig;
  socketPath?: string;
  initialUrl?: string;
  sessionName?: string;
}

export function App({ config, socketPath, initialUrl, sessionName }: AppProps) {
  const { state, setMessage, setPages, setSessionStatus, setState, addMessage } =
    useBrowserState();
  const agent = useAgent();
  const agentRef = React.useRef(agent);
  agentRef.current = agent;

  const clientRef = React.useRef<DaemonClient | null>(null);
  const [focusPanel, setFocusPanel] = React.useState<FocusPanel>("chat");
  const pagesRef = React.useRef(state.pages);
  const activePageIdRef = React.useRef(state.activePageId);

  const executeCommand = createCommandExecutor(clientRef, setMessage, addMessage, agentRef);

  const handleSubmit = React.useCallback(
    (text: string) => {
      addMessage({ role: "user", content: text });
      executeCommand(text);
    },
    [addMessage, executeCommand],
  );

  pagesRef.current = state.pages;
  activePageIdRef.current = state.activePageId;

  const observeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageSnapshotRef = React.useRef<string>("");

  React.useEffect(() => {
    let mounted = true;
    const sp = socketPath ?? getDaemonSocketPath();

    const handlers: ClientApi = {
      pagesChanged(pages, activePageId) {
        if (!mounted) return;
        setPages(pages, activePageId);
        addMessage({
          role: "system",
          content: `Pages: ${pages.length} | Active: ${activePageId ?? "none"}`,
        });

        const ag = agentRef.current;
        if (ag && ag.isReady() && ag.state.mode === "observation" && pages.length > 0) {
          const snapshot = JSON.stringify({ pages, activePageId });
          if (snapshot === lastPageSnapshotRef.current) return;
          lastPageSnapshotRef.current = snapshot;

          if (observeTimerRef.current) clearTimeout(observeTimerRef.current);
          observeTimerRef.current = setTimeout(async () => {
            if (!mounted) return;
            try {
              let response = "";
              for await (const token of ag.observe({ pages, activePageId })) {
                response += token;
                setState((prev) => ({ ...prev, streamingContent: response }));
              }
              if (response.trim()) {
                addMessage({ role: "agent", content: response.trim() });
              }
              setState((prev) => ({ ...prev, streamingContent: "" }));
            } catch {
              setState((prev) => ({ ...prev, streamingContent: "" }));
            }
          }, 1000);
        }
      },
      sessionStatusChanged(status) {
        if (!mounted) return;
        setSessionStatus(status as "disconnected" | "connecting" | "connected" | "error");
      },
    };

    async function connect() {
      let client: DaemonClient;

      try {
        addMessage({ role: "system", content: `Config: ${getConfigPath()}` });
        setSessionStatus("connecting", "Connecting to daemon...");
        addMessage({ role: "system", content: "Connecting to daemon..." });
        client = await DaemonClient.connect(sp, handlers);
        if (!mounted) { client.destroy(); return; }
        clientRef.current = client;
        setSessionStatus("connected", "Connected to daemon");
        addMessage({ role: "system", content: "Connected to daemon" });
      } catch {
        if (!mounted) return;
        if (!config) {
          setSessionStatus("error", "No config provided and no daemon running");
          addMessage({ role: "system", content: "No config provided and no daemon running" });
          return;
        }
        try {
          setSessionStatus("connecting", "Starting daemon...");
          addMessage({ role: "system", content: "Starting daemon..." });
          const spawned = await DaemonClient.spawn(config, handlers);
          if (!mounted) { spawned.client.destroy(); return; }
          client = spawned.client;
          clientRef.current = client;
          setSessionStatus("connected", "Daemon started");
          addMessage({ role: "system", content: "Daemon started" });
        } catch (err) {
          if (!mounted) return;
          setSessionStatus("error", `Failed to start daemon: ${String(err)}`);
          addMessage({ role: "system", content: `Failed to start daemon: ${String(err)}` });
          return;
        }
      }

      if (mounted && config) {
        const agentConfig = config.llm;
        try {
          await agentRef.current.init(client, {
            model: agentConfig.model,
            apiKey: agentConfig.apiKey,
            baseUrl: agentConfig.baseUrl,
            skillsDir: agentConfig.skillsDir,
            specsDir: agentConfig.specsDir,
            interactionMode: agentConfig.interactionMode,
          });
          addMessage({
            role: "system",
            content: `Agent ready. ${agentRef.current.state.loadedSkills.length} skills, ${agentRef.current.state.availableTools.length} tools.`,
          });
        } catch (err) {
          addMessage({
            role: "system",
            content: `Agent init skipped (no API key?): ${String(err)}`,
          });
        }
      }

      if (initialUrl && mounted) {
        try {
          const pages = await client.remote.getPages();
          if (pages.length === 0) {
            addMessage({ role: "system", content: `Opening ${initialUrl}...` });
            await client.remote.createSession(initialUrl);
          }
        } catch (err) {
          setSessionStatus("error", `Failed to open ${initialUrl}: ${String(err)}`);
          addMessage({ role: "system", content: `Failed to open ${initialUrl}: ${String(err)}` });
        }
      }

      if (mounted) {
        try {
          const daemonSessionName = await client.remote.getSessionName();
          setState((prev) => ({ ...prev, sessionName: daemonSessionName }));
          if (sessionName && daemonSessionName !== sessionName) {
            addMessage({
              role: "system",
              content: `Warning: daemon is running session "${daemonSessionName}" but you requested "${sessionName}". Restart to switch.`,
            });
          }
        } catch {
          // getSessionName not supported by older daemon, ignore
        }
      }
    }

    connect();

    return () => {
      mounted = false;
      if (observeTimerRef.current) clearTimeout(observeTimerRef.current);
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [config, socketPath, initialUrl, setPages, setMessage, setSessionStatus, addMessage]);

  useInput((_input, key) => {
    if (key.tab) {
      setFocusPanel((prev) => (prev === "chat" ? "browser" : "chat"));
      return;
    }

    if (key.escape) {
      process.exit(0);
    }

    const client = clientRef.current;

    if (key.ctrl && (_input === "t" || _input === "T")) {
      const newMode = agent.state.mode === "dialogue" ? "observation" : "dialogue";
      agent.setMode(newMode);
      addMessage({ role: "system", content: `Mode: ${newMode}` });
      return;
    }

    if (key.ctrl) {
      const numMatch = _input.match(/^[1-9]$/);
      if (numMatch && client) {
        const index = parseInt(numMatch[0], 10) - 1;
        const pages = pagesRef.current;
        if (index < pages.length) {
          client.remote.switchToPage(pages[index].id);
        }
        return;
      }

      if (_input === "[" && client) {
        const pages = pagesRef.current;
        const activeId = activePageIdRef.current;
        if (pages.length > 1 && activeId) {
          const ci = pages.findIndex((p) => p.id === activeId);
          const prev = ci <= 0 ? pages.length - 1 : ci - 1;
          client.remote.switchToPage(pages[prev].id);
        }
        return;
      }

      if (_input === "]" && client) {
        const pages = pagesRef.current;
        const activeId = activePageIdRef.current;
        if (pages.length > 1 && activeId) {
          const ci = pages.findIndex((p) => p.id === activeId);
          const next = ci >= pages.length - 1 ? 0 : ci + 1;
          client.remote.switchToPage(pages[next].id);
        }
        return;
      }

      if (_input === "w" && client) {
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
      sessionName={state.sessionName}
      sessionStatus={state.sessionStatus}
      pages={state.pages}
      activePageId={state.activePageId}
      messages={state.messages}
      streamingContent={state.streamingContent}
      focusPanel={focusPanel}
      agentReady={agent.isReady()}
      agentStatus={agent.state.status}
      agentMode={agent.state.mode}
      agentError={agent.state.error}
      loadedSkills={agent.state.loadedSkills}
      onSwitchPage={(pageId) => {
        clientRef.current?.remote.switchToPage(pageId);
      }}
      onSubmit={handleSubmit}
    />
  );
}
