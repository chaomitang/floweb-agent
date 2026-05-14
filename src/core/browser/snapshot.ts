import type { Page } from "playwright";

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

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio",
  "checkbox", "switch", "tab", "slider", "spinbutton", "text field",
  "generic", "heading", "image", "list", "listitem",
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

  const ref = nextRef();
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

  const data: {
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
  } = await page.evaluate(() => {
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

  return { title, url, root, refs };
}

// ── rendering ──────────────────────────────────────────────────────

export function renderSnapshot(snap: PageSnapshot): string {
  const lines: string[] = [
    `Title: ${snap.title}`,
    `URL: ${snap.url}`,
    ``,
  ];

  const renderNode = (node: SnapshotNode, depth: number) => {
    const indent = "  ".repeat(depth);
    const name = node.name ? ` "${node.name.slice(0, 80)}"` : "";
    const ref = ` [${node.ref}]`;

    if (node.children.length === 0) {
      if (INTERACTIVE_ROLES.has(node.role)) {
        const attrs = node.attributes
          ? " " +
            Object.entries(node.attributes)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}="${v}"`)
              .join(" ")
          : "";
        lines.push(`${indent}<${node.role}${ref}${attrs}>${name}</${node.role}>`);
      } else {
        lines.push(`${indent}<${node.role}${ref}>${name}</${node.role}>`);
      }
    } else {
      lines.push(`${indent}<${node.role}${ref}>${name}`);
      for (const child of node.children) {
        renderNode(child, depth + 1);
      }
      lines.push(`${indent}</${node.role}>`);
    }
  };

  renderNode(snap.root, 0);
  return lines.join("\n");
}
