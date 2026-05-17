# Floweb

基于终端的浏览器自动化工具，内置 LLM 驱动的 Agent。结合 Playwright 浏览器控制、LangGraph Agent 编排、React+Ink TUI，通过自然语言进行交互式网页自动化。

## 技术栈

- **运行时**: Node.js, TypeScript 5.9, ESM only
- **浏览器**: Playwright（Chromium）
- **LLM**: LangChain + LangGraph（Anthropic/OpenAI），`MemorySaver` 检查点
- **TUI**: React 19 + Ink 7
- **校验**: Zod 4
- **构建**: tsup
- **测试**: Vitest
- **IPC**: Unix domain socket，JSON-line 协议

## 构建与运行

```bash
npm run build          # tsup → dist/
npm run dev            # tsup --watch
npm run type-check     # tsc --noEmit
npm run test           # vitest run
npm run lint           # eslint .
npm run format         # prettier --write .

# Session 管理
floweb session start <name> [url]   # 创建命名 session（独立 daemon + 浏览器）
floweb session stop  <name>          # 关闭 session（close + shutdown + 清理 socket）
floweb session list                   # 列出所有运行中的 session
floweb session status [--session]     # JSON 状态

# Browser 操作（1:1 对应 MCP tools，28 个子命令）
floweb navigate|click|type|press|hover|scroll|select|wait|
       move-cursor|highlight|evaluate|exec|pages|snapshot|
       snapshot-diff|switch-tab|close-tab|close-session|
       back|forward|reload|screenshot|compact-html|intercept|
       audit|load-profile|save-profile|observe
       [--session <name>]

# 便捷命令
floweb tui [session]     # 启动 TUI
floweb open <url>        # = navigate
floweb close             # = close-session
floweb run <file>        # 通过 FLOWEB_SOCKET 运行脚本
floweb mcp               # 启动 MCP 服务器（stdin/stdout JSON-RPC）
floweb setup [target]    # 安装 skills 到 Agent 配置目录
```

## 架构

```text
                    ┌──────────────────────────────┐
                    │       DaemonApi (30+ IPC)     │
                    │  统一的浏览器操作接口          │
                    └──────────┬───────────────────┘
                               │ Unix socket / JSON-line
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌──────────┐      ┌──────────┐       ┌──────────┐
     │   CLI    │      │   MCP    │       │   TUI    │
     │ 子命令   │      │  tools   │       │  Agent   │
     │ 1:1 映射 │      │ 1:1 映射 │       │ 30+ tools│
     └──────────┘      └──────────┘       └──────────┘
            │                  │                  │
            └──────────────────┼──────────────────┘
                               ▼
                    ┌──────────────────┐
                    │   DaemonServer   │
                    │   BrowserManager │
                    │   (Playwright)   │
                    └──────────────────┘
```

CLI、MCP、TUI 三种接入方式能力完全对等，底层走同一个 DaemonApi。

### 主流程

1. CLI / MCP / TUI 各通过 Zod schema 解析参数，分发到对应处理器
2. `DaemonClient.connect()` 连接已有 daemon 或 `spawn()` fork 新进程（`child_process.fork`）
3. 命名 session 使用独立 socket（`/tmp/floweb-${uid}-<name>.sock`），默认 session 使用 `/tmp/floweb-${uid}.sock`
4. 所有操作通过 `DaemonClient.remote.*()` → IPC → `BrowserManager` → Playwright
5. 状态变更通过 `pagesChanged` / `statusChanged` 事件广播给所有客户端

### 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/cli/` | CLI 入口 + 参数解析（`args.ts` 手动解析器，`index.ts` 子命令路由） |
| `src/core/` | 配置与类型、`BrowserManager`（Playwright 封装）、快照系统、视觉反馈、会话管理 |
| `src/daemon/` | `DaemonServer`（IPC 服务端）、`DaemonClient`（IPC 客户端）、socket 连接、API 接口定义 |
| `src/agent/` | LangGraph ReAct 运行时、提示词、35 个工具 |
| `src/tui/` | React+Ink 终端 UI（聊天、浏览器面板、Agent 状态） |
| `src/mcp/` | MCP 服务器（JSON-RPC over stdin/stdout），28 个 browser 工具 |
| `src/skills/` | Skill 加载器/注册表 |
| `src/spec/` | Spec 驱动开发：schema、parser、tracker、validator |
| `src/shared/` | 共享 logger、schemas |
| `skills/` | 内置 skill 定义（`floweb` / `floweb-cli` / `floweb-mcp`） |
| `specs/` | Spec 文件目录 |
| `scripts/` | 生成的独立 Playwright 脚本 |

