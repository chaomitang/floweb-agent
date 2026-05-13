import { join } from "node:path";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { statSync } from "node:fs";

export const SESSION_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function validateSessionName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Session name must be a non-empty string");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid session name: "${name}"`);
  }
  if (!SESSION_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid session name: "${name}". Only alphanumeric, dots, hyphens, and underscores are allowed.`,
    );
  }
}

export function getSessionDirPath(baseDir: string, name: string): string {
  validateSessionName(name);
  return join(baseDir, name);
}

export function listSessions(baseDir: string): string[] {
  if (!existsSync(baseDir)) {
    return [];
  }

  try {
    return readdirSync(baseDir).filter((entry) => {
      const fullPath = join(baseDir, entry);
      try {
        if (!statSync(fullPath).isDirectory()) return false;
      } catch {
        return false;
      }
      const stateFile = join(fullPath, "session-state.json");
      return existsSync(stateFile);
    });
  } catch {
    return [];
  }
}

export function deleteSessionDir(baseDir: string, name: string): void {
  validateSessionName(name);
  const dirPath = join(baseDir, name);
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}
