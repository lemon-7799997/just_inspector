/**
 * Message envelopes — modeled after the Chrome DevTools Protocol (CDP).
 *
 * Three kinds of frames, all plain JSON text:
 *
 *  - Command (client -> game):  { "id": 1, "method": "Runtime.getTree", "params": {...} }
 *  - Response (game -> client): { "id": 1, "result": {...} }  |  { "id": 1, "error": { "code": ..., "message": "..." } }
 *  - Event (game -> client):    { "method": "Runtime.nodeChanged", "params": {...} }   // no "id"
 *
 * A frame with an "id" and a "method" is a command; a frame with an "id" but no
 * "method" is a response; a frame with a "method" but no "id" is an event.
 */

export const PROTOCOL_VERSION = "1.0";

/** Client -> game request. */
export interface Command {
  id: number;
  method: string;
  params?: unknown;
}

export interface SuccessResponse {
  id: number;
  result: unknown;
}

export interface ErrorData {
  code: number;
  message: string;
  data?: unknown;
}

export interface ErrorResponse {
  id: number;
  error: ErrorData;
}

/** Game -> client push notification (no id). */
export interface EventMessage {
  method: string;
  params?: unknown;
}

export type Message = Command | SuccessResponse | ErrorResponse | EventMessage;

/** Error codes. JSON-RPC style for transport/protocol errors, domain codes for inspector errors. */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerErrorStart: -32000,
  /** The referenced node does not exist (anymore). */
  UnknownNode: 4100,
  /** The property is read-only. */
  ReadOnlyProperty: 4101,
  /** The value could not be applied (wrong type, out of range, ...). */
  InvalidValue: 4102,
  /** The command requires an attached session. */
  NotAttached: 4103,
  /** Protocol version mismatch between client and game. */
  ProtocolMismatch: 4104,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
