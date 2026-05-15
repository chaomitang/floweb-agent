---
name: floweb
description: 浏览器自动化 + Spec 驱动开发。导航页面、抓取快照、点击元素、生成/审查/实现 Spec、执行脚本并验证。
---

# Floweb

## 浏览器自动化

### 核心工作流

1. **先 snapshot** → `browser_snapshot` 查看页面结构和可交互元素
2. **再操作** → `browser_click`、`browser_type`、`browser_press`、`browser_navigate`
3. **后验证** → `browser_snapshot_diff` 查看变化（+新增、-删除、~修改）
4. **最终产出** → 验证过的 Playwright 脚本

### 工作规则

- 宣布当前 session 和页面
- 不确定该点什么、该输入什么 → 问用户，不要猜
- 可见 ≠ 可交互；点不动先查遮挡物
- 每次只跑一个 `browser_exec`，不并行
- 探索会话视为即弃，除非用户要求保留
- 执行有副作用的操作前获取用户确认
- 验证时**用 `browser_exec` 逐步执行**，在共享浏览器中确认每步结果正确
- `browser_exec` 已提供 `page`、`browser`、`context`，**不要**在里面 `chromium.launch()`
- 用户表达观察意图（"watch"、"observe"、"观察"、"看着我操作"等）→ 调用 `browser_set_observing(true)` 进入观察模式，然后静默等待页面变化推送
- 用户表达操作完成（"好了"、"done"、"分析一下"、"总结"等）→ 调用 `browser_set_observing(false)` 退出观察模式并给出总结
- 观察模式下用户可能边聊边操作 → 保持观察状态，不要每收到一条消息就退出
- `browser_snapshot` 输出中看到 `Compacted HTML fallback (CDP AXTree unavailable)` 时，说明无障碍树获取失败，已自动回退到浓缩 HTML，无需额外操作
- `browser_snapshot` 结果中某个元素的 tag/id/href/placeholder 看不清 → 用 `browser_compact_html` 获取 HTML 源码视角的属性信息
- **SPA 空 AXTree 应对**：如果连续 2 次 `browser_snapshot` 返回空或极少的无障碍树（常见于 React/Vue SPA 页面），**立即切换策略**：
  1. 用 `browser_compact_html` 获取浓缩 DOM 结构，从中提取 CSS selector
  2. 用 `browser_exec` 直接操作 DOM 查找元素、读取内容
  3. 不要再反复调用 `browser_snapshot`，它不会突然有数据
- **控制步骤数**：复杂探索任务控制在 15-20 步内完成一个子目标。每 3-5 步做一次总结判断方向是否正确。发现循环（同一页面同一操作重复 3 次以上）立即停止，换个思路

### 工具速查

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开 URL，自动补全 https:// |
| `browser_back` | 浏览器后退 |
| `browser_forward` | 浏览器前进 |
| `browser_reload` | 刷新当前页面 |
| `browser_snapshot` | 抓取无障碍树快照（标题、URL、可交互元素 + ref ID），CDP 失败时自动 fallback 到浓缩 HTML |
| `browser_snapshot_diff` | 对比前后快照（+新增、-删除、~修改） |
| `browser_compact_html` | 获取浓缩 HTML（去除了 <script>/<style>、注释、base64、非语义类名），比原始 HTML 小 70-90% |
| `browser_click` | 通过 CSS selector 点击元素 |
| `browser_type` | 向输入框输入文本 |
| `browser_press` | 按键（Enter、Escape、Tab 等） |
| `browser_hover` | 鼠标悬停在元素上 |
| `browser_scroll` | 滚动页面（x/y 像素） |
| `browser_select` | 选择下拉框选项 |
| `browser_wait` | 等待毫秒数或元素出现 |
| `browser_exec` | 在浏览器中执行 TypeScript/JS，**执行前后自动 diff** |
| `browser_evaluate` | 执行 JS 并返回结果 |
| `browser_list_pages` | 列出所有标签页 |
| `browser_switch_tab` | 切换标签页 |
| `browser_close_tab` | 关闭标签页 |
| `browser_close_session` | 关闭会话 |
| `browser_intercept` | 被动拦截网络请求，捕获 HTTP 响应 |
| `browser_load_profile` | 加载已保存的认证 Profile（cookies + localStorage） |
| `browser_save_profile` | 保存当前登录态供后续复用 |
| `browser_audit` | 审计站点反爬策略 |
| `browser_screenshot` | 截取当前页面 PNG 截图 |
| `browser_set_observing` | 进入/退出观察模式（true=观察，false=对话） |

### 生成脚本时必读

生成生产代码前，**先读以下参考文档**：

- **[代码生成规范](references/code-generation-rules.md)** — Playwright locator 规则、反模式对照、API Client 模式、注释规范
- **[集成策略](references/integration-strategies.md)** — 4 种数据捕获方案对比、反爬检测、决策指南
- **[站点审计](references/site-audit.md)** — 集成前探测反爬策略、选择最安全的数据捕获方案
- **[会话日志](references/session-logs.md)** — 读取 `actions.jsonl` 调试操作序列、辅助生成脚本
- **[登录态管理](references/login-state.md)** — 手动登录后保存 cookies/localStorage 复用认证状态
- **[标签页管理](references/tab-management.md)** — 多页面/多 tab 定位和切换

---

## Spec 驱动开发

先读对应 reference，再执行：

- **[生成 Spec](references/spec-generate.md)** — 深入理解代码 → 设计方案 → 写 Phase 化 Spec
- **[审查 Spec](references/spec-review.md)** — 从欠规范/设计错误/规范符合度三维度审查
- **[实现 Spec](references/spec-implement.md)** — 逐 Phase 实现，每个 Phase 后 type-check + test
