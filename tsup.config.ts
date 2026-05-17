import { defineConfig } from "tsup";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

function resolveAliases(): void {
  execSync("npx tsc-alias -p tsconfig.json", { stdio: "inherit" });
}

function ensureCliShebang(): void {
  const entryPath = "dist/cli/index.js";
  const content = readFileSync(entryPath, "utf-8");
  if (!content.startsWith("#!/")) {
    writeFileSync(entryPath, `#!/usr/bin/env node\n${content}`);
  }
  chmodSync(entryPath, 0o755);
}

export default defineConfig([
  {
    entry: ["src/**/*.{ts,tsx}", "!src/cli/**", "!src/**/*.test.{ts,tsx}"],
    format: ["esm"],
    dts: true,
    bundle: false,
    minify: false,
    clean: ["**", "!cli/**"],
    outDir: "dist",
    onSuccess: async () => {
      resolveAliases();
    },
  },
  {
    entry: ["src/cli/**/*.ts", "!src/cli/**/*.test.ts"],
    format: ["esm"],
    dts: false,
    bundle: false,
    minify: false,
    clean: true,
    outDir: "dist/cli",
    onSuccess: async () => {
      resolveAliases();
      ensureCliShebang();
    },
  },
]);
