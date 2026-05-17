## Problem overview

Floweb 的核心是 spec 驱动开发自动化脚本。当前 `src/spec/` 系统支持 agent 编写 spec 文档、解析 phase、追踪进度，但存在三个断层：

1. **Spec 中的 successCriteria 只是给人看的文本。** Agent 执行完一个 phase 后，无法用 successCriteria 自动验证页面状态是否符合预期。它必须手动调用 `browser_snapshot` / `browser_evaluate` 来检查，依赖自己的推理能力判断「这是否符合 successCriteria 的描述」。
2. **浏览器操作的返回值信息密度太低。** `browser_click` 返回 `Clicked "button#login"`，agent 不知道页面发生了什么变化。它必须在每次操作后额外调用 `browser_snapshot` 或 `browser_snapshot_diff`，导致工具调用量翻倍、token 消耗翻倍、速度变慢。
3. **迭代必须重头跑。** Phase 1 和 2 已经通过验证，但 phase 3 失败后，修改脚本必须从 phase 1 重新开始——浪费时间和 token。

## Solution overview

扩展 `src/spec/` schema，让 spec phase 包含**可执行的 actions 和 asserts**，而不仅仅是给人看的 successCriteria。同时：

- **Recording 层**：每个 browser 操作自动录制 before/after snapshot + diff，agent 在工具返回值中直接看到
- **可执行断言**：`browser_assert` 工具 + spec phase 内的 `asserts` 字段，agent 不需要手动判断
- **Phase checkpoint**：每个 phase 通过后自动 checkpoint，后续可增量重放
- **Spec 生成来源**：agent 从两个渠道生成 spec——（A）观察用户手动操作（observation mode 的 [User Action] + [Snapshot Diff]）和（B）对话中用户用自然语言描述需求

核心原则：**同一个 spec markdown 文件，人看是文档，agent 看是可执行剧本，机器跑是自动化脚本。**
Spec 格式是 markdown（`.md`）——`actions` 和 `asserts` 作为 phase 内的 YAML fenced code block 嵌入，不破坏人可读性。

## Goals

- [ ] `SpecPhaseSchema` 增加 `actions` 和 `asserts` 字段，将 phase 从纯文本升级为可执行单元
- [ ] `spec_mark_phase_complete` 在标记完成前自动执行 phase 的 actions 和 asserts，失败时阻止标记并提供诊断
- [ ] 每个 mutation 类 browser 操作（click/type/navigate/select/scroll/press）自动在工具返回值中附加 URL 变化和 DOM diff 摘要
- [ ] 新增 `browser_assert` 工具，断言失败时返回 expected vs actual 对比和页面上下文
- [ ] 每个 phase 完成时自动保存 checkpoint（URL + snapshot + 累积操作序列），支持从 checkpoint 增量重放
- [ ] Spec 的 successCriteria 仍然保留（给人看），`asserts` 是其对应的可执行版本（给机器跑）
- [ ] 现有的 5 个 spec 工具和 28 个 browser 工具接口向后兼容

## Non-goals

- [ ] 不做 TUI timeline 面板——recording 数据通过工具返回值消费，人通过 spec 文档 + screenshot 查看
- [ ] 不做传统的断点/单步调试——spec 的 asserts 是天然的验证点
- [ ] 不修改 LangGraph Agent 运行时——ReAct loop 不变，只是工具返回值更丰富
- [ ] 不持久化 checkpoint 到当前 session 外部——session 关闭即清除
- [ ] 不改变 spec 文件的 markdown 结构——`actions` 和 `asserts` 作为 Phase 内部的 YAML/JSON block 嵌入，不破坏现有人可读的格式

## Important files

- `src/spec/schema.ts` — SpecPhaseSchema、SpecSchema，需增加 actions/asserts 字段
- `src/spec/parser.ts` — spec markdown 解析，需支持解析 actions/asserts 代码块
- `src/spec/tracker.ts` — phase 状态追踪，`markPhaseComplete` 需要触发执行
- `src/agent/tools/spec.tools.ts` — spec_create/read/update/list/markPhaseComplete
- `src/agent/tools/browser.tools.ts` — 28 个 browser 工具，需增强返回值 + 新增 browser_assert
- `src/core/browser/manager.ts` — BrowserManager，需嵌入录制逻辑
- `src/core/browser/snapshot.ts` — PageSnapshot 类型
- `src/core/browser/snapshot-diff.ts` — diffSnapshots 函数
- `src/core/browser/exec-repl.ts` — DaemonExecRepl，browser_assert 利用它执行断言条件
- `src/daemon/ipc/api.ts` — DaemonApi 接口，可能需要新增 recording 相关方法
- `src/agent/prompts.ts` — 系统提示词，需告知 agent 如何利用 assertion/recording

