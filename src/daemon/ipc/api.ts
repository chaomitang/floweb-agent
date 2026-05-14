import type { PageInfo } from "../../core/types.js";

// ─── Daemon → Client (methods exposed by the daemon) ─────────────────

export interface DaemonApi {
  ping(): { protocolVersion: number };
  getPages(): PageInfo[];
  getActivePageId(): string | null;
  switchToPage(pageId: string): void;
  closePage(pageId: string): void;
  createSession(url: string): void;
  closeSession(): void;
  resetSessionData(): void;
  getSessionName(): string;
  listSessions(): string[];
  deleteSession(name: string): void;
  // Page interaction
  execCode(code: string): { output: string; result: unknown; diff: string };
  snapshotActive(): { title: string; url: string; text: string; elements: string };
  snapshotDiff(): { text: string; diff: string };
  evaluate(js: string): unknown;
  click(selector: string): void;
  typeText(selector: string, text: string): void;
  pressKey(key: string): void;
  // Session control
  getSessionMode(): string;
  setSessionMode(mode: string): void;
  saveProfile(domain: string): void;
}

// ─── Client → Daemon (methods exposed by each client, pushed to) ─────

export interface ClientApi {
  pagesChanged(pages: PageInfo[], activePageId: string | null): void;
  sessionStatusChanged(status: string): void;
  actionLogged(action: { type: string; detail: string; role: "user" | "agent" }): void;
}

// ─── Fork IPC ready signal ──────────────────────────────────────────

export type DaemonReadyMessage = {
  type: "ready";
  socketPath: string;
};
