import { StateGraph, MessagesAnnotation, START, END, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { DaemonClient } from "../daemon/ipc/client.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { AgentConfig, AgentState, InteractionMode } from "./types.js";
import { buildSystemPrompt, buildObservationPrompt } from "./prompts.js";
import { createBrowserTools } from "./tools/browser.tools.js";
import { createSpecTools } from "./tools/spec.tools.js";
import { createSkillTools } from "./tools/skill.tools.js";

export class AgentRuntime {
  private model: ChatAnthropic;
  private tools: StructuredTool[];
  private checkpointer: MemorySaver;
  private app: ReturnType<typeof this.buildGraph>;
  private config: AgentConfig;
  private registry: SkillRegistry;
  private client: DaemonClient | null = null;

  constructor(config: AgentConfig, registry: SkillRegistry, client: DaemonClient | null = null) {
    this.config = config;
    this.registry = registry;
    this.client = client;
    this.model = new ChatAnthropic({
      model: config.model,
      temperature: 0,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.tools = this.buildTools();
    this.checkpointer = new MemorySaver();
    this.app = this.buildGraph();
  }

  setClient(client: DaemonClient): void {
    this.client = client;
    this.tools = this.buildTools();
    this.app = this.buildGraph();
  }

  setMode(mode: InteractionMode): void {
    this.config = { ...this.config, interactionMode: mode };
    this.app = this.buildGraph();
  }

  getState(): AgentState {
    return {
      status: "idle",
      mode: this.config.interactionMode,
      error: null,
    };
  }

  private buildTools(): StructuredTool[] {
    const browserTools = createBrowserTools(() => this.client);
    const specTools = createSpecTools(this.config.specsDir);
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

  async invoke(content: string, threadId: string): Promise<string> {
    try {
      const result = await this.app.invoke(
        {
          messages: [new HumanMessage(content)],
        },
        { configurable: { thread_id: threadId } },
      );
      const messages = result.messages as BaseMessage[];
      const lastAi = messages
        .slice()
        .reverse()
        .find((m) => m.getType() === "ai");
      if (lastAi) {
        const text = (lastAi as AIMessage).content;
        if (typeof text === "string") return text;
        if (Array.isArray(text))
          return text
            .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
            .join("");
      }
      return "No response from agent.";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Agent error: ${message}`;
    }
  }

  async *stream(content: string, threadId: string): AsyncGenerator<string> {
    try {
      const stream = await this.app.stream(
        {
          messages: [new HumanMessage(content)],
        },
        {
          configurable: { thread_id: threadId },
          streamMode: "messages" as const,
        },
      );
      for await (const [chunk] of stream) {
        if (chunk && typeof chunk === "object" && "content" in chunk) {
          const c = (chunk as { content: unknown }).content;
          if (typeof c === "string") yield c;
          else if (Array.isArray(c)) {
            for (const part of c) {
              if (typeof part === "string") yield part;
              else if (part && typeof part === "object" && "text" in part) {
                yield (part as { text: string }).text;
              }
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield `Agent error: ${message}`;
    }
  }

  observe(pageState: unknown, threadId: string): AsyncGenerator<string> {
    const prompt = buildObservationPrompt(pageState);
    return this.stream(prompt, threadId);
  }

  getTools(): StructuredTool[] {
    return this.tools;
  }

  listTools(): string[] {
    return this.tools.map((t) => t.name);
  }
}
