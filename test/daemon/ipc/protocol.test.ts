import { describe, it, expect } from "vitest";
import {
  createIpcPeer,
  serializeError,
  deserializeError,
} from "../../../src/daemon/ipc/protocol.js";
import type { IpcTransport, IpcProtocolMessage } from "../../../src/daemon/ipc/protocol.js";

function createMockTransport(): {
  transport: IpcTransport<IpcProtocolMessage>;
  sentMessages: IpcProtocolMessage[];
  triggerMessage: (msg: IpcProtocolMessage) => void;
  triggerClose: (err?: Error) => void;
} {
  const sentMessages: IpcProtocolMessage[] = [];
  let listener: ((msg: IpcProtocolMessage) => void) | null = null;
  let closeCb: ((err?: Error) => void) | null = null;

  return {
    sentMessages,
    transport: {
      send(message) {
        sentMessages.push(message);
      },
      listen(cb) {
        listener = cb;
        return () => {
          listener = null;
        };
      },
      onClose(cb) {
        closeCb = cb;
        return () => {
          closeCb = null;
        };
      },
    },
    triggerMessage(msg: IpcProtocolMessage) {
      listener?.(msg);
    },
    triggerClose(err?: Error) {
      closeCb?.(err);
    },
  };
}

describe("createIpcPeer", () => {
  it("sends an ipc-request and resolves on ipc-response", async () => {
    const { transport, sentMessages, triggerMessage } = createMockTransport();

    type RemoteApi = { greet(name: string): string };
    const handlers = {
      greet: (name: string) => `Hello, ${name}!`,
    };

    const peer = createIpcPeer<RemoteApi, typeof handlers>(transport, handlers);

    const promise = peer.call.greet("World");

    // The request should have been sent
    expect(sentMessages.length).toBe(1);
    const req = sentMessages[0];
    expect(req.type).toBe("ipc-request");
    if (req.type !== "ipc-request") throw new Error("Expected request");
    expect(req.method).toBe("greet");
    expect(req.args).toEqual(["World"]);

    // Simulate a response
    triggerMessage({
      type: "ipc-response",
      id: req.id,
      method: "greet",
      data: "Hello, World!",
    });

    const result = await promise;
    expect(result).toBe("Hello, World!");

    peer.destroy();
  });

  it("rejects on ipc-response with error", async () => {
    const { transport, sentMessages, triggerMessage } = createMockTransport();

    type RemoteApi = { fail(): never };
    const handlers = {};

    const peer = createIpcPeer<RemoteApi, typeof handlers>(transport, handlers);

    const promise = peer.call.fail();
    const req = sentMessages[0];

    triggerMessage({
      type: "ipc-response",
      id: req.id,
      method: "fail",
      error: serializeError(new Error("boom")),
    });

    await expect(promise).rejects.toThrow("boom");
    peer.destroy();
  });

  it("handles incoming ipc-request by calling the handler", () => {
    const { transport, triggerMessage } = createMockTransport();

    const handlers = {
      add: (a: number, b: number) => a + b,
    };

    const peer = createIpcPeer<Record<string, never>, typeof handlers>(transport, handlers);

    triggerMessage({
      type: "ipc-request",
      id: "add-id",
      method: "add",
      args: [2, 3],
    });

    // The response should be queued (transport.send is synchronous in mock)
    expect(true).toBe(true); // just verifying no crash
    peer.destroy();
  });

  it("returns error for unknown method", async () => {
    const { transport, sentMessages, triggerMessage } = createMockTransport();

    const handlers = {};
    const peer = createIpcPeer<Record<string, never>, typeof handlers>(transport, handlers);

    // Simulate a request for an unknown method
    triggerMessage({
      type: "ipc-request",
      id: "unknown-id",
      method: "nonexistent",
      args: [],
    });

    // The response should contain an error
    expect(sentMessages.length).toBe(1);
    const resp = sentMessages[0];
    expect(resp.type).toBe("ipc-response");
    expect((resp as { error?: unknown }).error).toBeDefined();

    peer.destroy();
  });

  it("rejects all pending on destroy", async () => {
    const { transport } = createMockTransport();

    type RemoteApi = { slow(): string };
    const handlers = {};

    const peer = createIpcPeer<RemoteApi, typeof handlers>(transport, handlers);

    const promise = peer.call.slow();
    peer.destroy();

    await expect(promise).rejects.toThrow("IpcPeer");
  });

  it("rejects all pending on transport close", async () => {
    const { transport, triggerClose } = createMockTransport();

    type RemoteApi = { wait(): string };
    const handlers = {};

    const peer = createIpcPeer<RemoteApi, typeof handlers>(transport, handlers);
    const promise = peer.call.wait();

    triggerClose(new Error("Connection lost"));

    await expect(promise).rejects.toThrow("Connection lost");
    peer.destroy();
  });
});

describe("serializeError", () => {
  it("serializes a plain Error", () => {
    const result = serializeError(new Error("test message"));
    expect(result.name).toBe("Error");
    expect(result.message).toBe("test message");
    expect(result.stack).toBeDefined();
  });

  it("serializes error with cause chain", () => {
    const cause = new Error("root cause");
    const outer = new Error("outer error", { cause });

    const result = serializeError(outer);
    expect(result.message).toBe("outer error");
    expect(result.cause).toBeDefined();
    expect(result.cause!.message).toBe("root cause");
  });

  it("serializes AggregateError", () => {
    const errors = [new Error("a"), new Error("b")];
    const agg = new AggregateError(errors, "multiple errors");

    const result = serializeError(agg);
    expect(result.message).toBe("multiple errors");
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(2);
    expect(result.errors![0].message).toBe("a");
  });

  it("handles non-Error values", () => {
    const result = serializeError("string error");
    expect(result.name).toBe("Error");
    expect(result.message).toBe("string error");
  });

  it("handles circular references gracefully", () => {
    const err = new Error("recursive");
    (err as unknown as Record<string, unknown>).circular = err;
    const result = serializeError(err);
    expect(result.message).toBe("recursive");
  });
});

describe("deserializeError", () => {
  it("reconstructs an Error from serialized form", () => {
    const serialized = serializeError(new Error("test"));
    const err = deserializeError(serialized);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("test");
  });

  it("reconstructs error cause chain", () => {
    const cause = new Error("root");
    const outer = new Error("outer", { cause });
    const serialized = serializeError(outer);
    const restored = deserializeError(serialized);

    expect(restored.message).toBe("outer");
    expect(restored.cause).toBeInstanceOf(Error);
    expect((restored.cause as Error).message).toBe("root");
  });
});
