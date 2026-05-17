import type { DaemonClient } from "../daemon/ipc/client.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export function getMcpTools(): McpTool[] {
  return [
    // ── Navigation ──
    {
      name: "browser_navigate",
      description: "Navigate the browser to a URL. Auto-adds https:// if no protocol specified.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "The URL to navigate to" } },
        required: ["url"],
      },
    },
    {
      name: "browser_back",
      description: "Navigate the browser back to the previous page.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_forward",
      description: "Navigate the browser forward to the next page.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_reload",
      description: "Reload/refresh the current page.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Page State ──
    {
      name: "browser_snapshot",
      description: "Capture an accessibility tree snapshot of the active page. Shows all interactive elements (links, buttons, inputs) with ref IDs, roles, and labels.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_snapshot_diff",
      description: "Take a new snapshot and diff it against the previous one. Returns +added, -removed, ~modified elements.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_list_pages",
      description: "List all open browser pages/tabs with their titles and URLs.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Interaction ──
    {
      name: "browser_click",
      description: "Click an element on the active page. Use a CSS selector (e.g. 'button.submit', '#login').",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string", description: "CSS selector of the element to click" } },
        required: ["selector"],
      },
    },
    {
      name: "browser_type",
      description: "Type text into an input element. Use a CSS selector (e.g. 'input[name=\"q\"]', '#search').",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the input element" },
          text: { type: "string", description: "Text to fill" },
        },
        required: ["selector", "text"],
      },
    },
    {
      name: "browser_press",
      description: "Press a keyboard key. Use key names like 'Enter', 'Escape', 'Tab', 'ArrowDown', etc.",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string", description: "Key to press" } },
        required: ["key"],
      },
    },
    {
      name: "browser_hover",
      description: "Hover the mouse over an element. Useful for triggering tooltips, dropdown menus, etc.",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string", description: "CSS selector of the element to hover" } },
        required: ["selector"],
      },
    },
    {
      name: "browser_scroll",
      description: "Scroll the page by pixel offsets. x=horizontal, y=vertical (positive=down).",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "Horizontal scroll pixels (default 0)" },
          y: { type: "number", description: "Vertical scroll pixels (default 0)" },
        },
      },
    },
    {
      name: "browser_select",
      description: "Select an option in a <select> dropdown element.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the select element" },
          value: { type: "string", description: "Option value to select" },
        },
        required: ["selector", "value"],
      },
    },
    {
      name: "browser_wait",
      description: "Wait for a specified number of milliseconds, or wait for a CSS selector to appear in the DOM.",
      inputSchema: {
        type: "object",
        properties: {
          ms: { type: "number", description: "Milliseconds to wait (default 1000)" },
          selector: { type: "string", description: "Wait for this CSS selector to appear" },
        },
      },
    },
    // ── Visual Feedback ──
    {
      name: "browser_move_cursor",
      description: "Move the visual cursor indicator to pixel coordinates on the page. The cursor is a visual feedback element, not the system mouse.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X pixel coordinate" },
          y: { type: "number", description: "Y pixel coordinate" },
        },
        required: ["x", "y"],
      },
    },
    {
      name: "browser_highlight",
      description: "Highlight an element on the page with a visual overlay. Useful for showing which element will be interacted with next.",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string", description: "CSS selector of the element to highlight" } },
        required: ["selector"],
      },
    },
    // ── Tab Management ──
    {
      name: "browser_switch_tab",
      description: "Switch to a different browser tab by its page ID.",
      inputSchema: {
        type: "object",
        properties: { pageId: { type: "string", description: "Page ID to switch to" } },
        required: ["pageId"],
      },
    },
    {
      name: "browser_close_tab",
      description: "Close a browser tab by its page ID.",
      inputSchema: {
        type: "object",
        properties: { pageId: { type: "string", description: "Page ID to close" } },
        required: ["pageId"],
      },
    },
    {
      name: "browser_close_session",
      description: "Close the entire browser session and all tabs.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Execution ──
    {
      name: "browser_evaluate",
      description: "Execute JavaScript in the active page and return the result as JSON.",
      inputSchema: {
        type: "object",
        properties: { js: { type: "string", description: "JavaScript code to execute" } },
        required: ["js"],
      },
    },
    {
      name: "browser_exec",
      description: "Execute TypeScript/JavaScript code in a persistent REPL within the browser context. Has access to `page`, `browser`, `context` (Playwright objects).",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "TypeScript/JavaScript code to execute" },
          timeout: { type: "number", description: "Request timeout in milliseconds (default 120000 = 2 min)" },
        },
        required: ["code"],
      },
    },
    // ── Network & Auth ──
    {
      name: "browser_intercept",
      description: "Start passive network interception, listening for HTTP responses. Waits for the specified seconds and returns intercepted data. Useful for anti-crawler data capture.",
      inputSchema: {
        type: "object",
        properties: { timeout: { type: "number", description: "Seconds to wait (default 5)" } },
      },
    },
    {
      name: "browser_load_profile",
      description: "Load a previously saved authentication profile (cookies + localStorage) for a domain and refresh the page.",
      inputSchema: {
        type: "object",
        properties: { domain: { type: "string", description: "Domain name, e.g. example.com" } },
        required: ["domain"],
      },
    },
    {
      name: "browser_save_profile",
      description: "Save the current authentication state (cookies + localStorage) for a domain to reuse later.",
      inputSchema: {
        type: "object",
        properties: { domain: { type: "string", description: "Domain name, e.g. example.com" } },
        required: ["domain"],
      },
    },
    // ── Utilities ──
    {
      name: "browser_audit",
      description: "Audit the current page for anti-bot services (Akamai/Cloudflare/DataDome/PerimeterX), fetch interception, webdriver fingerprint, and CAPTCHAs.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_screenshot",
      description: "Take a PNG screenshot of the current page and return it as a base64-encoded string.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_compact_html",
      description: "Get a compacted version of the current page HTML. Removes <script>/<style> content, HTML comments, base64 data, non-semantic CSS classes, framework attributes, etc. Saves 70-90% tokens compared to full HTML.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_set_observing",
      description: "Toggle observation mode. Set true to enter (user is manually operating the browser), false to exit.",
      inputSchema: {
        type: "object",
        properties: { observing: { type: "boolean", description: "true to enter observation mode, false to exit" } },
        required: ["observing"],
      },
    },
  ];
}

