import { WebSocketServer, type WebSocket } from "ws";

import { FakeAgent } from "./fake-agent.js";
import {
  createEvent,
  isApprovalResponse,
  parseMessage,
  type ConnectionPayload,
  type Envelope,
  type ErrorPayload,
} from "./protocol.js";

export interface BridgeOptions {
  /** Localhost only. Bridge tidak boleh terjangkau dari jaringan luar. */
  host?: string;
  port: number;
}

export function startBridge({
  host = "127.0.0.1",
  port,
}: BridgeOptions): WebSocketServer {
  const server = new WebSocketServer({ host, port });
  const clients = new Set<WebSocket>();

  const sendTo = (socket: WebSocket, event: Envelope): void => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(event));
  };

  const broadcast = (event: Envelope): void => {
    for (const socket of clients) sendTo(socket, event);
    console.log(`[bridge] -> ${event.type} (${clients.size} client(s))`);
  };

  // Satu agent per bridge, bukan per koneksi: state harus selamat dari disconnect.
  const agent = new FakeAgent(broadcast);

  server.on("error", (error: Error) => {
    console.error(`[bridge] server error: ${error.message}`);
  });

  server.on("connection", (socket: WebSocket) => {
    clients.add(socket);
    console.log(`[bridge] client connected (${clients.size} total)`);

    const sendError = (message: string): void => {
      sendTo(socket, createEvent<ErrorPayload>("error", { message }));
    };

    // Urutan wajib: connection dulu, baru state_snapshot.
    sendTo(
      socket,
      createEvent<ConnectionPayload>("connection", { status: "connected" }),
    );
    sendTo(socket, agent.snapshotEvent());

    // No-op kalau agent sudah jalan; reconnect tidak pernah me-restart agent.
    agent.start();

    socket.on("message", (data) => {
      // Message dari client tidak dipercaya: apa pun isinya, bridge harus tetap hidup.
      try {
        const result = parseMessage(data.toString());
        if (!result.ok) {
          console.log(`[bridge] invalid message: ${result.error}`);
          sendError(result.error);
          return;
        }

        const event = result.event;
        console.log(`[bridge] <- ${event.type}`);

        if (event.type !== "approval_response") {
          sendError(`unsupported event type from client: ${event.type}`);
          return;
        }
        if (!isApprovalResponse(event)) {
          sendError(
            "approval_response requires payload.requestId and payload.approved",
          );
          return;
        }

        const outcome = agent.handleApprovalResponse(event);
        if (!outcome.ok) {
          sendError(outcome.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[bridge] failed to handle message: ${message}`);
        sendError("failed to handle message");
      }
    });

    socket.on("error", (error: Error) => {
      console.error(`[bridge] socket error: ${error.message}`);
    });

    socket.on("close", () => {
      // Hanya buang socket-nya. State agent sengaja tidak disentuh.
      clients.delete(socket);
      console.log(`[bridge] client disconnected (${clients.size} left)`);
    });
  });

  return server;
}
