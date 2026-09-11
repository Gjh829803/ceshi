export interface CloudClient {
 cancelTrackedJob(remote: Record<string, any>): Promise<any>;
 runCodex(args: Record<string, unknown>): Promise<any>;
 generateImages(args: Record<string, unknown>): Promise<any>;
 generateEvents(args: Record<string, unknown>): Promise<any>;
 uploadArtifact(file: string, uri: string): Promise<any>;
 downloadArtifact(uri: string, file: string): Promise<any>;
 publishDirectory(root: string, uri: string): Promise<any>;
 hydrateDirectory(uri: string, root: string): Promise<any>;
}
export function createCloudClient(options?: Record<string, unknown>): CloudClient;
export const runCodex: CloudClient['runCodex'];
export const generateImages: CloudClient['generateImages'];
export const generateEvents: CloudClient['generateEvents'];
export const uploadArtifact: CloudClient['uploadArtifact'];
export const downloadArtifact: CloudClient['downloadArtifact'];
export const publishDirectory: CloudClient['publishDirectory'];
export const hydrateDirectory: CloudClient['hydrateDirectory'];
