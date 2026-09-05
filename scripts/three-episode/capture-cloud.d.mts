import type { CaptureSummary } from './capture.js';
import type { CloudClient } from './cloud.mjs';
export function createCaptureDispatcher(options: {runtimeConfig: Record<string, unknown>; cloud?: CloudClient; onProgress?: (event: any) => void}): {
 run(options: { sourceManifestPath: string; planPath: string; outputRoot: string; worldBuildHash: string; segmentIds?: string[] }): Promise<CaptureSummary>;
};
