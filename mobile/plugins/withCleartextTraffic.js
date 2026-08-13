/**
 * Expo config plugin: izinkan cleartext traffic di semua build type.
 *
 * Kenapa perlu:
 * targetSdk 36 membuat Android memblokir koneksi non-TLS secara default. App
 * memakai `ws://` ke bridge di LAN, jadi tanpa flag ini WebSocket-nya langsung
 * gagal dan app tidak pernah CONNECTED.
 *
 * Expo hanya menambahkan flag ini pada manifest overlay debug (untuk Metro),
 * sehingga build release ikut terblokir. Plugin ini menaruhnya di manifest
 * utama supaya release ikut terkena.
 *
 * Kenapa tidak pakai networkSecurityConfig yang lebih sempit:
 * network security config hanya menerima domain/IP satu per satu, bukan CIDR.
 * IP LAN laptop berubah-ubah per jaringan, jadi daftar itu tidak praktis.
 *
 * Konsekuensi keamanan: app boleh melakukan koneksi cleartext ke alamat mana
 * pun, bukan hanya LAN. Bisa diterima selama bridge masih development-only dan
 * unauthenticated. Saat protocol pindah ke `wss://`, plugin ini harus dihapus.
 */

const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults,
    );
    application.$["android:usesCleartextTraffic"] = "true";
    return config;
  });
};
