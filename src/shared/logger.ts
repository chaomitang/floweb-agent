import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export type LogOptions = {
  timestamp?: Date;
};

export type MinimalLogger = {
  info: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
};

export type SinkEntry = {
  id: string;
  scope: string;
  level: LogLevel;
  event: string;
  data: Record<string, unknown>;
  options?: LogOptions;
};

export type LoggerSink = {
  write: (entry: SinkEntry) => void;
  flush?: () => Promise<void>;
  close?: () => Promise<void>;
};

export type LoggerApi = {
  info: (event: string, data?: Record<string, unknown>, options?: LogOptions) => void;
  warn: (event: string, data?: Record<string, unknown>, options?: LogOptions) => void;
  error: (event: string, data?: Record<string, unknown>, options?: LogOptions) => void;
  withScope: (scope: string, context?: Record<string, unknown>) => LoggerApi;
  withContext: (context: Record<string, unknown>) => LoggerApi;
  flush: () => Promise<void>;
};

export class Logger implements LoggerApi {
  private scope: string;
  private sinks: LoggerSink[];
  private context: Record<string, unknown>;

  constructor(
    scope: string,
    sinks: LoggerSink[] = [consoleSink],
    context: Record<string, unknown> = {},
  ) {
    this.scope = scope;
    this.sinks = sinks;
    this.context = context;
  }

  info(event: string, data?: Record<string, unknown>, options?: LogOptions): void {
    this.write("info", event, data, options);
  }

  warn(event: string, data?: Record<string, unknown>, options?: LogOptions): void {
    this.write("warn", event, data, options);
  }

  error(event: string, data?: Record<string, unknown>, options?: LogOptions): void {
    this.write("error", event, data, options);
  }

  withScope(scope: string, context?: Record<string, unknown>): LoggerApi {
    return new Logger(
      `${this.scope}:${scope}`,
      this.sinks,
      context ? { ...this.context, ...context } : { ...this.context },
    );
  }

  withContext(context: Record<string, unknown>): LoggerApi {
    return new Logger(this.scope, this.sinks, { ...this.context, ...context });
  }

  async flush(): Promise<void> {
    for (const sink of [...this.sinks].reverse()) {
      if (sink.flush) {
        await sink.flush();
      }
    }
  }

  private write(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
    options?: LogOptions,
  ): void {
    for (const sink of this.sinks) {
      sink.write({
        id: randomUUID(),
        scope: this.scope,
        level,
        event,
        data: { ...this.context, ...data },
        options,
      });
    }
  }
}

export const consoleSink: LoggerSink = {
  write(entry: SinkEntry) {
    const timestamp = entry.options?.timestamp ?? new Date();
    const line = `[${timestamp.toISOString()}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.event} ${JSON.stringify(entry.data)}`;
    if (entry.level === "error") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  },
};
