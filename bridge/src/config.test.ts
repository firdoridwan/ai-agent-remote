/**
 * Test V0.1.2-B.2: resolusi BRIDGE_HOST / BRIDGE_PORT.
 *
 * Intinya satu: environment variable seburuk apa pun tidak boleh membuat bridge
 * gagal jalan. Yang invalid turun ke default yang aman.
 */

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  resolveBridgeConfig,
} from "./config.js";

const say = (message = ""): void => {
  process.stdout.write(`${message}\n`);
};

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    say(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  say(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

say("\nAI Agent Remote — V0.1.2-B.2 bridge config tests\n");

say("Default aman");
{
  const config = resolveBridgeConfig({});
  check("tanpa env, host = 127.0.0.1", config.host === DEFAULT_HOST, config.host);
  check("tanpa env, port = 8787", config.port === DEFAULT_PORT, String(config.port));
  check("tanpa env, tidak terbuka ke jaringan", config.exposedToNetwork === false);
  check("tanpa env, tanpa warning", config.warnings.length === 0);
}

say("\nNilai valid dipakai");
{
  const config = resolveBridgeConfig({
    BRIDGE_HOST: "0.0.0.0",
    BRIDGE_PORT: "9000",
  });
  check("host terbaca", config.host === "0.0.0.0", config.host);
  check("port terbaca", config.port === 9000, String(config.port));
  check("ditandai terbuka ke jaringan", config.exposedToNetwork === true);
  check(
    "ada warning LAN unauthenticated",
    config.warnings.some((w) => w.includes("unauthenticated")),
  );
  check(
    "ada warning jangan expose ke internet",
    config.warnings.some((w) => w.includes("public internet")),
  );
}

say("\nHostname dan IPv6");
{
  check(
    "hostname biasa diterima",
    resolveBridgeConfig({ BRIDGE_HOST: "my-laptop.local" }).host ===
      "my-laptop.local",
  );
  check(
    "IPv6 loopback diterima",
    resolveBridgeConfig({ BRIDGE_HOST: "::1" }).host === "::1",
  );
  check(
    ":: dianggap terbuka ke jaringan",
    resolveBridgeConfig({ BRIDGE_HOST: "::" }).exposedToNetwork === true,
  );
  check(
    "127.0.0.1 tidak dianggap terbuka",
    resolveBridgeConfig({ BRIDGE_HOST: "127.0.0.1" }).exposedToNetwork === false,
  );
}

say("\nHost invalid turun ke default");
{
  const invalidHosts = [
    "ws://192.168.1.10",
    "192.168.1.10:8787",
    "192.168.1.10/api",
    "has space",
    "   ",
    "",
  ];
  for (const value of invalidHosts) {
    const config = resolveBridgeConfig({ BRIDGE_HOST: value });
    check(
      `host ${JSON.stringify(value)} → ${DEFAULT_HOST}`,
      config.host === DEFAULT_HOST,
      config.host,
    );
  }
}

say("\nPort invalid turun ke default");
{
  const invalidPorts = ["0", "-1", "70000", "65536", "abc", "80.5", "8787abc", " ", ""];
  for (const value of invalidPorts) {
    const config = resolveBridgeConfig({ BRIDGE_PORT: value });
    check(
      `port ${JSON.stringify(value)} → ${DEFAULT_PORT}`,
      config.port === DEFAULT_PORT,
      String(config.port),
    );
  }
  check("port batas bawah 1 diterima", resolveBridgeConfig({ BRIDGE_PORT: "1" }).port === 1);
  check(
    "port batas atas 65535 diterima",
    resolveBridgeConfig({ BRIDGE_PORT: "65535" }).port === 65_535,
  );
}

say("\nEnv invalid tetap menghasilkan config yang bisa dipakai");
{
  const config = resolveBridgeConfig({
    BRIDGE_HOST: "not a host!!",
    BRIDGE_PORT: "definitely-not-a-port",
  });
  check("host jatuh ke default", config.host === DEFAULT_HOST, config.host);
  check("port jatuh ke default", config.port === DEFAULT_PORT, String(config.port));
  check("dua warning muncul", config.warnings.length === 2, String(config.warnings.length));
}

say(failures === 0 ? "\nSemua test lolos.\n" : `\n${failures} test GAGAL.\n`);
process.exit(failures === 0 ? 0 : 1);
