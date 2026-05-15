// JOJO 百科浏览 - 回放脚本
// 意图：Bing 搜索 → 点击百科结果 → 浏览内容 → 通过内部链接探索关联词条
import { chromium } from "playwright";

async function jojoBaikeExplorer() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: 打开 Bing 并搜索 "jojo"
  await page.goto("https://cn.bing.com");
  await page.fill('input#sb_form_q', 'jojo');
  await page.press('input#sb_form_q', 'Enter');
  await page.waitForLoadState('networkidle');

  // Step 2: 点击 JOJO的奇妙冒险 百度百科结果
  const jojoLink = page.locator('a[href*="baike.baidu.com/item/JOJO"]').first();
  await jojoLink.click({ force: true });
  await page.waitForLoadState('networkidle');
  console.log("✅ 已进入 JOJO的奇妙冒险 百科词条");

  // Step 3: 滚动浏览页面内容
  await page.evaluate(() => window.scrollBy(0, 2500));
  await page.waitForTimeout(500);
  console.log("✅ 已滚动浏览");

  // Step 4: 点击内部链接 - 乔纳森·乔斯达
  // 百度百科链接可能被遮挡，使用 force: true
  const jonathanLink = page.locator('a[href*="%E4%B9%94%E7%BA%B3%E6%A3%AE"][href*="fromModule=lemma_inlink"]').first();
  await jonathanLink.click({ force: true });
  await page.waitForLoadState('networkidle');
  console.log("✅ 已进入 乔纳森·乔斯达 词条");

  // Step 5: 关闭当前标签页，回到搜索结果
  await page.close();
  console.log("✅ 已关闭乔纳森词条");

  // Step 6: 切换到 Bing 搜索结果页，点击迪奥·布兰度
  const bingPage = context.pages().find(p => p.url().includes('bing.com'));
  if (bingPage) {
    await bingPage.bringToFront();
    const dioLink = bingPage.locator('a').filter({ hasText: /迪奥|布兰度/ }).first();
    const dioCount = await dioLink.count();
    if (dioCount > 0) {
      await dioLink.click({ force: true });
    } else {
      await bingPage.goto("https://baike.baidu.com/item/%E8%BF%AA%E5%A5%A5%C2%B7%E5%B8%83%E5%85%B0%E5%BA%A6/21618");
    }
    await bingPage.waitForLoadState('networkidle');
    console.log("✅ 已进入 迪奥·布兰度 词条");
  }

  console.log("\n🎉 全部操作完成！");
  // await browser.close();
}

jojoBaikeExplorer();
