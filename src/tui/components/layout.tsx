import React from "react";
import { Box } from "ink";
import { Header } from "./header.js";
import { TabBar } from "./tab-bar.js";
import { PageView } from "./page-view.js";
import { StatusBar } from "./status-bar.js";
import type { PageInfo } from "../../core/types.js";

interface LayoutProps {
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  message: string;
  onSwitchPage: (pageId: string) => void;
}

export function Layout({
  sessionStatus,
  pages,
  activePageId,
  message,
  onSwitchPage,
}: LayoutProps) {
  const activePage = pages.find((p) => p.id === activePageId) ?? null;

  return (
    <Box flexDirection="column" minHeight={20}>
      <Header />
      <TabBar pages={pages} activePageId={activePageId} onSwitchPage={onSwitchPage} />
      <PageView activePage={activePage} sessionStatus={sessionStatus} />
      <StatusBar
        message={message}
        pageCount={pages.length}
        activeTabIndex={
          activePageId ? pages.findIndex((p) => p.id === activePageId) + 1 : 0
        }
      />
    </Box>
  );
}
