import type { EpisodeSourceManifest } from './contracts.js';
import type { CloudClient } from './cloud.mjs';
export function runThreeEpisodeVisuals(options: {source: EpisodeSourceManifest; capture: unknown; episodeId: string; outputRoot: string; cloud: CloudClient; onProgress?: (state: any) => Promise<void>; stopBeforeSeedance: true; referenceStyleVariantId?: string; stylePlanCandidate?: {path:string;sha256:string}}): Promise<{status: string; preparedRequestCount: number; providerVideoSubmissionCount: number}>;
