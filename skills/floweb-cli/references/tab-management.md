# 多页面和页面定位

当 Floweb 会话有多个打开的页面时，使用本指南。

## 使用场景

- 操作过程中打开了弹窗、新标签页
- 不确定当前活跃的是哪个页面
- 需要在不同页面间切换

## 工作流

1. 列出所有页面：`/pages`
2. 根据 URL 或标题识别目标页面
3. 切换到目标页面：通过 TUI 的 `Ctrl+1-9` 或让 Agent 调用 `browser_switch_tab`
4. 在正确的页面执行操作

## Agent 工具

| 工具 | 用途 |
|------|------|
| `browser_list_pages` | 列出所有页面（ ▸ 标记活跃页） |
| `browser_switch_tab` | 按页面 ID 切换 |
| `browser_close_tab` | 关闭指定页面 |

## 注意事项

- 一个会话可以包含多个页面
- 多页面时**先定位页面再调试 selector**
- 用 `browser_list_pages` 获取正确的页面 ID，然后 `browser_switch_tab` 切换
