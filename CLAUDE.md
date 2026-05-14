# Floweb

基于终端的浏览器自动化工具，内置 LLM 驱动的 Agent。结合 Playwright 浏览器控制、LangGraph Agent 编排、React+Ink TUI，通过自然语言进行交互式网页自动化。

## 技术栈

- **运行时**: Node.js, TypeScript 5.9, ESM only (`"type": "module"`)
- **浏览器**: Playwright（Chromium，可选 Firefox/WebKit）
- **LLM**: LangChain + LangGraph（Anthropic/OpenAI），`MemorySaver` 检查点
- **TUI**: React 19 + Ink 7（`ink-text-input`）
- **校验**: Zod 4
- **构建**: tsup（ESM + `.d.ts`）
- **测试**: Vitest（forks pool, 4 workers）
- **IPC**: Unix domain socket，JSON-line 协议，无 HTTP 框架

## 构建与运行

```bash
npm run build          # tsup → dist/
npm run dev            # tsup --watch
npm run type-check     # tsc --noEmit
npm run test           # vitest run
npm run lint           # eslint .
npm run format         # prettier --write .

# CLI 命令
floweb tui             # 启动 TUI
floweb open <url>      # 在已有会话中打开 URL
floweb pages           # 列出标签页
floweb snapshot        # 活动页面的 JSON 快照
floweb close           # 关闭浏览器会话
floweb exec <code>     # 在浏览器 REPL 中执行代码
floweb run <file>      # 通过 FLOWEB_SOCKET 运行脚本
floweb mcp             # 启动 MCP 服务器（stdin/stdout JSON-RPC）
```

## 架构

```text
CLI (src/cli/) → DaemonClient (IPC over Unix socket) → DaemonServer (src/daemon/)
  → BrowserManager (src/core/browser/) → Playwright
  → AgentRuntime (src/agent/) → LangGraph ReAct → LLM ↔ tools
  → TUI (src/tui/) → React+Ink 渲染
```

### 主流程

1. CLI 通过 Zod schema 解析参数，分发到子命令处理器
2. `DaemonClient` 连接或 fork 守护进程（`child_process.fork`），socket 路径 `/tmp/floweb-${uid}.sock`
3. Daemon 拥有唯一的 `BrowserManager`（Playwright）和 `DaemonServer`（IPC）
4. TUI 作为客户端连接，初始化 `AgentRuntime`，渲染聊天 + 浏览器状态
5. Agent 工具调用 `DaemonClient.remote.browser_*()` → IPC → BrowserManager → Playwright
6. 状态变更通过 `pagesChanged` / `statusChanged` 事件广播给所有客户端

### 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/cli/` | CLI 入口 + 参数解析 |
| `src/core/` | 配置、类型、会话状态、`BrowserManager`、快照/差异对比 |
| `src/daemon/` | 守护进程、Unix socket IPC 协议、客户端 |
| `src/agent/` | LangGraph ReAct 运行时、提示词、19 个工具（browser + spec + skill） |
| `src/tui/` | React+Ink 终端 UI（聊天、浏览器面板、Agent 状态） |
| `src/mcp/` | MCP 服务器（JSON-RPC over stdin/stdout），11 个浏览器工具 |
| `src/skills/` | 技能加载器/注册表（YAML frontmatter SKILL.md 文件） |
| `src/spec/` | Spec 驱动开发：schema、parser、tracker、validator |
| `src/shared/` | 共享 logger、schemas |
| `skills/` | 内置技能定义（加载到 `~/.floweb/`） |
| `specs/` | Spec 文件目录 |

### Agent 工具（19 个）

- **Browser（12 个）**: navigate, snapshot, snapshotDiff, click, typeText, pressKey, evaluate, listPages, switchTab, closeTab, closeSession, exec
- **Spec（5 个）**: createSpec, readSpec, updateSpec, listSpecs, markPhaseComplete
- **Skill（2 个）**: skillList, skillDescribe

## 代码规范

- **只用命名导出**，不使用 default export
- **相对导入必须加 `.js` 后缀**（ESM 要求）
- **每个领域目录一个 `index.ts`** barrel 文件
- **Zod 用于运行时校验**：配置、CLI 参数、API schema、页面信息、会话状态
- **LangChain `tool()` 辅助函数**：工具通过 `@langchain/core/tools` 的 `tool()` 创建，传入 Zod schema
- **BrowserManager 基于事件**：继承 EventEmitter，发送 `pagesChanged` / `statusChanged`
- **守护进程生命周期**：fork 子进程，通过 `process.send({ type: "ready" })` 通知就绪，SIGINT/SIGTERM 时清理
- **错误序列化**：所有错误通过 IPC 序列化为 `SerializedError`（含 cause 链）

## 配置

配置文件 `~/.floweb/config.json`，首次运行自动创建：

```json
{
  "llm": {
    "provider": "openai",
    "model": "deepseek-v4-pro",
    "apiKey": "",
    "baseUrl": "https://api.deepseek.com/v1"
  }
}
```

环境变量：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`FLOWEB_SOCKET`（`floweb run` 时自动设置给子进程）。

`resolveConfig()` 会将文件和 CLI 参数做深度合并（特别是 LLM 对象）。

## 快照系统

主要通过 CDP `Accessibility.getFullAXTree`（depth=100）抓取无障碍树。失败时回退到 DOM 交互元素扫描。每个节点分配短引用 ID（`l1`, `l2`...），渲染为 `[ref]` 格式。差异对比基于节点指纹（`role:name:value` 三元组）。

## 观察模式

Agent 空闲时监听浏览器变化。TUI 将结构化页面状态以 `[Observation]` 注入对话。用户通过自然语言表达意图即可触发/退出，无需固定的触发关键词。
