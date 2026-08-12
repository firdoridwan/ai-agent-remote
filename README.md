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
│   │   ├── index.ts         # Entry point + WebSocket server
│   │   ├── protocol.ts      # Tipe envelope + parsing/validasi
│   │   ├── fake-agent.ts    # Simulasi agent (approval flow)
│   │   └── client.ts        # Test client terminal
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/                  # Placeholder Android app
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

### Script yang tersedia

| Command | Keterangan |
| --- | --- |
| `npm run dev` | Jalankan bridge dari source dengan auto-reload (tsx watch) |
| `npm start` | Jalankan bridge sekali dari source, tanpa watch |
| `npm run client` | Jalankan test client (butuh bridge yang sudah jalan) |
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

Connected.

🤖 Agent:
I need permission to continue.

Approval required.
[y] Yes
[n] No

> y

→ Sending approval...

🤖 Agent:
Approval received. Continuing...
```

Jawab `n`:

```text
> n

→ Sending denial...

🤖 Agent:
Approval denied. Stopping...
```

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
