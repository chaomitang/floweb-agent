import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { FlowebConfig } from "../config.js";
import type { PageInfo } from "../types.js";
import { captureSnapshot, renderSnapshot } from "./snapshot.js";
import { diffSnapshots, renderDiff } from "./snapshot-diff.js";
import { DaemonExecRepl } from "./exec-repl.js";
import { compactHTML } from "./compact-html.js";
import type { PageSnapshot } from "./snapshot.js";

export const BrowserManagerEvents = {
  PAGES_CHANGED: "pagesChanged",
  STATUS_CHANGED: "statusChanged",
  USER_ACTION: "userAction",
} as const;

export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pageById = new Map<string, Page>();
  private pageInfos = new Map<string, PageInfo>();
  private activePageId: string | null = null;
  private lastSnapshot: PageSnapshot | null = null;
  private repl = new DaemonExecRepl();

  getPageInfos(): PageInfo[] {
    return Array.from(this.pageInfos.values());
  }

  getActivePageId(): string | null {
    return this.activePageId;
  }

  getActivePage(): Page | null {
    if (!this.activePageId) return null;
    return this.pageById.get(this.activePageId) ?? null;
  }

  getSessionStatus(): "disconnected" | "connecting" | "connected" | "error" {
    if (!this.browser) return "disconnected";
    if (!this.browser.isConnected()) return "disconnected";
    return "connected";
  }

  switchToPage(pageId: string): void {
    if (!this.pageById.has(pageId)) return;

    if (this.activePageId) {
      const prevInfo = this.pageInfos.get(this.activePageId);
      if (prevInfo) {
        this.pageInfos.set(this.activePageId, { ...prevInfo, active: false });
      }
    }

    this.activePageId = pageId;
    const info = this.pageInfos.get(pageId);
    if (info) {
      this.pageInfos.set(pageId, { ...info, active: true });
    }
    this.emit(BrowserManagerEvents.PAGES_CHANGED, this.getPageInfos(), this.activePageId);
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.pageById.get(pageId);
    if (!page) return;

    try {
      await page.close();
    } catch {
      // page may already be closed
    }
  }

  async createSession(config: FlowebConfig, url: string): Promise<void> {
    if (this.browser) {
      await this.closeSession();
    }

    // Normalize URL: prepend https:// only if no scheme present
    // Handles about:blank, data: URIs, chrome://, file://, etc.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      url = `https://${url}`;
    }

    this.browser = await chromium.launch({
      headless: config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: config.viewport,
    });

    // Capture user clicks & typing during observation mode
    await this.context.exposeBinding("__floweb_log", (_source, type: string, detail: string) => {
      this.emit(BrowserManagerEvents.USER_ACTION, type, detail);
    });
    await this.context.addInitScript(() => {
      const isAgentAction = () => !!(window as any).__floweb_apiActionInProgress;

      // ── Click (debounced, with checkbox handling) ──
      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingClick: string | null = null;
      document.addEventListener("click", (e) => {
        if (isAgentAction()) return;
        const el = e.target as HTMLElement;
        if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox") {
          const id = el.id ? `#${el.id}` : "";
          const checked = (el as HTMLInputElement).checked;
          (window as any).__floweb_log(checked ? "check" : "uncheck", `${el.tagName.toLowerCase()}${id}`);
          return;
        }
        const id = el.id ? `#${el.id}` : "";
        const cls = el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : "";
        pendingClick = `${el.tagName.toLowerCase()}${id}${cls}`;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          if (pendingClick) (window as any).__floweb_log("click", pendingClick);
          pendingClick = null;
          clickTimer = null;
        }, 200);
      }, { capture: true });

      // ── Input (debounced per element, WeakMap) ──
      const inputTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
      document.addEventListener("input", (e) => {
        if (isAgentAction()) return;
        const el = e.target as HTMLElement;
        if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT")) return;

        // SELECT fires immediately
        if (el.tagName === "SELECT") {
          const id = el.id ? `#${el.id}` : "";
          (window as any).__floweb_log("type", `select${id} "${(el as HTMLSelectElement).value}"`);
          return;
        }

        const prev = inputTimers.get(el);
        if (prev) clearTimeout(prev);
        inputTimers.set(el, setTimeout(() => {
          inputTimers.delete(el);
          const id = el.id ? `#${el.id}` : "";
          const val = (el as HTMLInputElement).value?.slice(0, 100) ?? "";
          (window as any).__floweb_log("type", `${el.tagName.toLowerCase()}${id} "${val}"`);
        }, 500));
      }, { capture: true });

      // ── Keydown (special keys + shortcuts only) ──
      const specialKeys = new Set([
        "Enter", "Escape", "Tab", "Backspace", "Delete",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Home", "End", "PageUp", "PageDown",
      ]);
      document.addEventListener("keydown", (e) => {
        if (isAgentAction()) return;
        const isShortcut = e.ctrlKey || e.metaKey || e.altKey;
        if (!isShortcut && !specialKeys.has(e.key)) return;
        const desc = (e.ctrlKey ? "Ctrl+" : "") + (e.metaKey ? "Meta+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + e.key;
        (window as any).__floweb_log("press", desc);
      }, { capture: true });

      // ── Scroll (debounced) ──
      let scrollTimer: ReturnType<typeof setTimeout> | null = null;
      document.addEventListener("scroll", () => {
        if (isAgentAction()) return;
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          (window as any).__floweb_log("scroll", `(${Math.round(window.scrollX)}, ${Math.round(window.scrollY)})`);
        }, 300);
      }, { capture: true, passive: true });
    });

    this.context.on("page", (page) => {
      this.registerPage(page);
    });

    const initialPage = await this.context.newPage();
    // registerPage is called automatically via context.on("page")
    try {
      await initialPage.goto(url, { timeout: 15000 });
    } catch (err) {
      await this.closeSession();
      throw err;
    }

    this.emit(BrowserManagerEvents.STATUS_CHANGED, "connected");
  }

  async closeSession(): Promise<void> {
    if (this.browser) {
      this.pageById.clear();
      this.pageInfos.clear();
      this.activePageId = null;
      try {
        await this.browser.close();
      } catch {
        // browser may already be closed
      }
      this.browser = null;
      this.context = null;
    }
    this.emit(BrowserManagerEvents.PAGES_CHANGED, this.getPageInfos(), this.activePageId);
    this.emit(BrowserManagerEvents.STATUS_CHANGED, "disconnected");
  }

  async waitForStable(timeoutMs = 10000): Promise<void> {
    const page = this.getActivePage();
    if (!page) return;

    const deadline = Date.now() + timeoutMs;

    // Wait for page load + network idle (Playwright built-in)
    try {
      await page.waitForLoadState("load", {
        timeout: Math.max(0, deadline - Date.now()),
      });
      await page.waitForLoadState("networkidle", {
        timeout: Math.max(0, deadline - Date.now()),
      });
    } catch {
      // timeout is OK — proceed with what we have
    }

    // Wait for DOM mutations to settle (MutationObserver-based)
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining > 500) {
      try {
        // Install a MutationObserver that updates a timestamp on every DOM change.
        // waitForFunction polls this timestamp — when mutations stop for 400ms, done.
        await page.evaluate(() => {
          (window as any).__floweb_lastMutation = Date.now();
          const observer = new MutationObserver(() => {
            (window as any).__floweb_lastMutation = Date.now();
          });
          observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
          });
          (window as any).__floweb_mutationObserver = observer;
        });
        await page.waitForFunction(
          () => Date.now() - (window as any).__floweb_lastMutation >= 400,
          { timeout: remaining, polling: 100 },
        );
      } catch {
        // timeout is OK
      } finally {
        // Cleanup
        await page.evaluate(() => {
          const obs = (window as any).__floweb_mutationObserver;
          if (obs) { obs.disconnect(); }
          delete (window as any).__floweb_mutationObserver;
          delete (window as any).__floweb_lastMutation;
        }).catch(() => {});
      }
    }
  }

  async captureSnapshot(): Promise<PageSnapshot> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    const snap = await captureSnapshot(page);
    this.lastSnapshot = snap;
    return snap;
  }

  async snapshotActive(): Promise<{
    title: string;
    url: string;
    text: string;
    elements: string;
  }> {
    const snap = await this.captureSnapshot();
    return {
      title: snap.title,
      url: snap.url,
      text: renderSnapshot(snap),
      elements: `${snap.refs.size} nodes`,
    };
  }

  async snapshotDiff(): Promise<{
    text: string;
    diff: string;
  }> {
    const before = this.lastSnapshot;
    const after = await this.captureSnapshot();
    this.lastSnapshot = after;

    const text = renderSnapshot(after);

    if (!before) {
      return { text, diff: "(first snapshot — no diff)" };
    }

    const diff = diffSnapshots(before, after);
    return { text, diff: renderDiff(diff) };
  }

  async markApiActionInProgress(inProgress: boolean): Promise<void> {
    const page = this.getActivePage();
    if (!page) return;
    await page.evaluate((flag) => {
      (window as any).__floweb_apiActionInProgress = flag;
    }, inProgress);
  }

  async compactHTML(): Promise<{
    html: string;
    originalLength: number;
    condensedLength: number;
    reductions: Record<string, number>;
  }> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    const raw = await page.content();
    return compactHTML(raw);
  }

  async evaluate(js: string): Promise<unknown> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    return page.evaluate(js);
  }

  async click(selector: string): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.click(selector, { timeout: 10000 });
  }

  async typeText(selector: string, text: string): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.fill(selector, text, { timeout: 10000 });
  }

  async pressKey(key: string): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.keyboard.press(key);
  }

  async hover(selector: string): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.hover(selector);
  }

  async scroll(x: number, y: number): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x, y });
  }

  async screenshot(): Promise<string> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    const buf = await page.screenshot({ type: "png" });
    return buf.toString("base64");
  }

  async goBack(): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.goBack();
  }

  async goForward(): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.goForward();
  }

  async reloadPage(): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.reload();
  }

  async saveProfile(domain: string): Promise<{ domain: string; cookies: Array<{ name: string; value: string; domain: string; path: string }>; localStorage: Record<string, string>; savedAt: string }> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    const cookies = await page.context().cookies();
    const storage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) items[key] = localStorage.getItem(key) ?? "";
      }
      return items;
    });
    return { domain, cookies, localStorage: storage, savedAt: new Date().toISOString() };
  }

  async loadProfile(profile: { domain: string; cookies: Array<{ name: string; value: string; domain: string; path: string }>; localStorage: Record<string, string> }): Promise<void> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    await page.context().addCookies(profile.cookies);
    await page.evaluate((storage) => {
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, value);
      }
    }, profile.localStorage);
    await page.reload();
  }

  private interceptResponses: Array<{ url: string; status: number; body: string }> = [];
  private interceptHandler: ((response: unknown) => void) | null = null;

  startIntercept(): void {
    this.interceptResponses = [];
    const page = this.getActivePage();
    if (!page) return;

    // Remove previous listener to avoid duplicates
    if (this.interceptHandler) {
      page.off("response", this.interceptHandler);
    }

    const handler = async (resp: { url(): string; status(): number; text(): Promise<string> }) => {
      try {
        const body = await resp.text().catch(() => "");
        this.interceptResponses.push({
          url: resp.url(),
          status: resp.status(),
          body: body.slice(0, 2000),
        });
      } catch { /* ignore */ }
    };
    this.interceptHandler = handler as (response: unknown) => void;
    page.on("response", this.interceptHandler);
  }

  getIntercepted(): Array<{ url: string; status: number; body: string }> {
    return [...this.interceptResponses];
  }

  async auditSite(): Promise<string> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    return page.evaluate(() => {
      const findings: string[] = [];

      // Anti-bot cookies
      const cookies = document.cookie;
      const botCookies: Record<string, string> = {
        _abck: "Akamai Bot Manager",
        cf_clearance: "Cloudflare",
        datadome: "DataDome",
      };
      for (const [key, label] of Object.entries(botCookies)) {
        if (cookies.includes(key)) findings.push(`[反爬] ${label} (cookie: ${key})`);
      }
      const px = cookies.match(/_px[A-Za-z0-9]*/);
      if (px) findings.push(`[反爬] PerimeterX/HUMAN (cookie: ${px[0]})`);

      // Fetch/XHR interception
      try {
        const fetchStr = window.fetch.toString();
        if (fetchStr.includes("[native code]")) {
          findings.push("[网络] fetch: 原生（未拦截）");
        } else {
          findings.push("[网络] fetch: 已被 Proxy 包装");
        }
      } catch { findings.push("[网络] fetch: 检测失败"); }

      // Challenge page
      const body = document.body?.innerText ?? "";
      if (/checking.*browser/i.test(body)) findings.push("[挑战] 检测到 'Checking your browser' 页面");
      if (/captcha|验证码/i.test(body)) findings.push("[挑战] 检测到 CAPTCHA/验证码");
      if (/please wait|请等待/i.test(body)) findings.push("[挑战] 检测到 'Please wait' 页面");

      // Navigator checks
      findings.push(`[指纹] webdriver: ${(navigator as unknown as { webdriver?: unknown }).webdriver ?? "undefined"}`);
      findings.push(`[指纹] plugins.length: ${(navigator as unknown as { plugins?: { length: number } }).plugins?.length ?? "N/A"}`);

      return findings.join("\n");
    });
  }

  async execCode(code: string): Promise<{ output: string; result: unknown; diff: string }> {
    const page = this.getActivePage();
    if (!page) throw new Error("No active page");
    if (!this.browser || !this.context) throw new Error("Browser not initialized");

    // Snapshot before
    let beforeSnap: PageSnapshot | null = null;
    try { beforeSnap = await captureSnapshot(page); } catch { /* ok */ }

    // Run code in persistent REPL
    this.repl.setPage(page, this.browser, this.context);
    const { output, result } = await this.repl.run(code);

    // Snapshot after and diff
    let afterSnap: PageSnapshot | null = null;
    try { afterSnap = await captureSnapshot(page); } catch { /* ok */ }

    let diff = "";
    if (beforeSnap && afterSnap) {
      const entries = diffSnapshots(beforeSnap, afterSnap);
      diff = renderDiff(entries);
    }

    this.lastSnapshot = afterSnap;
    return { output, result, diff };
  }

  async dispose(): Promise<void> {
    await this.closeSession();
    this.removeAllListeners();
  }

  private generatePageId(): string {
    const bytes = randomBytes(2);
    const chars = bytes.toString("base64url").slice(0, 3);
    return `page-${chars}`;
  }

  private isInternalPage(url: string): boolean {
    return url.startsWith("devtools://") || url.startsWith("chrome-error://") || url === "about:blank";
  }

  private registerPage(page: Page): void {
    const pageId = this.generatePageId();
    const now = new Date().toISOString();

    if (this.activePageId) {
      const prevInfo = this.pageInfos.get(this.activePageId);
      if (prevInfo) {
        this.pageInfos.set(this.activePageId, { ...prevInfo, active: false });
      }
    }

    const info: PageInfo = {
      id: pageId,
      url: this.isInternalPage(page.url()) ? "about:blank" : page.url(),
      title: "Loading...",
      active: true,
      createdAt: now,
    };

    this.pageById.set(pageId, page);
    this.pageInfos.set(pageId, info);
    this.activePageId = pageId;

    this.setupPageListeners(page, pageId);

    // context.on("page") already captures all new pages including popups,
    // so we don't need a separate page.on("popup") handler.

    this.emit(BrowserManagerEvents.PAGES_CHANGED, this.getPageInfos(), this.activePageId);
  }

  private setupPageListeners(page: Page, pageId: string): void {
    page.on("load", () => {
      this.syncPageInfo(page, pageId);
    });

    page.on("close", () => {
      this.pageById.delete(pageId);
      this.pageInfos.delete(pageId);

      if (this.activePageId === pageId) {
        const remaining = Array.from(this.pageById.keys());
        if (remaining.length > 0) {
          const newActive = remaining[0];
          this.activePageId = newActive;
          const info = this.pageInfos.get(newActive);
          if (info) {
            this.pageInfos.set(newActive, { ...info, active: true });
          }
        } else {
          this.activePageId = null;
        }
      }

      this.emit(BrowserManagerEvents.PAGES_CHANGED, this.getPageInfos(), this.activePageId);
    });
  }

  private syncPageInfo(page: Page, pageId: string): void {
    const info = this.pageInfos.get(pageId);
    if (!info) return;

    const url = page.url();
    const displayUrl = this.isInternalPage(url) ? info.url : url;

    this.pageInfos.set(pageId, {
      ...info,
      url: displayUrl,
    });

    page
      .title()
      .then((title: string) => {
        const current = this.pageInfos.get(pageId);
        if (current) {
          this.pageInfos.set(pageId, {
            ...current,
            title: title || current.url,
          });
          this.emit(BrowserManagerEvents.PAGES_CHANGED, this.getPageInfos(), this.activePageId);
        }
      })
      .catch(() => {});
  }
}
