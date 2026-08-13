/**
 * Koneksi WebSocket ke Local Bridge.
 *
 * V0.1.3: app boleh menjawab approval. Satu-satunya message yang dikirim app
 * adalah `approval_response` — tidak ada yang lain.
 *
 * Client tetap bukan source of truth. App tidak pernah menebak hasil approval;
 * status baru berubah setelah bridge mengirim state_snapshot. Yang disimpan
 * lokal hanya connection state dan penanda "sedang mengirim".
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BRIDGE_URL } from "./config";
import {
  createEvent,
  parseMessage,
  type AgentOutputPayload,
  type AgentState,
  type ApprovalResponsePayload,
  type ConnectionState,
  type ErrorPayload,
} from "./protocol";

export type LogKind = "agent" | "error" | "system";

export interface LogEntry {
  key: string;
  kind: LogKind;
  text: string;
}

/** Approval yang sudah dikirim tapi belum dikonfirmasi bridge. */
export interface Submission {
  requestId: string;
  approved: boolean;
}

export interface Bridge {
  url: string;
  connectionState: ConnectionState;
  agentState: AgentState | null;
  log: LogEntry[];
  submission: Submission | null;
  connect: () => void;
  disconnect: () => void;
  respond: (approved: boolean) => void;
}

export function useBridge(): Bridge {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("DISCONNECTED");
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const logSequence = useRef(0);
  // Handler WebSocket hidup di luar render, jadi butuh ref supaya tidak membaca
  // nilai basi saat memutuskan kapan "Sending..." selesai.
  const submissionRef = useRef<Submission | null>(null);

  const trackSubmission = useCallback((next: Submission | null) => {
    submissionRef.current = next;
    setSubmission(next);
  }, []);

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
      console.log(`[bridge] open ${BRIDGE_URL}`);
    };

    // Detail error di RN tipis, jadi apa pun yang ada kita tampilkan apa adanya
    // supaya kegagalan tidak berhenti di kata "DISCONNECTED".
    socket.onerror = (event: Event) => {
      const detail =
        (event as Event & { message?: string }).message ??
        "no detail from platform";
      console.log(`[bridge] error: ${detail}`);
      append("error", `Connection error: ${detail}`);
      append("system", `Target: ${BRIDGE_URL}`);
    };

    socket.onclose = (event: { code?: number; reason?: string }) => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnectionState("DISCONNECTED");
      // Kiriman yang menggantung dianggap batal, supaya setelah reconnect
      // tombolnya hidup lagi kalau approval-nya memang masih PENDING.
      trackSubmission(null);

      const code = event?.code ?? 0;
      const reason = event?.reason ? ` ${event.reason}` : "";
      console.log(`[bridge] close ${code}${reason}`);
      append("system", `Disconnected (code ${code}${reason}).`);

      // 1006 = tertutup tanpa close frame: gagal sebelum handshake selesai.
      // Penyebab paling umum: alamat salah, bridge belum jalan / masih bind ke
      // loopback, beda jaringan, atau cleartext diblokir Android.
      if (code === 1006) {
        append(
          "error",
          "Tidak sampai ke bridge. Cek: BRIDGE_HOST=0.0.0.0, Wi-Fi yang sama, IP benar.",
        );
      }
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

        case "state_snapshot": {
          const state = result.event.payload as AgentState;
          setAgentState(state);

          // Bridge sudah memutuskan: approval bukan PENDING lagi, atau sudah
          // berpindah ke request lain. Kiriman kita selesai.
          const pending = submissionRef.current;
          if (
            pending &&
            (state.approval.status !== "PENDING" ||
              state.approval.requestId !== pending.requestId)
          ) {
            trackSubmission(null);
          }
          break;
        }

        case "agent_output":
          append("agent", (result.event.payload as AgentOutputPayload).text);
          break;

        case "error": {
          const { message } = result.event.payload as ErrorPayload;
          append("error", message);
          // Bridge menolak. Lepas kuncinya supaya user bisa mencoba lagi
          // selama approval-nya masih PENDING.
          if (submissionRef.current) trackSubmission(null);
          break;
        }

        // approval_request tidak perlu ditangani terpisah: approval yang
        // menunggu selalu ada di state_snapshot, termasuk saat reconnect.
        default:
          break;
      }
    };
  }, [append, trackSubmission]);

  const respond = useCallback(
    (approved: boolean) => {
      const approval = agentState?.approval;
      if (approval?.status !== "PENDING" || !approval.requestId) return;
      // Kunci double submit.
      if (submissionRef.current) return;

      const socket = socketRef.current;
      if (!socket || socket.readyState !== 1) {
        append("error", "Belum terhubung ke bridge. Connect dulu.");
        return;
      }

      const requestId = approval.requestId;
      const event = createEvent<ApprovalResponsePayload>(
        "approval_response",
        { requestId, approved },
        "res",
      );

      trackSubmission({ requestId, approved });
      try {
        socket.send(JSON.stringify(event));
        console.log(`[bridge] sent approval_response ${requestId}=${approved}`);
        append("system", approved ? "Sending approval..." : "Sending denial...");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.log(`[bridge] send failed: ${detail}`);
        append("error", `Gagal mengirim: ${detail}`);
        trackSubmission(null);
      }
    },
    [agentState, append, trackSubmission],
  );

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
    submission,
    connect,
    disconnect,
    respond,
  };
}
