import { defineConfig } from "vitest/config";

export default defineConfig({
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
