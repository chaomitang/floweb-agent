import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Checkpoint {
  phaseIndex: number;
  phaseTitle: string;
  url: string;
  snapshotText: string;
  recordingSeq: number;
  timestamp: string;
}

export class CheckpointStore {
  private checkpoints: Checkpoint[] = [];
  private sessionDir: string | null = null;

  start(sessionDir: string): void {
    this.sessionDir = sessionDir;
    this.checkpoints = this.loadFromDisk();
  }

  save(checkpoint: Checkpoint): void {
    this.checkpoints.push(checkpoint);
    this.writeToDisk();
  }

  get(phaseIndex: number): Checkpoint | null {
    return this.checkpoints.find((c) => c.phaseIndex === phaseIndex) ?? null;
  }

  getLatest(): Checkpoint | null {
    if (this.checkpoints.length === 0) return null;
    return this.checkpoints[this.checkpoints.length - 1];
  }

  list(): Checkpoint[] {
    return [...this.checkpoints];
  }

  stop(): void {
    this.sessionDir = null;
    this.checkpoints = [];
  }

  private filePath(): string | null {
    if (!this.sessionDir) return null;
    return join(this.sessionDir, "checkpoints.json");
  }

  private loadFromDisk(): Checkpoint[] {
    const path = this.filePath();
    if (!path) return [];
    try {
      if (!existsSync(path)) return [];
      const raw = readFileSync(path, "utf8");
      return JSON.parse(raw) as Checkpoint[];
    } catch {
      return [];
    }
  }

  private writeToDisk(): void {
    if (!this.sessionDir) return;
    try {
      if (!existsSync(this.sessionDir)) {
        mkdirSync(this.sessionDir, { recursive: true });
      }
      const path = this.filePath()!;
      writeFileSync(path, JSON.stringify(this.checkpoints, null, 2), "utf8");
    } catch {
      // best-effort
    }
  }
}
