import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import type { FlowwebConfig } from "../core/config.js";

export interface StartTuiOptions {
  config?: FlowwebConfig;
  socketPath?: string;
}

export function startTui(options?: StartTuiOptions) {
  const { unmount, waitUntilExit } = render(
    React.createElement(App, { config: options?.config, socketPath: options?.socketPath }),
  );

  return {
    unmount,
    waitUntilExit,
  };
}
