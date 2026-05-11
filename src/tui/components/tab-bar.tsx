import React from "react";
import { Box, Text } from "ink";
import type { PageInfo } from "../../core/types.js";

interface TabBarProps {
  pages: PageInfo[];
  activePageId: string | null;
  onSwitchPage: (pageId: string) => void;
}

function shortLabel(page: PageInfo): string {
  if (page.title && page.title !== "Loading...") {
    return page.title.length > 20 ? page.title.slice(0, 18) + "..." : page.title;
  }
  try {
    const host = new URL(page.url).hostname;
    return host.length > 20 ? host.slice(0, 18) + "..." : host;
  } catch {
    return page.url.length > 20 ? page.url.slice(0, 18) + "..." : page.url;
  }
}

export function TabBar({ pages, activePageId }: TabBarProps) {
  if (pages.length === 0) {
    return (
      <Box paddingX={1} paddingY={0}>
        <Text dimColor>No pages open</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1} paddingY={0} flexDirection="row">
      {pages.map((page, index) => {
        const isActive = page.id === activePageId;
        const label = shortLabel(page);
        const isFirst = index === 0;

        if (isActive) {
          return (
            <Box key={page.id} borderStyle="round" borderColor="green" paddingX={1}>
              <Text bold color="green">
                {isFirst ? "\u25B8 " : ""}{label}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={page.id} borderStyle="round" borderColor="gray" paddingX={1}>
            <Text dimColor>
              {label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
