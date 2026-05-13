import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DaemonClient } from "../../daemon/ipc/client.js";

export function createBrowserTools(getClient: () => DaemonClient | null) {
  const client = () => {
    const c = getClient();
    if (!c) throw new Error("Daemon not connected");
    return c;
  };

  const navigate = tool(
    async ({ url }: { url: string }) => {
      const normalized = url.includes("://") ? url : `https://${url}`;
      await client().remote.createSession(normalized);
      return `Opened ${normalized}`;
    },
    {
      name: "browser_navigate",
      description: "Navigate the browser to a URL. Auto-adds https:// if no protocol specified.",
      schema: z.object({
        url: z.string().describe("The URL to navigate to"),
      }),
    },
  );

  const snapshot = tool(
    async () => {
      const pages = await client().remote.getPages();
      const activeId = await client().remote.getActivePageId();
      return JSON.stringify({ pages, activePageId: activeId }, null, 2);
    },
    {
      name: "browser_snapshot",
      description: "Get the current state of all browser pages/tabs as JSON.",
      schema: z.object({}),
    },
  );

  const listPages = tool(
    async () => {
      const pages = await client().remote.getPages();
      const activeId = await client().remote.getActivePageId();
      if (pages.length === 0) return "No pages open.";
      return pages
        .map(
          (p) =>
            `${p.id === activeId ? "▶" : " "} [${p.id}] ${p.title || "Untitled"} — ${p.url}`,
        )
        .join("\n");
    },
    {
      name: "browser_list_pages",
      description: "List all open browser pages/tabs with their titles and URLs.",
      schema: z.object({}),
    },
  );

  const switchTab = tool(
    async ({ pageId }: { pageId: string }) => {
      await client().remote.switchToPage(pageId);
      return `Switched to page ${pageId}`;
    },
    {
      name: "browser_switch_tab",
      description: "Switch to a different browser tab by its page ID.",
      schema: z.object({
        pageId: z.string().describe("The page ID to switch to"),
      }),
    },
  );

  const closeTab = tool(
    async ({ pageId }: { pageId: string }) => {
      await client().remote.closePage(pageId);
      return `Closed page ${pageId}`;
    },
    {
      name: "browser_close_tab",
      description: "Close a browser tab by its page ID.",
      schema: z.object({
        pageId: z.string().describe("The page ID to close"),
      }),
    },
  );

  const closeSession = tool(
    async () => {
      await client().remote.closeSession();
      return "Browser session closed.";
    },
    {
      name: "browser_close_session",
      description: "Close the entire browser session and all tabs.",
      schema: z.object({}),
    },
  );

  return [navigate, snapshot, listPages, switchTab, closeTab, closeSession];
}
