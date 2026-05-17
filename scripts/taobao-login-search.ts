import { chromium, type Page, type Browser } from "playwright";
import { fileURLToPath } from "url";

type Input = { keyword?: string; };
type Output = { success: boolean; url: string; keyword: string; resultCount?: number; message: string; };

export default async function taobaoLoginAndSearch(input: Input = {}): Promise<Output> {
  const { keyword = "手机" } = input;
  const browser: Browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page: Page = await context.newPage();
  try {
    console.log("[Phase 1] Opening taobao...");
    await page.goto("https://www.taobao.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#q", { timeout: 15000 });
    console.log("[Phase 1] Taobao homepage loaded");

    const isLoggedIn = await page.evaluate(() => {
      const el = document.querySelector("#J_SiteNavLogin");
      if (!el) return false;
      const t = el.textContent || "";
      return !t.includes("请登录");
    });

    if (!isLoggedIn) {
      console.log("[Phase 2] Not logged in, clicking login...");
      await page.locator('a[href*="login.taobao.com"]').first().click();
      await page.waitForTimeout(2000);
      console.log(">>> Please login manually in the browser window <<<");
      try {
        await page.waitForFunction(() => location.href.includes("taobao.com") && !location.href.includes("login"), { timeout: 300000, polling: 2000 });
      } catch {
        return { success: false, url: page.url(), keyword, message: "Login timeout (5min)" };
      }
      console.log("[Phase 2] Login success");
    } else {
      console.log("[Phase 2] Already logged in");
    }

    console.log("[Phase 3] Searching: " + keyword);
    // 使用 page.fill 并 press Enter，更可靠
    const searchInput = page.locator("#q").first();
    await searchInput.click();
    await searchInput.fill("");
    await searchInput.type(keyword, { delay: 50 });
    await page.keyboard.press("Enter");

    // 等待搜索结果：URL 变化或搜索结果出现
    await page.waitForURL("**/s.taobao.com/search**", { timeout: 15000 });
    await page.waitForSelector('a[id^="item_id_"]', { timeout: 15000 });

    const resultCount = await page.locator('a[id^="item_id_"]').count().catch(() => 0);
    console.log("[Phase 3] Results: " + resultCount + " items");

    return { success: true, url: page.url(), keyword, resultCount, message: "Search done: " + resultCount + " items" };
  } catch (error) {
    return { success: false, url: page.url(), keyword, message: "Error: " + String(error) };
  } finally {
    console.log("Done. Browser stays open.");
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  taobaoLoginAndSearch({ keyword: process.argv[2] || "手机" }).then(r => console.log(JSON.stringify(r, null, 2)));
}