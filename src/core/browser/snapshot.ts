import type { Page } from "playwright";

// ── types ──────────────────────────────────────────────────────────

export interface SnapshotNode {
  role: string;
  name: string;
  ref: string;
  children: SnapshotNode[];
  tag?: string;
  attributes?: Record<string, string>;
  value?: string;
  fingerprint: string;
  backendNodeId?: number;
}

export interface PageSnapshot {
  title: string;
  url: string;
  root: SnapshotNode;
  refs: Map<string, SnapshotNode>;
}

// ── CDP raw types ──────────────────────────────────────────────────

interface RawAXNode {
  nodeId: string;
  role?: { value: string } | string;
  name?: { value: string } | string;
  value?: { value: string } | string;
  childIds?: string[];
  ignored?: boolean;
  backendDOMNodeId?: number;
  properties?: Array<{ name: string; value: unknown }>;
}

// ── constants ──────────────────────────────────────────────────────

let _refCounter = 0;
function nextRef(): string { return "l" + ++_refCounter; }

const REFS_BY_ROLE = new Set([
  "button", "link", "textbox", "textfield", "searchbox", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio",
  "checkbox", "switch", "tab", "slider", "spinbutton",
  "heading", "image", "list", "listitem",
  "main", "navigation", "banner", "contentinfo", "form", "search",
  "article", "section", "region",
]);

const INTERACTIVE_TAGS = new Set([
  "a", "button", "input", "select", "textarea", "form", "details", "dialog", "label",
]);

// 没有语义价值的纯布局标签——自身不做节点，只传递子节点
const LAYOUT_TAGS = new Set([
  "div", "span", "p", "section", "article", "aside", "header", "footer",
  "main", "nav", "figure", "figcaption", "picture", "source",
  "template", "slot", "em", "strong", "b", "i", "u", "small", "br", "hr",
  "code", "pre", "blockquote", "caption", "tbody", "thead", "tfoot",
  "tr", "td", "th", "colgroup", "col", "dl", "dt", "dd",
]);

const SEMANTIC_CONTAINERS = new Set([
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "head", "meta", "link", "title", "base",
  "svg", "path", "circle", "rect", "g", "use", "defs", "symbol",
]);

const KEEP_ATTRS = new Set([
  "id", "name", "type", "placeholder", "href", "src", "action", "method",
  "alt", "title", "value", "aria-label", "aria-expanded", "aria-pressed",
  "aria-selected", "aria-checked", "role", "tabindex", "contenteditable",
  "data-testid", "data-test", "data-qa", "data-cy", "disabled", "checked",
  "selected", "readonly", "required",
]);

const MAX_CHILDREN_PER_PARENT = 4;

// ── helpers ────────────────────────────────────────────────────────

function getAxValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value ?? "");
  return "";
}

function normalizeRole(raw: string): string {
  const r = raw.toLowerCase().replace(/\s+/g, "");
  if (r === "statictext" || r === "inlinetextbox") return "text";
  if (r === "textfield") return "textbox";
  return r;
}

// ── capture: DOM 做主结构，AX 做富化 ────────────────────────────────

