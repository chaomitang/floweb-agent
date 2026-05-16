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
  url?: string;
  fingerprint: string;
}

export interface PageSnapshot {
  title: string;
  url: string;
  root: SnapshotNode;
  refs: Map<string, SnapshotNode>;
}

// ── CDP AX tree types ──────────────────────────────────────────────

interface RawAXNode {
  nodeId: string;
  role?: { value: string } | string;
  name?: { value: string } | string;
  value?: { value: string } | string;
  childIds?: string[];
  ignored?: boolean;
  focused?: boolean;
  backendDOMNodeId?: number;
}

interface RawDOMNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  attributes?: string[];
  children?: RawDOMNode[];
  contentDocument?: RawDOMNode;
  shadowRoots?: RawDOMNode[];
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

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio",
  "checkbox", "switch", "tab", "slider", "spinbutton", "text field",
  "generic", "heading", "image", "list", "listitem",
]);

const MAX_CHILDREN_PER_PARENT = 4;

// DOM 属性白名单——只有这些属性值得传给 LLM
const KEEP_ATTRS = new Set([
  "id", "name", "type", "placeholder", "href", "src", "action", "method",
  "alt", "title", "value", "aria-label", "aria-expanded", "aria-pressed",
  "aria-selected", "aria-checked", "role", "tabindex", "contenteditable",
  "data-testid", "data-test", "data-qa", "data-cy",
]);

function normalizeRole(raw: string): string {
  const r = raw.toLowerCase().replace(/\s+/g, "");
  if (r === "statictext" || r === "inlinetextbox") return "text";
  if (r === "textfield") return "textbox";
  return r;
}

function getAxValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value ?? "");
  return "";
}

// ── capture ────────────────────────────────────────────────────────

