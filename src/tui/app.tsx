import React from "react";
import { useInput } from "ink";
import { Layout } from "@/tui/components/layout.js";
import type { FocusPanel } from "@/tui/components/layout.js";
import { useBrowserState } from "@/tui/hooks/use-browser-state.js";
import type { ActionLogEntry } from "@/tui/hooks/use-browser-state.js";
import { createCommandExecutor } from "@/tui/hooks/use-command-input.js";
import { useAgent } from "@/tui/hooks/use-agent.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";
import type { FlowebConfig } from "../core/config.js";
import { getConfigPath, getLogPath, getSessionDir } from "../core/config.js";
import { saveMessages, loadContextPrompt } from "../core/conversation-store.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildUserActionObservation } from "../agent/prompts.js";

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
    case "hover": return "hover";
    case "scroll": return "scroll";
    case "check": case "uncheck": return "click";
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
  const sessionDirRef = React.useRef<string | null>(null);
  const historyInjectedRef = React.useRef(false);
  const [focusPanel, setFocusPanel] = React.useState<FocusPanel>("chat");
  const [observing, setObserving] = React.useState(false);
  const observingRef = React.useRef(false);
  const messagesRef = React.useRef(state.messages);
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

  const updateObserving = (value: boolean) => {
    observingRef.current = value;
    setObserving(value);
  };

  const executeCommand = createCommandExecutor(clientRef, setMessage, addMessage, agentRef, clearSession, updateObserving);

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

      let agentContent = executeCommand(text);
      if (agentContent === null) return; // fully handled by slash command

      // Inject previous conversation context on first message
      if (!historyInjectedRef.current && sessionDirRef.current) {
        historyInjectedRef.current = true;
        const ctx = loadContextPrompt(sessionDirRef.current);
        if (ctx) {
          agentContent = `${ctx}\n\n[Current message]\n${agentContent}`;
        }
      }

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
        // Persist conversation after each turn
        if (sessionDirRef.current) {
          const now = new Date().toISOString();
          saveMessages(sessionDirRef.current, [
            ...messagesRef.current,
            { role: "user" as const, content: text, timestamp: now },
            ...(response.trim() ? [{ role: "agent" as const, content: response.trim(), timestamp: now }] : []),
          ]);
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

      // Flush pending page-change observations that arrived while agent was busy.
      // This handles redirects after /mode toggle while agent was still responding.
      const pendingObs = pendingObserveRef.current;
      if (pendingObs && pagesChangedImplRef.current) {
        pendingObserveRef.current = null;
        setState((prev) => ({ ...prev, streamingContent: "" }));
        pagesChangedImplRef.current(pendingObs.pages, pendingObs.activePageId);
      }
    },
    [addMessage, executeCommand, setState, setPendingMessage],
  );

  messagesRef.current = state.messages;
  pagesRef.current = state.pages;
  activePageIdRef.current = state.activePageId;

  const observeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageSnapshotRef = React.useRef<string>("");
  const pendingObserveRef = React.useRef<{ pages: typeof state.pages; activePageId: string | null } | null>(null);
  const pagesChangedImplRef = React.useRef<((pages: typeof state.pages, activePageId: string | null) => void) | null>(null);

  // Unified user activity tracking: both pagesChanged and actionLogged feed
  // into one debounced pipeline → snapshotDiff → agent summary (if observing).
  const pendingUserActionsRef = React.useRef<Array<{ type: string; detail: string }>>([]);
  const userActivityTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingUserActivityRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  // Action types from the daemon that indicate user-driven page changes
  // worth snapshotDiff-ing. snapshot_diff/snapshot/exec are results, not triggers.
  const ACTIVITY_TRIGGERS = new Set([
    "click", "type", "press", "scroll", "check", "uncheck",
    "navigate", "close_tab",
  ]);

  React.useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const sp = socketPath ?? getDaemonSocketPath();

    // ── unified user activity flush ────────────────────────────────
    async function flushUserActivity() {
      if (processingUserActivityRef.current) return;
      const actions = pendingUserActionsRef.current.splice(0);
      if (actions.length === 0) return;

      const ag = agentRef.current;
      const cl = clientRef.current;
      if (!ag || !cl) return;

      // If agent is still busy with a prior task, wait and retry
      if (ag.state.status !== "idle") {
        pendingUserActionsRef.current = [...actions, ...pendingUserActionsRef.current];
        if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);
        userActivityTimerRef.current = setTimeout(flushUserActivity, 500);
        return;
      }

      processingUserActivityRef.current = true;
      try {
        // Wait for page to be fully stable (load, network idle, DOM settled)
        // before taking the snapshot diff. Falls back to timeout gracefully.
        await cl.remote.waitForPageStable(8000).catch(() => {});

        // Take snapshot diff — this also triggers daemon logAction("snapshot_diff", …)
        // which broadcasts actionLogged so the diff appears in the browser panel.
        let diff = "";
        try {
          const result = await cl.remote.snapshotDiff();
          diff = result.diff;
        } catch (err) {
          // diff unavailable, still build prompt with actions only
        }

        // In observing mode, send actions + diff to agent for a summary
        if (observingRef.current) {
          const prompt = buildUserActionObservation(actions, diff);
          try {
            let response = "";
            for await (const event of ag.streamMessage(prompt)) {
              if (!mounted) break;
              switch (event.type) {
                case "text":
                  response += event.content;
                  setState((prev) => ({ ...prev, streamingContent: response }));
                  break;
                case "tool_start":
                  addMessage({ role: "tool", content: `${event.toolName}(${JSON.stringify(event.toolArgs)})` });
                  break;
                case "tool_end": {
                  const truncated = event.result.length > 200 ? event.result.slice(0, 200) + "..." : event.result;
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
              addAction({ type: "summary", detail: response.trim(), role: "agent" });
            }
            updateObserving(true);
            setState((prev) => ({ ...prev, streamingContent: "" }));
          } catch {
            setState((prev) => ({ ...prev, streamingContent: "" }));
          }

          // Flush pending page-change observations that arrived while agent was busy
          const pending = pendingObserveRef.current;
          if (pending && mounted) {
            pendingObserveRef.current = null;
            const pendingSnapshot = JSON.stringify({ pages: pending.pages, activePageId: pending.activePageId });
            if (pendingSnapshot !== lastPageSnapshotRef.current) {
              lastPageSnapshotRef.current = pendingSnapshot;
              pagesChangedImpl(pending.pages, pending.activePageId);
            }
          }
        }
      } finally {
        processingUserActivityRef.current = false;
      }
    }

    function scheduleUserActivityFlush() {
      if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);
      // Short debounce just to batch rapid events (e.g. click → navigate → title).
      // The actual page stability wait happens in flushUserActivity via waitForPageStable.
      userActivityTimerRef.current = setTimeout(flushUserActivity, 300);
    }

    // ── pagesChanged handler ───────────────────────────────────────
    function pagesChangedImpl(pages: typeof state.pages, activePageId: string | null) {
      pagesChangedImplRef.current = pagesChangedImpl;
      if (!mounted) return;
      const prevPages = pagesRef.current;
      setPages(pages, activePageId);

      const ag = agentRef.current;
      const isObserving = ag?.state.status === "idle";

        // During observation mode, log user page changes to actions.jsonl
        // and show them as user messages in chat.
        if (isObserving) {
          const cl = clientRef.current;
          if (pages.length > prevPages.length) {
            const newPages = pages.filter((p) => !prevPages.find((pp) => pp.id === p.id));
            for (const np of newPages) {
              if (np.url && np.url !== "about:blank") {
                cl?.remote.recordAction("navigate", np.url).catch(() => {});
                addMessage({ role: "user", content: `Opened ${np.url}` });
              }
            }
          } else if (pages.length < prevPages.length) {
            const closed = prevPages.filter((p) => !pages.find((pp) => pp.id === p.id));
            for (const cp of closed) {
              const label = cp.title && cp.title !== "Loading..." ? cp.title : cp.url;
              cl?.remote.recordAction("close_tab", label).catch(() => {});
              addMessage({ role: "user", content: `Closed ${label}` });
            }
          } else {
            for (const p of pages) {
              const prev = prevPages.find((pp) => pp.id === p.id);
              if (prev && prev.title !== p.title && p.title !== "Loading...") {
                cl?.remote.recordAction("navigate", p.title?.slice(0, 50)).catch(() => {});
                addMessage({ role: "user", content: `Loaded ${p.title?.slice(0, 50)}` });
              }
            }
          }
        }

        // Only send observation when agent is idle (not in tool-call loop).
        // Injecting during tool execution breaks the ReAct message chain.
        if (ag && ag.isReady() && pages.length > 0) {
          const snapshot = JSON.stringify({ pages, activePageId });
          if (snapshot === lastPageSnapshotRef.current) return;

          if (!isObserving) {
            // Agent is busy — save as pending, will be processed when idle
            pendingObserveRef.current = { pages, activePageId };
            lastPageSnapshotRef.current = snapshot;
            return;
          }

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
              updateObserving(true);
              setState((prev) => ({ ...prev, streamingContent: "" }));
            } catch {
              setState((prev) => ({ ...prev, streamingContent: "" }));
            }
            // After observe completes, flush pending changes that arrived while we were thinking
            const pending = pendingObserveRef.current;
            if (pending && mounted) {
              pendingObserveRef.current = null;
              const pendingSnapshot = JSON.stringify({ pages: pending.pages, activePageId: pending.activePageId });
              if (pendingSnapshot !== lastPageSnapshotRef.current) {
                lastPageSnapshotRef.current = pendingSnapshot;
                // Trigger a follow-up observation for the missed change
                pagesChangedImpl(pending.pages, pending.activePageId);
              }
            }
          }, 1500);
        }
      } // end pagesChangedImpl

      const handlers: ClientApi = {
        pagesChanged: pagesChangedImpl,
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
          // 用户操作 → 自动进入观察模式（agent 空闲时）
          if (action.role === "user" && ACTIVITY_TRIGGERS.has(action.type)) {
            if (!observingRef.current && agentRef.current?.state.status === "idle") {
              updateObserving(true);
              // 立即切换边框为黄色，不等 React re-render
              clientRef.current?.remote.setAgentBorder("yellow").catch(() => {});
            }
            if (observingRef.current) {
              pendingUserActionsRef.current.push({ type: action.type, detail: action.detail });
              scheduleUserActivityFlush();
            }
          }
        },
        observingChanged(obs) {
          if (!mounted) return;
          updateObserving(obs);
        },
      };

    async function connect() {
      let client: DaemonClient;

      try {
        addMessage({ role: "system", content: `Config: ~/.floweb/config.json` });
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
        sessionDirRef.current = getSessionDir(config);
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
      mountedRef.current = false;
      if (observeTimerRef.current) clearTimeout(observeTimerRef.current);
      if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [config, socketPath, initialUrl, setPages, setMessage, setSessionStatus, addMessage]);

  // 页面边框：TUI-daemon 连接标识，持续显示。粉色=正常，黄色=观察模式，agent 操作时临时变粉
  React.useEffect(() => {
    const cl = clientRef.current;
    if (!cl) return;
    const thinking = agent.state.status === "thinking" || agent.state.status === "executing";
    // 操作中 → 粉色（无论模式），空闲时观察模式 → 黄色，空闲时正常 → 粉色
    if (thinking) {
      cl.remote.setAgentBorder("pink").catch(() => {});
    } else {
      cl.remote.setAgentBorder(observing ? "yellow" : "pink").catch(() => {});
    }
  }, [agent.state.status, observing]);

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
      observing={observing}
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
