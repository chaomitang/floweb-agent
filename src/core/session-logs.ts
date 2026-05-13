import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LogAction {
  type: string;
  timestamp: string;
  data?: unknown;
}

export function appendAction(sessionDir: string, action: LogAction): void {
  try {
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    const line = JSON.stringify(action) + "\n";
    const filePath = join(sessionDir, "actions.jsonl");
    appendFileSync(filePath, line, "utf-8");
  } catch {
    // Best-effort logging, silently fail
  }
}

export function readActions(sessionDir: string): LogAction[] {
  const filePath = join(sessionDir, "actions.jsonl");
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as LogAction);
  } catch {
    return [];
  }
}
