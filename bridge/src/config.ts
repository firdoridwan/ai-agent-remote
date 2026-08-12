/**
 * Konfigurasi host/port bridge dari environment variable.
 *
 * Default sengaja loopback: bridge tidak terjangkau dari jaringan kecuali
 * dinyatakan secara eksplisit lewat BRIDGE_HOST.
 *
 * Environment variable yang tidak valid tidak boleh membuat bridge mati — kita
 * turun ke default yang aman dan memberi peringatan.
 */

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

/** Host yang menerima koneksi dari interface jaringan mana pun. */
const ANY_HOST = new Set(["0.0.0.0", "::", "[::]"]);

// Hostname/IPv4 (huruf, angka, titik, strip) atau IPv6 (hex + titik dua).
const HOSTNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const IPV6_PATTERN = /^[0-9A-Fa-f:]+$/;

export interface BridgeConfig {
  host: string;
  port: number;
  /** Hal yang perlu dicetak ke operator: env invalid, atau bridge terbuka ke LAN. */
  warnings: string[];
  /** true kalau bridge mendengar di semua interface, bukan loopback saja. */
  exposedToNetwork: boolean;
}

function isValidHost(value: string): boolean {
  return HOSTNAME_PATTERN.test(value) || IPV6_PATTERN.test(value);
}

function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return port;
}

export function resolveBridgeConfig(
  env: Record<string, string | undefined> = process.env,
): BridgeConfig {
  const warnings: string[] = [];

  let host = DEFAULT_HOST;
  const rawHost = env.BRIDGE_HOST?.trim();
  if (rawHost) {
    if (isValidHost(rawHost)) {
      host = rawHost;
    } else {
      warnings.push(
        `BRIDGE_HOST tidak valid (${env.BRIDGE_HOST ?? ""}), pakai ${DEFAULT_HOST}`,
      );
    }
  } else if (rawHost === "") {
    warnings.push(`BRIDGE_HOST kosong, pakai ${DEFAULT_HOST}`);
  }

  let port = DEFAULT_PORT;
  const rawPort = env.BRIDGE_PORT?.trim();
  if (rawPort) {
    const parsed = parsePort(rawPort);
    if (parsed !== null) {
      port = parsed;
    } else {
      warnings.push(
        `BRIDGE_PORT tidak valid (${env.BRIDGE_PORT ?? ""}), pakai ${DEFAULT_PORT}`,
      );
    }
  } else if (rawPort === "") {
    warnings.push(`BRIDGE_PORT kosong, pakai ${DEFAULT_PORT}`);
  }

  const exposedToNetwork = ANY_HOST.has(host);
  if (exposedToNetwork) {
    warnings.push(
      `Listening di ${host}: bridge bisa dihubungi dari jaringan lokal.`,
      "LAN mode is development-only and currently unauthenticated.",
      "Do not expose the bridge port to the public internet.",
    );
  }

  return { host, port, warnings, exposedToNetwork };
}