export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;
  const title = await page.title();
  const url = page.url();

  const cdp = await page.context().newCDPSession(page);

  try {
    // 并行抓取 AX 树（主体结构）+ DOM 树（tag 名和属性）
    await cdp.send("Accessibility.enable");
    const [axResult, domResult] = await Promise.all([
      cdp.send("Accessibility.getFullAXTree", { depth: 100 }),
      cdp.send("DOM.getDocument", { depth: -1, pierce: true }).catch(() => null),
    ]);

    // 从 DOM 树提取属性映射：backendNodeId → {id, href, placeholder, ...}
    const domAttrs = new Map<number, Record<string, string>>();
    if (domResult) {
      walkDOM(domResult.root, domAttrs);
    }

    // AX 树节点映射
    const nodeMap = new Map<string, RawAXNode>();
    const axNodes = axResult.nodes as unknown as RawAXNode[];
    for (const n of axNodes) {
      nodeMap.set(n.nodeId, n);
    }

    const rootRaw = axNodes[0] as unknown as RawAXNode | undefined;
    const rootId = rootRaw?.nodeId ?? "";
    const root = buildMergedTree(nodeMap, rootId, "", domAttrs) ?? {
      role: "root", name: "", ref: nextRef(), children: [], fingerprint: "root:",
    };

    const refs = new Map<string, SnapshotNode>();
    const walk = (node: SnapshotNode) => {
      if (node.ref) refs.set(node.ref, node);
      for (const child of node.children) walk(child);
    };
    walk(root);

    return { title, url, root, refs };
  } catch {
    // CDP 完全不可用——最小回退
    return basicFallback(page);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

function walkDOM(node: unknown, out: Map<number, Record<string, string>>): void {
  const n = node as Record<string, unknown>;
  if (!n) return;
  const backendNodeId = n.backendNodeId as number | undefined;
  const attrs = n.attributes as string[] | undefined;
  if (backendNodeId && attrs?.length) {
    const filtered: Record<string, string> = {};
    for (let i = 0; i < attrs.length - 1; i += 2) {
      const name = attrs[i];
      if (name && KEEP_ATTRS.has(name)) {
        filtered[name] = attrs[i + 1] || "";
      }
    }
    if (Object.keys(filtered).length > 0) {
      out.set(backendNodeId, filtered);
    }
  }
  const children = n.children as unknown[] | undefined;
  if (children) for (const c of children) walkDOM(c, out);
  if (n.contentDocument) walkDOM(n.contentDocument, out);
  const shadow = n.shadowRoots as unknown[] | undefined;
  if (shadow) for (const s of shadow) walkDOM(s, out);
}

function buildMergedTree(
  rawNodes: Map<string, RawAXNode>,
  nodeId: string,
  _parentName: string,
  domAttrs: Map<number, Record<string, string>>,
): SnapshotNode | null {
  const raw = rawNodes.get(nodeId);
  if (!raw || raw.ignored) return null;

  const role = normalizeRole(getAxValue(raw.role) || "generic");
  const name = getAxValue(raw.name).slice(0, 200);
  const value = getAxValue(raw.value);
  const backendId = raw.backendDOMNodeId;

  const children: SnapshotNode[] = [];
  if (raw.childIds) {
    for (const childId of raw.childIds) {
      const child = buildMergedTree(rawNodes, childId, name, domAttrs);
      if (child) children.push(child);
    }
  }

  if (children.length === 1 && children[0].role === "text" && children[0].name === name) {
    children.length = 0;
  }

  const ref = REFS_BY_ROLE.has(role) ? nextRef() : "";
  const fp = `${role}:${name}:${value}`;

  // 从 DOM 树补充 tag 名和属性
  const domData = backendId ? domAttrs.get(backendId) : undefined;

  return {
    role,
    name,
    ref,
    children,
    value: value || undefined,
    tag: domData ? tagFromAttrs(domData) : undefined,
    attributes: domData,
    fingerprint: fp,
  };
}

function tagFromAttrs(attrs: Record<string, string>): string | undefined {
  // DOM 树不直接给 tagName（DOM.getDocument 的节点有 nodeName，但 AX 树的 backendDOMNodeId
  // 可能对应任何类型的 DOM 节点）。返回 undefined 让渲染时只用 role。
  return undefined;
}

// ── minimal fallback（CDP 完全挂掉时） ─────────────────────────────

async function basicFallback(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;
  const title = await page.title();
  const url = page.url();
  const refs = new Map<string, SnapshotNode>();

  const data = await page.evaluate(() => {
    const interactive = [
      ...document.querySelectorAll(
        'a, button, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [role="searchbox"]',
      ),
    ];
    return {
      title: document.title,
      url: location.href,
      elements: interactive.slice(0, 200).map((el) => {
        const tag = el.tagName.toLowerCase();
        const text = (el as HTMLElement).innerText?.slice(0, 60) || "";
        const href = (el as HTMLAnchorElement).href || "";
        const placeholder = (el as HTMLInputElement).placeholder || "";
        const type = (el as HTMLInputElement).type || "";
        const id = (el as HTMLElement).id || "";
        return { tag, text, href: href || undefined, placeholder: placeholder || undefined, type: type || undefined, id: id || undefined };
      }),
    };
  });

  const children: SnapshotNode[] = data.elements.map((el: { tag: string; text: string; href?: string; placeholder?: string; type?: string; id?: string }) => {
    const ref = nextRef();
    const label = [el.text, el.href, el.placeholder].filter(Boolean).join(" | ");
    const node: SnapshotNode = {
      role: el.tag,
      name: label.slice(0, 100), ref,
      children: [],
      tag: el.tag,
      attributes: { id: el.id || "", type: el.type || "", placeholder: el.placeholder || "", href: el.href || "" },
      fingerprint: `${el.tag}:${label}`,
    };
    refs.set(ref, node);
    return node;
  });

  return {
    title, url,
    root: { role: "page", name: title, ref: nextRef(), children, url, fingerprint: `page:${title}` },
    refs,
  };
}

// ── rendering ──────────────────────────────────────────────────────

export function renderSnapshot(snap: PageSnapshot): string {
  const lines: string[] = [`Title: ${snap.title}`, `URL: ${snap.url}`, ``];
  renderNodeBody(snap.root, 0, lines);
  return lines.join("\n");
}

function renderNodeBody(node: SnapshotNode, depth: number, lines: string[]): void {
  const folded = foldableChild(node);
  if (folded) { renderNodeBody(folded, depth, lines); return; }

  const indent = "  ".repeat(depth);
  const ref = node.ref ? ` [${node.ref}]` : "";
  const name = node.name ? ` "${node.name.slice(0, 80)}"` : "";

  if (node.children.length === 0) {
    if (node.attributes && Object.keys(node.attributes).length > 0) {
      const attrs = " " + Object.entries(node.attributes)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      lines.push(`${indent}<${node.role}${ref}${attrs}>${name}</${node.role}>`);
    } else {
      lines.push(`${indent}<${node.role}${ref}>${name}</${node.role}>`);
    }
  } else {
    lines.push(`${indent}<${node.role}${ref}>${name}`);
    renderChildren(node.children, depth + 1, lines);
    lines.push(`${indent}</${node.role}>`);
  }
}

function renderChildren(children: SnapshotNode[], depth: number, lines: string[]): void {
  const merged = mergeAdjacentTextNodes(children);
  const shown = merged.slice(0, MAX_CHILDREN_PER_PARENT);
  const truncated = merged.slice(MAX_CHILDREN_PER_PARENT);
  for (const child of shown) renderNodeBody(child, depth, lines);
  if (truncated.length > 0) {
    const indent = "  ".repeat(depth);
    const summary = truncatedChildrenSummary(truncated);
    lines.push(`${indent}[Truncated ${truncated.length} more element${truncated.length > 1 ? "s" : ""}${summary}]`);
  }
}

function foldableChild(node: SnapshotNode): SnapshotNode | null {
  if (node.children.length !== 1) return null;
  const child = node.children[0]!;
  if (!child) return null;
  if (node.ref) return null;
  if (child.role === "statictext" || child.role === "inlinetextbox" || child.role === "text") return null;
  return child;
}

function mergeAdjacentTextNodes(nodes: SnapshotNode[]): SnapshotNode[] {
  const result: SnapshotNode[] = [];
  for (const node of nodes) {
    const prev = result[result.length - 1];
    const isTextLike = node.role === "statictext" || node.role === "inlinetextbox" || node.role === "text";
    if (prev && isTextLike && (prev.role === "statictext" || prev.role === "inlinetextbox" || prev.role === "text") && prev.name === node.name) {
      continue;
    }
    result.push(node);
  }
  return result;
}

function truncatedChildrenSummary(nodes: SnapshotNode[]): string {
  const interactive = nodes.filter((n) => INTERACTIVE_ROLES.has(n.role) && n.ref);
  if (interactive.length === 0) return "";
  const labels = interactive.slice(0, 3).map((n) => {
    const label = n.name ? n.name.slice(0, 60) : n.role;
    return `<${n.role} [${n.ref}]> "${label}"`;
  }).join(", ");
  const more = interactive.length > 3 ? ", ..." : "";
  return `. Interactive: ${labels}${more}`;
}
