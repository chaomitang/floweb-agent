import React from "react";
import { useInput } from "ink";
import { Layout } from "./components/layout.js";
import { useBrowserState } from "./hooks/use-browser-state.js";
import { BrowserManager } from "../core/browser/manager.js";
import type { FlowwebConfig } from "../core/config.js";

interface AppProps {
  config?: FlowwebConfig;
}

export function App(_props: AppProps) {
  const { state, setMessage, setPages } = useBrowserState();
  const browserManagerRef = React.useRef<BrowserManager | null>(null);

  // Initialize BrowserManager on mount
  React.useEffect(() => {
    const manager = new BrowserManager();
    browserManagerRef.current = manager;

    manager.onPageListChanged(() => {
      setPages(manager.getPageInfos(), manager.getActivePageId());
      setMessage(
        `Pages: ${manager.getPageInfos().length} | Active: ${manager.getActivePageId() ?? "none"}`,
      );
    });

    return () => {
      manager.dispose().catch(() => {});
      browserManagerRef.current = null;
    };
  }, [setPages, setMessage]);

  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
      return;
    }

    const manager = browserManagerRef.current;
    if (!manager) return;

    // Ctrl+1-9: switch to page by index
    if (key.ctrl) {
      const numMatch = input.match(/^[1-9]$/);
      if (numMatch) {
        const index = parseInt(numMatch[0], 10) - 1;
        const pages = manager.getPageInfos();
        if (index < pages.length) {
          manager.switchToPage(pages[index].id);
        }
        return;
      }

      // Ctrl+[: previous page
      if (input === "[") {
        const pages = manager.getPageInfos();
        const activeId = manager.getActivePageId();
        if (pages.length > 1 && activeId) {
          const currentIndex = pages.findIndex((p) => p.id === activeId);
          const prevIndex = currentIndex <= 0 ? pages.length - 1 : currentIndex - 1;
          manager.switchToPage(pages[prevIndex].id);
        }
        return;
      }

      // Ctrl+]: next page
      if (input === "]") {
        const pages = manager.getPageInfos();
        const activeId = manager.getActivePageId();
        if (pages.length > 1 && activeId) {
          const currentIndex = pages.findIndex((p) => p.id === activeId);
          const nextIndex = currentIndex >= pages.length - 1 ? 0 : currentIndex + 1;
          manager.switchToPage(pages[nextIndex].id);
        }
        return;
      }

      // Ctrl+W: close current page
      if (input === "w") {
        const activeId = manager.getActivePageId();
        if (activeId) {
          manager.closePage(activeId).catch(() => {});
        }
        return;
      }
    }

    // Ctrl+C: handled by Ink's default exit
  });

  return (
    <Layout
      sessionStatus={state.sessionStatus}
      pages={state.pages}
      activePageId={state.activePageId}
      message={state.message}
      onSwitchPage={(pageId) => {
        browserManagerRef.current?.switchToPage(pageId);
      }}
    />
  );
}
