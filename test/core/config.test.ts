import { describe, it, expect } from "vitest";
import { FlowwebConfigSchema, resolveConfig } from "../../src/core/config.js";

describe("FlowwebConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const config = FlowwebConfigSchema.parse({});
    expect(config).toMatchObject({
      provider: "anthropic",
      headless: false,
      browserType: "chromium",
      viewport: { width: 1280, height: 720 },
      logLevel: "info",
      sessionDir: ".flowweb/sessions",
      sessionName: "default",
    });
  });

  it("accepts valid partial config", () => {
    const config = FlowwebConfigSchema.parse({
      headless: true,
      browserType: "firefox",
      viewport: { width: 1920, height: 1080 },
    });
    expect(config.headless).toBe(true);
    expect(config.browserType).toBe("firefox");
    expect(config.viewport).toEqual({ width: 1920, height: 1080 });
    expect(config.provider).toBe("anthropic");
    expect(config.logLevel).toBe("info");
  });
});

describe("resolveConfig", () => {
  it("resolves with defaults", () => {
    const config = resolveConfig();
    expect(config.provider).toBe("anthropic");
    expect(config.headless).toBe(false);
  });

  it("resolves with overrides", () => {
    const config = resolveConfig({ headless: true });
    expect(config.headless).toBe(true);
  });

  it("throws for invalid input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => resolveConfig({ browserType: "ie" as any })).toThrow();
  });
});
