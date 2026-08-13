/**
 * Protocol V0.1 sisi client.
 *
 * Spec: ../../protocol/README.md
 * Sumber kebenaran implementasi: ../../bridge/src/protocol.ts
 *
 * File ini sengaja duplikat dari bridge, bukan di-import, supaya Metro tidak
 * perlu setup monorepo dulu. Kalau protocol berubah, dua file ini harus ikut
 * berubah bersamaan.
 *
 * V0.1.3: app boleh mengirim approval_response, jadi createEvent hadir lagi.
 * Envelope-nya sama persis dengan V0.1 — tidak ada format baru.
 */

export const EVENT_TYPES = [
  "connection",
  "state_snapshot",
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

/** State koneksi adalah state lokal client, bukan milik bridge. */
export type ConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export type AgentLifecycle = "IDLE" | "WORKING" | "WAITING_APPROVAL";

export type ApprovalStatus = "NONE" | "PENDING" | "APPROVED" | "DENIED";

export interface ApprovalState {
  status: ApprovalStatus;
  requestId?: string;
  message?: string;
  options?: string[];
}

/** Source of truth-nya ada di bridge; ini cuma salinan terakhir yang diterima. */
export interface AgentState {
  agentId: string;
  agentState: AgentLifecycle;
  approval: ApprovalState;
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
