/**
 * Satu alamat tetap untuk milestone V0.1.2-B.1. Tidak ada input di UI.
 *
 * HP fisik menembak loopback-nya sendiri, lalu diteruskan ke laptop lewat
 * `adb reverse tcp:8787 tcp:8787`. Dengan begitu bridge tetap bind ke
 * 127.0.0.1 dan tidak ada port yang terbuka ke jaringan.
 *
 * File ini sengaja tanpa import, supaya bisa dipakai app (lewat Metro) dan
 * smoke test (lewat Node) sekaligus.
 */
export const BRIDGE_URL = "ws://127.0.0.1:8787";
