import type { JsonValue, ProtocolError, ProtocolErrorCode } from "@athena/protocol";

export class AthenaServerError extends Error {
	readonly code: ProtocolErrorCode;
	readonly details: JsonValue | undefined;

	constructor(error: ProtocolError) {
		super(error.message);
		this.name = "AthenaServerError";
		this.code = error.code;
		this.details = error.details;
	}
}

export class AthenaDisconnectedError extends Error {
	constructor(message = "Athena client is disconnected") {
		super(message);
		this.name = "AthenaDisconnectedError";
	}
}

export class AthenaClientDisposedError extends Error {
	constructor() {
		super("Athena client is disposed");
		this.name = "AthenaClientDisposedError";
	}
}

export class AthenaSessionOwnershipError extends Error {
	readonly sessionId: string;

	constructor(sessionId: string, message: string) {
		super(message);
		this.name = "AthenaSessionOwnershipError";
		this.sessionId = sessionId;
	}
}

export class AthenaSessionDetachedError extends Error {
	readonly sessionId: string;

	constructor(sessionId: string) {
		super(`Session ${sessionId} is not attached`);
		this.name = "AthenaSessionDetachedError";
		this.sessionId = sessionId;
	}
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function toDisconnectedError(error: unknown): AthenaDisconnectedError {
	const cause = toError(error);
	return cause instanceof AthenaDisconnectedError ? cause : new AthenaDisconnectedError(cause.message);
}
