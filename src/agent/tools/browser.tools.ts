import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DaemonClient } from "../../daemon/ipc/client.js";

export function createBrowserTools(getClient: () => DaemonClient | null) {
  const client = () => {
    const c = getClient();
    if (!c) throw new Error("Daemon not connected");
    return c;
  };

  const navigate = tool(
    async ({ url }: { url: string }) => {
      if (!url || typeof url !== "string") {
        throw new Error("请提供有效的 URL 地址");
      }
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
        ? url
        : `https://${url}`;
      await client().remote.createSession(normalized);
      return `Opened ${normalized}`;
    },
    {
      name: "browser_navigate",
      description: "导航浏览器到指定 URL。支持完整 URL（https://example.com）和简写（example.com），自动补全 https://。也支持 about:blank 打开空白页。",
      schema: z.object({ url: z.string().describe("要导航到的 URL 地址") }),
    },
  );

  const snapshot = tool(
    async () => {
      const snap = await client().remote.snapshotActive();
      return snap.text;
    },
    {
      name: "browser_snapshot",
      description:
        "捕获当前页面的无障碍树快照。展示所有可交互元素（链接、按钮、输入框）及其引用 ID、角色和标签。每个元素有 [ref] 标记（如 [l3]）可供引用。在点击或输入前使用，以了解页面结构并找到 CSS 选择器。",
      schema: z.object({}),
    },
  );

  const snapshotDiff = tool(
    async () => {
      const result = await client().remote.snapshotDiff();
      return result.diff;
    },
    {
      name: "browser_snapshot_diff",
      description:
        "抓取新快照并与上一个快照对比。返回结构化差异：+新增、-删除、~修改的元素。在 click、type、press 操作后使用，验证页面变化。",
      schema: z.object({}),
    },
  );

  const listPages = tool(
    async () => {
      const pages = await client().remote.getPages();
      const activeId = await client().remote.getActivePageId();
      if (pages.length === 0) return "No pages open.";
      return pages
        .map(
          (p) =>
            `${p.id === activeId ? "▶" : " "} [${p.id}] ${p.title || "Untitled"} — ${p.url}`,
        )
        .join("\n");
    },
    {
      name: "browser_list_pages",
      description: "列出所有打开的浏览器标签页，包含标题和 URL。",
      schema: z.object({}),
    },
  );

  const switchTab = tool(
    async ({ pageId }: { pageId: string }) => {
      await client().remote.switchToPage(pageId);
      return `Switched to page ${pageId}`;
    },
    {
      name: "browser_switch_tab",
      description: "通过页面 ID 切换到指定标签页。",
      schema: z.object({ pageId: z.string().describe("要切换到的页面 ID") }),
    },
  );

  const closeTab = tool(
    async ({ pageId }: { pageId: string }) => {
      await client().remote.closePage(pageId);
      return `Closed page ${pageId}`;
    },
    {
      name: "browser_close_tab",
      description: "通过页面 ID 关闭指定标签页。",
      schema: z.object({ pageId: z.string().describe("要关闭的页面 ID") }),
    },
  );

  const closeSession = tool(
    async () => {
      await client().remote.closeSession();
      return "Browser session closed.";
    },
    {
      name: "browser_close_session",
      description: "关闭整个浏览器会话和所有标签页。",
      schema: z.object({}),
    },
  );

  const click = tool(
    async ({ selector }: { selector: string }) => {
      await client().remote.click(selector);
      return `Clicked "${selector}"`;
    },
    {
      name: "browser_click",
      description:
        "点击当前页面上的元素。使用 CSS 选择器（如 'button.submit'、'#login'、'a[href=\"/search\"]'）。先运行 browser_snapshot 找到正确的选择器。",
      schema: z.object({
        selector: z.string().describe("要点击元素的 CSS 选择器"),
      }),
    },
  );

  const typeText = tool(
    async ({ selector, text }: { selector: string; text: string }) => {
      await client().remote.typeText(selector, text);
      return `Typed "${text}" into "${selector}"`;
    },
    {
      name: "browser_type",
      description:
        "在输入框中输入文本。使用 CSS 选择器（如 'input[name=\"q\"]'、'#search'）。先运行 browser_snapshot 找到正确的选择器。",
      schema: z.object({
        selector: z.string().describe("输入元素的 CSS 选择器"),
        text: z.string().describe("要输入的文本内容"),
      }),
    },
  );

  const pressKey = tool(
    async ({ key }: { key: string }) => {
      await client().remote.pressKey(key);
      return `Pressed "${key}"`;
    },
    {
      name: "browser_press",
      description: "按下键盘按键。使用键名如 'Enter'、'Escape'、'Tab'、'ArrowDown' 等。",
      schema: z.object({ key: z.string().describe("要按下的键名") }),
    },
  );

  const exec = tool(
    async ({ code, timeout }: { code: string; timeout?: number }) => {
      const timeoutMs = timeout && timeout > 0 ? timeout * 1000 : 120_000;
      getClient()?.setRequestTimeout(timeoutMs);
      try {
        const result = await client().remote.execCode(code);
        return [
          result.output || "(no output)",
          result.result !== undefined ? `=> ${JSON.stringify(result.result)}` : "",
          result.diff ? `\n--- Snapshot Diff ---\n${result.diff}` : "",
        ].filter(Boolean).join("\n");
      } finally {
        getClient()?.clearRequestTimeout();
      }
    },
    {
      name: "browser_exec",
      description: "在共享浏览器的持久 REPL 中执行 TypeScript/JavaScript 代码。已注入 `page`、`browser`、`context`（Playwright 对象），无需 launch。用 console.log() 输出，return 返回值。执行前后自动对比快照差异。默认超时 120 秒，长脚本可通过 timeout 参数自行延长。",
      schema: z.object({
        code: z.string().describe("在浏览器 REPL 中执行的代码"),
        timeout: z.number().optional().describe("超时秒数，默认 120，长脚本可设更大值"),
      }),
    },
  );

  const evaluate = tool(
    async ({ js }: { js: string }) => {
      const result = await client().remote.evaluate(js);
      return JSON.stringify(result, null, 2);
    },
    {
      name: "browser_evaluate",
      description: "在当前页面执行 JavaScript 代码并返回 JSON 序列化结果。",
      schema: z.object({ js: z.string().describe("要执行的 JavaScript 代码") }),
    },
  );

  return [
    navigate,
    snapshot,
    snapshotDiff,
    listPages,
    switchTab,
    closeTab,
    closeSession,
    click,
    typeText,
    pressKey,
    evaluate,
    exec,
  ];
}
