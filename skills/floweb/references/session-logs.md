# Action Logs

- 存储在 `.floweb/sessions/<session>/actions.jsonl`
- 每行一个 JSON 对象
- 用 `cat`/`tail` 直接查看：`tail -20 .floweb/sessions/default/actions.jsonl`

## 日志类型

| type | 含义 |
|------|------|
| `navigate` | 导航到 URL |
| `click` | 点击元素（记录 selector） |
| `type` | 输入文本 |
| `press` | 按键 |
| `snapshot` | 页面快照 |
| `snapshot_diff` | 快照对比 |
| `evaluate` | 执行 JS（记录代码前 200 字符） |
| `exec` | REPL 代码执行 |
| `switch_tab` | 切换标签 |
| `close_tab` | 关闭标签 |
| `close_session` | 关闭会话 |
| `session_mode` | 设置会话模式 |
| `save_profile` | 保存认证 Profile |

## 使用场景

- **调试脚本**：对比 action log 和脚本步骤，确认脚本复现了正确操作
- **排查失败**：检查 failure 前后的 action 序列
- **生成脚本**：Agent 读 action log 提取用户操作序列，翻译成 Playwright 代码

## 示例

```json
{"type":"navigate","timestamp":"...","data":{"detail":"Open https://taobao.com"}}
{"type":"click","timestamp":"...","data":{"detail":"input[name=\"q\"]"}}
{"type":"type","timestamp":"...","data":{"detail":"手机 → input[name=\"q\"]"}}
{"type":"press","timestamp":"...","data":{"detail":"Enter"}}
{"type":"snapshot","timestamp":"...","data":{"detail":"Snapshot taken"}}
```
