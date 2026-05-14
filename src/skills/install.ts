import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSourceSkillsDir } from "../core/config.js";

/**
 * Ensure built-in skills from the npm package are installed to the global
 * skills directory (~/.floweb/skills/).  Runs once on startup; skips if
 * source skills are not present (e.g. when running from unpacked dev build).
 */
export function ensureSkillsInstalled(globalDir: string): void {
  const sourceDir = getSourceSkillsDir();

  if (!existsSync(sourceDir)) return;

  mkdirSync(globalDir, { recursive: true });

  const entries = readdirSync(sourceDir);

  for (const entry of entries) {
    const srcPath = join(sourceDir, entry);
    const destPath = join(globalDir, entry);

    if (!statSync(srcPath).isDirectory()) continue;
    if (!existsSync(join(srcPath, "SKILL.md"))) continue;

    // Copy if destination doesn't exist, or if source is newer
    if (!existsSync(destPath) || statSync(srcPath).mtimeMs > statSync(destPath).mtimeMs) {
      cpSync(srcPath, destPath, { recursive: true });
    }
  }
}
