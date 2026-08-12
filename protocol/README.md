# Protocol V0.1

Message/event schema antara client (nanti Android) dan Local Bridge.

Transport: WebSocket, JSON text frame, satu event per frame.

Implementasi TypeScript-nya ada di [`bridge/src/protocol.ts`](../bridge/src/protocol.ts).
Ketika Android mulai dibuat, tipe di sana yang dipindahkan ke folder ini sebagai
shared package.

## Envelope

Semua event memakai envelope yang sama:

```json
{
  "type": "string",
  "id": "string",
  "timestamp": "ISO-8601 string",
  "payload": {}
}
```

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `type` | string | Salah satu event di bawah |
| `id` | string | ID unik event ini |
| `timestamp` | string | Waktu event dibuat, ISO-8601 UTC |
| `payload` | object | Isi spesifik per `type` |

Message dianggap **invalid** kalau: bukan JSON valid, bukan object, `type` tidak
dikenal, `id`/`timestamp` bukan string non-kosong, atau `payload` bukan object.
Bridge membalas `error` dan koneksi tetap hidup.

## Events

| Event | Arah | Keterangan |
| --- | --- | --- |
| `connection` | Bridge → Client | Dikirim sekali saat client connect |
| `agent_output` | Bridge → Client | Output teks dari agent |
| `approval_request` | Bridge → Client | Agent minta persetujuan, lalu menunggu |
| `approval_response` | Client → Bridge | Jawaban user atas `approval_request` |
| `error` | Bridge → Client | Message invalid atau tidak bisa diproses |

### connection

```json
{
  "type": "connection",
  "id": "evt-1",
  "timestamp": "2026-08-12T10:00:00.000Z",
  "payload": {
    "status": "connected"
  }
}
```

### agent_output

```json
{
  "type": "agent_output",
  "id": "evt-2",
  "timestamp": "2026-08-12T10:00:00.010Z",
  "payload": {
    "text": "I need permission to continue."
  }
}
```

### approval_request

```json
{
  "type": "approval_request",
  "id": "req-1",
  "timestamp": "2026-08-12T10:00:00.020Z",
  "payload": {
    "message": "Approval required.",
    "options": ["yes", "no"]
  }
}
```

Setelah mengirim ini, agent **berhenti dan menunggu**. Tidak ada lanjutan
otomatis dan tidak ada timeout di V0.1.

### approval_response

```json
{
  "type": "approval_response",
  "id": "res-1",
  "timestamp": "2026-08-12T10:00:05.000Z",
  "payload": {
    "requestId": "req-1",
    "approved": true
  }
}
```

`requestId` harus sama dengan `id` dari `approval_request` yang sedang menunggu.
Kalau tidak cocok, atau tidak ada request yang menunggu, Bridge membalas `error`
dan agent tetap menunggu.

### error

```json
{
  "type": "error",
  "id": "evt-3",
  "timestamp": "2026-08-12T10:00:06.000Z",
  "payload": {
    "message": "invalid JSON"
  }
}
```

## Flow V0.1.1

```text
Client                         Bridge / Fake Agent
  |                                     |
  |  <------ connection --------------  |
  |  <------ agent_output ------------  |
  |  <------ approval_request --------  |
  |                                  (WAIT)
  |  ------- approval_response ------>  |
  |  <------ agent_output ------------  |
```
