export {
  createIpcPeer,
  serializeError,
  deserializeError,
} from "./protocol.js";
export type {
  IpcTransport,
  IpcProtocolMessage,
  IpcRequestMessage,
  IpcResponseMessage,
  SerializedError,
  IpcPeerHandlers,
  IpcPeer,
} from "./protocol.js";

export {
  createJsonSocketTransport,
  connectToIpcSocket,
  createIpcSocketServer,
  listenOnIpcSocket,
  removeStaleSocketFile,
  getDaemonSocketPath,
} from "./socket.js";
export type { IpcConnectionHandler } from "./socket.js";

export type { DaemonApi, ClientApi, DaemonReadyMessage } from "./api.js";

export { DaemonClient } from "./client.js";
