import type { CaptureSummary } from './capture.js';
import type { CloudClient } from '../cloud/cloud.mjs';
export function createCaptureDispatcher(options: {runtimeConfig: Record<string, unknown>; cloud?: CloudClient; queue?: any; onProgress?: (event: any) => void}): {
 run(options: { sourceManifestPath: string; planPath: string; outputRoot: string; worldBuildHash: string; segmentIds?: string[]; caseId?: string; cohortId?: string; continuation?: any }): Promise<CaptureSummary>;
};
