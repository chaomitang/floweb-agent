import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PageInfoSchema } from "../shared/schemas.js";

const SessionStateSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  sessionName: z.string().optional(),
  port: z.number().optional(),
  pid: z.number().optional(),
  cdpEndpoint: z.string().optional(),
  pages: z.array(PageInfoSchema),
  activePageId: z.string().nullable(),
  startedAt: z.string().datetime({ offset: true }),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

function sessionFilePath(sessionDir: string): string {
  return join(sessionDir, "session-state.json");
}

export function readSessionState(sessionDir: string): SessionState | null {
  const filePath = sessionFilePath(sessionDir);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return SessionStateSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function writeSessionState(sessionDir: string, state: SessionState): void {
  const filePath = sessionFilePath(sessionDir);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  // Ensure conversations/ subdirectory exists
  const conversationsDir = join(sessionDir, "conversations");
  if (!existsSync(conversationsDir)) {
    mkdirSync(conversationsDir, { recursive: true });
  }
  const validated = SessionStateSchema.parse(state);
  writeFileSync(filePath, JSON.stringify(validated, null, 2), "utf-8");
}