## Implementation

### Phase 1: Extend Spec schema with executable actions and asserts

扩展 `SpecPhaseSchema`，在保留现有 `description` 和 `successCriteria` 的同时，新增两个可选字段：

```ts
// src/spec/schema.ts

export const SpecActionSchema = z.object({
  tool: z.string(),              // "browser_navigate" | "browser_click" | ...
  args: z.record(z.unknown()),   // { url: "https://..." } | { selector: "..." }
});

export const SpecAssertSchema = z.object({
  condition: z.string(),         // "page.url().includes('/dashboard')"
  description: z.string(),       // "navigated to dashboard after login"
});

export const SpecPhaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  actions: z.array(SpecActionSchema).optional(),      // NEW
  asserts: z.array(SpecAssertSchema).optional(),      // NEW
  successCriteria: z.array(z.string()),
  codeSample: z.object({
    file: z.string(),
    code: z.string(),
  }).optional(),
});
```

Spec 文件中的表示方式——Phase 内嵌入 YAML 代码块：

```markdown
### Phase 2: Fill login form and submit

Navigate to the login page, fill credentials, and click submit.

**Actions:**
\`\`\`yaml
- tool: browser_navigate
  args:
    url: https://example.com/login
- tool: browser_type
  args:
    selector: input[name="email"]
    text: test@example.com
- tool: browser_type
  args:
    selector: input[name="password"]
    text: password123
- tool: browser_click
  args:
    selector: button[type="submit"]
\`\`\`

**Asserts:**
\`\`\`yaml
- condition: page.url().includes('/dashboard')
  description: navigated to dashboard after login
- condition: "await page.locator('h1').textContent()?.includes('Welcome')"
  description: dashboard welcome message visible
\`\`\`

- [ ] Navigate to login page successfully
- [ ] Fill credentials and submit
- [ ] Verify redirect to dashboard
- [ ] Verify welcome message is visible
```

- [ ] 扩展 `src/spec/schema.ts` 增加 `SpecActionSchema` 和 `SpecAssertSchema`
- [ ] 扩展 `src/spec/parser.ts` 解析 YAML 代码块：在 phase 解析时检测 `**Actions:**` 后的 YAML fence block 和 `**Asserts:**` 后的 YAML fence block
- [ ] YAML 解析使用现有的项目依赖（如果没有，直接用 `JSON.parse` 对 JSON 格式也支持——或者用简单的行解析避免引入新依赖）
- [ ] 类型检查通过：`pnpm type-check`

### Phase 2: Recording engine in BrowserManager

在 BrowserManager 中嵌入录制逻辑。录制是透明的，自动发生在 mutation 操作中，不需要 agent 手动触发。

```ts
// src/core/browser/recorder.ts

interface RecordingFrame {
  seq: number;
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  before: {
    url: string;
    title: string;
    snapshotText: string;
  };
  after: {
    url: string;
    title: string;
    snapshotText: string;
    diffText: string;
  };
  durationMs: number;
  error: string | null;
}
```

- [ ] 新增 `src/core/browser/recorder.ts`
  - `Recorder` 类：`start(sessionName)` / `record(frame)` / `getFrames()` / `getRecordingPath()` / `flush()`
  - 录制文件路径：`~/.floweb/sessions/<name>/recording.jsonl`
  - 启动时自动清理旧录制文件（或 append session 时间戳后缀）
- [ ] 在 BrowserManager 中，对每个 mutation 操作包装录制逻辑：
  - `navigate`, `click`, `typeText`, `pressKey`, `select`, `scroll`, `hover`, `goBack`, `goForward`, `reload`
  - before：操作前抓 snapshot + url + title
  - after：操作后等待页面稳定 → 抓 snapshot → 计算 diff
  - 错误时：after 抓当前状态，设置 `error` 字段
- [ ] 只读操作（`snapshot`, `screenshot`, `pages`, `compact-html`, `evaluate`）不录制
- [ ] 录制随 `createSession` 开始，随 `closeSession` flush 到磁盘

### Phase 3: Enriched browser tool return values

修改 browser tool 的返回值，嵌入录制信息。Agent 不再需要每次操作后手动 snapshot。

成功返回格式：
```
✓ Clicked button[type="submit"] (0.3s)
  URL: /login → /dashboard
  Diff: +41 nodes, −5 nodes
    + [l45] h1 "Dashboard"
    + [l46] div "Welcome back"
    − [l12] div "Please sign in"
  [rec:3]
```

失败返回格式：
```
✗ Clicked button[type="submit"] (2.1s)
  URL: /login (unchanged)
  Error: Timeout 30000ms exceeded
  [rec:3]
  Tip: run browser_snapshot to inspect current page
```

