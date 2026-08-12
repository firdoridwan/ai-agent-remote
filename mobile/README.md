# mobile

Android app (Expo + React Native, TypeScript) sebagai remote untuk Local Bridge.

Milestone: **V0.1.2-B.2 — Wireless LAN Connectivity**.

App tetap **read-only** seperti V0.1.2-B.1. App hanya connect, menerima, dan
menampilkan. App tidak pernah mengirim message apa pun ke bridge, jadi tidak
bisa mengubah state agent.

Koneksi lewat **Wi-Fi / LAN**. Tidak ada USB, `adb reverse`, atau Android Studio.

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

Dibentuk di `src/config.ts` dari environment variable Expo:

```text
ws://${EXPO_PUBLIC_BRIDGE_HOST}:${EXPO_PUBLIC_BRIDGE_PORT}
```

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_BRIDGE_HOST` | `127.0.0.1` |
| `EXPO_PUBLIC_BRIDGE_PORT` | `8787` |

Tidak ada IP yang di-hardcode dan tidak ada editor URL di UI. Nilainya
di-substitusi Metro saat bundling.

> Ini mekanisme **development sementara**. Akan diganti local discovery di
> milestone berikutnya.

## Menjalankan

Butuh Node.js dan **Expo Go** di HP Android. Tidak perlu Android Studio, tidak
perlu kabel.

### 1. HP dan laptop di Wi-Fi yang sama

Wi-Fi dengan client isolation (umum di jaringan publik) akan memblokir koneksi
ini.

### 2. Cari IP LAN laptop

```bash
ipconfig getifaddr en0     # macOS, Wi-Fi
hostname -I                # Linux
ipconfig                   # Windows
```

Misalnya hasilnya `192.168.1.42`.

### 3. Jalankan bridge dalam LAN mode

```bash
cd bridge
BRIDGE_HOST=0.0.0.0 npm run dev
```

Tanpa `BRIDGE_HOST=0.0.0.0`, bridge hanya mendengar di loopback dan HP tidak
akan bisa connect.

### 4. Jalankan app dengan IP laptop

```bash
cd mobile
npm install
EXPO_PUBLIC_BRIDGE_HOST=192.168.1.42 npm start
```

Scan QR-nya dengan Expo Go.

## Peringatan

> **LAN mode is development-only and currently unauthenticated.**
> **Do not expose the bridge port to the public internet.**

Siapa pun di jaringan lokal yang tahu alamat dan port bisa connect dan membaca
state agent. Belum ada authentication, pairing, atau enkripsi.

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
