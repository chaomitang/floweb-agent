import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { FlowwebConfig } from "../config.js";
import type { PageInfo } from "../types.js";

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

  async createSession(config: FlowwebConfig, url: string): Promise<void> {
    if (this.browser) {
      await this.closeSession();
    }

    // Normalize URL: prepend https:// if no protocol
    if (!/^https?:\/\//i.test(url)) {
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
    await initialPage.goto(url);

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

    page.on("popup", (popup) => {
      // popups are also captured by context.on("page"), but we log them
      this.registerPage(popup);
    });

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