- [ ] 在 `src/agent/tools/browser.tools.ts` 的每个 mutation tool 中，调用 BrowserManager 获取最近一次 recording frame
- [ ] 新增 `formatToolResult(frame: RecordingFrame): string` 格式化工具返回值
  - 成功：checkmark + action + duration + URL change + top 3 diff entries
  - 失败：crossmark + action + duration + URL + error + tip
  - `[rec:N]` 标记帧号，agent 可引用
- [ ] URL change 用箭头表示：`不变时不显示`，`变化时显示 before → after`
- [ ] Diff 摘要截取前 3 条新增/删除节点，避免返回值过长

### Phase 4: `browser_assert` tool

新增第 29 个 browser 工具，让 agent 在任意时刻断言页面状态。

```ts
{
  name: "browser_assert",
  description: "验证当前页面的某个条件是否成立。condition 是 Playwright JS 表达式（在 page 上下文中执行）。失败时返回 expected vs actual 和页面上下文。stopOnFail=false 时只记录失败不中断。",
  schema: z.object({
    condition: z.string(),
    description: z.string(),
    stopOnFail: z.boolean().optional().default(true),
  })
}
```

通过返回（PASS）：
```
✓ PASS: navigated to dashboard after login
  Condition: page.url().includes('/dashboard')
  URL: https://example.com/dashboard
```

不通过返回（FAIL）：
```
✗ FAIL: dashboard welcome message visible
  Expected: page.locator('h1').textContent()?.includes('Welcome')
  Actual:   h1 textContent = "Sign In"
  Context:
    URL:     https://example.com/dashboard
    Title:   My App
    Snapshot excerpt:
      [l1] heading "Sign In"
      [l2] textbox "Email" value="test@example.com"
      [l3] textbox "Password"
      [l4] button "Login"
      [l5] div.error "Invalid credentials"
  Last 3 actions:
    [rec:1] browser_navigate https://example.com/login
    [rec:2] browser_type input[name="email"] → "test@..."
    [rec:3] browser_click button[type="submit"] ← error here
  Hint: Login failed with "Invalid credentials".
        Check if the password is correct or the account exists.
```

- [ ] 新增 `browser_assert` 到 `src/agent/tools/browser.tools.ts`
- [ ] 断言条件通过 `DaemonExecRepl.run()` 执行（利用已有基础设施，page/context/browser 已注入）
- [ ] 失败时自动抓取：当前 URL、title、snapshot 前 10 行、最近 3 个 recording frame
- [ ] 对明显危险的条件表达式（含 `require(`, `process.exit`, `fetch(` 等）返回明确错误
- [ ] `stopOnFail: false`：只记录失败，不抛异常——适用于批量软断言
- [ ] 返回值中的 `Hint` 由简单规则生成：error 中包含 "credentials" → 提示检查密码；包含 "timeout" → 提示检查选择器；否则省略

### Phase 5: Execute actions + asserts on spec_mark_phase_complete

`spec_mark_phase_complete` 不再是简单的文本替换，而是在标记完成前实际执行 phase 的 actions 和 asserts。

流程：
```
spec_mark_phase_complete(name="login-flow", phaseTitle="Phase 2: Fill login form")
  │
  ├─ 1. Parse spec → extract Phase 2
  ├─ 2. If phase.actions:
  │      for each action:
  │        execute tool(action.tool, action.args)
  │        recording auto-captures before/after
  │        if error → stop, report failure, do NOT mark complete
  ├─ 3. If phase.asserts:
  │      for each assert:
  │        eval condition via DaemonExecRepl
  │        if fail → report expected/actual, stop, do NOT mark complete
  ├─ 4. All passed → save checkpoint (URL + snapshot + frame#)
  └─ 5. Mark successCriteria as [x] in spec file
```

- [ ] 修改 `src/agent/tools/spec.tools.ts` 的 `spec_mark_phase_complete`：
  - 解析 spec 找到对应 phase
  - 如果 phase 有 `actions`，遍历执行每个 action tool
  - 如果 phase 有 `asserts`，遍历执行每个 assert
  - 全部通过后才修改文件标记 [x]
  - 同时保存 checkpoint
- [ ] `spec_mark_phase_complete` 需要访问 BrowserManager/DaemonClient 来执行浏览器操作
  - 当前 `createSpecTools` 只接收 `specsDir` 参数
  - 需要增加可选的 `executeAction` 和 `executeAssert` 回调参数
