import type { SnapshotNode, PageSnapshot } from "./snapshot.js";

export interface DiffEntry {
  type: "added" | "removed" | "modified" | "context";
  ref?: string;
  role?: string;
  name?: string;
  oldName?: string;
  children?: DiffEntry[];
}

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
  const result: DiffEntry[] = [];

  // Added
  if (!before && after) {
    result.push({ type: "added", ref: after.ref, role: after.role, name: after.name });
    for (const child of after.children) {
      result.push(...diffNodes(undefined, child));
    }
    return result;
  }

  // Removed
  if (before && !after) {
    result.push({ type: "removed", ref: before.ref, role: before.role, name: before.name });
    for (const child of before.children) {
      result.push(...diffNodes(child, undefined));
    }
    return result;
  }

  if (!before || !after) return result;

  // Modified (different fingerprint)
  if (before.fingerprint !== after.fingerprint) {
    result.push({
      type: "modified",
      ref: after.ref,
      role: after.role,
      name: after.name,
      oldName: before.name,
    });
    return result;
  }

  // Same fingerprint — recurse into children
  const childDiffs: DiffEntry[] = [];
  const maxLen = Math.max(before.children.length, after.children.length);

  for (let i = 0; i < maxLen; i++) {
    const bc = before.children[i];
    const ac = after.children[i];
    const childResult = diffNodes(bc, ac);
    childDiffs.push(...childResult);
  }

  if (childDiffs.length > 0) {
    result.push({
      type: "context",
      ref: before.ref,
      role: before.role,
      name: before.name,
      children: childDiffs,
    });
  }

  return result;
}

export function renderDiff(entries: DiffEntry[]): string {
  const lines: string[] = [];

  const render = (entries: DiffEntry[], depth: number) => {
    const indent = "  ".repeat(depth);

    for (const entry of entries) {
      const label = entry.name ? ` "${entry.name.slice(0, 60)}"` : "";

      switch (entry.type) {
        case "added":
          lines.push(`${indent}+ <${entry.role}>${label}`);
          break;
        case "removed":
          lines.push(`${indent}- <${entry.role}>${label}`);
          break;
        case "modified":
          lines.push(
            `${indent}~ <${entry.role}>${label} (was "${(entry.oldName ?? "").slice(0, 60)}")`,
          );
          break;
        case "context":
          if (entry.children && entry.children.length > 0) {
            lines.push(`${indent}  <${entry.role}>${label}`);
            render(entry.children, depth + 1);
            lines.push(`${indent}  </${entry.role}>`);
          }
          break;
      }
    }
  };

  render(entries, 0);
  return lines.length > 0 ? lines.join("\n") : "(no changes)";
}
