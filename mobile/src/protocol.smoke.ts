/**
 * Smoke test read-only: modul protocol milik app diadu dengan bridge asli.
 *
 * Bukan pengganti test di device — ini hanya membuktikan jalur bacanya benar:
 * event dari bridge bisa di-parse oleh kode app, dan approval yang menunggu
 * terbaca lengkap dari state_snapshot.
 *
 * Sesuai milestone V0.1.2-B.1, test ini tidak pernah mengirim apa pun ke
 * bridge, jadi state agent tidak tersentuh.
 *
 * Butuh bridge jalan lebih dulu:
 *   cd bridge && npm run dev
 *   cd mobile && npm run smoke
 *
 * Dijalankan Node langsung (type stripping), jadi tidak menambah dependency.
 */

import {
  parseMessage,
  type AgentState,
  type AgentOutputPayload,
  type Envelope,
} from "./protocol.ts";

import { BRIDGE_URL } from "./config.ts";

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

const events: Envelope[] = [];
const socket = new WebSocket(BRIDGE_URL);

const lastSnapshot = (): AgentState | undefined =>
  events
    .filter((event) => event.type === "state_snapshot")
    .map((event) => event.payload as AgentState)
    .at(-1);

const outputs = (): string[] =>
  events
    .filter((event) => event.type === "agent_output")
    .map((event) => (event.payload as AgentOutputPayload).text);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  label: string,
  predicate: () => boolean,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await delay(25);
  }
}

socket.addEventListener("message", (event: MessageEvent) => {
  if (typeof event.data !== "string") return;
  const result = parseMessage(event.data);
  if (!result.ok) {
    failures += 1;
    console.log(`  ✗ gagal parse message dari bridge: ${result.error}`);
    return;
  }
  events.push(result.event);
});

socket.addEventListener("error", () => {
  console.error(
    "Tidak bisa connect ke bridge. Jalankan `npm run dev` di bridge/.",
  );
  process.exit(1);
});

socket.addEventListener("open", () => {
  void run();
});

async function run(): Promise<void> {
  console.log("\nAI Agent Remote mobile — protocol smoke test (read-only)\n");

  console.log("Menerima event dari bridge");
  await waitFor("connection + snapshot", () => events.length >= 2);
  check(
    "event pertama = connection",
    events[0]?.type === "connection",
    events[0]?.type,
  );
  check(
    "event kedua = state_snapshot",
    events[1]?.type === "state_snapshot",
    events[1]?.type,
  );

  const initial = lastSnapshot();
  check("snapshot punya agentId", initial?.agentId === "fake-agent", initial?.agentId);
  check("agentState terbaca", typeof initial?.agentState === "string", initial?.agentState);

  console.log("\nMembaca agent_output");
  await waitFor("agent_output", () => outputs().length > 0);
  check("agent_output terbaca", outputs().length > 0, `${outputs().length} output`);

  console.log("\nMembaca approval yang menunggu");
  await waitFor(
    "approval PENDING",
    () => lastSnapshot()?.approval.status === "PENDING",
  );
  const pending = lastSnapshot();
  check(
    "agentState = WAITING_APPROVAL",
    pending?.agentState === "WAITING_APPROVAL",
    pending?.agentState,
  );
  check(
    "approval.status = PENDING",
    pending?.approval.status === "PENDING",
    pending?.approval.status,
  );
  check(
    "message terbaca dari snapshot",
    (pending?.approval.message ?? "").length > 0,
  );
  check(
    "requestId terbaca dari snapshot",
    (pending?.approval.requestId ?? "").length > 0,
  );

  console.log("\nMemastikan tidak ada yang dikirim ke bridge");
  await delay(1000);
  check(
    "approval tetap PENDING (app tidak mengubah state)",
    lastSnapshot()?.approval.status === "PENDING",
    lastSnapshot()?.approval.status,
  );
  check(
    "tidak ada error event dari bridge",
    events.every((event) => event.type !== "error"),
  );

  socket.close();
  console.log(
    failures === 0 ? "\nSmoke test lolos.\n" : `\n${failures} check GAGAL.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
