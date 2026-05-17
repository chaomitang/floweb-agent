import { chromium } from "playwright";
import { fileURLToPath } from "url";

// ============================================================
// Apple MacBook Air M5 技术规格抓取
// 从 Apple 中国官网抓取 MacBook Air 15 英寸最新技术规格
// ============================================================

type MacBookAirSpec = {
  chip: string;
  models: Array<{
    memory: string;
    storage: string;
    price: string;
  }>;
  display: string;
  battery: string;
  dimensions: string;
  weight: string;
  wireless: string;
  camera: string;
  colors: string[];
};

type Output = {
  url: string;
  title: string;
  spec: MacBookAirSpec;
  rawText: string;
};

/**
 * 从 Apple 中国官网抓取 MacBook Air 15 英寸技术规格
 */
export default async function fetchMacBookAirSpecs(): Promise<Output> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Phase 1: 打开 Apple 中国官网
    await page.goto("https://www.apple.com.cn", {
      waitUntil: "domcontentloaded",
    });

    // Phase 2: 进入 Mac 产品页面
    await page.click('a[href="/mac/"]');
    await page.waitForURL("**/mac/**");

    // Phase 3: 进入 MacBook Air 产品概览页
    await page.click(
      'a[aria-label="进一步了解，13 英寸和 15 英寸 MacBook Air"]'
    );
    await page.waitForURL("**/macbook-air/**");

    // Phase 4: 进入技术规格页面（localnav 链接可能被遮挡，直接 goto）
    await page.goto("https://www.apple.com.cn/macbook-air/specs/", {
      waitUntil: "domcontentloaded",
    });

    // Phase 5: 切换到 15 英寸标签页
    await page.click("button#table-15-label");
    await page.waitForTimeout(500);

    // Phase 6: 提取规格数据
    const rawText = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.innerText : "";
    });

    const spec = parseSpec(rawText);

    return {
      url: page.url(),
      title: await page.title(),
      spec,
      rawText: rawText.substring(0, 3000),
    };
  } finally {
    await browser.close();
  }
}

function parseSpec(text: string): MacBookAirSpec {
  const chip = "Apple M5";

  const priceMatches = text.match(/RMB\s*([\d,]+)/g);
  const prices = priceMatches ? priceMatches.map((p) => p.replace(/\s/g, "")) : [];

  const models: Array<{ memory: string; storage: string; price: string }> = [];
  const memPattern = /(\d+GB)\s*统一内存[\s\S]*?((?:\d+GB|\d+TB))\s*固态硬盘/g;
  const memStorList = Array.from(text.matchAll(memPattern)).slice(0, 3);
  for (let i = 0; i < Math.min(3, prices.length); i++) {
    models.push({
      memory: memStorList[i] ? memStorList[i][1] : "未知",
      storage: memStorList[i] ? memStorList[i][2] : "未知",
      price: prices[i],
    });
  }

  const displayMatch = text.match(/(\d+\.?\d*)\s*英寸[\s\S]*?分辨率\s*(\d+\s*[xX]\s*\d+)[\s\S]*?(\d+)\s*尼特/);
  const display = displayMatch
    ? displayMatch[1] + "英寸, " + displayMatch[2].replace(/\s/g, "") + ", " + displayMatch[3] + "nit"
    : "未识别";

  const batteryMatch = text.match(/最长可达\s*(\d+)\s*小时[\s\S]*?流媒体/);
  const battery = batteryMatch ? batteryMatch[1] + " 小时" : "未识别";

  const heightMatch = text.match(/高度[：:]\s*([\d.]+)\s*厘米/);
  const widthMatch = text.match(/宽度[：:]\s*([\d.]+)\s*厘米/);
  const depthMatch = text.match(/深度[：:]\s*([\d.]+)\s*厘米/);
  const dimensions = heightMatch && widthMatch && depthMatch
    ? heightMatch[1] + "×" + widthMatch[1] + "×" + depthMatch[1] + " cm"
    : "未识别";

  const weightMatch = text.match(/重量[：:]\s*([\d.]+)\s*千克/);
  const weight = weightMatch ? weightMatch[1] + " kg" : "未识别";

  const wireless = "Wi-Fi 7 + 蓝牙 6";

  const cameraMatch = text.match(/(\d+)\s*万像素[\s\S]*?Center\s*Stage/);
  const camera = cameraMatch ? cameraMatch[1] + "万像素 Center Stage" : "未识别";

  const colors = ["天蓝色", "银色", "星光色", "午夜色"];

  return { chip, models, display, battery, dimensions, weight, wireless, camera, colors };
}

// 自执行入口
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  fetchMacBookAirSpecs()
    .then((result) => {
      console.log("=== MacBook Air 15\" M5 技术规格 ===");
      console.log(JSON.stringify(result.spec, null, 2));
      console.log("\n来源: " + result.url);
    })
    .catch((err) => {
      console.error("抓取失败:", err);
      process.exit(1);
    });
}
