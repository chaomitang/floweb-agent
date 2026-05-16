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
  recordAction(type: string, detail: string): void;
  setObservingMode(observing: boolean): void;
  getObservingMode(): boolean;
  loadProfile(domain: string): void;
  startIntercept(): void;
  getIntercepted(): Array<{ url: string; status: number; body: string }>;
  auditSite(): string;
  getSessionName(): string;
  listSessions(): string[];
  deleteSession(name: string): void;
  // Page interaction
  execCode(code: string): { output: string; result: unknown; diff: string };
  snapshotActive(): { title: string; url: string; text: string; elements: string };
  waitForPageStable(timeoutMs?: number): void;
  snapshotDiff(): { text: string; diff: string };
  compactHTML(): { html: string; originalLength: number; condensedLength: number; reductions: Record<string, number> };
  evaluate(js: string): unknown;
  moveCursor(x: number, y: number): void;
  highlightElement(selector: string): void;
  setAgentBorder(color: "pink" | "yellow"): void;
  click(selector: string): void;
  typeText(selector: string, text: string): void;
  pressKey(key: string): void;
  hover(selector: string): void;
  scroll(x: number, y: number): void;
  screenshot(): string;
  goBack(): void;
  goForward(): void;
  reloadPage(): void;
  // Session control
  saveProfile(domain: string): void;
}

// ─── Client → Daemon (methods exposed by each client, pushed to) ─────

export interface ClientApi {
  pagesChanged(pages: PageInfo[], activePageId: string | null): void;
  sessionStatusChanged(status: string): void;
  actionLogged(action: { type: string; detail: string; role: "user" | "agent" }): void;
  observingChanged(observing: boolean): void;
}

// ─── Fork IPC ready signal ──────────────────────────────────────────

export type DaemonReadyMessage = {
  type: "ready";
  socketPath: string;
};
