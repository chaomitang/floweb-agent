# 站点安全评估

在决定集成方案前，先评估目标站点的反爬和安全策略。

## 探测步骤

### 1. 检测反爬服务

查看页面 cookies 中是否有安全相关字段：

| Cookie 模式 | 对应服务 |
|------------|----------|
| `_abck` | Akamai Bot Manager |
| `_px*` | PerimeterX (HUMAN) |
| `datadome` | DataDome |
| `cf_clearance` | Cloudflare |
| `x-kpsdk-*` | Kasada |

也检查全局变量（`window._pxAppId`、`window.bmak` 等）和页面脚本的来源域名。

### 2. 检测 fetch/XHR 拦截

```js
// 执行这些检查
window.fetch.toString()
XMLHttpRequest.prototype.open.toString()
Object.getOwnPropertyDescriptor(window, 'fetch')
```

如果 `fetch` 或 `XHR` 被 Proxy 包装过，说明站点监控网络调用。

### 3. 检测 Challenge 页面

检查页面是否显示验证页面而非真实内容（"Checking your browser..."、CAPTCHA 等）。

## 选择数据捕获策略

### A：优先浏览器内 fetch — `page.evaluate(fetch(...))`
- **条件**：无反爬、fetch 未被拦截、API 返回 JSON
- **优点**：最快、最干净，共享浏览器 TLS 指纹和 cookies
- **风险**：站点监控 fetch 调用栈时可被检测

### B：优先被动网络拦截 — `page.on("response", ...)`
- **条件**：有反爬或 fetch 被拦截
- **优点**：零额外网络风险，只监听不主动发请求
- **缺点**：只能收数据不能发，需要 UI 操作触发请求

### C：优先 DOM 提取 — Playwright locator
- **条件**：数据是服务端渲染的、没有可用的 JSON API
- **优点**：不管什么架构都能用
- **缺点**：慢、脆弱（UI 变化易断）

## 决策表

| 站点特征 | 首选方案 | 备选方案 |
|----------|----------|----------|
| 无反爬，fetch 未拦截 | A（fetch） | Playwright 做导航/登录 |
| 无反爬，fetch 被拦截 | B（拦截） | DOM 提取做补充 |
| 有反爬，fetch 未拦截 | B（拦截） | 谨慎使用 A |
| 有反爬，fetch 被拦截 | B（拦截） | DOM 提取 |
| 服务端渲染（无 API） | C（DOM） | Playwright 做全部交互 |

## 输出：站点评估摘要

```
## 站点评估: [URL]

### 反爬检测
- 企业反爬服务: [未检测到 / 检测到 — 描述]
- Fetch/XHR 拦截: [原生 / 被拦截 — 描述]
- Challenge 页面: [无 / 有 — 描述]
- 整体安全级别: [无 / 低 / 中 / 高 / 极高]

### API 表面
- 观察到的 API 调用: [列出关键端点]
- 数据格式: [JSON / GraphQL / HTML]
- 分页方式: [描述]

### 安全方案
- page.evaluate(fetch(...)): [安全 / 不安全 — 理由]
- page.on('response', ...): [可行 / 不可行]
- DOM 提取: [始终可用]
```
