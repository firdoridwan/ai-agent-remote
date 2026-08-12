/**
 * Alamat bridge untuk app.
 *
 * SEMENTARA — hanya untuk development.
 *
 * Host diisi lewat environment variable Expo saat menjalankan dev server, jadi
 * tidak ada IP yang di-hardcode dan tidak ada editor URL di UI:
 *
 *   EXPO_PUBLIC_BRIDGE_HOST=192.168.1.42 npm start
 *
 * Angka di atas cuma contoh. Pakai IP LAN laptop Anda sendiri; jangan
 * mengasumsikan subnet tertentu. Lihat README untuk cara mencarinya.
 *
 * Tanpa env var, app menembak loopback — berguna untuk `npm run web` di laptop
 * yang sama, tapi tidak akan berhasil dari HP.
 *
 * Mekanisme ini akan diganti local discovery pada milestone berikutnya, jadi
 * jangan diperlakukan sebagai arsitektur final.
 *
 * File ini sengaja tanpa import, supaya bisa dipakai app (lewat Metro) dan
 * smoke test (lewat Node) sekaligus.
 */

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "8787";

const host = process.env.EXPO_PUBLIC_BRIDGE_HOST?.trim() || DEFAULT_HOST;
const port = process.env.EXPO_PUBLIC_BRIDGE_PORT?.trim() || DEFAULT_PORT;

export const BRIDGE_URL = `ws://${host}:${port}`;