- [ ] 返回值的格式：
  - 全部通过：`Phase "Phase 2: Fill login form" completed. 4 actions, 2 assertions passed. Checkpoint saved at seq=7.`
  - 某个 assert 失败：`Phase "Phase 2" FAILED. Assertion #2 failed: dashboard welcome message visible. <expected/actual details>. Actions 1-4 succeeded.`
  - 某个 action 失败：`Phase "Phase 2" FAILED. Action #3 (browser_click button[type="submit"]) failed: Timeout.`

### Phase 6: Checkpoint system for incremental rerun

每个 phase 通过后保存 checkpoint，后续 spec 运行可从任意 checkpoint 恢复。

```ts
// src/core/browser/checkpoint.ts

interface Checkpoint {
  phaseIndex: number;
  phaseTitle: string;
  url: string;
  snapshotText: string;
  screenshotPath?: string;
  recordingSeq: number;
  timestamp: string;
}
```

恢复流程：
```
// Agent 修复了 phase 3，只想重跑 phase 3
// 1. 找到 phase 2 的 checkpoint
// 2. Navigate to checkpoint URL
// 3. 快速重放（无 stability wait）recording frames 1..checkpoint.recordingSeq
// 4. 继续执行 phase 3 的 actions + asserts
```

- [ ] 新增 `src/core/browser/checkpoint.ts`
  - `CheckpointStore` 类：`save(phaseIndex, frameSeq)` / `get(phaseIndex)` / `getLatest()` / `list()`
  - 存储在 session 目录：`~/.floweb/sessions/<name>/checkpoints.json`
- [ ] 在 BrowserManager 或 spec tools 中：`spec_mark_phase_complete` 成功后自动调用 `checkpointStore.save()`
- [ ] 重新运行 phase 时：如果存在前一个 phase 的 checkpoint，先通过快速重放到 checkpoint 状态，然后执行当前 phase
  - 快速重放：不等待页面稳定（假定确定性），每个操作完成后直接发下一个
  - 如果快速重放失败（DOM 状态不匹配），回退到完整重跑
- [ ] `floweb run` 增加 `--from-phase N` flag（或 agent 通过更新 spec 文件标记来实现——phase 标记为已完成的不再执行）

### Phase 7: Update agent prompts and skill docs

更新 agent 的 system prompt 和 skill 文档，让 agent 知道如何使用增强后的 spec 系统。

- [ ] 更新 `src/agent/prompts.ts` 的 `BASE_PROMPT`，增加：
  - browser_assert 工具的用途和使用方式
  - spec phase 的 actions/asserts 字段说明
  - 利用 enriched tool returns 中的 diff 信息判断操作结果，避免不必要的 browser_snapshot
  - 失败时的诊断流程：看 assert 返回的 expected/actual → 看 last actions 列表 → 修 spec → 从 checkpoint 重跑
- [ ] 更新 `skills/floweb/SKILL.md`，在 spec 驱动开发部分增加 actions/asserts 的编写规范
- [ ] 在 prompts 中说明：`successCriteria` 是给人看的（文档用途），`asserts` 是给机器验证的（执行用途），两者应保持对应关系

## Future work

### Spec 自动生成：Observation → Spec

Observing mode 已能捕获用户的点击、输入、滚动等操作（`USER_ACTION` 事件），结合 recording 层的 before/after snapshot，agent 可以分析用户操作并自动生成 spec：

```
User: "帮我记录接下来的操作"

Agent 进入观察模式 → browser_set_observing(true)

User 手动操作:
  1. navigate to https://github.com/login
  2. type "user@email.com" into #login_field
  3. type "password" into #password
  4. click input[type="submit"]

Agent 观察:
  [User Action] navigate ...    → 对应 browser_navigate
  [User Action] type ...        → 对应 browser_type
  [Snapshot Diff] +41 nodes     → 页面变化：出现了 h1 "Dashboard"

User: "好了"

Agent 退出观察模式 → browser_set_observing(false)
Agent 分析录制帧，生成 spec:

  ### Phase 1: Login to GitHub
  **Actions:**
  ```yaml
  - tool: browser_navigate
    args:
      url: https://github.com/login
  - tool: browser_type
    args:
      selector: "#login_field"
      text: "user@email.com"
  ...
  ```
  **Asserts:**
  ```yaml
  - condition: page.url().includes('/dashboard')
    description: logged in successfully
  ```
```

这个流程不需要额外的开发工作——它完全建立在已有的 observation mode + recording + spec 系统之上。agent prompt 中已有相关指令，后续可考虑：
- 自动从 diff 中提取 assert condition（如 URL 从 `/login` 变为 `/dashboard` → 自动生成 `page.url().includes('/dashboard')`）
- 将用户操作序列直接翻译为 spec actions YAML
- 多轮对话中逐步 refine spec（用户说"这里不对" → agent 定位到对应 phase → 修改）
