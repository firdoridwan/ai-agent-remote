# mobile

Android app (Expo + React Native, TypeScript) sebagai remote untuk Local Bridge.

Milestone: **V0.1.2-B.1 — Android WebSocket Connection Client**.

Milestone ini **read-only**. App hanya connect, menerima, dan menampilkan. App
tidak pernah mengirim message apa pun ke bridge, jadi tidak bisa mengubah state
agent.

## Yang ditampilkan

- Connection state (`DISCONNECTED` / `CONNECTING` / `CONNECTED`) — satu-satunya
  state milik client.
- Agent state + approval state dari `state_snapshot` milik bridge.
- Saat approval menunggu: panel **Approval / Pending** beserta pesannya, tanpa
  tombol. Approval dijawab lewat test client di laptop (`bridge/npm run client`).
- Log `agent_output` dan `error`.
- Tombol Connect / Disconnect manual.

Bridge tetap source of truth. App tidak menyimpan kebenaran apa pun selain
status koneksinya sendiri.

## Bridge URL

Tetap, tidak bisa diubah dari UI:

```text
ws://127.0.0.1:8787
```

Nilainya ada di `src/config.ts`.

## Menjalankan

Butuh Node.js dan **Expo Go** terpasang di HP Android. Tidak perlu Android
Studio.

### 1. Sambungkan HP lewat USB

Butuh `adb` (Android platform-tools). Kalau belum ada:

```bash
brew install --cask android-platform-tools
```

Aktifkan USB debugging di HP, lalu:

```bash
adb devices                        # pastikan HP terdeteksi
adb reverse tcp:8787 tcp:8787      # bridge
adb reverse tcp:8081 tcp:8081      # Metro (Expo)
```

`adb reverse` membuat `127.0.0.1:8787` di HP diteruskan ke laptop lewat USB.
Bridge tetap bind ke loopback — tidak ada yang terbuka ke jaringan.

### 2. Jalankan bridge

```bash
cd bridge
npm run dev
```

### 3. Jalankan app

```bash
cd mobile
npm install
npm start
```

Tekan `a` untuk membuka di Expo Go, atau scan QR-nya.

## Scripts

| Command | Keterangan |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run android` | Expo dev server, langsung buka di Android |
| `npm run web` | Buka app di browser — cara cepat mencoba tanpa HP |
| `npm run smoke` | Adu modul protocol app dengan bridge asli (butuh bridge jalan) |
| `npm run typecheck` | Type check |

`npm run web` memakai `react-dom`, `react-native-web`, dan `@expo/metro-runtime`.
Android tidak memakainya, tapi mereka dipertahankan karena berguna untuk
development tanpa perangkat.

## Catatan

- `src/protocol.ts` adalah **duplikat** dari `bridge/src/protocol.ts`, bukan
  import. Ini menghindari setup monorepo Metro untuk sekarang. Kalau protocol
  berubah, dua file itu harus diubah bersamaan. Rencananya disatukan ke folder
  `protocol/` saat shared package dibuat.
- Modul protocol di sini sengaja hanya punya parsing. Tidak ada pembuat event,
  supaya app benar-benar tidak punya cara mengirim apa pun. Tipe seperti
  `ApprovalResponsePayload` tetap ada sebagai dokumentasi.
- Reconnect masih manual lewat tombol Connect. Auto-retry belum dibuat.
- `ws://` (cleartext) jalan di Expo Go. Untuk standalone APK nanti perlu
  `usesCleartextTraffic` atau network security config.
