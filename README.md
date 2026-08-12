# AI Agent Remote

Android app sebagai remote / control center untuk AI coding agents yang berjalan
di laptop. Idenya: agent tetap hidup di terminal laptop, sementara kontrol dan
monitoringnya bisa dilakukan dari HP.

## Tujuan V0.1

V0.1 hanya membuktikan jalur komunikasi:

```text
Android
   ↕
Local Bridge
   ↕
Terminal Process
```

Belum ada integrasi Claude Code / Codex / Gemini, belum ada WebSocket, belum ada
UI Android, belum ada database atau cloud backend. Target tahap ini adalah
skeleton project yang bersih dan bisa dijalankan.

## Arsitektur sementara

- **Android** — remote UI, mengirim perintah dan menerima output (belum dibuat).
- **Local Bridge** — proses Node.js di laptop, jembatan antara Android dan
  terminal process.
- **Terminal Process** — proses agent/CLI yang dijalankan bridge (belum dibuat).

## Struktur folder

```text
ai-agent-remote/
├── bridge/                  # Local bridge (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── config.ts        # BRIDGE_HOST / BRIDGE_PORT
│   │   ├── bridge.ts        # WebSocket server + broadcast
│   │   ├── protocol.ts      # Tipe envelope/state + parsing/validasi
│   │   ├── fake-agent.ts    # Simulasi agent (state + approval flow)
│   │   ├── client.ts        # Test client terminal
│   │   └── state.test.ts    # Test state & reconnect
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/                  # Android app (Expo + React Native)
│   ├── App.tsx              # UI read-only
│   ├── src/
│   │   ├── config.ts        # Bridge URL tetap
│   │   ├── protocol.ts      # Protocol parsing (duplikat dari bridge)
│   │   ├── useBridge.ts     # Koneksi WebSocket + state
│   │   └── protocol.smoke.ts# Smoke test lawan bridge asli
│   └── app.json
│
├── protocol/                # Spec message/event protocol
│   └── README.md
│
├── README.md
└── .gitignore
```

## Menjalankan bridge

Butuh Node.js 20+ dan npm.

```bash
cd bridge
npm install
npm run dev
```

Output yang diharapkan:

```text
AI Agent Remote Bridge
Status: running
WebSocket: ws://127.0.0.1:8787
```

