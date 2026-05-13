import { Box, Text } from "ink";
import type { PageInfo } from "../../core/types.js";

interface BrowserPanelProps {
  sessionName: string;
  sessionStatus: "disconnected" | "connecting" | "connected" | "error";
  pages: PageInfo[];
  activePageId: string | null;
  onSwitchPage: (pageId: string) => void;
  isFocused?: boolean;
}

function shortLabel(page: PageInfo): string {
  if (page.title && page.title !== "Loading...") {
    return page.title.length > 30 ? page.title.slice(0, 28) + "..." : page.title;
  }
  try {
    const host = new URL(page.url).hostname;
    return host.length > 30 ? host.slice(0, 28) + "..." : host;
  } catch {
    return page.url.length > 30 ? page.url.slice(0, 28) + "..." : page.url;
  }
}

export function BrowserPanel({
  sessionName,
  sessionStatus,
  pages,
  activePageId,
  isFocused,
}: BrowserPanelProps) {
  const activePage = pages.find((p) => p.id === activePageId) ?? null;

  return (
    <Box
      borderStyle="round"
      borderColor={isFocused ? "cyan" : undefined}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      {/* Row 1: session + tabs */}
      <Box flexDirection="row">
        <Text bold color={isFocused ? "cyan" : undefined}>Browser</Text>
        <Text dimColor>
          {" "}
          [{sessionName}] [{sessionStatus}]
        </Text>
        <Text> Tabs ({pages.length}): </Text>
        {pages.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          <Text>
            {pages.map((p, i) => {
              const isActive = p.id === activePageId;
              const label = shortLabel(p);
              const prefix = i > 0 ? " | " : "";
              if (isActive) return `${prefix}${label}`;
              return `${prefix}${label}`;
            })}
          </Text>
        )}
      </Box>

      {/* Row 2: active page info */}
      <Box flexDirection="row">
        <Text dimColor>Active: </Text>
        {activePage ? (
          <>
            <Text>{activePage.url}</Text>
            <Text dimColor> — </Text>
            <Text dimColor>{activePage.title || "Loading..."}</Text>
          </>
        ) : (
          <Text dimColor>No active page</Text>
        )}
        <Text dimColor> | Rec: idle</Text>
      </Box>
    </Box>
  );
}
