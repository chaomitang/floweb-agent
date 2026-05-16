import type { ChatMessage } from "../tui/hooks/use-browser-state.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function messagesPath(sessionDir: string): string {
  return join(sessionDir, "conversations", "messages.json");
}

export function saveMessages(sessionDir: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const dir = join(sessionDir, "conversations");
  mkdirSync(dir, { recursive: true });
  // Keep only user and agent messages, skip system/tool noise
  const clean = messages
    .filter((m) => m.role === "user" || m.role === "agent")
    .slice(-100);
  writeFileSync(messagesPath(sessionDir), JSON.stringify(clean, null, 2), "utf-8");
}

export function loadMessages(sessionDir: string): ChatMessage[] {
  try {
    const file = messagesPath(sessionDir);
    if (!existsSync(file)) return [];
    return JSON.parse(readFileSync(file, "utf-8")) as ChatMessage[];
  } catch {
    return [];
  }
}

export function loadContextPrompt(sessionDir: string): string | null {
  const messages = loadMessages(sessionDir);
  if (messages.length === 0) return null;

  const lines = messages.map((m) => {
    const role = m.role === "user" ? "User" : "Assistant";
    return `${role}: ${m.content}`;
  });

  return [
    "[Previous conversation from last session — you already know this user:]",
    ...lines,
    "[End of previous conversation.]",
    "[IMPORTANT: This is a new session. The browser state may be completely different from the previous conversation — DO NOT assume any pages are still open. Always check the current page state with browser_snapshot before making claims about what page you are on.]",
  ].join("\n");
}

export function deleteMessages(sessionDir: string): void {
  try {
    if (existsSync(messagesPath(sessionDir))) unlinkSync(messagesPath(sessionDir));
  } catch { /* ignore */ }
}
