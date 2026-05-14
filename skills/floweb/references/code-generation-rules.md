# 代码生成规范

交互式探索只是过程，脚本才是最终产出。

## 两种执行模式

### 模式 A：REPL 即时执行（`browser_exec`）

在 TUI 的共享浏览器中**即时运行**代码，用于快速验证和探索。`browser_exec` 提供 3 个预置对象：

| 对象 | 类型 | 说明 |
|------|------|------|
| `page` | `Page` | 当前活跃页面 |
| `browser` | `Browser` | 共享浏览器实例 |
| `context` | `BrowserContext` | 浏览器上下文 |

**关键规则：不要 `chromium.launch()`，不要 `import`/`require("playwright")`。直接用 `page`、`browser`、`context`。**

```typescript
// browser_exec 中运行的代码（即时执行，共享浏览器）
await page.goto("https://example.com");
await page.fill('input[name="q"]', "keyword");
await page.press('input[name="q"]', "Enter");

const title = await page.title();
console.log("Page title:", title);  // console.log 会捕获到输出

// 返回值会显示在结果中
return { title, url: page.url() };
```

### 模式 B：独立脚本文件（`npx tsx` 运行）

生成可独立运行的 Playwright 脚本文件。这种模式下脚本**自己启动和关闭浏览器**。

```typescript
// scripts/my-workflow.ts
import { chromium } from "playwright";

type Input = {
  keyword: string;
  maxResults?: number;
};

type Output = {
  results: Array<{ name: string; value: string }>;
};

export default async function myWorkflow(input: Input): Promise<Output> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto("https://example.com");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('input[name="q"]', input.keyword);
    await page.press('input[name="q"]', "Enter");
    await page.waitForSelector(".results");

    return { results: [] };
  } finally {
    await browser.close();
  }
}
```

要点：
- 始终 `export default` 主工作流函数
- `input` 参数定义工作流需要的输入
- 用 `console.log`/`console.warn`/`console.error` 记录日志
- 脚本负责启动和关闭浏览器（仅在模式 B 中）

## 验证脚本（在 REPL 中运行）

编写完独立脚本后，**不要**用 `browser_exec` 去 import 它。应该在 REPL 中用相同的逻辑**即时执行**每一步来验证：

```typescript
// ✅ 正确 — 在 REPL 中用 page 直接验证
await page.goto("https://example.com");
await page.fill('input[name="q"]', "jojo");
await page.press('input[name="q"]', "Enter");
// 等页面加载
await page.waitForTimeout(2000);
const results = await page.locator(".result").all();
console.log("Found:", results.length, "results");
return { count: results.length };
```

```typescript
// ❌ 错误 — 在 REPL 中 require/import 脚本文件
const script = require("./scripts/my-workflow");
// 这样会启动独立浏览器，TUI 看不到过程
```

## Selector 优先级

1. `data-testid` — 最稳定
2. `id` — 唯一标识
3. `aria-label` — 无障碍标签
4. `text=` — 文本匹配
5. `role=` — 语义角色
6. CSS 路径 — 最脆弱，最后手段

## Playwright Locator 规则

**生产代码中必须使用 Playwright locator API。禁止用 `page.evaluate()` 替代 DOM 操作。**

交互式探索阶段 `browser_exec` 里用 `page.evaluate` 快速验证是 OK 的。生成生产代码时必须翻译成 locator。

### 反模式对照

```typescript
// ❌ 错误 — evaluate 批量读 DOM
const data = await page.evaluate(`(() => {
  const posts = document.querySelectorAll('.post');
  return Array.from(posts).map(p => ({
    name: p.querySelector('.name')?.textContent,
    content: p.querySelector('.content')?.textContent,
  }));
})()`);

// ✅ 正确 — Playwright locator + 循环
const posts = await page.locator(".post").all();
for (const post of posts) {
  const name = await post.locator(".name").textContent();
  const content = await post.locator(".content").textContent();
}
```

```typescript
// ❌ 错误 — evaluate 计数
const count = await el.evaluate(`(el) => el.querySelectorAll('.item').length`);

// ✅ 正确
const count = await el.locator(".item").count();
```

```typescript
// ❌ 错误 — evaluate 读范围内文本
const text = await post.evaluate(
  `(el) => el.querySelector('[data-view-name="foo"]')?.textContent`,
);

// ✅ 正确
const text = await post.locator('[data-view-name="foo"]').textContent();
```

### 什么时候可以用 page.evaluate()

仅限没有 locator 等价物的操作：
1. 浏览器原生 API：`getComputedStyle()`、`window.*`、`document.cookie`、滚动位置
2. 浏览器内 fetch：从浏览器上下文发起 HTTP 请求
3. 解析操作：`DOMParser` 解析 HTML/XML

自检：evaluate 体内出现 `querySelector`、`querySelectorAll`、`textContent`、`click()`、`getAttribute()` 或遍历 DOM → 用 locator 重写。

## 网络请求方法

用网络请求替代 UI 操作时，封装成 `ApiClient` 类：

```typescript
class ApiClient {
  constructor(private page: Page) {}

  private async apiFetch(
    url: string,
    options?: { method?: string; body?: string },
  ): Promise<string> {
    return await this.page.evaluate(
      async ({ url, method, body }) => {
        const init: RequestInit = { method: method ?? "GET" };
        if (body) {
          init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
          init.body = body;
        }
        const response = await fetch(url, init);
        if (!response.ok) throw new Error(`${response.status} for ${url}`);
        return await response.text();
      },
      { url, method: options?.method, body: options?.body },
    );
  }

  async searchProducts(keyword: string): Promise<Product[]> {
    const raw = await this.apiFetch(`/api/search?q=${keyword}`);
    return JSON.parse(raw);
  }
}
```

一个方法对应一个端点。API 方法内部不用 try/catch，让错误向上传播。

## 注释规范

注释描述**意图**，不重述代码。相关操作归到一条注释下。

```typescript
// 用凭证登录
await page.locator("#username").fill(user);
await page.locator("#password").fill(pass);
await page.locator("#login").click();

// 从每个帖子提取作者和内容
const posts = await page.locator(".post").all();
for (const post of posts) {
  const name = await post.locator(".name").textContent();
  const content = await post.locator(".content").textContent();
}
```

## Type Checking

生成的脚本必须能通过 `tsc --noEmit`。