export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;
  const title = await page.title();
  const url = page.url();

  const cdp = await page.context().newCDPSession(page);

  try {
    await cdp.send("Accessibility.enable");
    const [axResult, domResult] = await Promise.all([
      cdp.send("Accessibility.getFullAXTree", { depth: 100 }),
      cdp.send("DOM.getDocument", { depth: -1, pierce: true }).catch(() => null),
    ]);

    // AX 节点按 backendDOMNodeId 索引
    const axByBackend = new Map<number, RawAXNode>();
    for (const n of axResult.nodes as unknown as RawAXNode[]) {
      if (n.backendDOMNodeId != null) {
        axByBackend.set(n.backendDOMNodeId, n);
      }
    }

    // 从 DOM 树构建主结构，AX 数据富化每个节点
    const refs = new Map<string, SnapshotNode>();
    const root: SnapshotNode = {
      role: "root", name: "", ref: nextRef(), children: [], fingerprint: "root:",
    };

    if (domResult) {
      const domChildren = buildFromDOM(domResult.root, axByBackend, refs);
      root.children = domChildren;
    }

    // 如果 DOM 也没拿到内容，回退到纯 AX 树
    if (root.children.length === 0) {
      const axNodes = axResult.nodes as unknown as RawAXNode[];
      const nodeMap = new Map<string, RawAXNode>();
      for (const n of axNodes) nodeMap.set(n.nodeId, n);
      const rootRaw = axNodes[0];
      const axRoot = buildFromAX(nodeMap, rootRaw?.nodeId ?? "", "", new Map()) ?? root;
      root.children = axRoot.children;
      for (const [k, v] of walkRefs(axRoot)) refs.set(k, v);
    }

    return { title, url, root, refs };
  } catch {
    return basicFallback(page);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

function walkRefs(node: SnapshotNode): Map<string, SnapshotNode> {
  const m = new Map<string, SnapshotNode>();
  if (node.ref) m.set(node.ref, node);
  for (const child of node.children) {
    for (const [k, v] of walkRefs(child)) m.set(k, v);
  }
  return m;
}

// ── DOM → SnapshotNode 树 ──────────────────────────────────────────

function buildFromDOM(
  domNode: unknown,
  axByBackend: Map<number, RawAXNode>,
  refs: Map<string, SnapshotNode>,
): SnapshotNode[] {
  const n = domNode as Record<string, unknown>;
  if (!n) return [];

  const tagName = (n.nodeName as string)?.toLowerCase() ?? "";
  const backendId = n.backendNodeId as number | undefined;
  const nodeType = n.nodeType as number | undefined;
  const attrs = n.attributes as string[] | undefined;
  const nodeValue = (n.nodeValue as string)?.trim();

  // 跳过非内容节点
  if (SKIP_TAGS.has(tagName)) return [];
  if (nodeType === 10) return []; // DOCUMENT_FRAGMENT_NODE

  // 文本节点
  if ((nodeType === 3 || tagName === "") && nodeValue) {
    return [];
  }

  const children: SnapshotNode[] = [];

  // 递归子节点
  const domChildren = n.children as unknown[] | undefined;
  if (domChildren) {
    for (const c of domChildren) {
      children.push(...buildFromDOM(c, axByBackend, refs));
    }
  }
  if (n.contentDocument) {
    children.push(...buildFromDOM(n.contentDocument, axByBackend, refs));
  }
  const shadow = n.shadowRoots as unknown[] | undefined;
  if (shadow) {
    for (const s of shadow) children.push(...buildFromDOM(s, axByBackend, refs));
  }

  // 非元素节点 / 跳过标签 — 不生成自身，只传递子节点
  if (!tagName || nodeType !== 1) return children;
  if (SKIP_TAGS.has(tagName)) return children;

  // 过滤属性白名单
  const filteredAttrs: Record<string, string> = {};
  if (attrs) {
    for (let i = 0; i < attrs.length - 1; i += 2) {
      const name = attrs[i];
      const val = attrs[i + 1] || "";
      if (name && KEEP_ATTRS.has(name) && val) {
        filteredAttrs[name] = val;
      }
    }
  }

  // AX 数据富化
  const ax = backendId ? axByBackend.get(backendId) : undefined;
  const role = ax ? normalizeRole(getAxValue(ax.role) || "generic") : tagToRole(tagName);
  const name = ax ? getAxValue(ax.name).slice(0, 200) : textFromAttrs(filteredAttrs, children);
  const value = ax ? getAxValue(ax.value) : undefined;

  const isInteractive = INTERACTIVE_TAGS.has(tagName) || REFS_BY_ROLE.has(role);
  const isSemantic = SEMANTIC_CONTAINERS.has(tagName);

  // 能「救回」layout 标签的属性：role, aria-*, data-testid, tabindex, onclick
  const hasRescueAttr = Object.keys(filteredAttrs).some(
    (k) => k === "role" || k.startsWith("aria-") || k === "data-testid" || k === "tabindex" || k === "contenteditable",
  );
  const isLayout = LAYOUT_TAGS.has(tagName);

  // 纯布局标签：扁平传递子节点，除非有「救回」属性
  if (isLayout && !hasRescueAttr) {
    return children;
  }

  // 既不是交互也不是语义容器——扁平化
  if (!isInteractive && !isSemantic) {
    return children;
  }

  const ref = isInteractive ? nextRef() : "";
  const fp = `${role}:${name}:${value ?? ""}`;

  const node: SnapshotNode = {
    role,
    name,
    ref,
    children,
    tag: tagName,
    attributes: Object.keys(filteredAttrs).length > 0 ? filteredAttrs : undefined,
    value: value || undefined,
    fingerprint: fp,
    backendNodeId: backendId,
  };
  if (ref) refs.set(ref, node);
  return [node];
}

function tagToRole(tag: string): string {
  switch (tag) {
    case "a": return "link";
    case "button": return "button";
    case "input": return "textbox";
    case "select": return "combobox";
    case "textarea": return "textbox";
    case "img": return "image";
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": return "heading";
    case "ul": case "ol": return "list";
    case "li": return "listitem";
    case "form": return "form";
    case "nav": return "navigation";
    case "main": return "main";
    default: return "generic";
  }
}

function textFromAttrs(attrs: Record<string, string>, children: SnapshotNode[]): string {
  // 从属性提取文本：placeholder > aria-label > title > alt
  const text = attrs.placeholder || attrs["aria-label"] || attrs.title || attrs.alt || "";
  if (text) return text.slice(0, 200);
  // 从第一个文本子节点提取
  for (const c of children) {
    if (c.role === "text" && c.name) return c.name.slice(0, 200);
  }
  return "";
}

// ── AX-only fallback（DOM 树不可用时） ────────────────────────────

function buildFromAX(
  rawNodes: Map<string, RawAXNode>,
  nodeId: string,
  parentName: string,
  domAttrs: Map<number, Record<string, string>>,
): SnapshotNode | null {
  const raw = rawNodes.get(nodeId);
  if (!raw || raw.ignored) return null;
  const role = normalizeRole(getAxValue(raw.role) || "generic");
  const name = getAxValue(raw.name).slice(0, 200);
  const value = getAxValue(raw.value);
  const children: SnapshotNode[] = [];
  if (raw.childIds) {
    for (const cid of raw.childIds) {
      const c = buildFromAX(rawNodes, cid, name, domAttrs);
      if (c) children.push(c);
    }
  }
  if (children.length === 1 && children[0].role === "text" && children[0].name === name) {
    children.length = 0;
  }
  const ref = REFS_BY_ROLE.has(role) ? nextRef() : "";
  const fp = `${role}:${name}:${value}`;
  return { role, name, ref, children, value: value || undefined, fingerprint: fp };
}

// ── minimal CDP fallback ───────────────────────────────────────────

async function basicFallback(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;
  const title = await page.title();
  const url = page.url();
  const refs = new Map<string, SnapshotNode>();
  const data = await page.evaluate(() => {
    const els = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="textbox"]');
    return Array.from(els).slice(0, 200).map((el) => {
      const tag = el.tagName.toLowerCase();
      return { tag, text: (el as HTMLElement).innerText?.slice(0, 60) || "", href: (el as HTMLAnchorElement).href || "", placeholder: (el as HTMLInputElement).placeholder || "", type: (el as HTMLInputElement).type || "", id: (el as HTMLElement).id || "" };
    });
  });
  const children: SnapshotNode[] = data.map((el: any) => {
    const ref = nextRef();
    const label = [el.text, el.href, el.placeholder].filter(Boolean).join(" | ");
    const node: SnapshotNode = {
      role: el.tag, name: label.slice(0, 100), ref, children: [],
      tag: el.tag,
      attributes: { id: el.id || "", type: el.type || "", placeholder: el.placeholder || "", href: el.href || "" },
      fingerprint: `${el.tag}:${label}`,
    };
    refs.set(ref, node);
    return node;
  });
  return { title, url, root: { role: "page", name: title, ref: nextRef(), children, fingerprint: `page:${title}` }, refs };
}

