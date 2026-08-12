/**
 * Simulasi agent untuk membuktikan approval flow + state management.
 * Belum ada Claude Code / proses terminal sungguhan di sini.
 *
 * Dua sifat yang wajib dipertahankan:
 * 1. Setelah mengirim approval_request, agent benar-benar berhenti sampai
 *    approval_response yang cocok diterima. Tidak ada timeout, tidak ada
 *    auto approve/deny.
 * 2. Agent hidup di level bridge, bukan per koneksi. Client disconnect tidak
 *    mengubah state agent sama sekali.
 */

import { setTimeout as delay } from "node:timers/promises";

import {
  createEvent,
  type AgentOutputPayload,
  type AgentState,
  type ApprovalRequestPayload,
  type ApprovalResponsePayload,
  type Envelope,
  type StateSnapshotPayload,
} from "./protocol.js";

const AGENT_ID = "fake-agent";

/** Durasi kerja simulasi, supaya state WORKING bisa diamati. Bukan timeout approval. */
const WORK_DURATION_MS = 2000;

type Emit = (event: Envelope) => void;

interface PendingApproval {
  requestId: string;
  resolve: (approved: boolean) => void;
}

export class FakeAgent {
  private readonly state: AgentState = {
    agentId: AGENT_ID,
    agentState: "IDLE",
    approval: { status: "NONE" },
  };

  private pending: PendingApproval | null = null;
  private started = false;

  constructor(private readonly emit: Emit) {}

  /** Salinan state, supaya pemanggil tidak bisa memutasi source of truth. */
  getState(): AgentState {
    return { ...this.state, approval: { ...this.state.approval } };
  }

  snapshotEvent(): Envelope<StateSnapshotPayload> {
    return createEvent<StateSnapshotPayload>(
      "state_snapshot",
      this.getState(),
      "state",
    );
  }

  /** Idempotent: agent jalan sekali per proses bridge, reconnect tidak me-restart. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.run().catch((error: Error) => {
      console.error(`[agent] stopped: ${error.message}`);
    });
  }

  /**
   * Dipanggil saat approval_response masuk, dari socket mana pun. Response yang
   * tidak cocok tidak mengubah state sedikit pun.
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
    const approved = event.payload.approved;

    // State dulu, baru event, supaya snapshot tidak pernah stale.
    if (approved) {
      this.state.approval.status = "APPROVED";
      this.state.agentState = "WORKING";
    } else {
      this.state.approval.status = "DENIED";
      this.state.agentState = "IDLE";
    }
    this.emitState();

    resolve(approved);
    return { ok: true };
  }

  private async run(): Promise<void> {
    this.setAgentState("WORKING");
    await delay(WORK_DURATION_MS);

    this.output("I need permission to continue.");
    const approved = await this.requestApproval("Approval required.", [
      "yes",
      "no",
    ]);

    if (!approved) {
      // State sudah DENIED + IDLE saat response diproses.
      this.output("Approval denied. Stopping...");
      return;
    }

    this.output("Approval received. Continuing...");
    await delay(WORK_DURATION_MS);
    this.setAgentState("IDLE");
  }

  private requestApproval(
    message: string,
    options: string[],
  ): Promise<boolean> {
    const request = createEvent<ApprovalRequestPayload>(
      "approval_request",
      { message, options },
      "req",
    );

    return new Promise<boolean>((resolve) => {
      this.pending = { requestId: request.id, resolve };

      this.state.agentState = "WAITING_APPROVAL";
      this.state.approval = {
        status: "PENDING",
        requestId: request.id,
        message,
        options,
      };
      this.emitState();

      this.emit(request);
    });
  }

  private setAgentState(next: AgentState["agentState"]): void {
    this.state.agentState = next;
    this.emitState();
  }

  private output(text: string): void {
    this.emit(createEvent<AgentOutputPayload>("agent_output", { text }));
  }

  private emitState(): void {
    this.emit(this.snapshotEvent());
  }
}
