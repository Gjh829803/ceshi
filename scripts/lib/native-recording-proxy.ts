import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import { isNativeRecordingRequest, type NativeRecordingBinding } from "./native-recording-binding.js";

export function createNativeRecordingProxy(input: {
  readonly binding: NativeRecordingBinding;
  readonly shellOrigin: string;
}) {
  const { binding, shellOrigin } = input;
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", shellOrigin);
    if (!url.pathname.startsWith("/api/")) { next(); return; }
    // Same-origin shell requests only. Runtime uses its own server, which does
    // not install this middleware or receive the capability in its environment.
    if (request.headers.host !== new URL(shellOrigin).host ||
        request.headers.origin !== undefined && request.headers.origin !== shellOrigin ||
        request.headers["sec-fetch-site"] === "cross-site" ||
        !isNativeRecordingRequest(binding.sceneId, request.method ?? "", url.pathname)) {
      response.writeHead(404); response.end(); return;
    }
    const headers: Record<string, string> = { "x-worldkit-native-recording-capability": binding.capability };
    for (const name of ["content-type", "content-length", "x-worldkit-recording-duration-ms", "range", "if-none-match"]) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const upstream = httpRequest(new URL(`${url.pathname}${url.search}`, binding.studioOrigin), {
      method: request.method, headers,
    }, result => {
      const outputHeaders: OutgoingHttpHeaders = { "cache-control": "private, no-store" };
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "etag"]) {
        const value = result.headers[name];
        if (value !== undefined) outputHeaders[name] = value;
      }
      response.writeHead(result.statusCode ?? 502, outputHeaders);
      result.on("error", () => response.destroy());
      result.pipe(response);
    });
    upstream.on("error", () => {
      if (!response.headersSent) { response.writeHead(502); response.end("Recording service unavailable"); }
      else response.destroy();
    });
    request.once("aborted", () => upstream.destroy());
    response.once("close", () => upstream.destroy());
    request.pipe(upstream);
  };
}
