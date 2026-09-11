export function enqueueDeliveredWorld(options: {outboxRoot: string; worldBuildHash: string; profileHash: string; sourceManifestPath: string; sourceManifestSha256: string; episodeId: string}): Promise<{created: boolean; event: Record<string, unknown>}>;
export function readDeliveryEvents(root: string): Promise<Record<string, unknown>[]>;
