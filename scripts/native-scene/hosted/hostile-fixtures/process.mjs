import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});
child.once("spawn", () => {
  process.stdout.write("UNEXPECTED_PROCESS_SPAWN\n");
  child.kill("SIGKILL");
});
child.once("error", () => undefined);
await new Promise((resolve) => child.once("close", resolve));
