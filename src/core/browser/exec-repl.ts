import type { Page, Browser, BrowserContext } from "playwright";

// Persistent execution context for browser code.
// Survives across exec calls — variables and functions persist.
//
// The REPL provides `page`, `browser`, `context` from the TUI's shared
// Playwright instance. Scripts should use these directly — do NOT call
// chromium.launch() or require("playwright") inside the REPL.

export class DaemonExecRepl {
  private ctx: Record<string, unknown> = {};
  private counter = 0;

  setPage(page: Page, browser: Browser, bcontext: BrowserContext) {
    this.ctx.page = page;
    this.ctx.browser = browser;
    this.ctx.context = bcontext;
  }

  async run(code: string): Promise<{ output: string; result: unknown }> {
    this.counter++;
    const outLines: string[] = [];

    // Intercept console.log/error/warn with multi-arg support.
    // Each call appends a line: all args are stringified and joined.
    const mkLog =
      (level: string) =>
      (...args: unknown[]) => {
        outLines.push(
          args
            .map((a) =>
              typeof a === "string" ? a : JSON.stringify(a, null, 2),
            )
            .join(" "),
        );
      };
    this.ctx.console = {
      log: mkLog("log"),
      error: mkLog("error"),
      warn: mkLog("warn"),
    };

    try {
      const result = await new Function(
        "ctx",
        `with (ctx) {
          return (async () => { ${code} })();
        }`,
      )(this.ctx);

      if (result !== undefined) {
        outLines.push(
          "=> " +
            (typeof result === "string" ? result : JSON.stringify(result, null, 2)),
        );
      }

      return { output: outLines.join("\n"), result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Detect common pitfalls and give helpful hints
      if (msg.includes("require is not defined")) {
        outLines.push(
          "Hint: browser_exec runs in the TUI's shared browser — use `page`, `browser`, `context` directly. No need for require().",
        );
      } else if (
        msg.includes("chromium") ||
        msg.includes("playwright") ||
        msg.includes("Cannot find module")
      ) {
        outLines.push(
          "Hint: browser_exec provides `page`, `browser`, `context` from the shared browser. Do NOT launch a new browser with chromium.launch().",
        );
      }

      if (!outLines.some((l) => l.includes(msg))) {
        outLines.push(`Error: ${msg}`);
      }
      return { output: outLines.join("\n"), result: undefined };
    }
  }
}
