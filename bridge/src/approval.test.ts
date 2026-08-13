/**
 * Test V0.1.3: penanganan approval_response dari client.
 *
 * Fake Agent hidup sekali per bridge, jadi tiap skenario memakai bridge sendiri
 * di port berbeda supaya bisa menguji jalur YES dan NO terpisah.
 *
 * Melengkapi state.test.ts, tidak menggantikannya.
 */

import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";
import type { WebSocketServer } from "ws";

import { startBridge } from "./bridge.js";
import {
  parseMessage,
  type AgentState,
  type Envelope,
} from "./protocol.js";

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

class Client {
  readonly events: Envelope[] = [];

  private constructor(private readonly socket: WebSocket) {}

  static connect(port: number): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      const client = new Client(socket);
      socket.on("message", (data) => {
        const parsed = parseMessage(data.toString());
        if (parsed.ok) client.events.push(parsed.event);
      });
      socket.on("open", () => resolve(client));
      socket.on("error", reject);
    });
  }

  lastSnapshot(): AgentState | undefined {
    return this.events
      .filter((event) => event.type === "state_snapshot")
      .map((event) => event.payload as AgentState)
      .at(-1);
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

  send(raw: string): void {
    this.socket.send(raw);
  }

  respond(requestId: string, approved: boolean): void {
    this.send(
      JSON.stringify({
        type: "approval_response",
        id: `res-${requestId}-${String(approved)}`,
        timestamp: new Date().toISOString(),
        payload: { requestId, approved },
      }),
    );
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
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await delay(25);
  }
}

let nextPort = 8801;

/** Bridge baru + client yang sudah menunggu di titik approval PENDING. */
async function bridgeAtPendingApproval(): Promise<{
  server: WebSocketServer;
  client: Client;
  requestId: string;
}> {
  const port = nextPort++;
  const server = startBridge({ port });
  await once(server, "listening");

  const client = await Client.connect(port);
  await waitFor(
    "approval PENDING",
    () => client.lastSnapshot()?.approval.status === "PENDING",
  );

  return {
    server,
    client,
    requestId: client.lastSnapshot()?.approval.requestId ?? "",
  };
}

