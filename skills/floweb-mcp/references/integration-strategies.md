# 浏览器自动化方案：反爬检测、数据捕获与集成策略

## 反爬检测的 4 个层级

### 1. 浏览器指纹
- `navigator.webdriver` → 自动化浏览器为 `true`
- 浏览器插件/扩展指纹 → 自动化浏览器通常为空
- WebGL/Canvas 指纹 → 无头浏览器渲染特征不同
- 屏幕和窗口尺寸 → 无头浏览器常报异常值
- UA 一致性 → UA 必须和实际浏览器行为匹配
- CDP 检测 → 部分网站检测是否有 CDP 会话
- 无头特征检测 → `chrome.runtime`、`Notification.permission`、`navigator.plugins` 等缺失
- Iframe/Sandbox 检测 → `window.self !== window.top`、`document.hasFocus()` 为 `false`

### 2. 行为分析
- 鼠标轨迹 → 真实用户有加速曲线，自动化没有
- 打字节奏 → 真实输入有可变的键间延迟
- 滚动行为 → 真实滚动有惯性和变速
- 导航时机 → 真实用户点击前会阅读内容
- 交互顺序 → 不聚焦输入框就点击提交很可疑

### 3. 网络层检测
- TLS 指纹（JA3/JA4）→ Node.js `fetch`/`axios` 和 Chrome 的 TLS 指纹完全不同
- HTTP/2 指纹 → SETTINGS 帧、WINDOW_UPDATE 行为、header 顺序
- Header 顺序和值 → 浏览器按特定顺序发送 headers
- Cookie 状态 → 外部请求必须手动复制 cookies
- Referer 和 Origin → 浏览器自动带，外部请求必须伪造

### 4. API 层监控
- 请求频率限制
- 异常参数检测
- Token/签名验证

## 4 种集成方案

### 方案 1：Playwright UI 自动化
直接模拟用户操作（点击、输入、滚动）。

**优点：** 几乎无法被检测（在有头模式下），cookie 和 session 自动管理
**缺点：** 慢，资源重，可能被行为分析检测（无头模式）

### 方案 2：被动网络拦截（`page.on("response")`）
拦截浏览器发出的网络请求，提取数据。

**优点：** 不干扰页面，速度快
**缺点：** 只能读不能写，依赖已有请求

### 方案 3：浏览器内 fetch（`page.evaluate(() => fetch(...))`）
在浏览器上下文中发起 `fetch` 请求。

**优点：** 继承浏览器的 TLS 指纹和 cookie，比 Node.js 直连更难检测
**缺点：** 需要手动管理 cookie/header，对复杂鉴权不友好

### 方案 4：Node.js 直连 HTTP
在 Node.js 中直接发 HTTP 请求（`fetch`/`axios`）。

**优点：** 最快，最轻量
**缺点：** TLS 指纹不同，没有浏览器 cookie，最容易被检测

## 决策指南

| 场景 | 推荐方案 |
|------|----------|
| 网站有严格反爬 | 方案 1（有头 Playwright） |
| 需要高频数据提取 | 方案 3（浏览器内 fetch） |
| 只需要读数据 | 方案 2（被动拦截） |
| 网站无反爬 | 方案 4（Node.js 直连） |
| 表单提交/支付 | 方案 1（Playwright） |

**默认策略：** 先试方案 3（浏览器内 fetch），不行再用方案 1（Playwright UI）。
