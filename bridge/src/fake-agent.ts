/**
 * Simulasi agent untuk membuktikan approval flow. Belum ada Claude Code / proses
 * terminal sungguhan di sini.
 *
 * Yang penting: setelah mengirim approval_request, agent benar-benar berhenti
 * sampai approval_response yang cocok diterima.
 */

import {
  createEvent,
  type AgentOutputPayload,
  type ApprovalRequestPayload,
  type ApprovalResponsePayload,
  type Envelope,
} from "./protocol.js";

type Send = (event: Envelope) => void;

interface PendingApproval {
  requestId: string;
  resolve: (approved: boolean) => void;
  reject: (reason: Error) => void;
}

export class FakeAgent {
  private pending: PendingApproval | null = null;

  constructor(private readonly send: Send) {}

  async run(): Promise<void> {
    this.output("I need permission to continue.");

    const approved = await this.requestApproval("Approval required.", [
      "yes",
      "no",
    ]);

    this.output(
      approved
        ? "Approval received. Continuing..."
        : "Approval denied. Stopping...",
    );
  }

  /**
   * Dipanggil saat approval_response masuk. Mengembalikan error string kalau
   * response-nya tidak cocok dengan request yang sedang menunggu.
   */
  handleApprovalResponse(
    event: Envelope<ApprovalResponsePayload>,
  ): { ok: true } | { ok: false; error: string } {
    if (!this.pending) {
      return { ok: false, error: "no pending approval request" };
    }
    if (event.payload.requestId !== this.pending.requestId) {
      return {
        ok: false,
        error: `unknown requestId: ${event.payload.requestId}`,
      };
    }

    const { resolve } = this.pending;
    this.pending = null;
    resolve(event.payload.approved);
    return { ok: true };
  }

  /** Batalkan agent saat client disconnect, supaya promise tidak menggantung. */
  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error("client disconnected"));
  }

  private output(text: string): void {
    this.send(createEvent<AgentOutputPayload>("agent_output", { text }));
  }

  private requestApproval(
    message: string,
    options: string[],
  ): Promise<boolean> {
    const event = createEvent<ApprovalRequestPayload>(
      "approval_request",
      { message, options },
      "req",
    );

    return new Promise<boolean>((resolve, reject) => {
      this.pending = { requestId: event.id, resolve, reject };
      this.send(event);
    });
  }
}
