import { randomUUID } from "node:crypto";

// ─── Transport abstraction ───────────────────────────────────────────

export interface IpcTransport<T> {
  send(message: T): void | Promise<void>;
  listen(callback: (message: T) => void): () => void;
  onClose?(callback: (error?: Error) => void): () => void;
  close?(): void;
}

// ─── Message types ───────────────────────────────────────────────────

export type IpcRequestMessage = {
  type: "ipc-request";
  id: string;
  method: string;
  args: unknown[];
  meta?: Record<string, unknown>;
};

export type IpcResponseMessage = {
  type: "ipc-response";
  id: string;
  method: string;
  data?: unknown;
  error?: SerializedError;
};

export type IpcProtocolMessage = IpcRequestMessage | IpcResponseMessage;

// ─── Error serialization ─────────────────────────────────────────────

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedError | null;
  errors?: SerializedError[];
};

const MAX_SERIALIZE_DEPTH = 5;

export function serializeError(err: unknown, depth = 0): SerializedError {
  if (!(err instanceof Error)) {
    return {
      name: "Error",
      message: String(err),
    };
  }

  if (depth >= MAX_SERIALIZE_DEPTH) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: (err as NodeJS.ErrnoException).code,
    };
  }

  const serialized: SerializedError = {
    name: err.name,
    message: err.message,
    stack: err.stack,
    code: (err as NodeJS.ErrnoException).code,
  };

  if (err.cause instanceof Error) {
    serialized.cause = serializeError(err.cause, depth + 1);
  }

  if (err instanceof AggregateError && err.errors.length > 0) {
    serialized.errors = err.errors.map((e) => serializeError(e, depth + 1));
  }

  return serialized;
}

export function deserializeError(serialized: SerializedError): Error {
  const ErrCtor = globalThis[serialized.name as keyof typeof globalThis] as typeof Error | undefined;
  const Ctor = ErrCtor ?? Error;
  const err = new Ctor(serialized.message);

  err.stack = serialized.stack;

  if (serialized.code !== undefined) {
    (err as NodeJS.ErrnoException).code = serialized.code;
  }

  if (serialized.cause) {
    err.cause = deserializeError(serialized.cause);
  }

  if (serialized.errors) {
    const aggregate = err as Error & { errors: Error[] };
    aggregate.errors = serialized.errors.map(deserializeError);
  }

  return err;
}

// ─── Peer types ──────────────────────────────────────────────────────

export type IpcPeerHandlers<Local> = {
  [K in keyof Local]: Local[K] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<R>
    : never;
};

type Asyncify<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : never;

export type IpcPeer<Remote> = {
  call: { [K in keyof Remote]: Asyncify<Remote[K]> };
  transport: IpcTransport<IpcProtocolMessage>;
  destroy: () => void;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Factory ─────────────────────────────────────────────────────────

export function createIpcPeer<Remote, Local>(
  transport: IpcTransport<IpcProtocolMessage>,
  handlers: IpcPeerHandlers<Local>,
  options?: {
    timeoutMs?: number;
    getMeta?: () => Record<string, unknown>;
    onRequest?: (message: IpcRequestMessage) => void;
  },
): IpcPeer<Remote> {
  const pending = new Map<string, PendingRequest>();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let destroyed = false;

  const unlisten = transport.listen((message) => {
    void handleMessage(message);
  });

  if (transport.onClose) {
    transport.onClose((err) => {
      rejectAllPending(err ?? new Error("Transport closed"));
    });
  }

  async function handleMessage(message: IpcProtocolMessage): Promise<void> {
    if (message.type === "ipc-response") {
      const pendingReq = pending.get(message.id);
      if (!pendingReq) return;

      pending.delete(message.id);
      if (pendingReq.timer) clearTimeout(pendingReq.timer);

      if (message.error) {
        pendingReq.reject(deserializeError(message.error));
      } else {
        pendingReq.resolve(message.data);
      }
      return;
    }

    if (message.type === "ipc-request") {
      options?.onRequest?.(message);
      const handler = (handlers as Record<string, (...args: unknown[]) => unknown>)[message.method];
      if (!handler) {
        const response: IpcResponseMessage = {
          type: "ipc-response",
          id: message.id,
          method: message.method,
          error: serializeError(new Error(`Unknown method: ${message.method}`)),
        };
        await transport.send(response);
        return;
      }

      try {
        const data = await handler(...message.args);
        const response: IpcResponseMessage = {
          type: "ipc-response",
          id: message.id,
          method: message.method,
          data,
        };
        await transport.send(response);
      } catch (err) {
        const response: IpcResponseMessage = {
          type: "ipc-response",
          id: message.id,
          method: message.method,
          error: serializeError(err),
        };
        await transport.send(response);
      }
    }
  }

  function rejectAllPending(err: Error): void {
    for (const [, pendingReq] of pending) {
      if (pendingReq.timer) clearTimeout(pendingReq.timer);
      pendingReq.reject(err);
    }
    pending.clear();
  }

  const callProxy = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (typeof method !== "string") return undefined;

        return (...args: unknown[]) => {
          if (destroyed) {
            return Promise.reject(new Error("IpcPeer is destroyed"));
          }

          return new Promise((resolve, reject) => {
            const id = `${method}-${randomUUID()}`;
            const meta = options?.getMeta?.();
            const reqTimeout = (meta?.timeoutMs as number) ?? timeoutMs;

            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`IPC request timeout: ${method} (${reqTimeout}ms)`));
            }, reqTimeout);

            pending.set(id, { resolve, reject, timer });

            const request: IpcRequestMessage = {
              type: "ipc-request",
              id,
              method,
              args,
              ...(meta ? { meta } : {}),
            };

            void (async () => {
              try {
                await transport.send(request);
              } catch (err) {
                pending.delete(id);
                clearTimeout(timer);
                reject(err);
              }
            })();
          });
        };
      },
    },
  );

  return {
    call: callProxy as IpcPeer<Remote>["call"],
    transport,
    destroy: () => {
      destroyed = true;
      unlisten();
      rejectAllPending(new Error("IpcPeer destroyed"));
      transport.close?.();
    },
  };
}