export async function callTool(
  client: DaemonClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { remote } = client;
  let text: string;

  switch (name) {
    // ── Navigation ──
    case "browser_navigate": {
      const url = args.url as string;
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
        ? url
        : `https://${url}`;
      await remote.createSession(normalized);
      text = `Opened ${normalized}`;
      break;
    }
    case "browser_back":
      await remote.goBack();
      text = "Navigated back";
      break;
    case "browser_forward":
      await remote.goForward();
      text = "Navigated forward";
      break;
    case "browser_reload":
      await remote.reloadPage();
      text = "Page reloaded";
      break;
    // ── Page State ──
    case "browser_snapshot": {
      const snap = await remote.snapshotActive();
      text = snap.text;
      break;
    }
    case "browser_snapshot_diff": {
      const result = await remote.snapshotDiff();
      text = result.diff;
      break;
    }
    case "browser_list_pages": {
      const pages = await remote.getPages();
      const activeId = await remote.getActivePageId();
      if (pages.length === 0) {
        text = "No pages open.";
      } else {
        text = pages
          .map((p) => `${p.id === activeId ? "▶" : " "} [${p.id}] ${p.title || "Untitled"} — ${p.url}`)
          .join("\n");
      }
      break;
    }
    // ── Interaction ──
    case "browser_click":
      await remote.click(args.selector as string);
      text = `Clicked "${args.selector}"`;
      break;
    case "browser_type":
      await remote.typeText(args.selector as string, args.text as string);
      text = `Typed "${args.text}" into "${args.selector}"`;
      break;
    case "browser_press":
      await remote.pressKey(args.key as string);
      text = `Pressed "${args.key}"`;
      break;
    case "browser_hover":
      await remote.hover(args.selector as string);
      text = `Hovered "${args.selector}"`;
      break;
    case "browser_scroll":
      await remote.scroll((args.x as number) ?? 0, (args.y as number) ?? 0);
      text = `Scrolled (${args.x ?? 0}, ${args.y ?? 0})`;
      break;
    // ── Visual Feedback ──
    case "browser_move_cursor":
      await remote.moveCursor(args.x as number, args.y as number);
      text = `Cursor moved to (${args.x}, ${args.y})`;
      break;
    case "browser_highlight":
      await remote.highlightElement(args.selector as string);
      text = `Highlighted "${args.selector}"`;
      break;
    case "browser_select": {
      const selValue = args.value as string;
      await remote.select(args.selector as string, selValue);
      text = `Selected "${selValue}" in ${args.selector}`;
      break;
    }
    case "browser_wait":
      await remote.waitFor(args.ms as number | undefined, args.selector as string | undefined);
      text = args.selector ? `Element "${args.selector}" appeared` : `Waited ${args.ms ?? 1000}ms`;
      break;
    // ── Tab Management ──
    case "browser_switch_tab":
      await remote.switchToPage(args.pageId as string);
      text = `Switched to page ${args.pageId}`;
      break;
    case "browser_close_tab":
      await remote.closePage(args.pageId as string);
      text = `Closed page ${args.pageId}`;
      break;
    case "browser_close_session":
      await remote.closeSession();
      text = "Browser session closed.";
      break;
    // ── Execution ──
    case "browser_evaluate": {
      const result = await remote.evaluate(args.js as string);
      text = JSON.stringify(result, null, 2);
      break;
    }
    case "browser_exec": {
      const timeout = (args.timeout as number) ?? 120000;
      client.setRequestTimeout(timeout);
      try {
        const result = await remote.execCode(args.code as string);
        text = [result.output, result.result !== undefined ? `=> ${result.result}` : "", result.diff ? `\n--- Diff ---\n${result.diff}` : ""]
          .filter(Boolean)
          .join("\n");
      } finally {
        client.setRequestTimeout(30000);
      }
      break;
    }
    // ── Network & Auth ──
    case "browser_intercept": {
      const timeout = (args.timeout as number) ?? 5;
      await remote.startIntercept();
      await new Promise((r) => setTimeout(r, timeout * 1000));
      const responses = await remote.getIntercepted();
      if (responses.length === 0) {
        text = "No requests intercepted";
      } else {
        text = responses
          .map((r) => `[${r.status}] ${r.url}\n${r.body.slice(0, 200)}`)
          .join("\n\n---\n\n");
      }
      break;
    }
    case "browser_load_profile":
      await remote.loadProfile(args.domain as string);
      text = `Loaded profile for ${args.domain}, page refreshed`;
      break;
    case "browser_save_profile":
      await remote.saveProfile(args.domain as string);
      text = `Saved profile for ${args.domain} (cookies + localStorage)`;
      break;
    // ── Utilities ──
    case "browser_audit":
      text = await remote.auditSite();
      break;
    case "browser_screenshot": {
      const b64 = await remote.screenshot();
      text = `Screenshot (base64, ${b64.length} chars)`;
      break;
    }
    case "browser_compact_html": {
      const result = await remote.compactHTML();
      text = [
        `Compacted HTML: ${result.condensedLength} chars (was ${result.originalLength}, ${Object.entries(result.reductions).map(([k, v]) => `${k} -${v}`).join(", ")})`,
        "",
        result.html,
      ].join("\n");
      break;
    }
    case "browser_set_observing":
      await remote.setObservingMode(args.observing as boolean);
      text = (args.observing as boolean) ? "Observation mode enabled" : "Observation mode disabled";
      break;
    default:
      text = `Unknown tool: ${name}`;
  }

  return { content: [{ type: "text", text }] };
}
