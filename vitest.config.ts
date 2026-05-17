import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    name: "floweb",
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    pool: "forks",
    isolate: true,
    maxWorkers: 4,
    reporters: ["minimal"],
  },
});
