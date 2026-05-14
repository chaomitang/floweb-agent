import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { FlowebConfig } from "../config.js";
import type { PageInfo } from "../types.js";
import { captureSnapshot, renderSnapshot } from "./snapshot.js";
import { diffSnapshots, renderDiff } from "./snapshot-diff.js";
import { DaemonExecRepl } from "./exec-repl.js";
import type { PageSnapshot } from "./snapshot.js";

export const BrowserManagerEvents = {
  PAGES_CHANGED: "pagesChanged",
  STATUS_CHANGED: "statusChanged",
} as const;

export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pageById = new Map<string, Page>();
  private pageInfos = new Map<string, PageInfo>();
  private activePageId: string | null = null;
  private lastSnapshot: PageSnapshot | null = null;
  private sessionMode: "read-only" | "write-access" = "write-access";
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

  getSessionMode(): string {
    return this.sessionMode;
  }

  setSessionMode(mode: string): void {
    if (mode !== "read-only" && mode !== "write-access") {
      throw new Error("Mode must be 'read-only' or 'write-access'");
    }
    this.sessionMode = mode;
  }

  async saveProfile(domain: string): Promise<void> {
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
    const profile = { domain, cookies, localStorage: storage, savedAt: new Date().toISOString() };
    // Save to a file via a callback? For now just log the data.
    // The daemon server will handle file writing.
    (this as any)._lastProfile = profile;
  }

  getLastProfile(): unknown {
    return (this as any)._lastProfile ?? null;
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
