/**
 * Test V0.1.2-A: state management + reconnect behavior.
 *
 * Dijalankan dengan `npm test`. Bridge di-start di dalam proses test pada port
 * terpisah, jadi tidak bentrok dengan bridge development di 8787.
 *
 * Skenarionya sengaja satu alur berurutan, karena agent memang hidup sepanjang
 * umur proses bridge — persis seperti kondisi nyatanya.
 */

import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";

import { startBridge } from "./bridge.js";
import {
  parseMessage,
  type AgentState,
  type Envelope,
  type EventType,
} from "./protocol.js";

const PORT = 8788;
const URL = `ws://127.0.0.1:${PORT}`;

const say = (message = ""): void => {
  process.stdout.write(`${message}\n`);
};

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    say(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  say(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

class TestClient {
  readonly events: Envelope[] = [];

  private constructor(private readonly socket: WebSocket) {}

  static connect(): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(URL);
      const client = new TestClient(socket);
      socket.on("message", (data) => {
        const parsed = parseMessage(data.toString());
        if (parsed.ok) client.events.push(parsed.event);
      });
      socket.on("open", () => resolve(client));
      socket.on("error", reject);
    });
  }

  types(): EventType[] {
    return this.events.map((event) => event.type);
  }

  snapshots(): AgentState[] {
    return this.events
      .filter((event) => event.type === "state_snapshot")
      .map((event) => event.payload as AgentState);
  }

  lastSnapshot(): AgentState | undefined {
    return this.snapshots().at(-1);
  }

  outputs(): string[] {
    return this.events
      .filter((event) => event.type === "agent_output")
      .map((event) => (event.payload as { text: string }).text);
  }

  errors(): string[] {
    return this.events
      .filter((event) => event.type === "error")
      .map((event) => (event.payload as { message: string }).message);
  }

  send(message: unknown): void {
    this.socket.send(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }

  sendApproval(requestId: string, approved: boolean): void {
    this.send({
      type: "approval_response",
      id: `res-test-${requestId}-${String(approved)}`,
      timestamp: new Date().toISOString(),
      payload: { requestId, approved },
    });
  }

  async close(): Promise<void> {
    if (this.socket.readyState === this.socket.CLOSED) return;
    const closed = once(this.socket, "close");
    this.socket.close();
    await closed;
  }
}

async function waitFor(
  label: string,
  predicate: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await delay(25);
  }
}

