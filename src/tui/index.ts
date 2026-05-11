import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import type { FlowwebConfig } from "../core/config.js";

export function startTui(config?: FlowwebConfig) {
  const { unmount, waitUntilExit } = render(React.createElement(App, { config }));

  return {
    unmount,
    waitUntilExit,
  };
}