### Agent 工具（35 个）

- **Browser（28 个）**: `browser_navigate`, `browser_snapshot`, `browser_snapshot_diff`, `browser_click`, `browser_type`, `browser_press`, `browser_hover`, `browser_scroll`, `browser_select`, `browser_wait`, `browser_move_cursor`, `browser_highlight`, `browser_evaluate`, `browser_exec`, `browser_list_pages`, `browser_switch_tab`, `browser_close_tab`, `browser_close_session`, `browser_back`, `browser_forward`, `browser_reload`, `browser_screenshot`, `browser_compact_html`, `browser_intercept`, `browser_audit`, `browser_load_profile`, `browser_save_profile`, `browser_set_observing`
- **Spec（5 个）**: `spec_create`, `spec_read`, `spec_update`, `spec_list`, `spec_mark_phase_complete`
- **Skill（2 个）**: `skill_list`, `skill_describe`

### Skills 系统

三个 skill 覆盖不同 Agent 接入方式，共享同一套 reference 文档：

| Skill | 目录 | 适用场景 | 调用方式 |
|---|---|---|---|
| `floweb` | `skills/floweb/` | TUI 内置 LangGraph Agent | 直接调用工具（35 个） |
| `floweb-cli` | `skills/floweb-cli/` | 三方 Agent（Claude Code 等） | `floweb <subcommand>` CLI 命令 |
| `floweb-mcp` | `skills/floweb-mcp/` | 三方 Agent（Claude Code 等） | `browser_*` MCP tools |

核心工作流：Explore（探索）→ Spec（规格）→ Validate（验证）→ Script（脚本）

## 代码规范

- **只用命名导出**，不使用 default export
- **导入使用 `@/` 路径别名**映射 `./src/`，避免 `../../` 相对路径。构建时 `tsc-alias` 自动还原为相对路径
- **导入必须加 `.js` 后缀**（ESM 要求）
- **每个领域目录一个 `index.ts`** barrel 文件
- **Zod 用于运行时校验**：配置、CLI 参数、API schema、页面信息、会话状态
- **LangChain `tool()` 辅助函数**：工具通过 `@langchain/core/tools` 的 `tool()` 创建，传入 Zod schema
- **BrowserManager**：继承 EventEmitter，发送 `pagesChanged` / `statusChanged` / `userAction` 事件。操作默认 10s timeout，仅对当前活跃 page 生效
- **`browser_exec` REPL**：注入 `page` / `browser` / `context` 全局变量，变量跨调用持久化。复杂参数（`wait` 的 ms/selector、`exec` 的 timeout、`intercept` 的 timeout）需注意类型
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

`FLOWEB_SOCKET` 由 `floweb run` 自动设置给子进程，用户无需手动配置。

`resolveConfig()` 会将文件和 CLI 参数做深度合并（特别是 LLM 对象）。`sessionName` 决定 socket 路径：默认 session 用 `/tmp/floweb-${uid}.sock`，命名 session 用 `/tmp/floweb-${uid}-<name>.sock`。

## 快照系统

通过 CDP 并行发送 `Accessibility.getFullAXTree`（depth=100）和 `DOM.getDocument`（depth=-1, pierce=true），DOM 树为主体结构，AX 数据（role/name/value）富化每个节点。失败时逐级回退：AX-only → `basicFallback`（`querySelectorAll` 扫描交互元素）。每个节点分配短引用 ID（`l1`, `l2`...），渲染为 `[ref]<tag role="role"> "name" />` 格式。`snapshotDiff` 基于节点指纹（`role:name:value` 三元组 + DOM 路径），输出 `+新增 / -删除 / ~修改`。

## 观察模式

通过 `browser_set_observing(true)` 进入观察模式。BrowserManager 通过 `exposeBinding` 捕获用户在浏览器中的手动点击和输入，以 `USER_ACTION` 事件上报。Agent 收到 `[User Action]` + `[Snapshot Diff]` 消息，实时分析用户意图。`browser_set_observing(false)` 退出，Agent 总结操作过程并建议可自动化步骤。用户通过自然语言表达进出意图，不依赖固定关键词。
