import { useState, useCallback, useRef } from "react";
import { AgentRuntime } from "../../agent/runtime.js";
import { SkillRegistry } from "../../skills/registry.js";
import type { DaemonClient } from "../../daemon/ipc/client.js";
import type { AgentConfig, InteractionMode } from "../../agent/types.js";

export interface AgentHookState {
  status: "idle" | "thinking" | "executing" | "error";
  mode: InteractionMode;
  error: string | null;
  streaming: boolean;
  streamingContent: string;
  loadedSkills: string[];
  availableTools: string[];
}

export interface AgentHook {
  state: AgentHookState;
  init: (client: DaemonClient, config: AgentConfig) => Promise<void>;
  send: (message: string) => Promise<string>;
  streamMessage: (message: string) => AsyncGenerator<string>;
  setMode: (mode: InteractionMode) => void;
  observe: (pageState: unknown) => AsyncGenerator<string>;
  isReady: () => boolean;
}

export function useAgent(): AgentHook {
  const [state, setState] = useState<AgentHookState>({
    status: "idle",
    mode: "dialogue",
    error: null,
    streaming: false,
    streamingContent: "",
    loadedSkills: [],
    availableTools: [],
  });

  const runtimeRef = useRef<AgentRuntime | null>(null);
  const registryRef = useRef<SkillRegistry | null>(null);

  const init = useCallback(async (client: DaemonClient, config: AgentConfig) => {
    try {
      setState((prev) => ({ ...prev, status: "thinking" }));

      const registry = new SkillRegistry();
      const count = await registry.loadFromDir(config.skillsDir);
      registryRef.current = registry;

      const runtime = new AgentRuntime(config, registry, client);
      runtimeRef.current = runtime;

      setState((prev) => ({
        ...prev,
        status: "idle",
        mode: config.interactionMode,
        loadedSkills: registry.listNames(),
        availableTools: runtime.listTools(),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: msg }));
    }
  }, []);

  const send = useCallback(async (message: string): Promise<string> => {
    const runtime = runtimeRef.current;
    if (!runtime) return "Agent not initialized.";

    setState((prev) => ({ ...prev, status: "thinking" }));
    try {
      const response = await runtime.invoke(message, "tui-session");
      setState((prev) => ({ ...prev, status: "idle" }));
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: msg }));
      return `Error: ${msg}`;
    }
  }, []);

  const streamMessage = useCallback(async function* (message: string): AsyncGenerator<string> {
    const runtime = runtimeRef.current;
    if (!runtime) {
      yield "Agent not initialized.";
      return;
    }

    setState((prev) => ({ ...prev, status: "thinking", streaming: true, streamingContent: "" }));
    try {
      for await (const token of runtime.stream(message, "tui-session")) {
        setState((prev) => ({ ...prev, streamingContent: prev.streamingContent + token }));
        yield token;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield `\nError: ${msg}`;
    } finally {
      setState((prev) => ({ ...prev, status: "idle", streaming: false, streamingContent: "" }));
    }
  }, []);

  const setMode = useCallback((mode: InteractionMode) => {
    runtimeRef.current?.setMode(mode);
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const observe = useCallback(async function* (pageState: unknown): AsyncGenerator<string> {
    const runtime = runtimeRef.current;
    if (!runtime) {
      yield "Agent not initialized.";
      return;
    }

    setState((prev) => ({ ...prev, status: "thinking", streaming: true, streamingContent: "" }));
    try {
      for await (const token of runtime.observe(pageState, "tui-session")) {
        setState((prev) => ({ ...prev, streamingContent: prev.streamingContent + token }));
        yield token;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield `\nError: ${msg}`;
    } finally {
      setState((prev) => ({ ...prev, status: "idle", streaming: false, streamingContent: "" }));
    }
  }, []);

  const isReady = useCallback(() => runtimeRef.current !== null, []);

  return { state, init, send, streamMessage, setMode, observe, isReady };
}
