import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

function requiredInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be an integer in [${minimum}, ${maximum}].`);
  }
  return number;
}

function parsedTime(value) {
  const milliseconds = Date.parse(String(value ?? ""));
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export class KubectlLeaseStore {
  constructor(namespace, { spawnImplementation = spawn } = {}) {
    if (!namespace) throw new Error("Kubernetes Lease namespace is required.");
    this.namespace = namespace;
    this.spawnImplementation = spawnImplementation;
  }

  async command(args, manifest = null) {
    return new Promise((resolvePromise, reject) => {
      const child = this.spawnImplementation(
        "kubectl",
        ["-n", this.namespace, ...args],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolvePromise(JSON.parse(stdout || "{}"));
          return;
        }
        if (/notfound|not found/i.test(stderr)) {
          resolvePromise({ outcome: "not-found" });
          return;
        }
        if (/alreadyexists|already exists|conflict|object has been modified/i.test(stderr)) {
          resolvePromise({ outcome: "conflict" });
          return;
        }
        reject(new Error(`kubectl Lease operation failed: ${stderr.slice(0, 500)}`));
      });
      child.stdin.end(manifest === null ? "" : JSON.stringify(manifest));
    });
  }

  async get(name) {
    const result = await this.command(["get", "lease", name, "-o", "json"]);
    return result.outcome === "not-found" ? null : result;
  }

  async create(manifest) {
    const result = await this.command(["create", "-f", "-", "-o", "json"], manifest);
    return result.outcome === "conflict" ? null : result;
  }

  async replace(manifest) {
    const result = await this.command(["replace", "-f", "-", "-o", "json"], manifest);
    return ["conflict", "not-found"].includes(result.outcome) ? null : result;
  }
}

class CloudWorkSlotLease {
  constructor(pool, claims) {
    this.pool = pool;
    this.claims = claims;
    this.timer = null;
  }

  startRenewal() {
    if (this.timer !== null) return this;
    this.timer = setInterval(() => {
      void Promise.all(this.claims.map(({ name, holderIdentity }) =>
        this.pool.renew(name, holderIdentity))).catch((error) => {
        process.stderr.write(
          `WORLDKIT_GLOBAL_SLOT_RENEW_WARNING ${this.pool.poolName} ${error.message}\n`,
        );
      });
    }, Math.max(10_000, Math.floor(this.pool.leaseDurationSeconds * 1_000 / 3)));
    this.timer.unref?.();
    return this;
  }

  async release() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await Promise.all(this.claims.map(({ name, holderIdentity }) =>
      this.pool.release(name, holderIdentity)));
  }
}

export class GlobalCloudWorkSlotPool {
  constructor({
    namespace,
    poolName,
    leaseNamePrefix = `worldkit-${poolName}-slot`,
    slotCount,
    leaseDurationSeconds = 900,
    pollIntervalMs = 5_000,
    store = null,
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }) {
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(String(poolName ?? ""))) {
      throw new Error("Cloud work-slot poolName is invalid.");
    }
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(String(leaseNamePrefix ?? ""))) {
      throw new Error("Cloud work-slot leaseNamePrefix is invalid.");
    }
    this.namespace = namespace;
    this.poolName = poolName;
    this.leaseNamePrefix = leaseNamePrefix;
    this.slotCount = requiredInteger(slotCount, "slotCount", 1, 128);
    this.leaseDurationSeconds = requiredInteger(
      leaseDurationSeconds,
      "leaseDurationSeconds",
      60,
      7_200,
    );
    this.pollIntervalMs = Math.max(50, Number(pollIntervalMs));
    this.store = store ?? new KubectlLeaseStore(namespace);
    this.now = now;
    this.sleep = sleep;
  }

  name(index) {
    return `${this.leaseNamePrefix}-${String(index).padStart(3, "0")}`;
  }

  manifest(name, holderIdentity, current, existing = null) {
    const metadata = {
      name,
      namespace: this.namespace,
      labels: { "worldkit.seedleap.dev/pool": this.poolName },
    };
    if (existing?.metadata?.resourceVersion) {
      metadata.resourceVersion = existing.metadata.resourceVersion;
    }
    const previousHolder = String(existing?.spec?.holderIdentity ?? "");
    return {
      apiVersion: "coordination.k8s.io/v1",
      kind: "Lease",
      metadata,
      spec: {
        holderIdentity,
        leaseDurationSeconds: this.leaseDurationSeconds,
        acquireTime: previousHolder === holderIdentity
          ? existing?.spec?.acquireTime ?? new Date(current).toISOString()
          : new Date(current).toISOString(),
        renewTime: new Date(current).toISOString(),
        leaseTransitions: Number(existing?.spec?.leaseTransitions ?? 0) +
          Number(Boolean(previousHolder && previousHolder !== holderIdentity)),
      },
    };
  }

  available(lease, holderIdentity, current) {
    const holder = String(lease?.spec?.holderIdentity ?? "");
    if (!holder || holder === holderIdentity) return true;
    const renewed = parsedTime(lease?.spec?.renewTime) ??
      parsedTime(lease?.spec?.acquireTime);
    const duration = Number(lease?.spec?.leaseDurationSeconds ?? this.leaseDurationSeconds);
    return renewed === null || renewed + duration * 1_000 <= current;
  }

  async claim(name, holderIdentity) {
    const current = this.now();
    const existing = await this.store.get(name);
    if (existing === null) {
      return this.store.create(this.manifest(name, holderIdentity, current));
    }
    if (!this.available(existing, holderIdentity, current)) return null;
    return this.store.replace(this.manifest(name, holderIdentity, current, existing));
  }

  async acquire(taskIdentity, {
    count = 1,
    waitTimeoutMs = 6 * 60 * 60_000,
  } = {}) {
    if (typeof taskIdentity !== "string" || taskIdentity.length < 3) {
      throw new Error("Cloud work-slot task identity is required.");
    }
    const requested = requiredInteger(count, "slot request count", 1, this.slotCount);
    const digest = createHash("sha256").update(taskIdentity).digest("hex");
    const startIndex = Number.parseInt(digest.slice(0, 8), 16) % this.slotCount;
    const deadline = this.now() + Math.max(1_000, waitTimeoutMs);
    while (this.now() < deadline) {
      const claims = [];
      for (let offset = 0; offset < this.slotCount && claims.length < requested; offset += 1) {
        const name = this.name((startIndex + offset) % this.slotCount);
        const holderIdentity = `worldkit-${digest.slice(0, 40)}-${String(claims.length).padStart(2, "0")}`;
        if (await this.claim(name, holderIdentity)) claims.push({ name, holderIdentity });
      }
      if (claims.length === requested) {
        process.stdout.write(
          `WORLDKIT_GLOBAL_SLOT_ACQUIRED ${this.poolName} count=${requested}\n`,
        );
        return new CloudWorkSlotLease(this, claims).startRenewal();
      }
      await Promise.all(claims.map(({ name, holderIdentity }) =>
        this.release(name, holderIdentity)));
      await this.sleep(Math.min(this.pollIntervalMs, Math.max(1, deadline - this.now())));
    }
    throw new Error(`Timed out waiting for ${requested} ${this.poolName} work slots.`);
  }

  async renew(name, holderIdentity) {
    const existing = await this.store.get(name);
    if (existing?.spec?.holderIdentity !== holderIdentity) return false;
    return await this.store.replace(
      this.manifest(name, holderIdentity, this.now(), existing),
    ) !== null;
  }

  async release(name, holderIdentity) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.store.get(name);
      if (existing === null || existing?.spec?.holderIdentity !== holderIdentity) return;
      if (await this.store.replace(this.manifest(name, "", this.now(), existing))) {
        process.stdout.write(`WORLDKIT_GLOBAL_SLOT_RELEASED ${this.poolName} ${name}\n`);
        return;
      }
    }
  }
}
