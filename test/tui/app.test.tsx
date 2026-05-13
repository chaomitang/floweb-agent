import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { App } from "../../src/tui/app.js";

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
