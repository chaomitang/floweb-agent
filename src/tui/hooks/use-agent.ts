import { useState, useCallback, useRef } from "react";
import { AgentRuntime } from "../../agent/runtime.js";
import { SkillRegistry } from "../../skills/registry.js";
import { getGlobalSkillsDir } from "../../core/config.js";
import type { DaemonClient } from "../../daemon/ipc/client.js";
import type { AgentConfig, AgentStreamEvent } from "../../agent/types.js";

export interface AgentHookState {
  status: "idle" | "thinking" | "executing" | "error";
  error: string | null;
  streaming: boolean;
  loadedSkills: Array<{ name: string; description: string }>;
  availableTools: Array<{ name: string; description: string }>;
}

export interface AgentHook {
  state: AgentHookState;
  init: (client: DaemonClient, config: AgentConfig) => Promise<{ loadedSkills: Array<{ name: string; description: string }>; availableTools: Array<{ name: string; description: string }> }>;
  send: (message: string) => Promise<string>;
  streamMessage: (message: string) => AsyncGenerator<AgentStreamEvent>;
  observe: (pageState: unknown) => AsyncGenerator<AgentStreamEvent>;
  cancel: () => void;
  isReady: () => boolean;
  debugInfo: () => string;
  setLogHandler: (handler: (msg: string) => void) => void;
}

export function useAgent(): AgentHook {
  const [state, setState] = useState<AgentHookState>({
    status: "idle",
    error: null,
    streaming: false,
    loadedSkills: [],
    availableTools: [],
  });

  const runtimeRef = useRef<AgentRuntime | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const init = useCallback(async (client: DaemonClient, config: AgentConfig) => {
    try {
      setState((prev) => ({ ...prev, status: "thinking", error: null }));
      const registry = new SkillRegistry();
      // Load global skills first (~/.floweb/skills/) — workspace overrides
      await registry.loadFromDir(getGlobalSkillsDir());
      // Load workspace skills (.floweb/skills/) — same name overrides global
      await registry.loadFromDir(config.skillsDir);
      const runtime = new AgentRuntime(config, registry, client);
      runtimeRef.current = runtime;
      const loadedSkills = registry.list().map((s) => ({ name: s.meta.name, description: s.meta.description }));
      const availableTools = runtime.listTools();
      setState((prev) => ({
        ...prev,
        status: "idle",
        loadedSkills,
        availableTools,
        error: null,
      }));
      return { loadedSkills, availableTools };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: msg }));
      throw err;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(async (message: string): Promise<string> => {
    const runtime = runtimeRef.current;
    if (!runtime) return "Agent not initialized.";
    abortRef.current = new AbortController();
    setState((prev) => ({ ...prev, status: "thinking", error: null }));
    runtime.setClientRole("agent");
    try {
      const response = await runtime.invoke(message, "tui-session", abortRef.current.signal);
      setState((prev) => ({ ...prev, status: "idle", streaming: false }));
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: msg }));
      return `Error: ${msg}`;
    } finally {
      runtime.setClientRole("user");
      abortRef.current = null;
    }
  }, []);

  const streamMessage = useCallback(async function* (
    message: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const runtime = runtimeRef.current;
    if (!runtime) {
      yield { type: "error", message: "Agent not initialized." };
      return;
    }
    abortRef.current = new AbortController();
    setState((prev) => ({ ...prev, status: "thinking", streaming: true, error: null }));
    runtime.setClientRole("agent");
    try {
      for await (const event of runtime.stream(message, "tui-session", abortRef.current.signal)) {
        yield event;
      }
    } finally {
      runtime.setClientRole("user");
      setState((prev) => ({ ...prev, status: "idle", streaming: false }));
      abortRef.current = null;
    }
  }, []);

  const observe = useCallback(async function* (
    pageState: unknown,
  ): AsyncGenerator<AgentStreamEvent> {
    const runtime = runtimeRef.current;
    if (!runtime) {
      yield { type: "error", message: "Agent not initialized." };
      return;
    }
    abortRef.current = new AbortController();
    setState((prev) => ({ ...prev, status: "thinking", streaming: true, error: null }));
    runtime.setClientRole("agent");
    try {
      for await (const event of runtime.observe(pageState, "tui-session", abortRef.current.signal)) {
        yield event;
      }
    } finally {
      runtime.setClientRole("user");
      setState((prev) => ({ ...prev, status: "idle", streaming: false }));
      abortRef.current = null;
    }
  }, []);

  const isReady = useCallback(() => runtimeRef.current !== null, []);
  const debugInfo = useCallback(() => runtimeRef.current?.debugInfo() ?? "Agent not initialized.", []);
  const setLogHandler = useCallback((handler: (msg: string) => void) => {
    runtimeRef.current?.setLogHandler(handler);
  }, []);

  return { state, init, send, streamMessage, observe, cancel, isReady, debugInfo, setLogHandler };
}
