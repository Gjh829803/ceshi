import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { lstat, rename, unlink, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import path from "node:path";
import { fileSha256, writeJson } from "./three-eval-runtime.mjs";
import { uploadS3File } from "../lib/lwdp-generation-client.mjs";
import {resolveProviderWorkspace,validateProviderWorkspace,validateProviderLauncher} from './three-eval-workspace.mjs';
import {readThreeLiveStatus} from './three-eval-live.mjs';

const exec = promisify(execFile);
const files = ["creator-launcher-report.json", "creator-events.jsonl", "creator-stderr.log", "creator-mcp-stderr.log"];
const maximumDiagnosticBytes = 512 * 1024 * 1024;

// Open every directory and the final file without following symlinks. Holding
// these descriptors closes the preflight/copy race; kubectl cp alone does not.
export const closedDiagnosticReader = String.raw`
import os,sys,stat,json,hashlib
root,name,limit=sys.argv[1],sys.argv[2],int(sys.argv[3])
assert name in ("creator-events.jsonl","creator-launcher-report.json","creator-stderr.log","creator-mcp-stderr.log")
expected=root+"/"+name
assert os.path.isabs(root) and os.path.realpath(root)==root
assert os.path.realpath(expected)==expected
directory=os.open("/",os.O_RDONLY|os.O_DIRECTORY)
try:
 for part in root.split("/")[1:]:
  assert part not in ("",".","..")
  next_directory=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
  os.close(directory)
  directory=next_directory
 before=os.stat(name,dir_fd=directory,follow_symlinks=False)
 assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<=before.st_size<=limit
 descriptor=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
 with os.fdopen(descriptor,"rb") as stream:
  opened=os.fstat(stream.fileno())
  assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns)
  count=0
  digest=hashlib.sha256()
  while True:
   chunk=stream.read(1024*1024)
   if not chunk: break
   count+=len(chunk)
   assert count<=limit
   digest.update(chunk)
   sys.stdout.buffer.write(chunk)
  after=os.fstat(stream.fileno())
  assert (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns,opened.st_nlink)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns,after.st_nlink)
  assert count==opened.st_size
  sys.stdout.buffer.flush()
  print(json.dumps({"bytes":count,"sha256":digest.hexdigest(),"sourcePath":expected,"regularFile":True,"nlink":after.st_nlink,"pathResolution":"directory-fd-no-follow"}),file=sys.stderr)
finally:
 os.close(directory)
`;

async function copyClosedDiagnostic({pod, sourceRoot, name, temporary}) {
  const child = spawn("kubectl", ["-n", "ray", "exec", pod, "-c", "ray-head", "--", "python", "-c", closedDiagnosticReader, sourceRoot, name, String(maximumDiagnosticBytes)], {stdio: ["ignore", "pipe", "pipe"]});
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-16_384); });
  const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`CREATOR_DIAGNOSTIC_CLOSED_READ_FAILED: ${name}; exit=${code}; signal=${signal}; ${stderr.slice(-2000)}`))); });
  let bytes = 0;
  const cap = new Transform({transform(chunk, _encoding, done) { bytes += chunk.length; done(bytes > maximumDiagnosticBytes ? new Error("CREATOR_DIAGNOSTIC_SIZE_LIMIT") : null, chunk); }});
  const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
  try {
    await Promise.all([exited, pipeline(child.stdout, cap, createWriteStream(temporary, {flags: "wx", mode: 0o600}))]);
    const remote = JSON.parse(stderr.trim().split("\n").at(-1));
    if (remote.sourcePath !== `${sourceRoot}/${name}` || remote.bytes !== bytes || remote.nlink !== 1 || remote.regularFile !== true || remote.sha256 !== await fileSha256(temporary)) throw new Error("CREATOR_DIAGNOSTIC_TRANSPORT_IDENTITY_MISMATCH");
    return remote;
  } catch (error) {
    child.kill("SIGKILL");
    await unlink(temporary).catch(() => {});
    throw error;
  } finally { clearTimeout(timer); }
}

