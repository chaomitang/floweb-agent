import type { FlowwebConfig } from "./config.js";

export interface PageInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
  createdAt: Date;
}

export interface BrowserSession {
  id: string;
  provider: string;
  headless: boolean;
  browserType: "chromium" | "firefox" | "webkit";
  viewport: { width: number; height: number };
  status: "active" | "idle" | "closed";
  startedAt: Date;
  pages: PageInfo[];
  activePageId: string | null;
  cdpEndpoint?: string;
  pid?: number;
}

export type FlowwebState = {
  config: FlowwebConfig;
  session: BrowserSession | null;
  message: string;
};
