import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {createHumanReviewHandler} from '../review/human-review-store.mjs';
import {createRejectionPublisher} from '../review/rejection-publisher.mjs';

/** Local artifact preview with byte ranges so native video controls can seek. */
export async function serveEpisodePreview({ root, port = 53747, policyS3Uri }) {
  const directory = await realpath(root);
  const inside = file => { const relative = path.relative(directory, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
  const mime = { '.html':'text/html; charset=utf-8', '.json':'application/json', '.mp4':'video/mp4', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.css':'text/css', '.js':'text/javascript' };
  const humanReview = createHumanReviewHandler(directory,{onSaved:createRejectionPublisher(directory,policyS3Uri)});
  const server = createServer(async (request, response) => {
    try {
      if (new URL(request.url,'http://localhost').pathname === '/human-ten/api/reviews') { await humanReview(request,response); return; }
      if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const url = new URL(request.url, 'http://localhost');
      let file = path.resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      if (!inside(file)) { response.writeHead(403).end(); return; }
      if ((await stat(file)).isDirectory()) file = path.join(file,'index.html');
      file = await realpath(file);
      if (!inside(file)) { response.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const headers = { 'Content-Type':mime[path.extname(file)]??'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-cache' };
      let start = 0, end = info.size-1, status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size-Number(match[2]));
          end = match[1] && match[2] ? Math.min(info.size-1, Number(match[2])) : info.size-1;
        } else start = Infinity;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      response.writeHead(status, { ...headers, 'Content-Length': Math.max(0,end-start+1) });
      if (request.method === 'HEAD' || info.size === 0) { response.end(); return; }
      const stream = createReadStream(file,{start,end});
      stream.on('error',() => response.destroy()); response.on('close',() => stream.destroy()); stream.pipe(response);
    } catch (error) { if (!response.headersSent) response.writeHead(error.code==='ENOENT'?404:400); response.end(); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node packages/episode-pipeline/src/cli/preview-server.mjs REPORT_DIRECTORY [PORT]');
  const server = await serveEpisodePreview({root:process.argv[2],port:Number(process.argv[3]??53747),policyS3Uri:process.argv[4]});
  console.log(JSON.stringify({pid:process.pid,address:server.address(),root:path.resolve(process.argv[2])}));
}
