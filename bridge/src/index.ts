import { startBridge } from "./bridge.js";

const HOST = "127.0.0.1";
const PORT = 8787;

const server = startBridge({ host: HOST, port: PORT });

server.on("listening", () => {
  console.log("AI Agent Remote Bridge");
  console.log("Status: running");
  console.log(`WebSocket: ws://${HOST}:${PORT}`);
});
