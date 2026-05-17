---
name: floweb-mcp
description: 浏览器自动化 RPA 工具（MCP 模式）。通过 MCP JSON-RPC 协议操控 Playwright 浏览器，28 个 browser tools 与 CLI 子命令 1:1 对等，支持 Session 管理、Spec 驱动开发和自动化脚本生成。
---

# Floweb MCP — 三方 Agent 浏览器自动化

你是运行在外部 Agent（Claude Code、Codex、OpenCode 等）中的 AI。你通过 MCP (Model Context Protocol) 调用 `browser_*` 工具操控 Playwright 浏览器，完成自动化任务。

## 架构

```
你（外部 Agent）
  → MCP: tools/call { name: "browser_xxx", arguments: {...} }
    → floweb MCP Server (stdin/stdout JSON-RPC)
      → DaemonClient (Unix socket IPC)
        → BrowserManager (Playwright)
```

CLI 子命令与 MCP tools 是 1:1 对等的，底层走同一个 DaemonApi。你调用的每个 MCP tool 都有对应的 CLI 命令。

## MCP Server 配置

### Claude Code

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

### 指定 Session

```json
{
  "mcpServers": {
    "floweb": {
      "command": "node",
      "args": ["dist/cli/index.js", "mcp", "--session", "my-session"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

MCP server 启动时会自动连接或 spawn 对应 session 的 daemon。

## 工具清单（28 个）

### 页面导航

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_navigate` | `url` | 打开 URL，自动补全 https:// |
| `browser_back` | — | 浏览器后退 |
| `browser_forward` | — | 浏览器前进 |
| `browser_reload` | — | 刷新当前页面 |

### 页面感知

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_snapshot` | — | 抓取 AX tree 快照，所有可交互元素带 `[ref]` ID |
| `browser_snapshot_diff` | — | 对比前后快照：+新增 -删除 ~修改 |
| `browser_list_pages` | — | 列出所有标签页及其标题/URL |
| `browser_screenshot` | — | 截取当前页面 PNG（base64） |
| `browser_compact_html` | — | 获取压缩 HTML，比原始 page.content() 小 70-90% |

### 交互操作

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_click` | `selector` | 点击元素 |
| `browser_type` | `selector`, `text` | 向输入框输入文本 |
| `browser_press` | `key` | 按键（Enter、Escape、Tab 等） |
| `browser_hover` | `selector` | 鼠标悬停 |
| `browser_scroll` | `x`, `y` | 滚动页面（像素偏移） |
| `browser_select` | `selector`, `value` | 选择下拉框选项 |
| `browser_wait` | `ms?`, `selector?` | 等待毫秒数或等待元素出现 |

### 可视反馈

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_move_cursor` | `x`, `y` | 移动可视化光标到像素坐标 |
| `browser_highlight` | `selector` | 在元素上显示高亮框 |

### 脚本执行

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_exec` | `code`, `timeout?` | 在浏览器 REPL 中执行 TypeScript/JS，已注入 page/browser/context，自动前后 diff。timeout 默认 120s |
| `browser_evaluate` | `js` | 执行 JS 并返回 JSON 序列化结果 |

### 标签页管理

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_switch_tab` | `pageId` | 切换到指定标签页 |
| `browser_close_tab` | `pageId` | 关闭指定标签页 |
| `browser_close_session` | — | 关闭浏览器会话 |

### 网络与认证

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_intercept` | `timeout?` | 被动拦截网络请求，等待指定秒数后返回捕获的 HTTP 响应（默认 5s） |
| `browser_load_profile` | `domain` | 加载已保存的认证 Profile（cookies + localStorage）并刷新页面 |
| `browser_save_profile` | `domain` | 保存当前登录态（cookies + localStorage）供后续复用 |
| `browser_audit` | — | 审计站点反爬策略（Akamai/Cloudflare/DataDome/PerimeterX 等） |

### Agent 模式

| 工具 | 参数 | 说明 |
|---|---|---|
| `browser_set_observing` | `observing` | 进入（true）或退出（false）观察模式 |

