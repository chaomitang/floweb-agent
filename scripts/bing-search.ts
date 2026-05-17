import { chromium } from "playwright";
import { fileURLToPath } from "url";

type Input = {
  keyword: string;
  maxResults?: number;
};

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

type Output = {
  keyword: string;
  totalResults: number;
  results: SearchResult[];
};

export default async function bingSearch(input: Input): Promise<Output> {
  const { keyword, maxResults = 10 } = input;

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // 打开 Bing 首页并等待加载完成
    await page.goto("https://www.bing.com");
    await page.waitForLoadState("domcontentloaded");

    // 输入搜索关键词并提交
    const searchInput = page.locator("#sb_form_q");
    await searchInput.fill(keyword);
    await searchInput.press("Enter");
    await page.waitForLoadState("domcontentloaded");

    // 等待搜索结果出现
    await page.waitForSelector("#b_results", { timeout: 10000 });

    // 提取搜索结果
    const resultElements = await page.locator("#b_results .b_algo").all();
    const results: SearchResult[] = [];

    for (const el of resultElements.slice(0, maxResults)) {
      const titleEl = el.locator("h2 a");
      if ((await titleEl.count()) === 0) continue;

      const title = (await titleEl.textContent())?.trim() ?? "";
      const url = (await titleEl.getAttribute("href")) ?? "";
      const description =
        (await el.locator(".b_caption p, .b_lineclamp2").first().textContent())?.trim() ?? "";

      results.push({ title, url, description });
    }

    console.log(`搜索 "${keyword}" 返回 ${results.length} 条结果`);
    return { keyword, totalResults: results.length, results };
  } finally {
    await browser.close();
  }
}

// 直接运行时自执行
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const keyword = process.argv[2] || "playwright browser automation";
  bingSearch({ keyword }).then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
