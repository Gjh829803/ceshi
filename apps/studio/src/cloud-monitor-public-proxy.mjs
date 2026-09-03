import process from "node:process";

import {
  createStudioPublicProxy,
  isAllowedCloudMonitorPublicRequest,
} from "./public-proxy.mjs";

const port = Number(process.env.WORLDKIT_CLOUD_MONITOR_PORT ?? 4175);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("WORLDKIT_CLOUD_MONITOR_PORT must be a valid TCP port.");
}

const server = createStudioPublicProxy({
  anonymous: true,
  targetOrigin: process.env.WORLDKIT_CLOUD_MONITOR_TARGET ?? "http://127.0.0.1:4197",
  isAllowedRequest: isAllowedCloudMonitorPublicRequest,
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", resolve);
});
process.stdout.write(`WorldKit read-only Cloud monitor: http://0.0.0.0:${port}\n`);

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
