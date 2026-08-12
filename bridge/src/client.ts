/**
 * Test client untuk membuktikan flow dari terminal.
 * Nanti peran client ini digantikan Android app.
 *
 * Client bukan source of truth: semua yang ditampilkan berasal dari event dan
 * state_snapshot milik bridge. Yang dipegang client hanya connection state.
 */

import { createInterface } from "node:readline";

import WebSocket from "ws";

import {
  createEvent,
  parseMessage,
  type AgentOutputPayload,
  type AgentState,
  type ApprovalRequestPayload,
  type ApprovalResponsePayload,
  type ConnectionState,
  type Envelope,
  type ErrorPayload,
} from "./protocol.js";

const URL = "ws://127.0.0.1:8787";

let connectionState: ConnectionState = "CONNECTING";

// Approval yang sudah pernah di-prompt, supaya approval_request dan
// state_snapshot untuk request yang sama tidak menanya dua kali.
let promptedRequestId: string | null = null;
let answered = false;

console.log("AI Agent Remote Test Client\n");

const socket = new WebSocket(URL);

socket.on("open", () => {
  connectionState = "CONNECTED";
});

socket.on("error", (error: Error) => {
  connectionState = "DISCONNECTED";
  console.error(`Connection failed: ${error.message}`);
  console.error("Pastikan bridge sudah jalan (npm run dev).");
  closeInput();
  process.exitCode = 1;
});

socket.on("close", () => {
  connectionState = "DISCONNECTED";
  closeInput();
});

socket.on("message", (data) => {
  handleMessage(data.toString()).catch((error: Error) => {
    console.error(`Client error: ${error.message}`);
    socket.close();
  });
});

async function handleMessage(raw: string): Promise<void> {
  const result = parseMessage(raw);
  if (!result.ok) {
    console.log(`⚠️  Invalid message from bridge: ${result.error}\n`);
    return;
  }

  const event = result.event;

  switch (event.type) {
    case "connection":
      console.log(`Connected. (${connectionState})\n`);
      break;

    case "state_snapshot":
      await handleSnapshot(event.payload as AgentState);
      break;

    case "agent_output": {
      const { text } = event.payload as AgentOutputPayload;
      console.log(`🤖 Agent:\n${text}\n`);
      break;
    }

    case "approval_request": {
      const { message, options } = event.payload as ApprovalRequestPayload;
      await promptApproval(event.id, message, options);
      break;
    }

    case "error": {
      const { message } = event.payload as ErrorPayload;
      console.log(`⚠️  Error: ${message}\n`);
      break;
    }

    default:
      break;
  }
}

async function handleSnapshot(state: AgentState): Promise<void> {
  console.log(
    `[state] agent: ${state.agentState} | approval: ${state.approval.status}`,
  );

  // Reconnect ke approval yang masih menunggu: prompt-nya datang dari snapshot,
  // karena approval_request-nya sudah lewat sebelum client ini connect.
  const { status, requestId, message, options } = state.approval;
  if (status === "PENDING" && requestId) {
    await promptApproval(
      requestId,
      message ?? "Approval required.",
      options ?? ["yes", "no"],
    );
    return;
  }

  // Selesai: agent kembali IDLE setelah jawaban kita diproses.
  if (answered && state.agentState === "IDLE" && status !== "PENDING") {
    socket.close();
  }
}

async function promptApproval(
  requestId: string,
  message: string,
  options: string[],
): Promise<void> {
  if (promptedRequestId === requestId) return;
  promptedRequestId = requestId;

  console.log(`\n${message}\n[${options[0]?.[0] ?? "y"}] Yes\n[${options[1]?.[0] ?? "n"}] No\n`);

  const approved = await askYesNo();
  if (approved === null) {
    console.log("\nNo input available. Closing.\n");
    socket.close();
    return;
  }

  console.log(
    approved ? "\n→ Sending approval...\n" : "\n→ Sending denial...\n",
  );

  answered = true;
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

/** null kalau stdin habis tanpa jawaban. */
async function askYesNo(): Promise<boolean | null> {
  for (;;) {
    process.stdout.write("> ");
    const line = await readLine();
    if (line === null) return null;

    const answer = line.trim().toLowerCase();
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Ketik y atau n.");
  }
}

// Baris stdin di-buffer sejak awal, supaya input yang di-pipe (mis. `echo y | ...`)
// tidak hilang saat tiba sebelum approval_request.
const bufferedLines: string[] = [];
let lineWaiter: ((line: string | null) => void) | null = null;
let inputClosed = false;

const input = createInterface({ input: process.stdin });

input.on("line", (line) => {
  const waiter = lineWaiter;
  if (waiter) {
    lineWaiter = null;
    waiter(line);
  } else {
    bufferedLines.push(line);
  }
});

input.on("close", () => {
  inputClosed = true;
  const waiter = lineWaiter;
  if (waiter) {
    lineWaiter = null;
    waiter(null);
  }
});

function readLine(): Promise<string | null> {
  const buffered = bufferedLines.shift();
  if (buffered !== undefined) return Promise.resolve(echo(buffered));
  if (inputClosed) return Promise.resolve(null);
  return new Promise((resolve) => {
    lineWaiter = (line) => resolve(echo(line));
  });
}

/** Terminal meng-echo input sendiri; stdin yang di-pipe tidak. */
function echo(line: string | null): string | null {
  if (line !== null && !process.stdin.isTTY) process.stdout.write(`${line}\n`);
  return line;
}

function closeInput(): void {
  input.close();
}
