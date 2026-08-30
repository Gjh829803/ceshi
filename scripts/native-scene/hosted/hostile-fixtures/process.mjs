import { spawn } from "node:child_process";

const attemptCount = 64;
const children = [];
let spawnedCount = 0;
let rejectedCount = 0;

await Promise.all(Array.from({ length: attemptCount }, () =>
  new Promise((resolve) => {
    const child = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
    children.push(child);
    child.once("spawn", () => {
      spawnedCount += 1;
      resolve();
    });
    child.once("error", () => {
      rejectedCount += 1;
      resolve();
    });
  })
));

if (rejectedCount === 0 || spawnedCount >= attemptCount) {
  process.stdout.write("UNEXPECTED_PROCESS_LIMIT_BYPASS\n");
}
process.stdout.write(
  `PROCESS_LIMIT_ENFORCED spawned=${spawnedCount} rejected=${rejectedCount}\n`,
);
for (const child of children) child.kill("SIGKILL");
