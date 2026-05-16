import type { SnapshotNode, PageSnapshot } from "./snapshot.js";

export interface DiffEntry {
  type: "added" | "removed" | "modified" | "context";
  ref?: string;
  role?: string;
  name?: string;
  oldName?: string;
  tag?: string;
  attributes?: Record<string, string>;
  children?: DiffEntry[];
}

const MAX_DIFF_CHILDREN_PER_PARENT = 4;

// ── diff algorithm ─────────────────────────────────────────────────

export function diffSnapshots(before: PageSnapshot, after: PageSnapshot): DiffEntry[] {
  return diffChildren(before.root.children, after.root.children);
}

function diffNodes(
  before: SnapshotNode | undefined,
  after: SnapshotNode | undefined,
): DiffEntry[] {
  if (!before && after) {
    const result: DiffEntry[] = [nodeToEntry("added", after)];
    for (const child of after.children) {
      result.push(...diffNodes(undefined, child));
    }
    return result;
  }

  if (before && !after) {
    const result: DiffEntry[] = [nodeToEntry("removed", before)];
    for (const child of before.children) {
      result.push(...diffNodes(child, undefined));
    }
    return result;
  }

  if (!before || !after) return [];

  // Modified: different fingerprint
  if (before.fingerprint !== after.fingerprint) {
    const entry: DiffEntry = { ...nodeToEntry("modified", after), oldName: before.name };
    const children = diffChildren(before.children, after.children);
    if (children.length > 0) entry.children = children;
    return [entry];
  }

  // Same fingerprint — check children
  const children = diffChildren(before.children, after.children);
  if (children.length > 0) {
    return [{ ...nodeToEntry("context", after), children }];
  }

  return [];
}

function diffChildren(
  beforeChildren: SnapshotNode[],
  afterChildren: SnapshotNode[],
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const usedBefore = new Set<number>();

  for (let afterIdx = 0; afterIdx < afterChildren.length; afterIdx++) {
    const after = afterChildren[afterIdx]!;
    const beforeIdx = findMatchingBefore(after, afterIdx, beforeChildren, usedBefore);

    if (beforeIdx === -1) {
      diffs.push(...diffNodes(undefined, after));
    } else {
      usedBefore.add(beforeIdx);
      diffs.push(...diffNodes(beforeChildren[beforeIdx]!, after));
    }
  }

  for (let beforeIdx = 0; beforeIdx < beforeChildren.length; beforeIdx++) {
    if (!usedBefore.has(beforeIdx)) {
      diffs.push(...diffNodes(beforeChildren[beforeIdx]!, undefined));
    }
  }

  return diffs;
}

function findMatchingBefore(
  after: SnapshotNode,
  afterIdx: number,
  beforeChildren: SnapshotNode[],
  usedBefore: Set<number>,
): number {
  // Tier 1: same position + same role
  const samePos = beforeChildren[afterIdx];
  if (samePos && !usedBefore.has(afterIdx) && samePos.role === after.role) {
    return afterIdx;
  }
  // Tier 2: same ref
  if (after.ref) {
    const byRef = beforeChildren.findIndex((b, i) => !usedBefore.has(i) && b.ref === after.ref);
    if (byRef !== -1) return byRef;
  }
  // Tier 3: same fingerprint
  const byFp = beforeChildren.findIndex((b, i) => !usedBefore.has(i) && b.fingerprint === after.fingerprint);
  return byFp;
}

function nodeToEntry(type: DiffEntry["type"], node: SnapshotNode): DiffEntry {
  return {
    type,
    ref: node.ref,
    role: node.role,
    name: node.name,
    tag: node.tag,
    attributes: node.attributes,
  };
}

// ── rendering ──────────────────────────────────────────────────────

export function renderDiff(entries: DiffEntry[]): string {
  const lines: string[] = [];
  renderDiffs(entries, 0, lines);
  return lines.length > 0 ? lines.join("\n") : "(no changes)";
}

function renderDiffs(entries: DiffEntry[], depth: number, lines: string[]): void {
  const shown = entries.slice(0, MAX_DIFF_CHILDREN_PER_PARENT);
  const truncated = entries.slice(MAX_DIFF_CHILDREN_PER_PARENT);
  for (const entry of shown) renderEntry(entry, depth, lines);
  if (truncated.length > 0) {
    const indent = "\t".repeat(depth);
    const added = truncated.filter((e) => e.type === "added").length;
    const removed = truncated.filter((e) => e.type === "removed").length;
    const modified = truncated.filter((e) => e.type === "modified").length;
    const parts: string[] = [];
    if (added) parts.push(`+${added}`);
    if (removed) parts.push(`-${removed}`);
    if (modified) parts.push(`~${modified}`);
    lines.push(`${indent}[${truncated.length} more changes (${parts.join(" ")})]`);
  }
}

function renderEntry(entry: DiffEntry, depth: number, lines: string[]): void {
  const indent = "\t".repeat(depth);
  const tag = entry.tag || entry.role || "?";
  const name = entry.name ? ` "${entry.name.slice(0, 60)}"` : "";
  const attrStr = entry.attributes
    ? " " + Object.entries(entry.attributes).filter(([, v]) => v).map(([k, v]) => `${k}="${v}"`).join(" ")
    : "";

  switch (entry.type) {
    case "added":
      lines.push(`${indent}+[${entry.ref}]<${tag}${attrStr}>${name} />`);
      if (entry.children) renderDiffs(entry.children, depth + 1, lines);
      break;

    case "removed":
      if (entry.ref) {
        lines.push(`${indent}-[${entry.ref}]<${tag}${attrStr}> "..." />`);
      } else {
        lines.push(`${indent}-<${tag}${attrStr}>${name} />`);
      }
      break;

    case "modified": {
      const old = entry.oldName ? ` (was "${entry.oldName.slice(0, 40)}")` : "";
      lines.push(`${indent}~[${entry.ref}]<${tag}${attrStr}>${name}${old} />`);
      if (entry.children) renderDiffs(entry.children, depth + 1, lines);
      break;
    }

    case "context":
      if (entry.children && entry.children.length > 0) {
        lines.push(`${indent}[${entry.ref}]<${tag}${attrStr}>${name}`);
        renderDiffs(entry.children, depth + 1, lines);
        lines.push(`${indent}</${tag}>`);
      }
      break;
  }
}
