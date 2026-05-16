import type { Page } from "playwright";

// 页面边框 + 操作光标 + 高亮的统一可视化层

const BORDER_ID = "__floweb_border__";
const CURSOR_ID = "__floweb_cursor__";
const HIGHLIGHT_CLASS = "__floweb_highlight__";

type BorderColor = "pink" | "yellow" | "none";

function borderColorValue(color: BorderColor): string {
  switch (color) {
    case "pink": return "rgba(236, 72, 153, 0.35)";
    case "yellow": return "rgba(234, 179, 8, 0.35)";
    case "none": return "rgba(0,0,0,0)";
  }
}

// ── 安装脚本（每次页面加载时执行） ──

export function installScript(): string {
  return `
(function() {
  // 页面边框
  if (!document.getElementById("${BORDER_ID}")) {
    var border = document.createElement("div");
    border.id = "${BORDER_ID}";
    border.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;pointer-events:none;box-shadow:inset 0 0 24px 4px rgba(236,72,153,0.35);transition:box-shadow 0.4s ease;";
    document.documentElement.appendChild(border);
  }
  // 光标圆点
  if (!document.getElementById("${CURSOR_ID}")) {
    var cursor = document.createElement("div");
    cursor.id = "${CURSOR_ID}";
    cursor.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:16px;height:16px;border-radius:50%;background:rgba(236,72,153,0.7);border:2px solid rgba(236,72,153,1);transform:translate(-50%,-50%);opacity:0;transition:left 0.25s cubic-bezier(0.16,1,0.3,1),top 0.25s cubic-bezier(0.16,1,0.3,1),opacity 0.15s ease;";
    document.documentElement.appendChild(cursor);
  }
})();
`;
}

// ── 安装（幂等，页面注册时调用） ──

export async function installVisualFeedback(page: Page): Promise<void> {
  await page.addInitScript({ content: installScript() });
  // 当前页面立即可用
  try { await page.evaluate(installScript()); } catch { /* page not ready */ }
}

// ── 边框颜色切换 ──

export async function setBorderColor(page: Page, color: BorderColor): Promise<void> {
  const c = borderColorValue(color);
  try {
    await page.evaluate(
      ({ id, color }) => {
        const el = document.getElementById(id);
        if (el) el.style.boxShadow = "inset 0 0 24px 4px " + color;
      },
      { id: BORDER_ID, color: c },
    );
  } catch { /* ok */ }
}

// ── 移动光标到指定位置 ──

export async function moveCursor(page: Page, x: number, y: number): Promise<void> {
  try {
    await page.evaluate(
      ({ id, x, y }) => {
        const el = document.getElementById(id);
        if (el) { el.style.left = x + "px"; el.style.top = y + "px"; el.style.opacity = "1"; }
      },
      { id: CURSOR_ID, x, y },
    );
  } catch { /* ok */ }
}

// ── 显示/隐藏光标 ──

export async function showCursor(page: Page): Promise<void> {
  try {
    await page.evaluate(
      ({ id }) => { const el = document.getElementById(id); if (el) el.style.opacity = "1"; },
      { id: CURSOR_ID },
    );
  } catch { /* ok */ }
}

export async function hideCursor(page: Page): Promise<void> {
  try {
    await page.evaluate(
      ({ id }) => { const el = document.getElementById(id); if (el) el.style.opacity = "0"; },
      { id: CURSOR_ID },
    );
  } catch { /* ok */ }
}

// ── 高亮元素 ──

export async function highlightElement(
  page: Page,
  selector: string,
): Promise<void> {
  try {
    await page.evaluate(
      ({ cls, selector }) => {
        const el = document.querySelector(selector);
        if (!el) return;
        // 移除旧高亮
        document.querySelectorAll("." + cls).forEach((e) => e.classList.remove(cls));
        // 添加新高亮
        el.classList.add(cls);
        // 自动消退
        setTimeout(() => el.classList.remove(cls), 600);
      },
      { cls: HIGHLIGHT_CLASS, selector },
    );
  } catch { /* ok */ }
}

// ── 高亮 CSS 样式（注入到页面） ──

export function highlightStyle(): string {
  return `
.__floweb_highlight__ {
  outline: 3px solid rgba(236,72,153,0.8) !important;
  outline-offset: 2px !important;
  transition: outline 0.15s ease !important;
  box-shadow: 0 0 12px 4px rgba(236,72,153,0.3) !important;
}
`;
}

export async function injectHighlightStyle(page: Page): Promise<void> {
  try {
    await page.evaluate(
      ({ css }) => {
        if (document.getElementById("__floweb_highlight_style__")) return;
        const style = document.createElement("style");
        style.id = "__floweb_highlight_style__";
        style.textContent = css;
        document.head.appendChild(style);
      },
      { css: highlightStyle() },
    );
  } catch { /* ok */ }
}