// ── rendering ──────────────────────────────────────────────────────

export function renderSnapshot(snap: PageSnapshot): string {
  const lines: string[] = [`Title: ${snap.title}`, `URL: ${snap.url}`, ``];
  for (const child of snap.root.children) {
    renderNode(child, 0, lines);
  }
  if (lines.length === 2) lines.push("(empty page)");
  return lines.join("\n");
}

function renderNode(node: SnapshotNode, depth: number, lines: string[]): void {
  const indent = "\t".repeat(depth);
  const ref = node.ref ? `[${node.ref}]` : "";
  const tag = node.tag || node.role;
  const name = node.name ? ` "${node.name.slice(0, 60)}"` : "";
  const attrStr = node.attributes
    ? " " + Object.entries(node.attributes).filter(([, v]) => v).map(([k, v]) => `${k}="${v}"`).join(" ")
    : "";

  if (node.children.length === 0) {
    // 叶子节点：自闭合，browser-use 风格
    lines.push(`${indent}${ref}<${tag}${attrStr}>${name} />`);
  } else {
    const shown = node.children.slice(0, MAX_CHILDREN_PER_PARENT);
    const truncated = node.children.slice(MAX_CHILDREN_PER_PARENT);
    lines.push(`${indent}${ref}<${tag}${attrStr}>${name}`);
    for (const child of shown) renderNode(child, depth + 1, lines);
    if (truncated.length > 0) {
      const summary = truncationSummary(truncated);
      lines.push(`${indent}\t[${truncated.length} more: ${summary}]`);
    }
    lines.push(`${indent}</${tag}>`);
  }
}

function truncationSummary(nodes: SnapshotNode[]): string {
  const labels = nodes.filter((n) => n.ref).slice(0, 5).map((n) => {
    const tag = n.tag || n.role;
    const name = n.name ? n.name.slice(0, 30) : "";
    return name ? `<${tag}> "${name}"` : `<${tag}>`;
  });
  return labels.join(", ") + (nodes.filter((n) => n.ref).length > 5 ? ", ..." : "");
}
