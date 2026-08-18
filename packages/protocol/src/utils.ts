/**
 * Envelope guards and (de)serialization helpers.
 */

import type { Command, ErrorResponse, EventMessage, Message, SuccessResponse } from "./messages";

type UnknownFrame = Record<string, unknown>;

function asFrame(m: Message): UnknownFrame {
  return m as unknown as UnknownFrame;
}

/** A frame with `id` + `method` is a command. */
export function isCommand(m: Message): m is Command {
  const f = asFrame(m);
  return typeof f.id === "number" && typeof f.method === "string";
}

/** A frame with `id` and no `method` is a response (success or error). */
export function isResponse(m: Message): m is SuccessResponse | ErrorResponse {
  const f = asFrame(m);
  return typeof f.id === "number" && f.method === undefined;
}

export function isSuccessResponse(m: Message): m is SuccessResponse {
  const f = asFrame(m);
  return typeof f.id === "number" && f.method === undefined && f.result !== undefined;
}

export function isErrorResponse(m: Message): m is ErrorResponse {
  const f = asFrame(m);
  return typeof f.id === "number" && f.method === undefined && f.error !== undefined;
}

/** A frame with `method` and no `id` is an event. */
export function isEvent(m: Message): m is EventMessage {
  const f = asFrame(m);
  return typeof f.method === "string" && f.id === undefined;
}

export function isEventOf(m: Message, method: string): m is EventMessage {
  return isEvent(m) && m.method === method;
}

/** Parse a raw text frame; returns null for malformed JSON. */
export function parseMessage(text: string): Message | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    return raw as Message;
  } catch {
    return null;
  }
}

export function encodeMessage(m: Message): string {
  return JSON.stringify(m);
}

/** Build an error response. */
export function errorResponse(id: number, code: number, message: string, data?: unknown): ErrorResponse {
  return { id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}
