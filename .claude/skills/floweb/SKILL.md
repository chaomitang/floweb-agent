---
name: floweb
description: 浏览器自动化 RPA 工具。通过 Browser Daemon 操控 Playwright 浏览器，支持 TUI 内置 Agent、Claude Code、MCP 等多种 Agent 接入方式，统一产出 Playwright 自动化脚本。
---

# Floweb — 浏览器自动化 RPA

## 架构

```
Agent（TUI / Claude Code / Codex / MCP Client）
  → DaemonClient (Unix socket IPC)
    → DaemonServer
      → BrowserManager（Playwright CDP）
```

所有 Agent 通过同一套 Daemon 操控浏览器。切换 Agent 不影响自动化脚本的生成流程。

## 使用方式

### TUI 内置 Agent

```bash
floweb tui                 # 启动 TUI，内建 LangGraph Agent
```

TUI 内可通过对话操控浏览器，或在浏览器中手动操作、Agent 自动观察并总结。

### Claude Code（外部 Agent）

```bash
# 方式 1：在已有 daemon 会话中执行操作
floweb open <url>          # 打开页面
floweb snapshot            # 抓取快照
floweb pages               # 列出标签页
floweb close               # 关闭会话

# 方式 2：通过 FLOWEB_SOCKET 在脚本中操控浏览器
floweb run <script.ts>     # 运行脚本，自动注入 page/browser/context

# 方式 3：MCP 服务器模式
floweb mcp                 # 启动 JSON-RPC MCP 服务器
```

Claude Code 应将 `floweb` MCP 配置到项目中：

```json
{
  "mcpServers": {
    "floweb": {
      "command": "node",
      "args": ["dist/cli/index.js", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### 观察模式（跨 Agent）

观察模式让用户手动操作浏览器，Agent 自动跟踪页面变化、分析意图、总结结果。

- **TUI Agent**：用户直接操作共享浏览器页面，Agent 自动检测变化并分析
- **Claude Code / MCP**：用户操作浏览器，Agent 通过定时 snapshot 感知变化

## 核心工作流

无论使用哪种 Agent，RPA 脚本生成的流程是统一的：

1. **探索页面** → `browser_snapshot` 查看页面结构和可交互元素，`browser_compact_html` 获取 HTML 视角
2. **操作交互** → `browser_click`、`browser_type`、`browser_press`、`browser_navigate`
3. **验证变化** → `browser_snapshot_diff` 查看 +新增 / -删除 / ~修改
4. **执行脚本** → `browser_exec` 在浏览器 REPL 中运行代码，自动 diff
5. **产出脚本** → 验证过的 Playwright 脚本，可直接部署

## 工具参考

### 页面导航

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开 URL，自动补全 https:// |
| `browser_back` | 浏览器后退 |
| `browser_forward` | 浏览器前进 |
| `browser_reload` | 刷新当前页面 |

### 页面感知

| 工具 | 用途 |
|------|------|
| `browser_snapshot` | 抓取合并快照（DOM 结构 + AX 角色 + 属性），所有可交互元素带 [ref] ID |
| `browser_snapshot_diff` | 对比前后快照：+新增、-删除、~修改 |
| `browser_compact_html` | 获取浓缩 HTML，比原始 page.content() 小 70-90% |
| `browser_screenshot` | 截取当前页面 PNG 截图 |
| `browser_list_pages` | 列出所有标签页 |

### 页面交互

| 工具 | 用途 |
|------|------|
| `browser_click` | 通过 CSS selector 点击元素 |
| `browser_type` | 向输入框输入文本 |
| `browser_press` | 按键（Enter、Escape、Tab 等） |
| `browser_hover` | 鼠标悬停在元素上 |
| `browser_scroll` | 滚动页面（x/y 像素） |
| `browser_select` | 选择下拉框选项 |
| `browser_wait` | 等待毫秒数或元素出现 |
| `browser_move_cursor` | 移动可视化光标到指定坐标 |
| `browser_highlight` | 在元素上显示高亮框 |

### 脚本执行

| 工具 | 用途 |
|------|------|
| `browser_exec` | 在浏览器 REPL 中执行 TypeScript/JS，已注入 page/browser/context，自动前后 diff |
| `browser_evaluate` | 执行 JS 并返回 JSON 序列化结果 |

### 标签页管理

| 工具 | 用途 |
|------|------|
| `browser_switch_tab` | 切换标签页 |
| `browser_close_tab` | 关闭标签页 |
| `browser_close_session` | 关闭整个浏览器会话 |

### 网络与认证

| 工具 | 用途 |
|------|------|
| `browser_intercept` | 被动拦截网络请求，捕获 HTTP 响应 |
| `browser_load_profile` | 加载已保存的认证 Profile（cookies + localStorage） |
| `browser_save_profile` | 保存当前登录态供后续复用 |
| `browser_audit` | 审计站点反爬策略（Akamai/Cloudflare/DataDome 等） |

### Agent 模式

| 工具 | 用途 |
|------|------|
| `browser_set_observing` | 进入/退出观察模式（true=观察，false=对话） |

## 操作规则

### 通用规则（所有 Agent）

- 先 snapshot 理解页面结构，再操作
- 不确定该点什么、该输入什么 → 问用户，不要猜
- 可见 ≠ 可交互；点不动先查遮挡物
- 每次只跑一个 `browser_exec`，不并行
- 执行有副作用的操作前获取用户确认
- `browser_exec` 已提供 `page`、`browser`、`context`，**不要**在里面 `chromium.launch()`

### SPA 页面处理

如果连续 2 次 `browser_snapshot` 返回空或极少元素（常见于 React/Vue SPA）：
1. 用 `browser_compact_html` 获取浓缩 DOM，从中提取 CSS selector
2. 用 `browser_exec` 直接操作 DOM
3. 不要再反复调用 `browser_snapshot`

### 观察模式

- 用户表达观察意图（"watch"、"观察"、"看着我操作"）→ `browser_set_observing(true)`
- 观察模式下保持静默，等待页面变化推送
- 用户表达操作完成（"好了"、"done"、"分析一下"）→ `browser_set_observing(false)` 并总结

### 步骤控制

- 复杂任务控制在 15-20 步内完成一个子目标
- 每 3-5 步总结判断方向
- 同一页面同一操作重复 3 次以上 → 停止，换思路

## 生成 Playwright 脚本

最终产出标准的 Playwright 脚本。参考以下文档：

- **[代码生成规范](references/code-generation-rules.md)** — locator 规则、反模式、API Client 模式
- **[集成策略](references/integration-strategies.md)** — 数据捕获方案对比、反爬决策
- **[站点审计](references/site-audit.md)** — 探测反爬、选择安全策略
- **[会话日志](references/session-logs.md)** — 读取 actions.jsonl 辅助生成脚本
- **[登录态管理](references/login-state.md)** — cookies/localStorage 复用

## Spec 驱动开发

- **[生成 Spec](references/spec-generate.md)** — 设计方案 → Phase 化 Spec
- **[审查 Spec](references/spec-review.md)** — 三维度审查
- **[实现 Spec](references/spec-implement.md)** — 逐 Phase 实现 + 验证
