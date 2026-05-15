import { chromium } from "playwright";

export default async function baiduJojoSearch() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to Baidu
    console.log("🌐 Navigating to Baidu...");
    await page.goto("https://www.baidu.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Step 2: Type search keyword and search
    console.log('🔍 Searching for "jojo"...');
    // Use evaluate to bypass visibility checks
    await page.evaluate(() => {
      (document.querySelector('#kw') as HTMLInputElement).value = 'jojo';
      (document.querySelector('#su') as HTMLInputElement).click();
    });

    // Step 3: Wait for navigation to search results
    await page.waitForTimeout(3000);

    // Check if redirected to CAPTCHA
    if (page.url().includes("wappass.baidu.com")) {
      console.log("⚠️  CAPTCHA detected! Please solve it manually...");
      console.log("   Waiting up to 60 seconds...");
      try {
        await page.waitForURL(
          (url) => !url.href.includes("wappass.baidu.com"),
          { timeout: 60000 }
        );
        console.log("✅ CAPTCHA solved!");
      } catch {
        console.log("❌ CAPTCHA timeout.");
        return { success: false, error: "CAPTCHA timeout" };
      }
    }

    console.log("📋 On search results page:", page.url());

    // Step 4: Find and click the JOJO Baidu Baike result
    // Target the specific JOJO manga entry, not the singer
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('h3 a'));
      // Prefer the JOJO manga baike entry
      const target = links.find(a =>
        a.textContent?.includes('JOJO') &&
        a.textContent?.includes('百度百科') &&
        (a.textContent?.includes('奇妙') || a.textContent?.includes('漫画'))
      ) || links.find(a =>
        a.textContent?.includes('百度百科')
      );
      if (target) {
        (target as HTMLAnchorElement).click();
        return target.textContent;
      }
      return null;
    });

    if (!clicked) {
      console.log("❌ Baike link not found.");
      return { success: false, error: "Baike link not found" };
    }
    console.log(`🎯 Clicked: "${clicked}"`);

    // Step 5: Wait for new tab to open and load
    await page.waitForTimeout(3000);
    const pages = context.pages();
    const baikePage = pages[pages.length - 1];
    await baikePage.waitForLoadState("domcontentloaded");
    await baikePage.waitForTimeout(2000);

    // Step 6: Extract content
    const title = await baikePage.title();
    const h1 = await baikePage.evaluate(() => {
      const el = document.querySelector('h1');
      return el?.textContent?.trim() || null;
    });
    const summary = await baikePage.evaluate(() => {
      const el = document.querySelector('.lemma-summary, .para');
      return el?.textContent?.trim()?.substring(0, 300) || null;
    });

    console.log("\n📖 Result:");
    console.log(`   Title: ${title}`);
    console.log(`   H1: ${h1}`);
    console.log(`   Summary: ${summary?.substring(0, 100)}...`);

    return { success: true, title, h1, summary };
  } catch (error) {
    console.error("❌ Error:", error);
    return { success: false, error: String(error) };
  } finally {
    console.log("\n⏳ Closing browser in 3 seconds...");
    await page.waitForTimeout(3000);
    await browser.close();
  }
}
