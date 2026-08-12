import { startBridge } from "./bridge.js";
import { resolveBridgeConfig } from "./config.js";

const config = resolveBridgeConfig(process.env);

const server = startBridge({ host: config.host, port: config.port });

server.on("listening", () => {
  console.log("AI Agent Remote Bridge");
  console.log("Status: running");
  console.log(`WebSocket: ws://${config.host}:${config.port}`);

  for (const warning of config.warnings) {
    console.log(`[bridge] ${warning}`);
  }
});
