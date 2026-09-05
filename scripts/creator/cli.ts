import { CreatorTools } from "./tools.js";
import { executeCreatorTool } from "./mcp.js";

const value = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const service = new CreatorTools(value("--workspace") ?? process.cwd());
try {
  let result: any = await executeCreatorTool(service, value("--tool") ?? "creator_describe_environment", JSON.parse(value("--args") ?? "{}"));
  if (result?.id?.startsWith("op-")) {
    while (["queued", "running"].includes(result.status)) {
      result = await service.getOperation(result.id, 5);
      if (["queued", "running"].includes(result.status)) process.stderr.write(`${JSON.stringify({ id: result.id, status: result.status, progress: result.progress })}\n`);
    }
    if (result.status !== "succeeded") process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; }
finally { await service.close(); }
