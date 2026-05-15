import type { SnapshotNode, PageSnapshot } from "./snapshot.js";

export interface DiffEntry {
  type: "added" | "removed" | "modified" | "context";
  ref?: string;
  role?: string;
  name?: string;
  oldName?: string;
  children?: DiffEntry[];
}

const MAX_DIFF_CHILDREN_PER_PARENT = 4;

// ── diff algorithm ─────────────────────────────────────────────────

export function diffSnapshots(
  before: PageSnapshot,
  after: PageSnapshot,
): DiffEntry[] {
  return diffNodes(before.root, after.root);
}

function diffNodes(
  before: SnapshotNode | undefined,
  after: SnapshotNode | undefined,
): DiffEntry[] {
  // Added (entire subtree is new)
  if (!before && after) {
    const result: DiffEntry[] = [
      { type: "added", ref: after.ref, role: after.role, name: after.name },
    ];
    for (const child of after.children) {
      result.push(...diffNodes(undefined, child));
    }
    return result;
  }

  // Removed (entire subtree is gone)
  if (before && !after) {
    const result: DiffEntry[] = [
      { type: "removed", ref: before.ref, role: before.role, name: before.name },
    ];
    for (const child of before.children) {
      result.push(...diffNodes(child, undefined));
    }
    return result;
  }

  if (!before || !after) return [];

  // Modified (different fingerprint — same position in parent)
  if (before.fingerprint !== after.fingerprint) {
    const entry: DiffEntry = {
      type: "modified",
      ref: after.ref,
      role: after.role,
      name: after.name,
      oldName: before.name,
    };
    const childDiffs = diffChildren(before.children, after.children);
    if (childDiffs.length > 0) entry.children = childDiffs;
    return [entry];
  }

  // Same fingerprint — no self-change, but children may differ
  const childDiffs = diffChildren(before.children, after.children);
  if (childDiffs.length > 0) {
    return [
      {
        type: "context",
        ref: before.ref,
        role: before.role,
        name: before.name,
        children: childDiffs,
      },
    ];
  }

  return [];
}

// Three-tier child matching: positional → key (ref) → fingerprint.
// This correctly handles list reordering, insertions, and deletions
// where simple index-based comparison would report everything as changed.
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
      // No match — this child is newly added
      diffs.push(...diffNodes(undefined, after));
    } else {
      usedBefore.add(beforeIdx);
      const before = beforeChildren[beforeIdx]!;
      const childResult = diffNodes(before, after);
      diffs.push(...childResult);
    }
  }

  // Remaining unmatched before children are removed
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
  // Tier 1: Same position + same role (most common case)
  const samePos = beforeChildren[afterIdx];
  if (samePos && !usedBefore.has(afterIdx) && samePos.role === after.role) {
    return afterIdx;
  }

  // Tier 2: Same ref (key-based — survives reordering)
  if (after.ref) {
    const byRef = beforeChildren.findIndex(
      (b, i) => !usedBefore.has(i) && b.ref === after.ref,
    );
    if (byRef !== -1) return byRef;
  }

  // Tier 3: Same fingerprint (content-based — survives ref reassignment)
  const byFp = beforeChildren.findIndex(
    (b, i) => !usedBefore.has(i) && b.fingerprint === after.fingerprint,
  );
  return byFp;
}

// ── rendering ──────────────────────────────────────────────────────

export function renderDiff(entries: DiffEntry[]): string {
  const lines: string[] = [];
  renderDiffs(entries, 0, lines);
  return lines.length > 0 ? lines.join("\n") : "(no changes)";
}

function renderDiffs(
  entries: DiffEntry[],
  depth: number,
  lines: string[],
): void {
  const shown = entries.slice(0, MAX_DIFF_CHILDREN_PER_PARENT);
  const truncated = entries.slice(MAX_DIFF_CHILDREN_PER_PARENT);

  for (const entry of shown) {
    renderEntry(entry, depth, lines);
  }

  if (truncated.length > 0) {
    const indent = "  ".repeat(depth);
    const added = truncated.filter((e) => e.type === "added").length;
    const removed = truncated.filter((e) => e.type === "removed").length;
    const modified = truncated.filter((e) => e.type === "modified").length;
    const parts: string[] = [];
    if (added) parts.push(`+${added}`);
    if (removed) parts.push(`-${removed}`);
    if (modified) parts.push(`~${modified}`);
    lines.push(`${indent}[Truncated ${truncated.length} more changes (${parts.join(" ")})]`);
  }
}

function renderEntry(entry: DiffEntry, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  const label = entry.name ? ` "${entry.name.slice(0, 60)}"` : "";

  switch (entry.type) {
    case "added":
      lines.push(`${indent}+ <${entry.role}>${label}`);
      if (entry.children) renderDiffs(entry.children, depth + 1, lines);
      break;

    case "removed":
      // Compact: only show ref for removed nodes, skip full children
      if (entry.ref) {
        lines.push(`${indent}- <${entry.role} [${entry.ref}]>...</${entry.role}>`);
      } else {
        lines.push(`${indent}- <${entry.role}>${label}</${entry.role}>`);
      }
      // Still recurse into children in case there are nested removed refs worth noting
      if (entry.children) {
        for (const child of entry.children) {
          if (child.type === "removed" && child.ref) {
            lines.push(`${indent}  - <${child.role} [${child.ref}]>...</${child.role}>`);
          }
        }
      }
      break;

    case "modified":
      lines.push(
        `${indent}~ <${entry.role}>${label} (was "${(entry.oldName ?? "").slice(0, 60)}")`,
      );
      if (entry.children) renderDiffs(entry.children, depth + 1, lines);
      break;

    case "context":
      if (entry.children && entry.children.length > 0) {
        lines.push(`${indent}  <${entry.role}>${label}`);
        renderDiffs(entry.children, depth + 1, lines);
        lines.push(`${indent}  </${entry.role}>`);
      }
      break;
  }
}
