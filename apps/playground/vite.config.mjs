import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_AUTHORING_BYTES = 8 * 1024 * 1024;

function writeJsonResponse(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

/** @returns {import("vite").Plugin} */
export function worldkitAuthoringSource() {
  return {
    name: "worldkit-authoring-source",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__worldkit/authoring-spec", (request, response) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          writeJsonResponse(response, 405, {
            diagnostics: [{
              severity: "error",
              code: "AUTHORING_SOURCE_METHOD_NOT_ALLOWED",
              instancePath: "",
              message: "The AuthoringSpec endpoint accepts only GET and HEAD.",
            }],
          });
          return;
        }
        void (async () => {
          const configuredPath = process.env.WORLDKIT_AUTHORING_SPEC_PATH;
          if (configuredPath === undefined || configuredPath.length === 0) {
            writeJsonResponse(response, 404, {
              diagnostics: [{
                severity: "error",
                code: "AUTHORING_SOURCE_NOT_CONFIGURED",
                instancePath: "",
                message: "WORLDKIT_AUTHORING_SPEC_PATH is not configured for this server.",
              }],
            });
            return;
          }
          const exactPath = path.resolve(configuredPath);
          const sourceStat = await stat(exactPath);
          if (!sourceStat.isFile()) throw new Error("Configured AuthoringSpec path is not a regular file.");
          if (sourceStat.size > MAX_AUTHORING_BYTES) {
            writeJsonResponse(response, 413, {
              diagnostics: [{
                severity: "error",
                code: "AUTHORING_JSON_TOO_LARGE",
                instancePath: "",
                message: `AuthoringSpec exceeds the ${MAX_AUTHORING_BYTES} byte server limit.`,
              }],
            });
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          response.end(await readFile(exactPath, "utf8"));
        })().catch((error) => {
          writeJsonResponse(response, 404, {
            diagnostics: [{
              severity: "error",
              code: "AUTHORING_SOURCE_UNAVAILABLE",
              instancePath: "",
              message: error instanceof Error ? error.message : String(error),
            }],
          });
        });
      });
    },
  };
}

/** @returns {import("vite").Plugin} */
function whiteboxArtifactWriter() {
  return {
    name: "whitebox-artifact-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__whitebox/write-triview", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("POST required");
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
          if (body.length > 24 * 1024 * 1024) request.destroy();
        });
        request.on("end", () => {
          void (async () => {
            const payload = JSON.parse(body);
            const idPattern = /^[a-z0-9][a-z0-9-]*$/;
            if (
              !idPattern.test(payload.sceneId ?? "") ||
              !idPattern.test(payload.prototypeId ?? "") ||
              !payload.dataUrl?.startsWith("data:image/png;base64,")
            ) {
              throw new Error("Invalid tri-view artifact payload.");
            }
            const png = Buffer.from(payload.dataUrl.slice("data:image/png;base64,".length), "base64");
            if (png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
              throw new Error("Tri-view payload is not a PNG.");
            }
            const directory = path.resolve(
              process.cwd(),
              "public",
              "scene-plans",
              payload.sceneId,
              "prototypes",
              payload.prototypeId,
            );
            await mkdir(directory, { recursive: true });
            const outputPath = path.join(directory, "whitebox-triview.png");
            await writeFile(outputPath, png);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ path: outputPath }));
          })().catch((error) => {
            response.statusCode = 400;
            response.end(error instanceof Error ? error.message : String(error));
          });
        });
      });
      server.middlewares.use("/__whitebox/write-opening-frame", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("POST required");
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
          if (body.length > 24 * 1024 * 1024) request.destroy();
        });
        request.on("end", () => {
          void (async () => {
            const payload = JSON.parse(body);
            const idPattern = /^[a-z0-9][a-z0-9-]*$/;
            if (
              !idPattern.test(payload.sceneId ?? "") ||
              !payload.dataUrl?.startsWith("data:image/png;base64,") ||
              typeof payload.report?.score !== "number" ||
              typeof payload.report?.pass !== "boolean" ||
              !Array.isArray(payload.report?.regions) ||
              !Array.isArray(payload.report?.anchors)
            ) {
              throw new Error("Invalid opening-frame artifact payload.");
            }
            const png = Buffer.from(payload.dataUrl.slice("data:image/png;base64,".length), "base64");
            if (png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
              throw new Error("Opening-frame payload is not a PNG.");
            }
            const directory = path.resolve(process.cwd(), "public", "scene-plans", payload.sceneId);
            await mkdir(directory, { recursive: true });
            const outputPath = path.join(directory, "whitebox-opening-frame.png");
            await writeFile(outputPath, png);
            const reportPath = path.join(directory, "opening-composition-report.json");
            await writeFile(reportPath, `${JSON.stringify(payload.report, null, 2)}\n`, "utf8");
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ path: outputPath, reportPath }));
          })().catch((error) => {
            response.statusCode = 400;
            response.end(error instanceof Error ? error.message : String(error));
          });
        });
      });
    },
  };
}

export default {
  plugins: [worldkitAuthoringSource(), whiteboxArtifactWriter()],
};
