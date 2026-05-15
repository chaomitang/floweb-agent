import type { Page } from "playwright";
import { compactHTML } from "./compact-html.js";

// ── types ──────────────────────────────────────────────────────────

export interface SnapshotNode {
  role: string;
  name: string;
  ref: string;
  children: SnapshotNode[];
  // element info for interactive nodes
  tag?: string;
  attributes?: Record<string, string>;
  value?: string;
  url?: string;
  // for dedup / diff
  fingerprint: string;
}

export interface PageSnapshot {
  title: string;
  url: string;
  root: SnapshotNode;
  refs: Map<string, SnapshotNode>;
  /** Condensed HTML fallback — populated when CDP AXTree is unavailable. */
  fallbackHTML?: string;
}

// ── AXTree capture via CDP ─────────────────────────────────────────

interface RawAXNode {
  nodeId: string;
  role?: { value: string } | string;
  name?: { value: string } | string;
  value?: { value: string } | string;
  childIds?: string[];
  ignored?: boolean;
  focused?: boolean;
}

let _refCounter = 0;

function nextRef(): string {
  return "l" + ++_refCounter;
}

// Only these roles get short ref IDs (l1, l2, …). StaticText, InlineTextBox,
// and layout-only generics are excluded — they just add noise.
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

function buildTree(
  rawNodes: Map<string, RawAXNode>,
  nodeId: string,
  _parentName: string,
): SnapshotNode | null {
  const raw = rawNodes.get(nodeId);
  if (!raw || raw.ignored) return null;

  const role = normalizeRole(getAxValue(raw.role) || "generic");
  const name = getAxValue(raw.name).slice(0, 200);
  const value = getAxValue(raw.value);

  // Collect children
  const children: SnapshotNode[] = [];
  if (raw.childIds) {
    for (const childId of raw.childIds) {
      const child = buildTree(rawNodes, childId, name);
      if (child) children.push(child);
    }
  }

  // Collapse: if only child is text with same name, take its children
  if (
    children.length === 1 &&
    children[0].role === "text" &&
    children[0].name === name
  ) {
    children.length = 0;
  }

  const ref = REFS_BY_ROLE.has(role) ? nextRef() : "";
  const fp = `${role}:${name}:${value}`;

  return {
    role,
    name,
    ref,
    children,
    value: value || undefined,
    fingerprint: fp,
  };
}

export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;

  try {
    // Get title + url
    const title = await page.title();
    const url = page.url();

    // Access CDP session for AXTree
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");

    const { nodes: axNodes } = await cdp.send("Accessibility.getFullAXTree", {
      depth: 100,
    });

    // Build lookup map
    const nodeMap = new Map<string, RawAXNode>();
    for (const n of axNodes) {
      const node = n as unknown as RawAXNode;
      nodeMap.set(node.nodeId, node);
    }

    // Build from root node (first one)
    const rootRaw = axNodes[0] as unknown as RawAXNode | undefined;
    const rootId = rootRaw?.nodeId ?? "";
    const root = buildTree(nodeMap, rootId, "") ?? {
      role: "root",
      name: "",
      ref: nextRef(),
      children: [],
      fingerprint: "root:",
    };

    // Build refs map
    const refs = new Map<string, SnapshotNode>();
    const walk = (node: SnapshotNode) => {
      refs.set(node.ref, node);
      for (const child of node.children) walk(child);
    };
    walk(root);

    await cdp.detach();
    return { title, url, root, refs };
  } catch {
    // Fallback: basic snapshot via evaluate
    return fallbackSnapshot(page);
  }
}

