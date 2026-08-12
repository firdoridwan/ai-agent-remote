/**
 * Protocol V0.1 — lihat ../../protocol/README.md untuk spesifikasinya.
 */

export const EVENT_TYPES = [
  "connection",
  "agent_output",
  "approval_request",
  "approval_response",
  "error",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface Envelope<TPayload = unknown> {
  type: EventType;
  id: string;
  timestamp: string;
  payload: TPayload;
}

export interface ConnectionPayload {
  status: "connected";
}

export interface AgentOutputPayload {
  text: string;
}

export interface ApprovalRequestPayload {
  message: string;
  options: string[];
}

export interface ApprovalResponsePayload {
  requestId: string;
  approved: boolean;
}

export interface ErrorPayload {
  message: string;
}

let sequence = 0;

export function createEvent<TPayload>(
  type: EventType,
  payload: TPayload,
  idPrefix = "evt",
): Envelope<TPayload> {
  sequence += 1;
  return {
    type,
    id: `${idPrefix}-${sequence}`,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export type ParseResult =
  | { ok: true; event: Envelope }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Parse + validasi envelope. Tidak pernah throw. */
export function parseMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }

  if (!isObject(data)) {
    return { ok: false, error: "message must be a JSON object" };
  }
  if (!isNonEmptyString(data.type)) {
    return { ok: false, error: "missing field: type" };
  }
  if (!EVENT_TYPES.includes(data.type as EventType)) {
    return { ok: false, error: `unknown event type: ${data.type}` };
  }
  if (!isNonEmptyString(data.id)) {
    return { ok: false, error: "missing field: id" };
  }
  if (!isNonEmptyString(data.timestamp)) {
    return { ok: false, error: "missing field: timestamp" };
  }
  if (!isObject(data.payload)) {
    return { ok: false, error: "missing field: payload" };
  }

  return {
    ok: true,
    event: {
      type: data.type as EventType,
      id: data.id,
      timestamp: data.timestamp,
      payload: data.payload,
    },
  };
}

export function isApprovalResponse(
  event: Envelope,
): event is Envelope<ApprovalResponsePayload> {
  if (event.type !== "approval_response") return false;
  const payload = event.payload as Record<string, unknown>;
  return (
    isNonEmptyString(payload.requestId) && typeof payload.approved === "boolean"
  );
}
