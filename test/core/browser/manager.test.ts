import { describe, it, expect, afterEach } from "vitest";
import { BrowserManager } from "../../../src/core/browser/manager.js";
import { resolveConfig } from "../../../src/core/config.js";
import type { PageInfo } from "../../../src/core/types.js";

describe("BrowserManager", () => {
  let manager: BrowserManager;

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
    }
  });

  it("initializes in disconnected state", () => {
    manager = new BrowserManager();
    expect(manager.getSessionStatus()).toBe("disconnected");
    expect(manager.getPageInfos()).toEqual([]);
    expect(manager.getActivePageId()).toBeNull();
    expect(manager.getActivePage()).toBeNull();
  });

  it("creates a session with an initial page", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");

    expect(manager.getSessionStatus()).toBe("connected");
    const pages = manager.getPageInfos();
    expect(pages.length).toBe(1);
    expect(pages[0].url).toContain("example");
    expect(pages[0].active).toBe(true);
    expect(manager.getActivePageId()).toBe(pages[0].id);
  });

  it("tracks new pages created via the context", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");

    const activePage = manager.getActivePage();
    expect(activePage).not.toBeNull();

    const context = activePage!.context();
    const newPage = await context.newPage();
    await newPage.goto("https://example.org");

    // Wait briefly for page registration
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pages = manager.getPageInfos();
    expect(pages.length).toBe(2);
    expect(pages.some((p: PageInfo) => p.url.includes("example.org"))).toBe(true);
  });

  it("switches active page with switchToPage", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");

    const context = (await manager.getActivePage())!.context();
    const newPage = await context.newPage();
    await newPage.goto("https://example.org");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pages = manager.getPageInfos();
    expect(pages.length).toBeGreaterThanOrEqual(2);

    // Find the first page (example.com) and switch to it
    const firstPage = pages.find((p: PageInfo) => p.url.includes("example.com") && !p.url.includes("example.org"));
    expect(firstPage).not.toBeUndefined();

    manager.switchToPage(firstPage!.id);
    expect(manager.getActivePageId()).toBe(firstPage!.id);
    expect(manager.getPageInfos().find((p: PageInfo) => p.id === firstPage!.id)?.active).toBe(true);
  });

  it("closes a page and auto-switches active", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");

    const context = manager.getActivePage()!.context();
    const newPage = await context.newPage();
    await newPage.goto("https://example.org");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pagesBefore = manager.getPageInfos();
    expect(pagesBefore.length).toBe(2);

    const activeId = manager.getActivePageId();
    expect(activeId).not.toBeNull();

    await manager.closePage(activeId!);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pagesAfter = manager.getPageInfos();
    expect(pagesAfter.length).toBe(1);
    // The remaining page should become active
    expect(manager.getActivePageId()).toBe(pagesAfter[0].id);
    expect(pagesAfter[0].active).toBe(true);
  });

  it("closes session and cleans up", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");
    await manager.closeSession();

    expect(manager.getSessionStatus()).toBe("disconnected");
    expect(manager.getPageInfos()).toEqual([]);
    expect(manager.getActivePageId()).toBeNull();
  });

  it("notifies on page changes via callback", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    let changed = false;
    manager.onPageListChanged(() => {
      changed = true;
    });

    await manager.createSession(config, "https://example.com");
    expect(changed).toBe(true);

    changed = false;
    const context = manager.getActivePage()!.context();
    const newPage = await context.newPage();
    await newPage.goto("https://example.org");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(changed).toBe(true);
  });

  it("switchToPage with invalid id does nothing", async () => {
    manager = new BrowserManager();
    const config = resolveConfig({ headless: true });

    await manager.createSession(config, "https://example.com");
    const activeId = manager.getActivePageId();

    manager.switchToPage("nonexistent-id");
    expect(manager.getActivePageId()).toBe(activeId);
  });
});
