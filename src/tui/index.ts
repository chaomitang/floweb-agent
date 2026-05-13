import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import type { FlowwebConfig } from "../core/config.js";

export interface StartTuiOptions {
  config?: FlowwebConfig;
  socketPath?: string;
  initialUrl?: string;
  sessionName?: string;
}

export function startTui(options?: StartTuiOptions) {
  // Clear screen for a clean start state
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

  const { unmount, waitUntilExit, cleanup } = render(
    React.createElement(App, {
      config: options?.config,
      socketPath: options?.socketPath,
      initialUrl: options?.initialUrl,
      sessionName: options?.sessionName,
    }),
    { alternateScreen: false },
  );

  return { unmount, waitUntilExit, cleanup };
}