async function main(): Promise<void> {
  console.log = () => {};

  say("\nAI Agent Remote — V0.1.3 approval_response tests\n");

  // --- Test E ---------------------------------------------------------------
  say("Test E — approval valid: YES");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();
    client.respond(requestId, true);

    await waitFor("APPROVED", () => client.lastSnapshot()?.approval.status === "APPROVED");
    check("approval.status = APPROVED", client.lastSnapshot()?.approval.status === "APPROVED");
    check("agentState = WORKING", client.lastSnapshot()?.agentState === "WORKING", client.lastSnapshot()?.agentState);
    check(
      "agent melanjutkan pekerjaan",
      client.outputs().includes("Approval received. Continuing..."),
    );

    await waitFor("IDLE", () => client.lastSnapshot()?.agentState === "IDLE");
    check("agent selesai jadi IDLE", client.lastSnapshot()?.agentState === "IDLE");
    check("approval tetap tercatat APPROVED", client.lastSnapshot()?.approval.status === "APPROVED");
    await client.close();
    server.close();
  }

  // --- Test F ---------------------------------------------------------------
  say("\nTest F — approval valid: NO");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();
    client.respond(requestId, false);

    await waitFor("DENIED", () => client.lastSnapshot()?.approval.status === "DENIED");
    check("approval.status = DENIED", client.lastSnapshot()?.approval.status === "DENIED");
    check("agentState = IDLE", client.lastSnapshot()?.agentState === "IDLE", client.lastSnapshot()?.agentState);

    await waitFor("output berhenti", () => client.outputs().length > 0);
    check(
      "agent berhenti",
      client.outputs().includes("Approval denied. Stopping..."),
      client.outputs().at(-1),
    );
    check(
      "tidak melanjutkan pekerjaan",
      !client.outputs().includes("Approval received. Continuing..."),
    );
    await client.close();
    server.close();
  }

  // --- Test G ---------------------------------------------------------------
  say("\nTest G — requestId salah");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();
    const snapshotsBefore = client.events.filter((e) => e.type === "state_snapshot").length;

    client.respond("req-does-not-exist", true);
    await waitFor("error", () => client.errors().length > 0);

    check("bridge membalas error", client.errors().at(-1)?.includes("unknown requestId") === true, client.errors().at(-1));
    await delay(200);
    check("tidak ada snapshot baru", client.events.filter((e) => e.type === "state_snapshot").length === snapshotsBefore);
    check("state tetap WAITING_APPROVAL", client.lastSnapshot()?.agentState === "WAITING_APPROVAL");
    check("approval tetap PENDING", client.lastSnapshot()?.approval.status === "PENDING");

    // Requirement 12: user boleh mencoba lagi selama masih PENDING.
    client.respond(requestId, true);
    await waitFor("APPROVED setelah retry", () => client.lastSnapshot()?.approval.status === "APPROVED");
    check("retry dengan requestId benar tetap diterima", client.lastSnapshot()?.approval.status === "APPROVED");
    await client.close();
    server.close();
  }

  // --- Test H ---------------------------------------------------------------
  say("\nTest H — duplicate approval response");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();
    client.respond(requestId, true);
    await waitFor("APPROVED", () => client.lastSnapshot()?.approval.status === "APPROVED");

    const errorsBefore = client.errors().length;
    const outputsBefore = client.outputs().length;

    // Kiriman kedua untuk requestId yang sama.
    client.respond(requestId, true);
    await waitFor("error kedua", () => client.errors().length > errorsBefore);

    check(
      "response kedua ditolak",
      client.errors().at(-1)?.includes("no pending approval request") === true,
      client.errors().at(-1),
    );
    await delay(300);
    check("agent tidak dijalankan dua kali", client.outputs().length === outputsBefore, `${client.outputs().length} vs ${outputsBefore}`);
    check("approval tetap APPROVED", client.lastSnapshot()?.approval.status === "APPROVED");

    // Jawaban berlawanan setelahnya juga tidak boleh membalik keputusan.
    client.respond(requestId, false);
    await delay(300);
    check("DENIED susulan diabaikan", client.lastSnapshot()?.approval.status === "APPROVED");
    await client.close();
    server.close();
  }

  // --- Test I ---------------------------------------------------------------
  say("\nTest I — reconnect saat PENDING lalu menjawab");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();
    const port = (server.address() as { port: number }).port;

    await client.close();
    await delay(500);

    const reconnected = await Client.connect(port);
    await waitFor("snapshot setelah reconnect", () => reconnected.events.length >= 2);

    const resumed = reconnected.lastSnapshot();
    check("approval masih PENDING", resumed?.approval.status === "PENDING", resumed?.approval.status);
    check("requestId sama", resumed?.approval.requestId === requestId);

    reconnected.respond(requestId, true);
    await waitFor("APPROVED", () => reconnected.lastSnapshot()?.approval.status === "APPROVED");
    check("client hasil reconnect bisa menjawab", reconnected.lastSnapshot()?.approval.status === "APPROVED");
    check("agent lanjut", reconnected.outputs().includes("Approval received. Continuing..."));
    await reconnected.close();
    server.close();
  }

  // --- Test J + K -----------------------------------------------------------
  say("\nTest J — approval_response malformed");
  {
    const { server, client, requestId } = await bridgeAtPendingApproval();

    const malformed: [string, string][] = [
      ["bukan JSON", "approval_response!!"],
      ["envelope datar (tanpa payload)", '{"type":"approval_response","requestId":"x","approved":true}'],
      ["payload kosong", '{"type":"approval_response","id":"a","timestamp":"t","payload":{}}'],
      ["approved bukan boolean", '{"type":"approval_response","id":"a","timestamp":"t","payload":{"requestId":"x","approved":"yes"}}'],
      ["requestId bukan string", '{"type":"approval_response","id":"a","timestamp":"t","payload":{"requestId":123,"approved":true}}'],
      ["payload array", '{"type":"approval_response","id":"a","timestamp":"t","payload":[]}'],
      ["approved null", '{"type":"approval_response","id":"a","timestamp":"t","payload":{"requestId":"x","approved":null}}'],
    ];

    for (const [label, raw] of malformed) {
      const before = client.errors().length;
      client.send(raw);
      await waitFor(`error untuk ${label}`, () => client.errors().length > before);
      check(`ditolak: ${label}`, client.errors().length > before);
    }

    check("state tidak berubah oleh message rusak", client.lastSnapshot()?.approval.status === "PENDING");

    say("\nTest K — bridge tetap hidup setelah semua itu");
    client.respond(requestId, true);
    await waitFor("APPROVED", () => client.lastSnapshot()?.approval.status === "APPROVED");
    check("approval valid tetap diproses", client.lastSnapshot()?.approval.status === "APPROVED");
    check("agent lanjut", client.outputs().includes("Approval received. Continuing..."));

    const fresh = await Client.connect((server.address() as { port: number }).port);
    await waitFor("client baru dilayani", () => fresh.events.length >= 2);
    check("bridge masih menerima koneksi baru", fresh.events[0]?.type === "connection");
    await fresh.close();
    await client.close();
    server.close();
  }

  say(failures === 0 ? "\nSemua test lolos.\n" : `\n${failures} test GAGAL.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: Error) => {
  console.error(`Test run failed: ${error.message}`);
  process.exit(1);
});
