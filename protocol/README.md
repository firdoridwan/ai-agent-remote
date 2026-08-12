# Protocol V0.1

Message/event schema antara client (nanti Android) dan Local Bridge.

Transport: WebSocket, JSON text frame, satu event per frame.

Implementasi TypeScript-nya ada di [`bridge/src/protocol.ts`](../bridge/src/protocol.ts).
Ketika Android mulai dibuat, tipe di sana yang dipindahkan ke folder ini sebagai
shared package.

## Bridge adalah source of truth

State agent/session dimiliki **Bridge**, bukan client. Client hanya menampilkan
salinan terakhir yang diterimanya lewat `state_snapshot`.

Konsekuensinya:

- Client boleh mati, restart, atau berganti perangkat tanpa mempengaruhi agent.
- Client tidak pernah "mengingat" approval yang tertunda; ia menanyakannya lagi
  ke bridge dengan cara connect dan membaca snapshot.
- Kalau client dan bridge berbeda pendapat soal state, bridge yang benar.

State disimpan **in-memory** di proses bridge. Belum ada persistence — kalau
proses bridge mati, state ikut hilang. Itu akan dipikirkan saat integrasi agent
sungguhan dibuat.

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

## State model

### Agent state

| Nilai | Arti |
| --- | --- |
| `IDLE` | Tidak sedang mengerjakan apa pun |
| `WORKING` | Sedang bekerja |
| `WAITING_APPROVAL` | Berhenti, menunggu jawaban user |

### Approval state

| Nilai | Arti |
| --- | --- |
| `NONE` | Belum pernah ada approval request |
| `PENDING` | Ada request yang menunggu jawaban |
| `APPROVED` | Request terakhir disetujui |
| `DENIED` | Request terakhir ditolak |

`APPROVED`/`DENIED` tetap tersimpan setelah agent selesai, sebagai catatan hasil
terakhir.

### Connection state

Ini **state lokal client**, tidak pernah dikirim ke bridge dan tidak disimpan
bridge:

```text
DISCONNECTED → CONNECTING → CONNECTED
```

Bridge tidak menyimpan `CONNECTING` karena itu murni urusan client.

### Transisi

```text
IDLE
 ↓ agent mulai bekerja
WORKING
 ↓ agent butuh izin
WAITING_APPROVAL + approval PENDING
 ↓ approval_response approved=true      ↓ approval_response approved=false
WORKING + APPROVED                      IDLE + DENIED
 ↓ pekerjaan selesai
IDLE + APPROVED
```

State selalu di-update **sebelum** event dikirim, jadi snapshot tidak pernah
menampilkan state basi.

## Events

| Event | Arah | Keterangan |
| --- | --- | --- |
| `connection` | Bridge → Client | Dikirim sekali saat client connect |
| `state_snapshot` | Bridge → Client | Keadaan agent saat ini |
| `agent_output` | Bridge → Client | Output teks dari agent |
| `approval_request` | Bridge → Client | Agent minta persetujuan, lalu menunggu |
| `approval_response` | Client → Bridge | Jawaban user atas `approval_request` |
| `error` | Bridge → Client | Message invalid atau tidak bisa diproses |

`approval_response` adalah satu-satunya event yang boleh dikirim client. Event
lain dari client dibalas `error`.

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

### state_snapshot

```json
{
  "type": "state_snapshot",
  "id": "state-2",
  "timestamp": "2026-08-12T10:00:00.001Z",
  "payload": {
    "agentId": "fake-agent",
    "agentState": "WAITING_APPROVAL",
    "approval": {
      "status": "PENDING",
      "requestId": "req-7",
      "message": "Approval required.",
      "options": ["yes", "no"]
    }
  }
}
```

`requestId`, `message`, dan `options` hanya ada ketika pernah ada approval
request. Saat `status` = `NONE`, `approval` hanya berisi `status`.

Snapshot dikirim ketika:

1. Client baru connect (selalu, tepat setelah `connection`).
2. Setiap kali state berubah — di-broadcast ke **semua** client yang terhubung.

### agent_output

```json
{
  "type": "agent_output",
  "id": "evt-3",
  "timestamp": "2026-08-12T10:00:02.010Z",
  "payload": {
    "text": "I need permission to continue."
  }
}
```

### approval_request

```json
{
  "type": "approval_request",
  "id": "req-7",
  "timestamp": "2026-08-12T10:00:02.020Z",
  "payload": {
    "message": "Approval required.",
    "options": ["yes", "no"]
  }
}
```

Setelah mengirim ini, agent **berhenti dan menunggu**. Tidak ada lanjutan
otomatis dan tidak ada timeout.

Client yang connect **setelah** event ini dikirim tidak akan menerimanya. Itulah
gunanya `state_snapshot`: approval yang masih `PENDING` selalu terbaca dari
snapshot, lengkap dengan `requestId`-nya.

### approval_response

```json
{
  "type": "approval_response",
  "id": "res-1",
  "timestamp": "2026-08-12T10:00:05.000Z",
  "payload": {
    "requestId": "req-7",
    "approved": true
  }
}
```

`requestId` harus sama dengan `requestId` pada approval yang sedang `PENDING`.
Kalau tidak cocok, atau tidak ada approval yang menunggu, Bridge membalas `error`
dan **state tidak berubah sama sekali** — agent tetap menunggu.

### error

```json
{
  "type": "error",
  "id": "evt-4",
  "timestamp": "2026-08-12T10:00:06.000Z",
  "payload": {
    "message": "unknown requestId: req-999"
  }
}
```

`error` dikirim hanya ke socket yang mengirim message bermasalah, bukan
di-broadcast.

## Urutan saat connect

Deterministic, selalu:

```text
connection
    ↓
state_snapshot
```

Baru setelah itu event lain menyusul sesuai keadaan agent.

## Reconnect behavior

Disconnect adalah peristiwa milik client, bukan milik agent. Bridge hanya
membuang socket-nya; **state agent tidak disentuh**.

| Saat disconnect | Setelah reconnect, snapshot menunjukkan |
| --- | --- |
| Agent `WORKING` | `WORKING` — tidak jatuh ke `IDLE` |
| Approval `PENDING` | `WAITING_APPROVAL` + `PENDING` + `requestId` yang sama |

Ketika approval sedang `PENDING` dan semua client putus, agent **tetap
menunggu**. Tidak ada auto approve, auto deny, timeout, maupun cancel.

Client yang reconnect membaca `requestId` dari snapshot, lalu mengirim
`approval_response` seperti biasa.

## Multiple clients

Bridge menerima lebih dari satu client sekaligus:

```text
Client A ─┐
          ├── Bridge ─── Agent
Client B ─┘
```

- Setiap perubahan state di-broadcast ke semua client.
- Agent dan approval **tidak terikat** ke socket mana pun.
- Approval request yang diterima Client A boleh dijawab Client B.
- Approval pertama yang valid yang menang; response berikutnya untuk
  `requestId` yang sama dibalas `error` karena sudah tidak ada yang `PENDING`.

## Flow lengkap

```text
Client A                       Bridge / Agent                     Client B
   |                                 |                                |
   |  <----- connection ------------ |                                |
   |  <----- state_snapshot (IDLE) - |                                |
   |  <----- state_snapshot (WORKING)|                                |
   |  <----- agent_output ---------- |                                |
   |  <----- state_snapshot (PENDING)|                                |
   |  <----- approval_request ------ |                                |
   |                              (WAIT)                              |
   X  disconnect                     |                                |
   |                              (tetap WAIT)                        |
   |                                 | ----- connection ------------> |
   |                                 | ----- state_snapshot (PENDING) |
   |                                 |  <---- approval_response ----- |
   |                                 | ----- state_snapshot (APPROVED)|
   |                                 | ----- agent_output ----------> |
```
