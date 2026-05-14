import { DaemonClient } from "../daemon/ipc/client.js";
import type { DaemonApi } from "../daemon/ipc/api.js";

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
    {
      name: "browser_navigate",
      description: "Navigate the browser to a URL. Auto-adds https:// if no protocol specified.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to" },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_snapshot",
      description:
        "Capture an accessibility tree snapshot of the active page. Shows all interactive elements (links, buttons, inputs) with ref IDs, roles, and labels. Use this to understand page structure before clicking or typing.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "browser_snapshot_diff",
      description:
        "Take a new snapshot and diff it against the previous one. Returns +added, -removed, ~modified elements. Use after browser_click, browser_type, or browser_press to verify what changed.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "browser_click",
      description:
        "Click an element on the active page. Use a CSS selector (e.g. 'button.submit', '#login'). Run browser_snapshot first to find selectors.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the element to click" },
        },
        required: ["selector"],
      },
    },
    {
      name: "browser_type",
      description:
        "Type text into an input element. Use a CSS selector (e.g. 'input[name=\"q\"]', '#search'). Run browser_snapshot first to find selectors.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the input element" },
          text: { type: "string", description: "Text to type" },
        },
        required: ["selector", "text"],
      },
    },
    {
      name: "browser_press",
      description:
        "Press a keyboard key. Use key names like 'Enter', 'Escape', 'Tab', 'ArrowDown', etc.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to press" },
        },
        required: ["key"],
      },
    },
    {
      name: "browser_evaluate",
      description: "Execute JavaScript in the active page and return the result as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          js: { type: "string", description: "JavaScript code to execute" },
        },
        required: ["js"],
      },
    },
    {
      name: "browser_list_pages",
      description: "List all open browser pages/tabs with their titles and URLs.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "browser_switch_tab",
      description: "Switch to a different browser tab by its page ID.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page ID to switch to" },
        },
        required: ["page_id"],
      },
    },
    {
      name: "browser_close_tab",
      description: "Close a browser tab by its page ID.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page ID to close" },
        },
        required: ["page_id"],
      },
    },
    {
      name: "browser_exec",
      description:
        "Execute TypeScript/JavaScript code in a persistent REPL within the browser context. Has access to `page`, `browser`, and `context` (Playwright objects). Use `console.log()` to print output. After execution, snapshots before/after are diffed automatically. Use this for complex multi-step interactions or to query page state with custom JS.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "TypeScript/JavaScript code to execute in the browser REPL" },
        },
        required: ["code"],
      },
    },
    {
      name: "browser_close_session",
      description: "Close the entire browser session and all tabs.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

export async function callTool(
  remote: any,
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let text: string;

  switch (name) {
    case "browser_navigate": {
      const url = args.url as string;
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
        ? url
        : `https://${url}`;
      await remote.createSession(normalized);
      text = `Opened ${normalized}`;
      break;
    }
    case "browser_snapshot": {
      const snap = await remote.snapshotActive();
      text = snap.text;
      break;
    }
    case "browser_exec": {
      const result = await remote.execCode(args.code as string);
      text = [result.output, result.result !== undefined ? `=> ${result.result}` : "", result.diff ? `\n--- Diff ---\n${result.diff}` : ""]
        .filter(Boolean)
        .join("\n");
      break;
    }
    case "browser_snapshot_diff": {
      const result = await remote.snapshotDiff();
      text = result.diff;
      break;
    }
    case "browser_click": {
      await remote.click(args.selector as string);
      text = `Clicked "${args.selector}"`;
      break;
    }
    case "browser_type": {
      await remote.typeText(args.selector as string, args.text as string);
      text = `Typed "${args.text}" into "${args.selector}"`;
      break;
    }
    case "browser_press": {
      await remote.pressKey(args.key as string);
      text = `Pressed "${args.key}"`;
      break;
    }
    case "browser_evaluate": {
      const result = await remote.evaluate(args.js as string);
      text = JSON.stringify(result, null, 2);
      break;
    }
    case "browser_list_pages": {
      const pages = await remote.getPages();
      const activeId = await remote.getActivePageId();
      if (pages.length === 0) {
        text = "No pages open.";
      } else {
        text = pages
          .map((p: any) => `${p.id === activeId ? "▶" : " "} [${p.id}] ${p.title || "Untitled"} — ${p.url}`)
          .join("\n");
      }
      break;
    }
    case "browser_switch_tab": {
      await remote.switchToPage(args.page_id as string);
      text = `Switched to page ${args.page_id}`;
      break;
    }
    case "browser_close_tab": {
      await remote.closePage(args.page_id as string);
      text = `Closed page ${args.page_id}`;
      break;
    }
    case "browser_close_session": {
      await remote.closeSession();
      text = "Browser session closed.";
      break;
    }
    default:
      text = `Unknown tool: ${name}`;
  }

  return { content: [{ type: "text", text }] };
}