async function fallbackSnapshot(page: Page): Promise<PageSnapshot> {
  _refCounter = 0;
  const title = await page.title();
  const url = page.url();
  const refs = new Map<string, SnapshotNode>();

  // Run basic DOM scan + page content in parallel
  const [data, rawHTML] = await Promise.all([
    page.evaluate(() => {
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
      } as {
        title: string;
        url: string;
        elements: Array<{
          tag: string;
          text: string;
          href?: string;
          placeholder?: string;
          type?: string;
          id?: string;
        }>;
      };
    }),
    page.content().catch(() => ""),
  ]);

  // Condense the raw HTML for LLM consumption
  let fallbackHTML: string | undefined;
  if (rawHTML) {
    try {
      const result = compactHTML(rawHTML);
      fallbackHTML = [
        `── Compacted HTML fallback (CDP AXTree unavailable) ──`,
        `Original: ${result.originalLength} chars → Compacted: ${result.condensedLength} chars`,
        `Reductions: ${Object.entries(result.reductions).map(([k, v]) => `${k} -${v}`).join(", ")}`,
        ``,
        result.html,
      ].join("\n");
    } catch {
      // ignore compactHTML errors
    }
  }

  const children: SnapshotNode[] = data.elements.map((el) => {
    const ref = nextRef();
    const label = [el.text, el.href, el.placeholder].filter(Boolean).join(" | ");
    const node: SnapshotNode = {
      role: el.tag,
      name: label.slice(0, 100),
      ref,
      children: [],
      tag: el.tag,
      attributes: { id: el.id || "", type: el.type || "", placeholder: el.placeholder || "", href: el.href || "" },
      fingerprint: `${el.tag}:${label}`,
    };
    refs.set(ref, node);
    return node;
  });

  const root: SnapshotNode = {
    role: "page",
    name: title,
    ref: nextRef(),
    children,
    url,
    fingerprint: `page:${title}`,
  };

  return { title, url, root, refs, fallbackHTML };
}

// ── rendering ──────────────────────────────────────────────────────

export function renderSnapshot(snap: PageSnapshot): string {
  const lines: string[] = [
    `Title: ${snap.title}`,
    `URL: ${snap.url}`,
    ``,
  ];

  renderNodeBody(snap.root, 0, lines);

  if (snap.fallbackHTML) {
    lines.push(``);
    lines.push(snap.fallbackHTML);
  }

  return lines.join("\n");
}

// ── helpers ────────────────────────────────────────────────────────

function renderNodeBody(node: SnapshotNode, depth: number, lines: string[]): void {
  // Try single-child chain folding first (recursive)
  const folded = foldableChild(node);
  if (folded) {
    renderNodeBody(folded, depth, lines);
    return;
  }

  const indent = "  ".repeat(depth);
  const ref = node.ref ? ` [${node.ref}]` : "";
  const name = node.name ? ` "${node.name.slice(0, 80)}"` : "";

  if (node.children.length === 0) {
    if (INTERACTIVE_ROLES.has(node.role) && node.attributes) {
      const attrs = " " +
        Object.entries(node.attributes)
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

function renderChildren(
  children: SnapshotNode[],
  depth: number,
  lines: string[],
): void {
  // Merge adjacent text-only nodes that share the same name
  const merged = mergeAdjacentTextNodes(children);
  const shown = merged.slice(0, MAX_CHILDREN_PER_PARENT);
  const truncated = merged.slice(MAX_CHILDREN_PER_PARENT);

  for (const child of shown) {
    renderNodeBody(child, depth, lines);
  }

  if (truncated.length > 0) {
    const indent = "  ".repeat(depth);
    const summary = truncatedChildrenSummary(truncated);
    lines.push(`${indent}[Truncated ${truncated.length} more element${truncated.length > 1 ? "s" : ""}${summary}]`);
  }
}

// If node is a non-semantic wrapper with a single structural child, return the
// child so renderNodeBody can fold recursively. e.g. div > section > link → link
function foldableChild(node: SnapshotNode): SnapshotNode | null {
  if (node.children.length !== 1) return null;
  const child = node.children[0]!;
  if (!child) return null;
  // Keep the current node if it carries a ref (semantically meaningful)
  if (node.ref) return null;
  // Don't fold into text-like leaves
  if (child.role === "statictext" || child.role === "inlinetextbox" || child.role === "text") return null;
  return child;
}

function mergeAdjacentTextNodes(nodes: SnapshotNode[]): SnapshotNode[] {
  const result: SnapshotNode[] = [];
  for (const node of nodes) {
    const prev = result[result.length - 1];
    const isTextLike = node.role === "statictext" || node.role === "inlinetextbox" || node.role === "text";
    if (
      prev &&
      isTextLike &&
      (prev.role === "statictext" || prev.role === "inlinetextbox" || prev.role === "text") &&
      prev.name === node.name
    ) {
      // Skip duplicate adjacent text with same name
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