// Trusted Host recovery only. LWDP returns before declared-output upload when
// Codex exits nonzero. Never traverse task scratch/account homes or synthesize
// creator-result.json / creator-delivery.tar.gz to obtain provider success.
export async function recoverFailedCreatorDiagnostics({jobId, caseId, workDirectory, localCaseRoot, outputS3Prefix,workspaceBinding,runtimeHash}) {
  if (!/^gen_[a-f0-9]+$/.test(jobId) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(caseId) || workDirectory !== `/fsx/pipeline/lwdp_generation/${jobId}`) throw new Error("CREATOR_DIAGNOSTIC_SCOPE_INVALID");
  if (!outputS3Prefix.startsWith("s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/")) throw new Error("CREATOR_DIAGNOSTIC_S3_SCOPE_INVALID");
  if(!workspaceBinding){
    const live=await readThreeLiveStatus([{jobId,taskId:caseId,workDir:workDirectory,runtimeHash}],{cacheMilliseconds:0});
    workspaceBinding=resolveProviderWorkspace({jobId,taskId:caseId,workDirectory,runtimeHash,live:live.jobs[0]});
  }
  if(workspaceBinding.jobId!==jobId||workspaceBinding.taskId!==caseId||workspaceBinding.runtimeHash!==runtimeHash)throw Error('CREATOR_DIAGNOSTIC_WORKSPACE_IDENTITY_INVALID');
  const sourceRoot = `${validateProviderWorkspace(workspaceBinding)}/outputs`;
  const inventory = await exec("kubectl", ["-n", "ray", "get", "pods", "-l", "ray.io/cluster=ray-cluster,ray.io/node-type=head", "-o", "json"], {timeout: 30_000, maxBuffer: 2 * 1024 * 1024});
  const pod = JSON.parse(inventory.stdout).items.find(item => item.status?.phase === "Running" && item.spec?.containers?.some(container => container.name === "ray-head"))?.metadata?.name;
  if (!pod || !/^[a-z0-9-]+$/.test(pod)) throw new Error("CREATOR_DIAGNOSTIC_SHARED_FSX_READER_UNAVAILABLE");
  const report = {schemaVersion: 1, kind: "trusted-host-failed-creator-diagnostic-recovery", jobId, caseId, sourceRoot,workspaceBinding, readerPod: pod, recoveredAt: new Date().toISOString(), qualification: "Failure diagnostics only; no successful creator artifacts are synthesized.", files: {}, errors: []};
  for (const name of files) {
    const target = path.join(localCaseRoot, name);
    const temporary = `${target}.fsx-recovery-${process.pid}.part`;
    try {
      const remote = await copyClosedDiagnostic({pod, sourceRoot, name, temporary});
      const metadata = await lstat(temporary);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Recovered diagnostic is not a regular file");
      if(name==='creator-launcher-report.json')validateProviderLauncher(workspaceBinding,JSON.parse(await readFile(temporary,'utf8')));
      await rename(temporary, target);
      const record = {bytes: metadata.size, sha256: await fileSha256(target), sourcePath: remote.sourcePath, pathResolution: remote.pathResolution, s3Uri: `${outputS3Prefix}/diagnostics/${name}`};
      report.files[name] = record;
      try { await uploadS3File(target, record.s3Uri); record.uploaded = true; }
      catch (error) { record.uploaded = false; report.errors.push({name, stage: "upload", message: error.message.slice(0, 2000)}); }
    } catch (error) { if(name==='creator-launcher-report.json')throw error;report.errors.push({name, stage: "recovery", message: error.message.slice(0, 2000)}); }
  }
  const reportPath = path.join(localCaseRoot, "diagnostic-recovery.json");
  await writeJson(reportPath, report);
  try { await uploadS3File(reportPath, `${outputS3Prefix}/diagnostics/diagnostic-recovery.json`); }
  catch (error) { report.errors.push({name: "diagnostic-recovery.json", stage: "upload", message: error.message.slice(0, 2000)}); await writeJson(reportPath, report); }
  return report;
}
