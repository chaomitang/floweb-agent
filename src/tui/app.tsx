import React from "react";
import { useInput } from "ink";
import { Layout } from "./components/layout.js";
import type { FocusPanel } from "./components/layout.js";
import { useBrowserState } from "./hooks/use-browser-state.js";
import type { ActionLogEntry } from "./hooks/use-browser-state.js";
import { createCommandExecutor } from "./hooks/use-command-input.js";
import { useAgent } from "./hooks/use-agent.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";
import type { FlowebConfig } from "../core/config.js";
import { getConfigPath, getLogPath } from "../core/config.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function mapDaemonActionType(type: string): ActionLogEntry["type"] | null {
  switch (type) {
    case "navigate": return "navigate";
    case "snapshot": return "snapshot";
    case "snapshot_diff": return "diff";
    case "click": return "click";
    case "type": return "type";
    case "press": return "press";
    case "close_tab": case "close_session": return "close";
    case "switch_tab": return "switch";
    case "exec": return "exec";
    case "evaluate": return "evaluate";
    default: return null;
  }
}

const writeLog = (msg: string) => {
  try {
    const path = getLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
};

interface AppProps {
  config?: FlowebConfig;
  socketPath?: string;
  initialUrl?: string;
  sessionName?: string;
}

export function App({ config, socketPath, initialUrl, sessionName }: AppProps) {
  const { state, setMessage, setPages, setSessionStatus, setState, addMessage, addAction, setPendingMessage } =
    useBrowserState();
  const agent = useAgent();
  const agentRef = React.useRef(agent);
  agentRef.current = agent;

  const clientRef = React.useRef<DaemonClient | null>(null);
  const [focusPanel, setFocusPanel] = React.useState<FocusPanel>("chat");
  const pagesRef = React.useRef(state.pages);
  const activePageIdRef = React.useRef(state.activePageId);
  const pendingRef = React.useRef<string | null>(null);

  const clearSession = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [
        {
          role: "system",
          content: "Session reset.",
          timestamp: new Date().toISOString(),
        } as const,
      ],
      actionLog: [],
    }));
  }, []);

  const executeCommand = createCommandExecutor(clientRef, setMessage, addMessage, agentRef, clearSession);

  const handleSubmit = React.useCallback(
    async (text: string) => {
      // If agent is already running, queue as pending
      const ag = agentRef.current;
      if (ag?.state.status === "thinking") {
        pendingRef.current = text;
        setPendingMessage(text);
        return;
      }

      // Show user input immediately, before command result
      addMessage({ role: "user", content: text });

      const agentContent = executeCommand(text);
      if (agentContent === null) return; // fully handled by slash command

      // Stream to agent (agentContent may differ from text for /mode, /spec etc.)
      setState((prev) => ({ ...prev, streamingContent: "" }));

      if (!ag || !ag.isReady()) {
        addMessage({ role: "system", content: "Agent not ready." });
        // Process pending message
        const pending = pendingRef.current;
        if (pending) {
          pendingRef.current = null;
          setPendingMessage(null);
          setTimeout(() => handleSubmit(pending), 0);
        }
        return;
      }

      try {
        let response = "";
        for await (const event of ag.streamMessage(agentContent)) {
          switch (event.type) {
            case "text":
              response += event.content;
              setState((prev) => ({ ...prev, streamingContent: response }));
              break;
            case "tool_start":
              addMessage({
                role: "tool",
                content: `${event.toolName}(${JSON.stringify(event.toolArgs)})`,
              });
              break;
            case "tool_end": {
              const truncated =
                event.result.length > 200
                  ? event.result.slice(0, 200) + "..."
                  : event.result;
              addMessage({ role: "tool", content: `  ${truncated}` });
              break;
            }
            case "error":
              addMessage({ role: "system", content: event.message });
              break;
          }
        }
        if (response.trim()) {
          addMessage({ role: "agent", content: response.trim() });
        }
      } catch (err) {
        addMessage({ role: "system", content: `Error: ${String(err)}` });
      } finally {
        setState((prev) => ({ ...prev, streamingContent: "" }));
      }

      // Process pending message
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        setPendingMessage(null);
        setTimeout(() => handleSubmit(pending), 0);
      }
    },
    [addMessage, executeCommand, setState, setPendingMessage],
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
        const prevPages = pagesRef.current;
        setPages(pages, activePageId);

        const ag = agentRef.current;
        const isObserving = ag?.state.status === "idle";

        // During observation mode, show page changes as user messages in chat.
        // Tool events already capture everything in the Browser panel activity log.
        if (isObserving) {
          if (pages.length > prevPages.length) {
            const newPages = pages.filter((p) => !prevPages.find((pp) => pp.id === p.id));
            for (const np of newPages) {
              if (np.url && np.url !== "about:blank") {
                addMessage({ role: "user", content: `Opened ${np.url}` });
              }
            }
          } else if (pages.length < prevPages.length) {
            const closed = prevPages.filter((p) => !pages.find((pp) => pp.id === p.id));
            for (const cp of closed) {
              const label = cp.title && cp.title !== "Loading..." ? cp.title : cp.url;
              addMessage({ role: "user", content: `Closed ${label}` });
            }
          } else {
            for (const p of pages) {
              const prev = prevPages.find((pp) => pp.id === p.id);
              if (prev && prev.title !== p.title && p.title !== "Loading...") {
                addMessage({ role: "user", content: `Loaded ${p.title?.slice(0, 50)}` });
              }
            }
          }
        }

        // Only send observation when agent is idle (not in tool-call loop).
        // Injecting during tool execution breaks the ReAct message chain.
        if (ag && ag.isReady() && isObserving && pages.length > 0) {
          const snapshot = JSON.stringify({ pages, activePageId });
          if (snapshot === lastPageSnapshotRef.current) return;
          lastPageSnapshotRef.current = snapshot;

          if (observeTimerRef.current) clearTimeout(observeTimerRef.current);
          observeTimerRef.current = setTimeout(async () => {
            if (!mounted) return;
            // Double-check agent is still idle before sending
            if (agentRef.current?.state.status !== "idle") return;
            try {
              let response = "";
              for await (const event of ag.observe({ pages, activePageId })) {
                switch (event.type) {
                  case "text":
                    response += event.content;
                    setState((prev) => ({ ...prev, streamingContent: response }));
                    break;
                  case "tool_start":
                    addMessage({
                      role: "tool",
                      content: `${event.toolName}(${JSON.stringify(event.toolArgs)})`,
                    });
                    break;
                  case "tool_end": {
                    const truncated =
                      event.result.length > 200
                        ? event.result.slice(0, 200) + "..."
                        : event.result;
                    addMessage({ role: "tool", content: `  ${truncated}` });
                    break;
                  }
                  case "error":
                    addMessage({ role: "system", content: event.message });
                    break;
                }
              }
              if (response.trim()) {
                addMessage({ role: "agent", content: response.trim() });
              }
              setState((prev) => ({ ...prev, streamingContent: "" }));
            } catch {
              setState((prev) => ({ ...prev, streamingContent: "" }));
            }
          }, 1500);
        }
      },
      sessionStatusChanged(status) {
        if (!mounted) return;
        setSessionStatus(status as "disconnected" | "connecting" | "connected" | "error");
      },
      actionLogged(action) {
        if (!mounted) return;
        const type = mapDaemonActionType(action.type);
        if (type) {
          addAction({ type, detail: action.detail, role: action.role });
        }
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
          const { loadedSkills, availableTools } = await agentRef.current.init(client, {
            provider: agentConfig.provider,
            model: agentConfig.model,
            apiKey: agentConfig.apiKey,
            baseUrl: agentConfig.baseUrl,
            skillsDir: agentConfig.skillsDir,
            specsDir: agentConfig.specsDir,
          });
          // Hook up log handler
          agentRef.current.setLogHandler((msg: string) => {
            writeLog(msg);
          });
          addMessage({
            role: "system",
            content: `Agent ready. ${loadedSkills.length} skills, ${availableTools.length} tools.`,
          });
          writeLog(agentRef.current.debugInfo());
        } catch (err) {
          addMessage({
            role: "system",
            content: `Agent init failed: ${String(err)}`,
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
      // Priority: cancel pending → interrupt agent → do nothing
      if (pendingRef.current) {
        pendingRef.current = null;
        setPendingMessage(null);
        return;
      }
      const ag = agentRef.current;
      if (ag?.state.status === "thinking") {
        ag.cancel();
        addMessage({ role: "system", content: "Interrupted." });
        return;
      }
      // idle: do nothing (exit via Ctrl+C or /quit)
      return;
    }

    const client = clientRef.current;

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
      pendingMessage={state.pendingMessage}
      actionLog={state.actionLog}
      focusPanel={focusPanel}
      agentReady={agent.isReady()}
      agentStatus={agent.state.status}
      agentError={agent.state.error}
      loadedSkills={agent.state.loadedSkills}
      onSwitchPage={(pageId) => {
        clientRef.current?.remote.switchToPage(pageId);
      }}
      onSubmit={handleSubmit}
    />
  );
}
