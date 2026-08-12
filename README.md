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
├── bridge/              # Local bridge (Node.js + TypeScript)
│   ├── src/
│   │   └── index.ts     # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/              # Placeholder Android app
│
├── protocol/            # Placeholder shared message/event schema
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
```

### Script yang tersedia

| Command | Keterangan |
| --- | --- |
| `npm run dev` | Jalankan dari source dengan auto-reload (tsx watch) |
| `npm start` | Jalankan sekali dari source, tanpa watch |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm run serve` | Jalankan hasil build (`node dist/index.js`) |
| `npm run typecheck` | Type check tanpa emit |
