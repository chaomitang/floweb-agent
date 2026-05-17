---
name: floweb-cli
description: 浏览器自动化 RPA 工具（CLI 模式）。通过 floweb CLI 子命令操控 Playwright 浏览器，所有操作通过 shell 命令执行，支持 Session 管理、Spec 驱动开发和自动化脚本生成。
---

# Floweb CLI — 三方 Agent 浏览器自动化

你是运行在外部 Agent（Claude Code、OpenCode 等）中的 AI。你通过执行 `floweb` shell 命令操控 Playwright 浏览器，完成自动化任务。

## 架构

```
你（外部 Agent）
  → bash: floweb <subcommand> [--session <name>]
    → DaemonClient (Unix socket IPC)
      → BrowserManager (Playwright)
```

所有命令底层通过同一个 DaemonApi 接口与浏览器通信。CLI 子命令与 MCP tools 是 1:1 对等的。

## Session 管理

Session 是独立的浏览器实例。先创建 session，再操作，最后关闭。

```bash
# 创建命名 session（可同时创建多个，互不干扰）
floweb session start <name> [url]

# 查看所有运行中的 session
floweb session list

# 查看某个 session 的状态
floweb session status --session <name>

# 关闭 session（浏览器 + daemon 进程 + socket 清理）
floweb session stop <name>
```

若不指定 `--session`，所有命令使用默认 session（`/tmp/floweb-${uid}.sock`）。

## 浏览器操作命令

所有命令 1:1 对应 DaemonApi，与 MCP 工具完全对等。

### 页面导航

```bash
floweb navigate <url>              [--session <name>]
floweb back                        [--session <name>]
floweb forward                     [--session <name>]
floweb reload                      [--session <name>]
```

### 页面感知

```bash
floweb snapshot                    [--session <name>]   # 输出 AX tree 文本
floweb snapshot-diff               [--session <name>]   # 对比前后快照
floweb pages                       [--session <name>]   # 列出标签页
floweb screenshot                  [--session <name>]   # base64 PNG
floweb compact-html                [--session <name>]   # 压缩 HTML，节省 70-90%
```

### 交互操作

```bash
floweb click <selector>            [--session <name>]
floweb type <selector> <text>      [--session <name>]
floweb press <key>                 [--session <name>]
floweb hover <selector>            [--session <name>]
floweb scroll <x> <y>              [--session <name>]
floweb select <selector> <value>   [--session <name>]
floweb wait --ms <N>               [--session <name>]
floweb wait --selector <css>       [--session <name>]
```

### 可视反馈

```bash
floweb move-cursor <x> <y>         [--session <name>]
floweb highlight <selector>        [--session <name>]
```

### 脚本执行

```bash
# 在浏览器 REPL 中执行代码（已注入 page/browser/context）
floweb exec <code>                 [--session <name>] [--timeout <ms>]

# 执行 JS 并返回 JSON
floweb evaluate <js>               [--session <name>]
```

### 标签页

```bash
floweb switch-tab <pageId>         [--session <name>]
floweb close-tab <pageId>          [--session <name>]
floweb close-session               [--session <name>]
```

### 网络与认证

```bash
floweb intercept [--timeout <sec>] [--session <name>]   # 被动拦截 HTTP 响应
floweb load-profile <domain>       [--session <name>]   # 加载 cookies/localStorage
floweb save-profile <domain>       [--session <name>]   # 保存登录态
floweb audit                       [--session <name>]   # 审计反爬策略
```

### Agent 模式

```bash
floweb observe <on|off>            [--session <name>]   # 观察模式
```

## 核心工作流：Explore → Spec → Validate → Script

### Phase 1：探索页面

```bash
floweb session start my-task https://目标网站
floweb snapshot --session my-task    # 查看页面结构
```

分析 snapshot 输出：每个可交互元素都有 `[ref]` ID 和 role/name/value 信息。找到目标元素的 CSS selector，执行交互：

```bash
floweb type "#search" "关键词" --session my-task
floweb click "button.submit" --session my-task
floweb snapshot-diff --session my-task   # 验证页面变化
```

### Phase 2：脚本验证

在 REPL 中逐步验证交互逻辑：

```bash
floweb exec "
  await page.fill('#search', 'test');
  await page.click('button.submit');
  await page.waitForSelector('.results');
  console.log('results loaded');
" --session my-task
```

`floweb exec` 自动做前后 snapshot diff，方便确认每步操作的效果。

### Phase 3：处理复杂页面

SPA 页面 snapshot 可能返回空 → 用 `floweb compact-html` 获取浓缩 DOM，从中提取 selector。

反爬站点 → 用 `floweb audit` 审计，参考 `references/site-audit.md` 选择策略。

需要登录 → 手动登录一次后用 `floweb save-profile <domain>` 保存，后续用 `floweb load-profile <domain>` 恢复。

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

### Phase 5：清理

```bash
floweb session stop my-task
```

## 操作规则

- **先 snapshot 再操作**：不知道页面结构不要盲点
- **不确定就问用户**：不要猜测该点什么、该输入什么
- **每次只跑一个 `floweb exec`**：不并行执行
- **SPA 页面**：连续 2 次 snapshot 返回空 → 改用 `floweb compact-html` + `floweb exec`
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
