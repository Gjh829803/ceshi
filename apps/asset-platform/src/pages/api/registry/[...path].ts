import path from "node:path";
import { access } from "node:fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import { createRegistryHandler } from "@worldkit/asset-library/registry-server";

// Preserve the Registry's streaming body limit, range responses and error contract.
export const config = { api: { bodyParser: false, responseLimit: false } };
let handler: ReturnType<typeof createRegistryHandler> | undefined;
export default async function registry(req: NextApiRequest, res: NextApiResponse) {
  try {
    const root = process.env.ASSET_PUBLICATION_ROOT;
    if (!root || !path.isAbsolute(root)) throw new Error("ASSET_PUBLICATION_ROOT must be an absolute published directory");
    if (!handler) await access(path.join(root, "registry.json"));
    handler ??= createRegistryHandler(root, {
      ...(process.env.ASSET_ARTIFACT_BASE_URL ? { artifactBaseUrl: process.env.ASSET_ARTIFACT_BASE_URL } : {}),
      ...(process.env.ASSET_PUBLIC_URL ? { publicBaseUrl: process.env.ASSET_PUBLIC_URL } : {}),
    });
    // Next rewrites keep protocol routes public; direct API requests use the same handler.
    req.url = (req.url || "/").replace(/^\/api\/registry(?=\/)/, "");
    await handler(req, res);
  } catch {
    res.status(503).json({error:{code:"ASSET_REGISTRY_UNAVAILABLE",message:"Published asset data is not configured or unavailable",retryable:true,details:{}}});
  }
}
