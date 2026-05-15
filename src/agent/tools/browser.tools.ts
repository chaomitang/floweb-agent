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

  const loadProfile = tool(
    async ({ domain }: { domain: string }) => {
      await client().remote.loadProfile(domain);
      return `已加载 ${domain} 的登录态，页面已刷新`;
    },
    {
      name: "browser_load_profile",
      description: "加载之前保存的认证 Profile（cookies + localStorage），恢复登录态。加载后自动刷新页面。",
      schema: z.object({ domain: z.string().describe("域名，如 example.com") }),
    },
  );

  const intercept = tool(
    async ({ timeout }: { timeout?: number }) => {
      const ms = (timeout ?? 5) * 1000;
      await client().remote.startIntercept();
      await new Promise((r) => setTimeout(r, ms));
      const responses = await client().remote.getIntercepted();
      if (responses.length === 0) return "未拦截到网络请求";
      return responses
        .map((r) => `[${r.status}] ${r.url}\n${r.body.slice(0, 200)}`)
        .join("\n\n---\n\n");
    },
    {
      name: "browser_intercept",
      description: "启动被动网络拦截，监听浏览器发出的所有 HTTP 响应。等待指定秒数后返回拦截到的数据。用于反爬场景的数据捕获。",
      schema: z.object({ timeout: z.number().optional().describe("等待秒数，默认 5 秒") }),
    },
  );

  const auditSite = tool(
    async () => {
      return await client().remote.auditSite();
    },
    {
      name: "browser_audit",
      description: "对当前页面进行安全审计，检测反爬服务（Akamai/Cloudflare/DataDome/PerimeterX）、fetch 拦截、webdriver 指纹、验证码等。",
      schema: z.object({}),
    },
  );

  const hover = tool(
    async ({ selector }: { selector: string }) => {
      await client().remote.hover(selector);
      return `Hovered "${selector}"`;
    },
    {
      name: "browser_hover",
      description: "将鼠标悬停在指定元素上。用于触发 tooltip、下拉菜单等。",
      schema: z.object({ selector: z.string().describe("CSS 选择器") }),
    },
  );

  const scroll = tool(
    async ({ x, y }: { x: number; y: number }) => {
      await client().remote.scroll(x, y);
      return `Scrolled (${x}, ${y})`;
    },
    {
      name: "browser_scroll",
      description: "滚动页面。x=水平像素，y=垂直像素（正数向下）。如 scroll(0, 500) 向下滚动 500px。",
      schema: z.object({
        x: z.number().default(0).describe("水平滚动像素"),
        y: z.number().default(0).describe("垂直滚动像素"),
      }),
    },
  );

  const screenshot = tool(
    async () => {
      const b64 = await client().remote.screenshot();
      return `Screenshot (base64, ${b64.length} chars)`;
    },
    {
      name: "browser_screenshot",
      description: "截取当前页面的 PNG 截图，返回 base64 编码。",
      schema: z.object({}),
    },
  );

  const goBack = tool(
    async () => {
      await client().remote.goBack();
      return "Navigated back";
    },
    {
      name: "browser_back",
      description: "浏览器后退到上一页。",
      schema: z.object({}),
    },
  );

  const goForward = tool(
    async () => {
      await client().remote.goForward();
      return "Navigated forward";
    },
    {
      name: "browser_forward",
      description: "浏览器前进到下一页。",
      schema: z.object({}),
    },
  );

  const reload = tool(
    async () => {
      await client().remote.reloadPage();
      return "Page reloaded";
    },
    {
      name: "browser_reload",
      description: "刷新当前页面。",
      schema: z.object({}),
    },
  );

  const saveProfile = tool(
    async ({ domain }: { domain: string }) => {
      await client().remote.saveProfile(domain);
      return `已保存 ${domain} 的登录态（cookies + localStorage）`;
    },
    {
      name: "browser_save_profile",
      description: "保存当前页面的认证状态（cookies + localStorage），用于后续复用登录态。",
      schema: z.object({ domain: z.string().describe("域名，如 example.com") }),
    },
  );

  const wait = tool(
    async ({ ms, selector }: { ms?: number; selector?: string }) => {
      if (selector) {
        await client().remote.evaluate(
          `new Promise(r => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) r('found'); else new MutationObserver((_, obs) => { if (document.querySelector(${JSON.stringify(selector)})) { obs.disconnect(); r('found'); } }).observe(document, { childList: true, subtree: true }); })`,
        );
        return `Element "${selector}" appeared`;
      }
      const timeout = ms ?? 1000;
      await new Promise((r) => setTimeout(r, timeout));
      return `Waited ${timeout}ms`;
    },
    {
      name: "browser_wait",
      description: "等待指定毫秒数，或等待某个 CSS 选择器出现在 DOM 中。",
      schema: z.object({
        ms: z.number().optional().describe("等待毫秒数，默认 1000"),
        selector: z.string().optional().describe("等待此 CSS 选择器出现在页面上"),
      }),
    },
  );

  const selectOption = tool(
    async ({ selector, value }: { selector: string; value: string }) => {
      await client().remote.evaluate(
        `(async () => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Not found'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      );
      return `Selected "${value}" in ${selector}`;
    },
    {
      name: "browser_select",
      description: "选择下拉框（<select>）中的选项。",
      schema: z.object({
        selector: z.string().describe("select 元素的 CSS 选择器"),
        value: z.string().describe("选项的 value"),
      }),
    },
  );

  const compactHTML = tool(
    async () => {
      const result = await client().remote.compactHTML();
      return [
        `Compacted HTML: ${result.condensedLength} chars (was ${result.originalLength}, ${Object.entries(result.reductions).map(([k, v]) => `${k} -${v}`).join(", ")})`,
        "",
        result.html,
      ].join("\n");
    },
    {
      name: "browser_compact_html",
      description:
        "获取当前页面的紧凑 HTML。去除 <script>/<style> 内容、HTML 注释、base64 数据、非语义 CSS 类名、框架属性等，只保留语义结构和交互元素。适合 LLM 分析页面结构时使用，比完整 HTML 节省 70-90% token。",
      schema: z.object({}),
    },
  );

  const setObserving = tool(
    async ({ observing }: { observing: boolean }) => {
      await client().remote.setObservingMode(observing);
      return observing ? "观察模式已开启" : "观察模式已关闭";
    },
    {
      name: "browser_set_observing",
      description:
        "进入或退出观察模式。当用户说\"watch\"、\"observe\"、\"观察\"、\"帮我看着\"、\"看我操作\"等表达了观察意图时，你必须立即调用 setObserving(true)，不能只口头回复。进入观察模式后，页面变化会以 [Observation] 消息推送给你，你只需对变化做出反馈即可。当用户说\"好了\"、\"完成\"、\"done\"、\"分析一下\"、\"总结\"等表示操作完成时，调用 setObserving(false) 退出观察模式，并给出总结。进入观察模式后用户可能继续和你聊天，保持观察状态不要退出。",
      schema: z.object({
        observing: z.boolean().describe("true=进入观察模式（用户操作时静默观察并反馈），false=退出观察模式（回到正常对话模式）"),
      }),
    },
  );

  return [
    // ── Navigation ──
    navigate,
    goBack,
    goForward,
    reload,
    // ── Page State ──
    snapshot,
    snapshotDiff,
    listPages,
    // ── Interaction ──
    click,
    typeText,
    pressKey,
    hover,
    scroll,
    selectOption,
    wait,
    // ── Tab Management ──
    switchTab,
    closeTab,
    closeSession,
    // ── Execution ──
    evaluate,
    exec,
    // ── Network & Auth ──
    intercept,
    loadProfile,
    saveProfile,
    // ── Utilities ──
    auditSite,
    screenshot,
    compactHTML,
    setObserving,
  ];
}
