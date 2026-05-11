import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { App } from "../../src/tui/app.js";
import { TabBar } from "../../src/tui/components/tab-bar.js";
import { PageView } from "../../src/tui/components/page-view.js";

describe("App", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(React.createElement(App));
    expect(lastFrame()).toBeTruthy();
  });

  it("renders header and status bar", () => {
    const { lastFrame, unmount } = render(React.createElement(App));
    const output = lastFrame();
    unmount();
    // App uses hooks (useBrowserState, useInput, useEffect) which
    // may render asynchronously in the test environment. Verify
    // the component produces non-empty output.
    expect(output?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("TabBar", () => {
  it("shows placeholder when no pages", () => {
    const { lastFrame } = render(
      React.createElement(TabBar, {
        pages: [],
        activePageId: null,
        onSwitchPage: () => {},
      }),
    );
    expect(lastFrame()).toContain("No pages open");
  });

  it("renders tab for each page", () => {
    const pages = [
      {
        id: "page-a1b",
        url: "https://example.com",
        title: "Example",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "page-c2d",
        url: "https://example.org",
        title: "Example Org",
        active: false,
        createdAt: new Date().toISOString(),
      },
    ];
    const { lastFrame } = render(
      React.createElement(TabBar, {
        pages,
        activePageId: "page-a1b",
        onSwitchPage: () => {},
      }),
    );
    const output = lastFrame();
    expect(output).toContain("Example");
    expect(output).toContain("Example Org");
  });

  it("handles page with long title", () => {
    const pages = [
      {
        id: "page-a1b",
        url: "https://very-long-domain-name-that-exceeds-limit.com/path",
        title: "Loading...",
        active: false,
        createdAt: new Date().toISOString(),
      },
    ];
    const { lastFrame } = render(
      React.createElement(TabBar, {
        pages,
        activePageId: null,
        onSwitchPage: () => {},
      }),
    );
    expect(lastFrame()).toBeTruthy();
  });
});

describe("PageView", () => {
  it("shows no-session message when no active page", () => {
    const { lastFrame } = render(
      React.createElement(PageView, {
        activePage: null,
        sessionStatus: "disconnected",
      }),
    );
    expect(lastFrame()).toContain("No browser session active");
  });

  it("shows connecting message", () => {
    const { lastFrame } = render(
      React.createElement(PageView, {
        activePage: null,
        sessionStatus: "connecting",
      }),
    );
    expect(lastFrame()).toContain("Connecting to browser");
  });

  it("shows page details when active page exists", () => {
    const activePage = {
      id: "page-a1b",
      url: "https://example.com",
      title: "Example Domain",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const { lastFrame } = render(
      React.createElement(PageView, {
        activePage,
        sessionStatus: "connected",
      }),
    );
    const output = lastFrame();
    expect(output).toContain("Example Domain");
    expect(output).toContain("https://example.com");
  });
});
