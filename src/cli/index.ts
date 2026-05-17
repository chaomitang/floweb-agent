#!/usr/bin/env node
import { startTui } from "../tui/index.js";
import { startMcpServer } from "../mcp/index.js";
import { createProgram } from "./args.js";
import { resolveConfig, initConfig, getGlobalSkillsDir } from "../core/config.js";
import { ensureSkillsInstalled } from "../skills/install.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";

const noopHandlers: ClientApi = {
  pagesChanged() {},
  sessionStatusChanged() {},
  actionLogged() {},
  observingChanged() {},
};

// ─── Helpers ──────────────────────────────────────────────────────────

async function withDaemon<T>(
  socketPath: string,
  fn: (client: DaemonClient) => Promise<T>,
): Promise<T> {
  const client = await DaemonClient.connect(socketPath, noopHandlers);
  try {
    return await fn(client);
  } finally {
    client.destroy();
  }
}

function sp(sessionName: string, opts: Record<string, unknown>): string {
  return (opts.socketPath as string) ?? getDaemonSocketPath(sessionName);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  initConfig();
  ensureSkillsInstalled(getGlobalSkillsDir());
  process.title = "floweb";

  const program = createProgram();
  const opts = () => program.opts<{ session: string; socketPath?: string }>();

  // ── session start ──
  const sessionCmd = program.commands.find((c) => c.name() === "session")!;

  sessionCmd.commands.find((c) => c.name() === "start")!
    .action(async (name: string, url?: string) => {
      const config = resolveConfig({ sessionName: name } as Record<string, unknown>);
      config.sessionName = name;
      const { client, pid } = await DaemonClient.spawn(config, noopHandlers);
      console.log(`Session "${name}" started (pid ${pid}, socket ${getDaemonSocketPath(name)})`);
      if (url) {
        const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `https://${url}`;
        await client.remote.createSession(normalized);
        console.log(`Opened: ${normalized}`);
      }
      client.destroy();
    });

  // ── session stop ──
  sessionCmd.commands.find((c) => c.name() === "stop")!
    .action(async (name: string) => {
      const s = getDaemonSocketPath(name);
      await withDaemon(s, async (client) => {
        await client.remote.closeSession();
        await client.remote.shutdown();
      });
      console.log(`Session "${name}" stopped.`);
    });

  // ── session list ──
  sessionCmd.commands.find((c) => c.name() === "list")!
    .action(async () => {
      const { readdir } = await import("node:fs/promises");
      const { userInfo } = await import("node:os");
      const uid = userInfo().uid;
      const prefix = `floweb-${uid}-`;
      const suffix = ".sock";
      console.log("Active sessions:");
      const entries = await readdir("/tmp").catch(() => [] as string[]);
      let found = false;
      for (const entry of entries) {
        if (entry.startsWith(prefix) && entry.endsWith(suffix)) {
          const name = entry.slice(prefix.length, -suffix.length);
          try {
            await withDaemon(getDaemonSocketPath(name), async (client) => {
              const pages = await client.remote.getPages();
              const activeId = await client.remote.getActivePageId();
              const activePage = pages.find((p) => p.id === activeId);
              console.log(`  ${name} — ${pages.length} page(s)${activePage ? `, active: ${activePage.title}` : ""}`);
            });
          } catch {
            console.log(`  ${name} (stale socket)`);
          }
          found = true;
        }
      }
      if (!found) console.log("  (none)");
    });

  // ── session status ──
  sessionCmd.commands.find((c) => c.name() === "status")!
    .action(async () => {
      const s = sp(opts().session, opts());
      await withDaemon(s, async (client) => {
        const pages = await client.remote.getPages();
        const activeId = await client.remote.getActivePageId();
        const activePage = pages.find((p) => p.id === activeId);
        console.log(JSON.stringify({
          pageCount: pages.length,
          activePage: activePage ? { id: activePage.id, title: activePage.title, url: activePage.url } : null,
          pages: pages.map((p) => ({ id: p.id, title: p.title, url: p.url })),
        }, null, 2));
      });
    });

  // ── navigate / open ──
  const navigateOrOpen = async (url: string) => {
    const s = sp(opts().session, opts());
    const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `https://${url}`;
    try {
      await withDaemon(s, (c) => c.remote.createSession(normalized));
      console.log(`Opened ${normalized}`);
    } catch {
      const config = resolveConfig(opts() as Record<string, unknown>);
      const { client } = await DaemonClient.spawn(config, noopHandlers);
      try { await client.remote.createSession(normalized); console.log(`Started daemon and opened: ${normalized}`); }
      finally { client.destroy(); }
    }
  };
  program.commands.find((c) => c.name() === "navigate")!.action(navigateOrOpen);
  program.commands.find((c) => c.name() === "open")!.action(navigateOrOpen);

  // ── back / forward / reload ──
  program.commands.find((c) => c.name() === "back")!
    .action(async () => { await withDaemon(sp(opts().session, opts()), (c) => c.remote.goBack()); console.log("Navigated back"); });
  program.commands.find((c) => c.name() === "forward")!
    .action(async () => { await withDaemon(sp(opts().session, opts()), (c) => c.remote.goForward()); console.log("Navigated forward"); });
  program.commands.find((c) => c.name() === "reload")!
    .action(async () => { await withDaemon(sp(opts().session, opts()), (c) => c.remote.reloadPage()); console.log("Page reloaded"); });

  // ── snapshot / snapshot-diff ──
  program.commands.find((c) => c.name() === "snapshot")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const snap = await c.remote.snapshotActive();
        console.log(snap.text);
      });
    });
  program.commands.find((c) => c.name() === "snapshot-diff")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const result = await c.remote.snapshotDiff();
        console.log(result.diff);
      });
    });

  // ── pages ──
  program.commands.find((c) => c.name() === "pages")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const pages = await c.remote.getPages();
        const activeId = await c.remote.getActivePageId();
        if (pages.length === 0) {
          console.log("No pages open.");
        } else {
          for (const page of pages) {
            const marker = page.id === activeId ? "*" : " ";
            console.log(`${marker} [${page.id}] ${page.title || "Untitled"} — ${page.url}`);
          }
        }
      });
    });

  // ── click ──
  program.commands.find((c) => c.name() === "click")!
    .action(async (selector: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.click(selector));
      console.log(`Clicked "${selector}"`);
    });

  // ── type ──
  program.commands.find((c) => c.name() === "type")!
    .action(async (selector: string, text: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.typeText(selector, text));
      console.log(`Typed "${text}" into "${selector}"`);
    });

  // ── press ──
  program.commands.find((c) => c.name() === "press")!
    .action(async (key: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.pressKey(key));
      console.log(`Pressed "${key}"`);
    });

  // ── hover ──
  program.commands.find((c) => c.name() === "hover")!
    .action(async (selector: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.hover(selector));
      console.log(`Hovered "${selector}"`);
    });

  // ── scroll ──
  program.commands.find((c) => c.name() === "scroll")!
    .action(async (x: string, y: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.scroll(Number(x), Number(y)));
      console.log(`Scrolled (${x}, ${y})`);
    });

  // ── select ──
  program.commands.find((c) => c.name() === "select")!
    .action(async (selector: string, value: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.select(selector, value));
      console.log(`Selected "${value}" in ${selector}`);
    });

  // ── wait ──
  program.commands.find((c) => c.name() === "wait")!
    .action(async (arg?: string, cmdOpts?: { ms?: number; selector?: string }) => {
      const ms = cmdOpts?.ms ?? (arg && !isNaN(Number(arg)) ? Number(arg) : undefined);
      const selector = cmdOpts?.selector ?? (arg && isNaN(Number(arg)) ? arg : undefined);
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.waitFor(ms, selector));
      console.log(selector ? `Element "${selector}" appeared` : `Waited ${ms ?? 1000}ms`);
    });

  // ── move-cursor ──
  program.commands.find((c) => c.name() === "move-cursor")!
    .action(async (x: string, y: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.moveCursor(Number(x), Number(y)));
      console.log(`Cursor moved to (${x}, ${y})`);
    });

  // ── highlight ──
  program.commands.find((c) => c.name() === "highlight")!
    .action(async (selector: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.highlightElement(selector));
      console.log(`Highlighted "${selector}"`);
    });

  // ── switch-tab / close-tab ──
  program.commands.find((c) => c.name() === "switch-tab")!
    .action(async (pageId: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.switchToPage(pageId));
      console.log(`Switched to page ${pageId}`);
    });
  program.commands.find((c) => c.name() === "close-tab")!
    .action(async (pageId: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.closePage(pageId));
      console.log(`Closed page ${pageId}`);
    });

  // ── close-session / close ──
  const closeHandler = async () => {
    await withDaemon(sp(opts().session, opts()), (c) => c.remote.closeSession());
    console.log("Browser session closed.");
  };
  program.commands.find((c) => c.name() === "close-session")!.action(closeHandler);
  program.commands.find((c) => c.name() === "close")!.action(closeHandler);

  // ── evaluate ──
  program.commands.find((c) => c.name() === "evaluate")!
    .action(async (codeParts: string[]) => {
      const js = codeParts.join(" ");
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const result = await c.remote.evaluate(js);
        console.log(JSON.stringify(result, null, 2));
      });
    });

  // ── exec ──
  program.commands.find((c) => c.name() === "exec")!
    .action(async (codeParts: string[], cmdOpts: { timeout?: number }) => {
      let code = codeParts?.join(" ") ?? "";
      if (!code) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        code = Buffer.concat(chunks).toString().trim();
        if (!code) { console.error("Usage: floweb exec <code> or echo <code> | floweb exec"); process.exit(1); }
      }
      const s = sp(opts().session, opts());
      const timeout = cmdOpts.timeout;
      await withDaemon(s, async (client) => {
        if (timeout) client.setRequestTimeout(timeout);
        try {
          const { output, result, diff } = await client.remote.execCode(code);
          if (output) console.log(output.trim());
          if (result !== undefined) console.log("=>", result);
          if (diff) console.log("\n--- Snapshot Diff ---\n" + diff);
        } finally {
          if (timeout) client.setRequestTimeout(30000);
        }
      });
    });

  // ── intercept ──
  program.commands.find((c) => c.name() === "intercept")!
    .action(async (timeout?: string) => {
      const sec = Number(timeout) || 5;
      await withDaemon(sp(opts().session, opts()), async (c) => {
        await c.remote.startIntercept();
        await new Promise((r) => setTimeout(r, sec * 1000));
        const responses = await c.remote.getIntercepted();
        if (responses.length === 0) {
          console.log("No requests intercepted");
        } else {
          for (const r of responses) {
            console.log(`[${r.status}] ${r.url}`);
            console.log(r.body.slice(0, 200));
            console.log("---");
          }
        }
      });
    });

  // ── load-profile / save-profile ──
  program.commands.find((c) => c.name() === "load-profile")!
    .action(async (domain: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.loadProfile(domain));
      console.log(`Loaded profile for ${domain}, page refreshed`);
    });
  program.commands.find((c) => c.name() === "save-profile")!
    .action(async (domain: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.saveProfile(domain));
      console.log(`Saved profile for ${domain} (cookies + localStorage)`);
    });

  // ── screenshot ──
  program.commands.find((c) => c.name() === "screenshot")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const b64 = await c.remote.screenshot();
        console.log(`Screenshot (base64, ${b64.length} chars)`);
      });
    });

  // ── compact-html ──
  program.commands.find((c) => c.name() === "compact-html")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        const result = await c.remote.compactHTML();
        console.log(`Compacted HTML: ${result.condensedLength} chars (was ${result.originalLength})`);
        console.log();
        console.log(result.html);
      });
    });

  // ── audit ──
  program.commands.find((c) => c.name() === "audit")!
    .action(async () => {
      await withDaemon(sp(opts().session, opts()), async (c) => {
        console.log(await c.remote.auditSite());
      });
    });

  // ── observe ──
  program.commands.find((c) => c.name() === "observe")!
    .action(async (onOff: string) => {
      await withDaemon(sp(opts().session, opts()), (c) => c.remote.setObservingMode(onOff === "on"));
      console.log(`Observation mode ${onOff === "on" ? "enabled" : "disabled"}`);
    });

  // ── tui ──
  program.commands.find((c) => c.name() === "tui")!
    .action(async (sessionName?: string) => {
      const o = opts();
      const config = resolveConfig(o as Record<string, unknown>);
      const s = (o.socketPath as string) ?? getDaemonSocketPath(sessionName ?? o.session);
      const { waitUntilExit } = startTui({ config, socketPath: s, sessionName });
      try { await waitUntilExit(); } catch (err) {
        console.error("Floweb exited with an error:", err);
        process.exit(1);
      }
    });

  // ── mcp ──
  program.commands.find((c) => c.name() === "mcp")!
    .action(async () => { await startMcpServer(opts().session); });

  // ── run ──
  program.commands.find((c) => c.name() === "run")!
    .action(async (file: string) => {
      const s = sp(opts().session, opts());
      const { fork } = await import("node:child_process");
      const child = fork(file, [], {
        env: { ...process.env, FLOWEB_SOCKET: s },
        stdio: "inherit",
      });
      await new Promise<void>((resolve) => child.on("exit", () => resolve()));
    });

  // ── setup ──
  program.commands.find((c) => c.name() === "setup")!
    .action(async (target?: string) => {
      const { homedir } = await import("node:os");
      const { join, dirname } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const KNOWN_TARGETS: Record<string, string> = {
        claude: join(homedir(), ".claude", "skills"),
        codex: join(homedir(), ".codex", "skills"),
        opencode: join(homedir(), ".opencode", "skills"),
      };

      const install = (dest: string) => {
        ensureSkillsInstalled(dest);
        console.log(`  -> ${dest}`);
      };

      if (target) {
        const dest = KNOWN_TARGETS[target] ?? target;
        console.log(`Installing floweb skills to:`);
        install(dest);
      } else {
        const found = Object.entries(KNOWN_TARGETS).filter(([, dest]) => existsSync(dirname(dest)));
        if (found.length === 0) {
          console.log("No known agent config directories found.");
          console.log("Usage: floweb setup [claude|codex|opencode|<path>]");
        } else {
          console.log(`Installing floweb skills to ${found.length} target(s):`);
          for (const [, dest] of found) install(dest);
        }
      }
    });

  // ── daemon (内部) ──
  program.commands.find((c) => c.name() === "daemon")!
    .action(() => { console.error("The 'daemon' subcommand is for internal use only."); process.exit(1); });

  await program.parseAsync(process.argv);
}

main();
