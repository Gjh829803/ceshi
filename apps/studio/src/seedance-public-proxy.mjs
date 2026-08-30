import process from "node:process";

import {
  createStudioPublicProxy,
  isAllowedSeedancePublicRequest,
} from "./public-proxy.mjs";

const port = Number(process.env.WORLDKIT_SEEDANCE_PUBLIC_PORT ?? 4398);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("WORLDKIT_SEEDANCE_PUBLIC_PORT must be a valid TCP port.");
}

const server = createStudioPublicProxy({
  anonymous: true,
  targetOrigin: process.env.WORLDKIT_SEEDANCE_PUBLIC_TARGET ?? "http://127.0.0.1:4297",
  isAllowedRequest: isAllowedSeedancePublicRequest,
  rootRedirect: "/?public=seedance#seedance-review",
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
process.stdout.write(`WorldKit Seedance public gateway: http://127.0.0.1:${port}\n`);

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
