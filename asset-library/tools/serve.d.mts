import type {Server} from 'node:http';

export interface ViewerStaticFile {
  path: string;
  mime_type: string;
}

export function copyViewer(libraryRoot: string, publishedRoot: string): ViewerStaticFile[];
export function createServer(publishedRoot?: string, options?: {
  artifactBaseUrl?: string;
  staticFiles?: ViewerStaticFile[];
}): Server;