async function main(): Promise<void> {
  const server = startBridge({ port: PORT });
  await once(server, "listening");

  // Log bridge dibungkam supaya laporan test terbaca; error tetap tampil.
  console.log = () => {};

  say("\nAI Agent Remote — V0.1.2-A state & reconnect tests\n");

  // --- Test 1 -------------------------------------------------------------
  say("Test 1 — connect: connection lalu state_snapshot");
  let clientA = await TestClient.connect();
  await waitFor("initial events", () => clientA.events.length >= 2);

  check("event pertama = connection", clientA.types()[0] === "connection", clientA.types()[0]);
  check("event kedua = state_snapshot", clientA.types()[1] === "state_snapshot", clientA.types()[1]);
  const initial = clientA.snapshots()[0];
  check("snapshot awal agentState = IDLE", initial?.agentState === "IDLE", initial?.agentState);
  check("snapshot awal approval = NONE", initial?.approval.status === "NONE", initial?.approval.status);
  check("agentId terisi", initial?.agentId === "fake-agent", initial?.agentId);

  // --- Test 2 -------------------------------------------------------------
  say("\nTest 2 — disconnect saat WORKING lalu reconnect");
  await waitFor(
    "agent WORKING",
    () => clientA.lastSnapshot()?.agentState === "WORKING",
  );
  await clientA.close();
  clientA = await TestClient.connect();
  await waitFor("snapshot setelah reconnect", () => clientA.events.length >= 2);

  const afterReconnect = clientA.lastSnapshot();
  check(
    "snapshot setelah reconnect tetap WORKING",
    afterReconnect?.agentState === "WORKING",
    afterReconnect?.agentState,
  );
  check(
    "agent tidak kembali IDLE karena disconnect",
    afterReconnect?.agentState !== "IDLE",
  );

  // --- Test 3 -------------------------------------------------------------
  say("\nTest 3 — disconnect saat approval PENDING: agent tetap menunggu");
  await waitFor(
    "approval PENDING",
    () => clientA.lastSnapshot()?.approval.status === "PENDING",
  );
  const pending = clientA.lastSnapshot();
  const requestId = pending?.approval.requestId ?? "";
  check("agentState = WAITING_APPROVAL", pending?.agentState === "WAITING_APPROVAL", pending?.agentState);
  check("requestId ada", requestId.length > 0, requestId);

  // Client B jadi saksi selama A putus.
  const clientB = await TestClient.connect();
  await waitFor("B punya snapshot", () => clientB.events.length >= 2);
  const eventsBeforeSilence = clientB.events.length;

  await clientA.close();
  await delay(1500);

  check(
    "tidak ada event apa pun selama client putus (tidak auto approve/deny)",
    clientB.events.length === eventsBeforeSilence,
    `${clientB.events.length - eventsBeforeSilence} event baru`,
  );
  check(
    "approval masih PENDING di sisi saksi",
    clientB.lastSnapshot()?.approval.status === "PENDING",
    clientB.lastSnapshot()?.approval.status,
  );
  check(
    "requestId tidak berubah",
    clientB.lastSnapshot()?.approval.requestId === requestId,
  );

  // --- Test 4 -------------------------------------------------------------
  say("\nTest 4 — reconnect melihat approval yang masih PENDING");
  clientA = await TestClient.connect();
  await waitFor("snapshot reconnect", () => clientA.events.length >= 2);

  const resumed = clientA.lastSnapshot();
  check("agentState = WAITING_APPROVAL", resumed?.agentState === "WAITING_APPROVAL", resumed?.agentState);
  check("approval.status = PENDING", resumed?.approval.status === "PENDING", resumed?.approval.status);
  check("requestId sama dengan sebelum disconnect", resumed?.approval.requestId === requestId);
  check("message ikut di snapshot", typeof resumed?.approval.message === "string" && resumed.approval.message.length > 0);
  check(
    "options ikut di snapshot",
    JSON.stringify(resumed?.approval.options) === JSON.stringify(["yes", "no"]),
    JSON.stringify(resumed?.approval.options),
  );

  // --- Test 6 (sebelum Test 5, karena butuh approval masih PENDING) -------
  say("\nTest 6 — approval_response dengan requestId salah");
  const snapshotsBeforeInvalid = clientB.snapshots().length;
  clientA.sendApproval("req-999", true);
  await waitFor("error event", () => clientA.errors().length > 0);

  check(
    "bridge membalas error",
    clientA.errors().at(-1)?.includes("unknown requestId") === true,
    clientA.errors().at(-1),
  );
  await delay(200);
  check(
    "tidak ada broadcast state baru",
    clientB.snapshots().length === snapshotsBeforeInvalid,
  );
  check(
    "state tetap WAITING_APPROVAL",
    clientA.lastSnapshot()?.agentState === "WAITING_APPROVAL",
    clientA.lastSnapshot()?.agentState,
  );
  check(
    "approval tetap PENDING",
    clientA.lastSnapshot()?.approval.status === "PENDING",
    clientA.lastSnapshot()?.approval.status,
  );

  // --- Test 5 + Test 7 ----------------------------------------------------
  say("\nTest 5 — reconnect mengirim approval valid, agent lanjut");
  say("Test 7 — perubahan state di-broadcast ke dua client");
  const outputsBefore = clientA.outputs().length;
  clientA.sendApproval(requestId, true);

  await waitFor("agent lanjut", () => clientA.outputs().length > outputsBefore);
  await waitFor(
    "B ikut menerima output",
    () => clientB.outputs().includes("Approval received. Continuing..."),
  );

  check(
    "A menerima output lanjutan",
    clientA.outputs().at(-1) === "Approval received. Continuing...",
    clientA.outputs().at(-1),
  );
  check("B menerima output yang sama (broadcast)", clientB.outputs().at(-1) === "Approval received. Continuing...");
  check("approval.status = APPROVED di A", clientA.lastSnapshot()?.approval.status === "APPROVED", clientA.lastSnapshot()?.approval.status);
  check("approval.status = APPROVED di B", clientB.lastSnapshot()?.approval.status === "APPROVED");
  check("A dan B melihat state yang identik", JSON.stringify(clientA.lastSnapshot()) === JSON.stringify(clientB.lastSnapshot()));

  say("\n   menunggu agent menyelesaikan pekerjaan...");
  await waitFor(
    "agent selesai (IDLE)",
    () => clientA.lastSnapshot()?.agentState === "IDLE",
  );
  check("agent kembali IDLE setelah selesai", clientA.lastSnapshot()?.agentState === "IDLE");
  check("approval tetap tercatat APPROVED", clientA.lastSnapshot()?.approval.status === "APPROVED");

  // --- Test 8 -------------------------------------------------------------
  say("\nTest 8 — disconnect tidak mengubah state agent");
  const stateBeforeDisconnect = JSON.stringify(clientA.lastSnapshot());
  await clientA.close();
  await clientB.close();
  await delay(300);

  const clientC = await TestClient.connect();
  await waitFor("snapshot client baru", () => clientC.events.length >= 2);

  check(
    "state tidak berubah walau semua client putus",
    JSON.stringify(clientC.lastSnapshot()) === stateBeforeDisconnect,
    clientC.lastSnapshot()?.agentState,
  );
  check("agent tidak restart saat client baru connect", clientC.outputs().length === 0, `${clientC.outputs().length} output`);

  await clientC.close();
  server.close();

  say(
    failures === 0
      ? "\nSemua test lolos.\n"
      : `\n${failures} test GAGAL.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: Error) => {
  console.error(`Test run failed: ${error.message}`);
  process.exit(1);
});
