/**
 * Smoke test: modul protocol milik app diadu dengan bridge asli.
 *
 * Bukan pengganti test di device — ini membuktikan jalur datanya benar dua arah:
 * event dari bridge bisa di-parse kode app, dan approval_response yang dibentuk
 * kode app (envelope dari createEvent) diterima bridge.
 *
 * Butuh bridge jalan lebih dulu, dan bridge yang FRESH karena Fake Agent hanya
 * jalan sekali per proses:
 *   cd bridge && npm run dev
 *   cd mobile && npm run smoke
 *
 * Dijalankan Node langsung (type stripping), jadi tidak menambah dependency.
 */

import { BRIDGE_URL } from "./config.ts";
import {
  createEvent,
  parseMessage,
  type AgentState,
  type AgentOutputPayload,
  type ApprovalResponsePayload,
  type Envelope,
} from "./protocol.ts";

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

const errors = (): string[] =>
  events
    .filter((event) => event.type === "error")
    .map((event) => (event.payload as { message: string }).message);

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

/** Persis cara app membentuk jawabannya. */
function sendApproval(requestId: string, approved: boolean): void {
  socket.send(
    JSON.stringify(
      createEvent<ApprovalResponsePayload>(
        "approval_response",
        { requestId, approved },
        "res",
      ),
    ),
  );
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
  console.log("\nAI Agent Remote mobile — protocol smoke test\n");

  console.log("Menerima event dari bridge");
  await waitFor("connection + snapshot", () => events.length >= 2);
  check("event pertama = connection", events[0]?.type === "connection", events[0]?.type);
  check("event kedua = state_snapshot", events[1]?.type === "state_snapshot", events[1]?.type);
  check("snapshot punya agentId", lastSnapshot()?.agentId === "fake-agent");

  console.log("\nMembaca approval yang menunggu");
  await waitFor("approval PENDING", () => lastSnapshot()?.approval.status === "PENDING");
  const pending = lastSnapshot();
  const requestId = pending?.approval.requestId ?? "";
  check("agentState = WAITING_APPROVAL", pending?.agentState === "WAITING_APPROVAL", pending?.agentState);
  check("requestId terbaca dari snapshot", requestId.length > 0);
  check("message terbaca dari snapshot", (pending?.approval.message ?? "").length > 0);

  console.log("\nrequestId salah harus ditolak, state tidak berubah");
  sendApproval("req-not-real", true);
  await waitFor("error", () => errors().length > 0);
  check("bridge membalas error", errors().at(-1)?.includes("unknown requestId") === true, errors().at(-1));
  await delay(200);
  check("approval tetap PENDING", lastSnapshot()?.approval.status === "PENDING");

  console.log("\nMengirim approval_response yang dibentuk kode app");
  const outputsBefore = outputs().length;
  sendApproval(requestId, true);

  await waitFor("agent lanjut", () => outputs().length > outputsBefore);
  check(
    "envelope buatan app diterima bridge",
    outputs().at(-1) === "Approval received. Continuing...",
    outputs().at(-1),
  );
  check("approval jadi APPROVED", lastSnapshot()?.approval.status === "APPROVED", lastSnapshot()?.approval.status);

  await waitFor("agent selesai", () => lastSnapshot()?.agentState === "IDLE");
  check("agent kembali IDLE", lastSnapshot()?.agentState === "IDLE");

  socket.close();
  console.log(
    failures === 0 ? "\nSmoke test lolos.\n" : `\n${failures} check GAGAL.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