Default-nya loopback. Untuk agar HP bisa menjangkaunya lewat Wi-Fi, lihat
[V0.1.2-B.2](#v012-b2--wireless-lan-connectivity).

### Script yang tersedia

| Command | Keterangan |
| --- | --- |
| `npm run dev` | Jalankan bridge dari source dengan auto-reload (tsx watch) |
| `npm start` | Jalankan bridge sekali dari source, tanpa watch |
| `npm run client` | Jalankan test client (butuh bridge yang sudah jalan) |
| `npm test` | Test config + state & reconnect (start bridge sendiri di port 8788) |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm run serve` | Jalankan hasil build (`node dist/index.js`) |
| `npm run typecheck` | Type check tanpa emit |

---

## V0.1.1 — WebSocket Bridge

Membuktikan komunikasi real-time dua arah, termasuk **approval flow** di mana
agent benar-benar berhenti menunggu jawaban user.

### Architecture

```text
Test Client  (bridge/src/client.ts)
     ↕  WebSocket ws://127.0.0.1:8787
Local Bridge (bridge/src/index.ts)
     ↕  in-process
Fake Agent   (bridge/src/fake-agent.ts)
```

Server bind **hanya ke `127.0.0.1`** — tidak terjangkau dari jaringan luar.
Belum ada authentication, karena belum ada yang bisa connect selain localhost.

Test client di sini adalah pengganti sementara Android app. Fake Agent adalah
pengganti sementara terminal process; belum ada Claude Code dan belum ada eksekusi
shell.

### Protocol events

Spec lengkap: [`protocol/README.md`](protocol/README.md).

Semua event memakai envelope yang sama:

```json
{ "type": "...", "id": "...", "timestamp": "ISO-8601", "payload": {} }
```

| Event | Arah | Keterangan |
| --- | --- | --- |
| `connection` | Bridge → Client | Dikirim sekali saat client connect |
| `agent_output` | Bridge → Client | Output teks dari agent |
| `approval_request` | Bridge → Client | Agent minta izin, lalu menunggu |
| `approval_response` | Client → Bridge | Jawaban user (`requestId` + `approved`) |
| `error` | Bridge → Client | Message invalid atau tidak bisa diproses |

Message yang tidak valid (bukan JSON, field kurang, `type` tidak dikenal,
`requestId` tidak cocok) dibalas `error`. Bridge tidak pernah crash dan koneksi
tetap hidup.

### Menjalankan

Dua terminal.

Terminal 1 — bridge:

```bash
cd bridge
npm install
npm run dev
```

Terminal 2 — test client:

```bash
cd bridge
npm run client
```

### Contoh approval flow

Jawab `y`:

```text
AI Agent Remote Test Client

Connected. (CONNECTED)

[state] agent: IDLE | approval: NONE
[state] agent: WORKING | approval: NONE
🤖 Agent:
I need permission to continue.

[state] agent: WAITING_APPROVAL | approval: PENDING

Approval required.
[y] Yes
[n] No

> y

→ Sending approval...

[state] agent: WORKING | approval: APPROVED
🤖 Agent:
Approval received. Continuing...

[state] agent: IDLE | approval: APPROVED
```

Jawab `n`:

```text
> n

→ Sending denial...

[state] agent: IDLE | approval: DENIED
🤖 Agent:
Approval denied. Stopping...
```

Baris `[state]` berasal dari event `state_snapshot` yang ditambahkan di V0.1.2-A.

Selama menunggu, agent tidak mengirim apa pun dan tidak punya timeout — flow
hanya lanjut setelah `approval_response` dengan `requestId` yang cocok diterima.

### Cek ketahanan terhadap malformed message

Dengan bridge jalan:

```bash
cd bridge
node -e 'const W=require("ws");const s=new W("ws://127.0.0.1:8787");s.on("open",()=>s.send("not json"));s.on("message",d=>console.log(d.toString()));setTimeout(()=>process.exit(0),1000)'
```

Bridge membalas `{"type":"error","payload":{"message":"invalid JSON"}}` dan tetap
running.

---

## V0.1.2-A — Bridge State & Reconnect

Bridge menjadi **source of truth** untuk state agent. Client hanya menampilkan
salinan state; ia tidak menyimpan kebenaran apa pun selain status koneksinya
sendiri.

```text
Client A ─┐
          ├── Bridge ─── Fake Agent   (state ada di sini)
Client B ─┘
```

### State model

| Agent state | Arti |
| --- | --- |
| `IDLE` | Tidak sedang mengerjakan apa pun |
| `WORKING` | Sedang bekerja |
| `WAITING_APPROVAL` | Berhenti, menunggu jawaban user |

| Approval state | Arti |
| --- | --- |
| `NONE` | Belum pernah ada approval request |
| `PENDING` | Ada request yang menunggu jawaban |
| `APPROVED` / `DENIED` | Hasil request terakhir |

Connection state (`DISCONNECTED` / `CONNECTING` / `CONNECTED`) adalah state lokal
client dan tidak pernah dikirim ke bridge.

### Event baru: `state_snapshot`

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

Dikirim saat client connect (selalu tepat setelah `connection`) dan setiap kali
state berubah — di-broadcast ke semua client. Envelope event lama tidak berubah.

### Reconnect

Disconnect adalah urusan client, bukan agent. Bridge hanya membuang socket-nya.

| Saat disconnect | Setelah reconnect |
| --- | --- |
| Agent `WORKING` | tetap `WORKING`, tidak jatuh ke `IDLE` |
| Approval `PENDING` | tetap `PENDING` dengan `requestId` yang sama |

Kalau semua client putus saat approval `PENDING`, agent **tetap menunggu** — tidak
ada auto approve, auto deny, timeout, atau cancel. Client yang reconnect membaca
`requestId` dari snapshot lalu menjawab seperti biasa.

Coba sendiri dengan dua terminal client berurutan:

```bash
# terminal 1
cd bridge && npm run dev

# terminal 2 — connect lalu pergi tanpa menjawab
cd bridge && npm run client < /dev/null

# terminal 2 — reconnect, approval-nya masih menunggu
cd bridge && npm run client
```

Client kedua langsung melihat prompt approval walaupun event `approval_request`
sudah lewat sebelum ia connect, karena promptnya dibangun dari snapshot.

### Test

```bash
cd bridge
npm test
```

Test menyalakan bridge sendiri di port 8788 (tidak bentrok dengan 8787) dan
memeriksa delapan behavior:

| # | Behavior |
| --- | --- |
| 1 | Urutan saat connect: `connection` lalu `state_snapshot` (IDLE/NONE) |
| 2 | Disconnect saat `WORKING` → reconnect tetap `WORKING` |
| 3 | Disconnect saat `PENDING` → agent tetap menunggu, tanpa event apa pun |
| 4 | Reconnect melihat approval `PENDING` beserta `requestId` |
| 5 | Approval valid dari client yang reconnect → agent lanjut |
| 6 | `requestId` salah → `error`, state tidak berubah |
| 7 | Perubahan state di-broadcast ke dua client sekaligus |
| 8 | Disconnect tidak mengubah state agent, agent tidak restart |

### Catatan

- Agent jalan **sekali per proses bridge**, dipicu client pertama yang connect.
  Reconnect tidak pernah me-restart agent. Restart bridge untuk mengulang skenario.
- Fake Agent memakai jeda kerja simulasi 2 detik supaya state `WORKING` bisa
  diamati. Ini durasi kerja, bukan timeout approval — approval tidak punya timeout.
- State hanya in-memory. Bridge mati = state hilang. Persistence menunggu
  integrasi agent sungguhan.

---

## V0.1.2-B.1 — Android WebSocket Connection Client

HP Android bisa connect ke bridge dan menampilkan state agent. Stack:
**Expo + React Native (TypeScript)**.

Milestone ini **read-only**: app hanya menerima dan menampilkan. App tidak
mengirim message apa pun, jadi tidak bisa mengubah state agent. Approval tetap
dijawab lewat test client di laptop.

Cara HP menjangkau bridge dibahas di V0.1.2-B.2 di bawah. Detail app:
[`mobile/README.md`](mobile/README.md).

### Yang bisa dilakukan app

- Menampilkan connection state, agent state, dan approval state.
- Menampilkan log `agent_output` dan `error`.
- Menampilkan panel **Approval / Pending** beserta pesannya saat agent menunggu
  — read-only, tanpa tombol.
- Membuka app di tengah approval yang sudah `PENDING` dan tetap melihat approval
  itu, karena tampilannya dibangun dari `state_snapshot`, bukan dari event
  `approval_request` yang mungkin sudah lewat.
- Connect / Disconnect manual. Bridge URL tidak bisa diubah dari UI.

---

## V0.1.2-B.2 — Wireless LAN Connectivity

Arah connectivity jadi **wireless-first**. Tidak ada USB, `adb reverse`, atau
Android Studio.

```text
📱 AI Agent Remote
       │
       │ Wi-Fi / LAN
       ▼
💻 Agent Bridge
       │
       ▼
🤖 Coding Agent
```

### Security boundary

| Host | Artinya |
| --- | --- |
| `127.0.0.1` (default) | Hanya bisa dihubungi dari laptop itu sendiri. Aman. |
| `0.0.0.0` | Bisa dihubungi dari interface jaringan mana pun yang tersedia — termasuk perangkat lain di Wi-Fi yang sama. |

`0.0.0.0` **bukan** default dan harus diminta secara eksplisit.

> **LAN mode is development-only and currently unauthenticated.**
> **Do not expose the bridge port to the public internet.**

Siapa pun di jaringan lokal yang tahu alamat dan port bisa connect dan membaca
state agent. Belum ada authentication, pairing, atau enkripsi — itu milestone
tersendiri. Jangan port-forward, jangan taruh di belakang tunnel publik.

### Bridge: host & port dari environment

| Variable | Default | Keterangan |
| --- | --- | --- |
| `BRIDGE_HOST` | `127.0.0.1` | Alamat bind |
| `BRIDGE_PORT` | `8787` | TCP port, 1–65535 |

Nilai yang tidak valid tidak membuat bridge mati — bridge memberi peringatan
lalu memakai default yang aman.

Default (loopback):

```bash
cd bridge
npm run dev
```

LAN mode:

```bash
cd bridge
BRIDGE_HOST=0.0.0.0 BRIDGE_PORT=8787 npm run dev
```

Outputnya jelas menandai keadaan ini:

```text
AI Agent Remote Bridge
Status: running
WebSocket: ws://0.0.0.0:8787
[bridge] Listening di 0.0.0.0: bridge bisa dihubungi dari jaringan lokal.
[bridge] LAN mode is development-only and currently unauthenticated.
[bridge] Do not expose the bridge port to the public internet.
```

### Mencari IP LAN laptop

macOS:

```bash
ipconfig getifaddr en0            # Wi-Fi
route -n get default | grep interface   # kalau bukan en0
```

Linux:

```bash
hostname -I
```

Windows:

```powershell
ipconfig
```

### Android: mengarahkan app ke IP laptop

Tidak ada IP yang di-hardcode dan tidak ada editor URL di UI. Host diberikan
lewat environment variable Expo saat menjalankan dev server:

```bash
cd mobile
EXPO_PUBLIC_BRIDGE_HOST=192.168.1.42 npm start
```

Ganti dengan IP laptop Anda sendiri. `EXPO_PUBLIC_BRIDGE_PORT` juga tersedia dan
default-nya `8787`. Tanpa env var, app menembak `127.0.0.1` — berguna untuk
`npm run web` di laptop, tapi tidak akan berhasil dari HP.

Ini **sementara**. Mekanismenya akan diganti local discovery di milestone
berikutnya, jadi jangan diperlakukan sebagai arsitektur final.

### Syarat

- HP dan laptop harus di **jaringan lokal yang sama**.
- Wi-Fi dengan client isolation (umum di jaringan publik/hotel) akan memblokir
  koneksi ini.
- Firewall laptop harus mengizinkan koneksi masuk ke port tersebut.

### Status verifikasi

| Verifikasi | Hasil |
| --- | --- |
| bridge typecheck / build | ✅ |
| bridge tests (config + state, 8 skenario) | ✅ tidak ada regresi |
| Default tetap loopback-only (LAN ditolak) | ✅ diuji |
| LAN mode bind `*:8787` + warning tampil | ✅ diuji |
| Test A–E lewat alamat LAN laptop | ✅ diuji dengan client Node |
| mobile typecheck | ✅ |
| `EXPO_PUBLIC_BRIDGE_HOST` ter-inline ke bundle Android | ✅ diuji |
| **Test A–E dari HP Android fisik** | ❌ **belum** |

Belum ada perangkat Android untuk diuji. Test A–E dijalankan dengan client Node
yang connect ke `ws://<IP-LAN-laptop>:8787` — itu membuktikan bridge menerima
koneksi lewat alamat LAN, bukan membuktikan HP sungguhan bisa menembus jaringan.

Langkah berikutnya: test dari HP Android fisik di Wi-Fi yang sama.
