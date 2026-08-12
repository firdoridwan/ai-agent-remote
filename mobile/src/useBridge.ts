/**
 * Koneksi WebSocket ke Local Bridge.
 *
 * V0.1.2-B.1 bersifat read-only: app hanya menerima dan menampilkan. Tidak ada
 * message yang dikirim ke bridge, jadi app tidak bisa mengubah state agent.
 *
 * Client bukan source of truth: yang dipegang di sini hanya connection state
 * dan salinan terakhir dari state_snapshot milik bridge.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BRIDGE_URL } from "./config";
import {
  parseMessage,
  type AgentOutputPayload,
  type AgentState,
  type ConnectionState,
  type ErrorPayload,
} from "./protocol";

export type LogKind = "agent" | "error" | "system";

export interface LogEntry {
  key: string;
  kind: LogKind;
  text: string;
}

export interface Bridge {
  url: string;
  connectionState: ConnectionState;
  agentState: AgentState | null;
  log: LogEntry[];
  connect: () => void;
  disconnect: () => void;
}

export function useBridge(): Bridge {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("DISCONNECTED");
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const logSequence = useRef(0);

  const append = useCallback((kind: LogKind, text: string) => {
    logSequence.current += 1;
    const key = `log-${logSequence.current}`;
    setLog((previous) => [...previous, { key, kind, text }]);
  }, []);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    setConnectionState("DISCONNECTED");
  }, []);

  const connect = useCallback(() => {
    socketRef.current?.close();

    setConnectionState("CONNECTING");
    append("system", `Connecting to ${BRIDGE_URL}`);

    const socket = new WebSocket(BRIDGE_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionState("CONNECTED");
    };

    socket.onerror = () => {
      // RN tidak memberi detail error yang berguna di sini.
      append("error", "Connection error. Bridge jalan? adb reverse aktif?");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnectionState("DISCONNECTED");
      append("system", "Disconnected.");
    };

    socket.onmessage = (event: { data: unknown }) => {
      if (typeof event.data !== "string") return;

      const result = parseMessage(event.data);
      if (!result.ok) {
        append("error", `Invalid message from bridge: ${result.error}`);
        return;
      }

      switch (result.event.type) {
        case "connection":
          append("system", "Connected.");
          break;

        case "state_snapshot":
          setAgentState(result.event.payload as AgentState);
          break;

        case "agent_output":
          append("agent", (result.event.payload as AgentOutputPayload).text);
          break;

        case "error":
          append("error", (result.event.payload as ErrorPayload).message);
          break;

        // approval_request tidak perlu ditangani terpisah: approval yang
        // menunggu selalu ada di state_snapshot, termasuk saat reconnect.
        default:
          break;
      }
    };
  }, [append]);

  // Connect sekali saat app dibuka; setelah itu manual lewat tombol.
  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    url: BRIDGE_URL,
    connectionState,
    agentState,
    log,
    connect,
    disconnect,
  };
}
