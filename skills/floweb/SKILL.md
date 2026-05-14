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

### 工具速查

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开 URL，自动补全 https:// |
| `browser_snapshot` | 抓取无障碍树快照（标题、URL、可交互元素 + ref ID） |
| `browser_snapshot_diff` | 对比前后快照（+新增、-删除、~修改） |
| `browser_click` | 通过 CSS selector 点击元素 |
| `browser_type` | 向输入框输入文本 |
| `browser_press` | 按键（Enter、Escape、Tab 等） |
| `browser_exec` | 在浏览器中执行 TypeScript/JS，**执行前后自动 diff** |
| `browser_evaluate` | 执行 JS 并返回结果 |
| `browser_list_pages` | 列出所有标签页 |
| `browser_switch_tab` | 切换标签页 |
| `browser_close_tab` | 关闭标签页 |
| `browser_close_session` | 关闭会话 |

### 观察模式

用户表达"帮我看着"意图 → Agent 观察浏览器，对变化给出实时评论
用户表达"我操作完了"意图 → Agent 总结发生了什么，建议可自动化的步骤
不依赖固定触发词，Agent 根据对话上下文理解用户意图

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
