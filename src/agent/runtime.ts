import { StateGraph, MessagesAnnotation, START, END, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatDeepSeek } from "@langchain/deepseek";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { DaemonClient } from "../daemon/ipc/client.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { AgentConfig, AgentState, AgentStreamEvent } from "./types.js";
import { buildSystemPrompt, buildObservationPrompt } from "./prompts.js";
import { createBrowserTools } from "@/agent/tools/browser.tools.js";
import { createSpecTools, type SpecExecutor } from "@/agent/tools/spec.tools.js";
import { createSkillTools } from "@/agent/tools/skill.tools.js";

export class AgentRuntime {
  private model: ChatAnthropic | ChatOpenAI | ChatDeepSeek;
  private tools: StructuredTool[];
  private checkpointer: MemorySaver;
  private app: ReturnType<typeof this.buildGraph>;
  private config: AgentConfig;
  private registry: SkillRegistry;
  private client: DaemonClient | null = null;
  private onLog: ((msg: string) => void) | null = null;

  constructor(config: AgentConfig, registry: SkillRegistry, client: DaemonClient | null = null) {
    this.config = config;
    this.registry = registry;
    this.client = client;
    const apiKey = config.apiKey;

    if (config.provider === "deepseek") {
      this.model = new ChatDeepSeek({
        model: config.model,
        temperature: 0,
        ...(apiKey ? { apiKey } : {}),
        ...(config.baseUrl
          ? { configuration: { baseURL: config.baseUrl } }
          : {}),
        modelKwargs: { thinking: { type: "disabled" } },
      });
    } else if (config.provider === "openai") {
      this.model = new ChatOpenAI({
        model: config.model,
        temperature: 0,
        ...(apiKey ? { apiKey } : {}),
        ...(config.baseUrl
          ? { configuration: { baseURL: config.baseUrl } }
          : {}),
      } as any);
    } else {
      this.model = new ChatAnthropic({
        model: config.model,
        temperature: 0,
        ...(apiKey ? { apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
    }
    this.tools = this.buildTools();
    this.checkpointer = new MemorySaver();
    this.app = this.buildGraph();
  }

  setLogHandler(handler: (msg: string) => void): void {
    this.onLog = handler;
  }

  debugInfo(): string {
    const apiKey = this.config.apiKey;
    const masked = apiKey
      ? apiKey.slice(0, 7) + "..." + (apiKey.length > 10 ? apiKey.slice(-4) : "")
      : "(not set)";
    return [
      `provider: ${this.config.provider}`,
      `model: ${this.config.model}`,
      `baseUrl: ${this.config.baseUrl || "(default)"}`,
      `apiKey: ${masked}`,
      `tools: ${this.tools.length} (${this.listTools().map(t => t.name).join(", ")})`,
    ].join("\n");
  }

  private log(msg: string): void {
    this.onLog?.(msg);
  }

  setClient(client: DaemonClient): void {
    this.client = client;
    this.tools = this.buildTools();
    this.app = this.buildGraph();
  }

  getState(): AgentState {
    return { status: "idle", error: null };
  }

  private buildTools(): StructuredTool[] {
    const browserTools = createBrowserTools(() => this.client);

    // Build spec executor that maps action tool names to daemon remote calls
    const specExecutor: SpecExecutor | undefined = this.client
      ? {
          executeAction: async (tool: string, args: Record<string, unknown>) => {
            const remote = this.client!.remote;
            const url = args.url as string | undefined;
            switch (tool) {
              case "browser_navigate":
                if (url) await remote.navigate(url);
                break;
              case "browser_click":
                await remote.click(args.selector as string);
                break;
              case "browser_type":
                await remote.typeText(args.selector as string, args.text as string);
                break;
              case "browser_press":
                await remote.pressKey(args.key as string);
                break;
              case "browser_select":
                await remote.select(args.selector as string, args.value as string);
                break;
              case "browser_hover":
                await remote.hover(args.selector as string);
                break;
              case "browser_scroll":
                await remote.scroll(args.x as number, args.y as number);
                break;
              case "browser_wait":
                await remote.waitFor(args.ms as number | undefined, args.selector as string | undefined);
                break;
              case "browser_back":
                await remote.goBack();
                break;
              case "browser_forward":
                await remote.goForward();
                break;
              case "browser_reload":
                await remote.reloadPage();
                break;
              default:
                throw new Error(`Unknown spec action tool: ${tool}`);
            }
          },
          executeAssert: async (condition: string, description: string, stopOnFail: boolean) => {
            const remote = this.client!.remote;
            const result = await remote.execCode(`return (${condition});`);
            const passed = Boolean(result.result);

            if (passed) {
              return `✓ PASS: ${description}\n  Condition: ${condition}`;
            }

            // Capture page context for diagnosis
            let contextInfo = "";
            try {
              const snap = await remote.snapshotActive();
              const snapLines = snap.text.split("\n").slice(0, 15);
              contextInfo = [
                `  URL: ${snap.url}`,
                `  Title: ${snap.title}`,
                ...snapLines.map((l: string) => `  ${l}`),
              ].join("\n");
            } catch {
              // best-effort
            }

            const output = [
              `✗ FAIL: ${description}`,
              `  Expected: ${condition}`,
              `  Actual:   ${JSON.stringify(result.result)}`,
              contextInfo ? `\n${contextInfo}` : "",
              "",
              "Check the previous actions for the root cause.",
            ].join("\n");

            if (stopOnFail) {
              throw new Error(output);
            }
            return output;
          },
          saveCheckpoint: async (phaseIndex: number, phaseTitle: string) => {
            await this.client!.remote.saveCheckpoint({ phaseIndex, phaseTitle });
          },
        }
      : undefined;

    const specTools = createSpecTools(this.config.specsDir, specExecutor);
    const skillTools = createSkillTools(() => this.registry);
    return [...browserTools, ...specTools, ...skillTools];
  }

  private buildGraph() {
    const modelWithTools = this.model.bindTools(this.tools);
    const toolNode = new ToolNode(this.tools);
    const systemPrompt = buildSystemPrompt(this.registry);

    const callModel = async (state: typeof MessagesAnnotation.State) => {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...state.messages,
      ];
      const response = await modelWithTools.invoke(messages);
      return { messages: [response] };
    };

    const shouldContinue = (state: typeof MessagesAnnotation.State): string => {
      const { messages } = state;
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        "tool_calls" in lastMessage &&
        (lastMessage as AIMessage).tool_calls?.length
      ) {
        return "tools";
      }
      return END;
    };

    return new StateGraph(MessagesAnnotation)
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge(START, "agent")
      .addConditionalEdges("agent", shouldContinue, {
        tools: "tools",
        [END]: END,
      })
      .addEdge("tools", "agent")
      .compile({
        checkpointer: this.checkpointer,
      });
  }

  async invoke(content: string, threadId: string, signal?: AbortSignal): Promise<string> {
    try {
      signal?.throwIfAborted();
      let text = "";
      for await (const event of this.stream(content, threadId, signal)) {
        if (event.type === "text") {
          text += event.content;
        } else if (event.type === "error") {
          return text || event.message;
        }
      }
      return text || "No response.";
    } catch (err) {
      if (signal?.aborted) return "Interrupted.";
      const message = err instanceof Error ? err.message : String(err);
      this.log(`[agent] invoke failed\n${this.debugInfo()}\nraw error: ${message}`);
      return `Agent error: ${message}`;
    }
  }

  async *stream(
    content: string,
    threadId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentStreamEvent> {
    try {
      signal?.throwIfAborted();
      const stream = await this.app.stream(
        { messages: [new HumanMessage(content)] },
        {
          configurable: { thread_id: threadId },
          streamMode: "messages" as const,
          recursionLimit: 100,
          ...(signal ? { signal } : {}),
        },
      );
      for await (const [msg] of stream) {
        if (!msg) continue;

        // Tool result
        if ("tool_call_id" in msg && msg.tool_call_id) {
          const tm = msg as ToolMessage;
          const result =
            typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content);
          yield {
            type: "tool_end",
            toolName: tm.name ?? "unknown",
            result,
          };
          continue;
        }

        // Tool calls — check multiple locations due to provider differences
        const aiMsg = msg as AIMessage;
        const extra = (aiMsg.additional_kwargs ?? {}) as unknown as Record<string, unknown>;
        const rawCalls: Array<{ name?: string; args?: unknown; id?: string }> =
          aiMsg.tool_calls?.length
            ? aiMsg.tool_calls
            : (extra.tool_calls as Array<{ name?: string; args?: unknown; id?: string }>)?.length
              ? (extra.tool_calls as Array<{ name?: string; args?: unknown; id?: string }>)
              : ((msg as unknown as Record<string, unknown>).tool_call_chunks as Array<{ name?: string; args?: unknown; id?: string }>) ?? [];

        if (rawCalls.length) {
          const seen = new Set<string>();
          for (const tc of rawCalls) {
            if (!tc.name) continue;
            const rawArgs = tc.args;
            let args: Record<string, unknown>;
            if (typeof rawArgs === "string") {
              if (rawArgs.length === 0) continue;
              try { args = JSON.parse(rawArgs) as Record<string, unknown>; } catch { continue; }
            } else {
              args = (rawArgs as Record<string, unknown>) ?? {};
            }
            // Deduplicate by call id when streaming (chunks repeat)
            const key = (tc.id as string) ?? tc.name;
            if (seen.has(key)) continue;
            seen.add(key);
            yield { type: "tool_start", toolName: tc.name, toolArgs: args };
          }
          continue;
        }

        // Text content
        if ("content" in msg) {
          const c = (msg as { content: unknown }).content;
          if (typeof c === "string" && c) {
            yield { type: "text", content: c };
          } else if (Array.isArray(c)) {
            for (const part of c) {
              if (typeof part === "string") {
                if (part) yield { type: "text", content: part };
              } else if (part && typeof part === "object" && "text" in part) {
                const text = (part as { text: string }).text;
                if (text) yield { type: "text", content: text };
              }
            }
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) {
        yield { type: "error", message: "Interrupted." };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.log(`[agent] stream failed\n${this.debugInfo()}\nraw error: ${message}`);
      yield { type: "error", message: `Agent error: ${message}` };
    }
  }

  async *observe(
    pageState: unknown,
    threadId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentStreamEvent> {
    const prompt = buildObservationPrompt(pageState);
    yield* this.stream(prompt, threadId, signal);
  }

  setClientRole(role: "user" | "agent"): void {
    this.client?.setRole(role);
  }

  getTools(): StructuredTool[] {
    return this.tools;
  }

  listTools(): Array<{ name: string; description: string }> {
    return this.tools.map((t) => ({ name: t.name, description: t.description }));
  }
}
