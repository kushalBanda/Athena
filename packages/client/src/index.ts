export { AthenaClient } from "./client.ts";
export {
	AthenaClientDisposedError,
	AthenaDisconnectedError,
	AthenaServerError,
	AthenaSessionDetachedError,
	AthenaSessionOwnershipError,
} from "./errors.ts";
export type { AcquireSessionOptions, AthenaSessionHandle, SessionLease, SessionLeaseMode } from "./session-handle.ts";
export type { ByteTransport, ByteTransportFactory, ByteTransportHandlers } from "./transport.ts";
export type {
	AthenaClientOptions,
	ConnectionState,
	ConnectionStateChange,
	CreateSessionOptions,
	ListenerErrorHandler,
	Unsubscribe,
} from "./types.ts";
