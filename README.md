# floweb

基于终端的浏览器自动化工具，内置 LLM 驱动的 Agent。结合 Playwright 浏览器控制、LangGraph Agent 编排、React+Ink TUI，通过自然语言进行交互式网页自动化。

## 安装

```bash
npm install
npm run build
```

## 快速开始

```bash
# 启动命名 session
floweb session start mybot https://example.com

# 打开网页
floweb open https://example.com

# 启动 TUI（对话式交互）
floweb tui

# 运行自动化脚本
floweb run script.js

# MCP 模式
floweb mcp
```

## 技术栈

- **运行时**: Node.js, TypeScript 5.9, ESM
- **浏览器**: Playwright（Chromium）
- **LLM**: LangChain + LangGraph（Anthropic/OpenAI）
- **TUI**: React 19 + Ink 7
- **构建**: tsup

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

## Skills 系统

| Skill | 适用场景 | 调用方式 |
|---|---|---|
| `floweb` | TUI 内置 LangGraph Agent | 直接调用工具（35 个） |
| `floweb-cli` | 三方 Agent（Claude Code 等） | `floweb <subcommand>` CLI 命令 |
| `floweb-mcp` | 三方 Agent（Claude Code 等） | `browser_*` MCP tools |

核心工作流：Explore（探索）→ Spec（规格）→ Validate（验证）→ Script（脚本）

## Session 管理

```bash
floweb session start <name> [url]   # 创建命名 session
floweb session stop  <name>          # 关闭 session
floweb session list                   # 列出运行中的 session
floweb session status                 # JSON 状态
```

## 配置

`~/.floweb/config.json`：

```json
{
  "llm": {
    "provider": "openai | anthropic",
    "model": "...",
    "apiKey": "...",
    "baseUrl": "..."
  },
  "sessionName": "default"
}
```
