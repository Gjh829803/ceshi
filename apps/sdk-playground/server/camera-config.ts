import { createHash, randomBytes } from 'node:crypto';
import { link, lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { parseCameraDocument, serializeCameraDocument } from '@worldkit/three';
import { CAMERA_PROJECT_FILES } from '../src/camera/project-files';
import type { CameraFileRead } from '../src/camera/file-contract';
const prefix = '/__camera-config/';
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const loopback = (address: string | undefined) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
class FileError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function registry(root: string) { return new Map(Object.entries(CAMERA_PROJECT_FILES).map(([id, file]) => [id, path.resolve(root, file)])); }
/** Reject symlink components even when their destination is inside the project. */
async function checkedPath(root: string, file: string) {
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== path.resolve(root)) throw new FileError(403, 'CAMERA_FILE_ROOT_SYMLINK');
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new FileError(403, 'CAMERA_FILE_PATH');
  let current = root;
  const parts = relative.split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]!);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new FileError(403, 'CAMERA_FILE_PATH');
      if (await realpath(current) !== current) throw new FileError(403, 'CAMERA_FILE_PATH');
    } catch (error) {
      if (missing(error) && index === parts.length - 1) return;
      throw error;
    }
  }
}
async function readCurrent(root: string, file: string): Promise<CameraFileRead> {
  await checkedPath(root, file);
  try {
    const bytes = await readFile(file);
    return { status: 'present', fileSha256: sha(bytes), document: parseCameraDocument(JSON.parse(bytes.toString('utf8'))) };
  } catch (error) { if (missing(error)) return { status: 'missing' }; throw error; }
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new FileError(400, 'CAMERA_FILE_CONTENT_TYPE');
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new FileError(413, 'CAMERA_FILE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FileError(400, 'CAMERA_FILE_REQUEST');
  return value as Record<string, unknown>;
}
/** Read-only adapter, also usable by static builds. One Buffer supplies BOTH exports. */
export function cameraDocumentPlugin(root: string): Plugin {
  const files = new Set(registry(path.resolve(root)).values());
  return {
    name: 'playground-camera-document', enforce: 'pre',
    async load(id) {
      if (!id.endsWith('?camera-document')) return;
      // Vite normalizes module IDs to slashes, while the registry uses native paths.
      const file = path.resolve(id.slice(0, -'?camera-document'.length));
      if (!files.has(file)) throw new Error('CAMERA_IMPORT_UNKNOWN');
      await checkedPath(path.resolve(root), file);
      const bytes = await readFile(file);
      const document = parseCameraDocument(JSON.parse(bytes.toString('utf8')));
      this.addWatchFile(file);
      return `export const fileSha256=${JSON.stringify(sha(bytes))};\nexport default ${JSON.stringify(document)};`;
    },
  };
}
/** Dev-only capability. Never registered for preview or externally bound dev. */
export function cameraFileServicePlugin(projectRoot: string): Plugin {
  const root = path.resolve(projectRoot), files = registry(root);
  const session = randomBytes(32).toString('hex');
  const queues = new Map<string, Promise<unknown>>();
  return {
    name: 'playground-camera-file-service', apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (server.config.server.host !== '127.0.0.1' && server.config.server.host !== '::1') return;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
        const reply = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
        try {
          const address = server.httpServer?.address();
          if (!address || typeof address === 'string' || !loopback(address.address) || !loopback(req.socket.remoteAddress)) throw new FileError(403, 'CAMERA_FILE_LOCAL_ONLY');
          const origin = `${server.config.server.https ? 'https' : 'http'}://${address.family === 'IPv6' ? '[::1]' : '127.0.0.1'}:${address.port}`;
          if (req.headers.origin !== origin || req.headers.host !== new URL(origin).host || req.method !== 'POST') throw new FileError(403, 'CAMERA_FILE_ORIGIN');
          const route = req.url.slice(prefix.length);
          if (!['session', 'read', 'save'].includes(route)) throw new FileError(404, 'CAMERA_FILE_ROUTE');
          if (route !== 'session' && req.headers['x-camera-session'] !== session) throw new FileError(403, 'CAMERA_FILE_SESSION');
          const input = await body(req);
          const allowed = route === 'session' ? [] : route === 'read' ? ['configurationId'] : ['configurationId','expectedFileSha256','document'];
          if (Object.keys(input).some(key => !allowed.includes(key))) throw new FileError(400, 'CAMERA_FILE_REQUEST');
          if (route === 'session') return reply(200, { session });
          const file = typeof input.configurationId === 'string' ? files.get(input.configurationId) : undefined;
          if (!file) throw new FileError(400, 'CAMERA_FILE_ID');
          const operation = async () => {
            const current = await readCurrent(root, file);
            if (route === 'read') return reply(200, current);
            const expected = input.expectedFileSha256;
            if (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))) throw new FileError(400, 'CAMERA_FILE_SHA');
            const bytes = serializeCameraDocument(parseCameraDocument(input.document));
            const matches = (value: CameraFileRead) => (value.status === 'missing' ? null : value.fileSha256) === expected;
            if (!matches(current)) return reply(409, { status: 'conflict', current });
            const temporary = `${file}.${randomBytes(12).toString('hex')}.tmp`;
            try {
              await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
              // Recheck after staging to detect external edits during serialization/I/O.
              const latest = await readCurrent(root, file);
              if (!matches(latest)) return reply(409, { status: 'conflict', current: latest });
              if (expected === null) {
                try { await link(temporary, file); } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
                  return reply(409, { status: 'conflict', current: await readCurrent(root, file) });
                }
              } else await rename(temporary, file);
            } finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
            reply(200, { status: 'saved', fileSha256: sha(bytes), document: parseCameraDocument(JSON.parse(bytes)) });
          };
          const previous = queues.get(file) ?? Promise.resolve();
          const pending = previous.catch(() => {}).then(operation); queues.set(file, pending);
          try { await pending; } finally { if (queues.get(file) === pending) queues.delete(file); }
        } catch (error) {
          reply(error instanceof FileError ? error.status : 400, { error: error instanceof FileError ? error.message : 'CAMERA_FILE_INVALID_OR_UNAVAILABLE' });
        }
      });
    },
  };
}
export function cameraConfigPlugin(root: string): Plugin[] { return [cameraDocumentPlugin(root), cameraFileServicePlugin(root)]; }