## 核心工作流：Explore → Spec → Validate → Script

### Phase 1：探索页面

1. `browser_navigate` 打开目标 URL
2. `browser_snapshot` 查看页面结构和可交互元素（所有元素带 `[ref]` ID）
3. 必要时用 `browser_compact_html` 获取完整 DOM 视角（SPA 页面首选）
4. 通过 `browser_click` `browser_type` `browser_press` 交互探索
5. 每次操作后用 `browser_snapshot_diff` 验证变化（+新增 -删除 ~修改）

### Phase 2：脚本验证

在 REPL 中逐步验证交互逻辑：

```
browser_exec({
  code: "await page.fill('#search', 'test'); await page.click('button.submit'); await page.waitForSelector('.results');"
})
```

`browser_exec` 自动做前后 snapshot diff，方便确认每步操作的效果。

### Phase 3：处理复杂页面

- **SPA 页面 snapshot 空** → 用 `browser_compact_html` 获取浓缩 DOM，从中提取 selector
- **反爬站点** → 用 `browser_audit` 审计，参考 `references/site-audit.md` 选择策略
- **需要登录** → 手动登录一次后 `browser_save_profile` 保存，后续 `browser_load_profile` 恢复

### Phase 4：生成独立脚本

根据探索结果生成独立的 Playwright 脚本。**必须**参考 `references/code-generation-rules.md` 的规范：

- 使用 Playwright locator API，禁止 `page.evaluate()` 替代 DOM 操作
- Selector 优先级：`data-testid` > `id` > `aria-label` > `text=` > `role=` > CSS
- `export default` 主函数 + 自执行入口块（`fileURLToPath` 判断 `isMain`）
- 通过 `tsc --noEmit` 类型检查

```typescript
// scripts/my-workflow.ts
import { chromium } from "playwright";
import { fileURLToPath } from "url";

type Input = { keyword: string };
type Output = { results: Array<{ title: string; url: string }> };

export default async function myWorkflow(input: Input): Promise<Output> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  try {
    await page.goto("https://example.com");
    // ... 交互逻辑
    return { results: [] };
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  myWorkflow({ keyword: process.argv[2] || "default" }).then(r => console.log(JSON.stringify(r, null, 2)));
}
```

## 操作规则

- **先 snapshot 再操作**：不知道页面结构不要盲点
- **不确定就问用户**：不要猜测该点什么、该输入什么
- **可见 ≠ 可交互**：点不动先查遮挡物
- **每次只调用一个 `browser_exec`**：不并行
- **`browser_exec` 已提供 `page` `browser` `context`**：不要在里面 `chromium.launch()`
- **SPA 页面**：连续 2 次 snapshot 返回空 → 改用 `browser_compact_html` + `browser_exec`
- **复杂任务控制在 15-20 步内完成一个子目标**：每 3-5 步总结方向
- **同一操作重复 3 次以上**：停止，换思路
- **执行有副作用的操作前获取用户确认**（提交表单、支付、删除等）

## 参考文档

- **[代码生成规范](references/code-generation-rules.md)** — Playwright locator 规则、反模式对照、API Client 模式、注释规范、自执行入口
- **[集成策略](references/integration-strategies.md)** — 4 种数据捕获方案对比、反爬检测、决策指南
- **[站点审计](references/site-audit.md)** — 集成前探测反爬策略、选择最安全的数据捕获方案
- **[会话日志](references/session-logs.md)** — 读取 `actions.jsonl` 调试操作序列、辅助生成脚本
- **[登录态管理](references/login-state.md)** — 手动登录后保存 cookies/localStorage 复用认证状态
- **[标签页管理](references/tab-management.md)** — 多页面/多 tab 定位和切换
- **[生成 Spec](references/spec-generate.md)** — 深入理解代码 → 设计方案 → 写 Phase 化 Spec
- **[审查 Spec](references/spec-review.md)** — 从欠规范/设计错误/规范符合度三维度审查
- **[实现 Spec](references/spec-implement.md)** — 逐 Phase 实现，每个 Phase 后 type-check + test
