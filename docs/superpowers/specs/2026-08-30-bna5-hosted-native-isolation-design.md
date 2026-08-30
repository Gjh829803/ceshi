# BNA-5 Hosted Native Isolation and Trust Profile Design

**Status:** implementation authority after BNA-4 acceptance
**Date:** 2026-08-30
**Program:** WRC-1 / BNA-5
**Baseline:** BNA-4 candidate `dfa6fbcdc18d3b6fa9fedce741efc1ec0dcb53d7`
**Upstream authority:**

- `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- `docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md`
- `docs/superpowers/specs/2026-08-30-bna3-native-package-receipt-design.md`
- `docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md`
- `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`
- `docs/reviews/full-dimension-review-protocol.md`
- `docs/reviews/runtime-deep-review-checklist.md`

## 1. Decision

BNA-5 keeps Babylon Native authoring intact and isolates the **whole verified Runtime execution**. It
does not translate Babylon geometry into another internal protocol and does not attempt to pass
Babylon `Scene`, Mesh, Havok, Camera or Engine objects across a trust boundary.

```text
Trusted Host
  verify exact WorldPackage
  resolve Trust Profile + Host policy + tenant policy
  compute one effective budget
  create immutable execution request
             |
             v
Hosted Isolation Provider
  provision disposable OS/container or dedicated browser-origin boundary
  mount only exact package bytes and runner image
  run the existing BNA-2 audit + BNA-4 RuntimeHost/Gameplay/Havok Kernel
  publish only closed protocol messages and a control-plane attestation
             |
             v
Trusted Host
  verify request/receipt/attestation identity
  expose stable Snapshot/Command/Cleanup results
```

There are exactly two trust profiles:

- **Trusted Local** executes the exact verified package in the existing in-process BNA-4 path. Its
  security claim remains “reviewed trusted code with fail-closed correctness gates”; it is not an
  untrusted-code sandbox.
- **Hosted Isolated** executes an exact verified package only through a Host-registered isolation
  provider. It has no in-process fallback. If the provider, policy, attestation, budget or cleanup
  evidence is unavailable, admission fails closed before Module execution.

The parent process is a lifecycle supervisor, not a second world-state owner. `RuntimeHost`,
Gameplay, Havok support, Camera, input normalization and fixed Tick remain single authorities inside
the execution domain that owns the live world.

## 2. Why the whole Runtime crosses the boundary

Babylon objects are mutable, cyclic, provider-specific and tied to one Engine/realm. Trying to run
only `module.build()` in a sandbox and then reconstruct the result in the Host would require one of
three bad designs:

1. serialize all visual geometry/material/light/animation intent into a new DSL;
2. trust a lossy object graph copied from untrusted code; or
3. keep remote callbacks/handles alive across the boundary.

All three recreate the compiler detour BNA was introduced to avoid, split Scene authority, or make
cleanup and determinism unprovable. Hosted therefore moves the Package loader, Candidate replay,
Babylon Runtime, Havok proxies, Gameplay Kernel and RuntimeHost together. The Host exchanges only
existing provider-neutral Commands, Events, Snapshots and lifecycle receipts.

## 3. Scope

BNA-5 delivers:

1. one canonical `NativeExecutionTrustProfileV1` Registry resource family for `trusted-local` and
   `hosted-isolated`;
2. one exact Host request, effective-budget value, isolation result and execution receipt contract;
3. a provider-neutral isolation-provider interface and Host supervisor with bounded lifecycle;
4. a Linux container reference provider for automated hostile-code, budget and cleanup evidence;
5. a dedicated browser-origin embedding contract for an interactive Hosted surface;
6. control-plane attestation that is produced outside the guest and binds the exact request, runner,
   sandbox policy, outcome and cleanup;
7. adversarial gates for network, credentials, environment, filesystem, process, time, memory,
   output, cross-run and cross-tenant isolation; and
8. current-only deletion of every Hosted in-process shortcut or ambiguous trust flag.

BNA-5 does not deliver:

- a second Native authoring API, geometry protocol, RuntimeHost, Gameplay Kernel or Browser command
  dialect;
- AI generation success-rate or repair evaluation (BNA-6);
- formal Capture/Route/navigation publication (BNA-7);
- final Trusted Local or Hosted production disposition (BNA-8);
- a claim that Node `vm`, a Worker, CSP, AST analysis or the Node Permission Model alone is a
  malicious-code security boundary; or
- a production cloud vendor implementation. A deployment may adapt the provider interface to its
  container/pod platform, but must satisfy the same attestation and adversarial gates.

## 4. Security basis and rejected primitives

The design follows these current primary-source constraints:

- Node documents that [`node:vm` is not a security mechanism](https://nodejs.org/api/vm.html) and
  must not run untrusted code.
- Node documents that its [Permission Model is a seat belt for trusted code](https://nodejs.org/api/permissions.html),
  not a malicious-code sandbox, and explicitly delegates same-user process isolation to OS users,
  seccomp or AppArmor.
- Kubernetes documents `runAsNonRoot`, dropped capabilities, `allowPrivilegeEscalation: false`,
  `readOnlyRootFilesystem` and seccomp through the
  [container security context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/).
- Docker documents that [rootless mode](https://docs.docker.com/engine/security/rootless/) runs the
  daemon and containers inside a user namespace without root privileges.
- MDN documents that iframe sandbox tokens restore capability one by one, warns against combining
  script and same-origin capability for a same-origin parent, and recommends a separate origin for
  potentially hostile content in the
  [`iframe` security guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).
- MDN requires exact target origins and validation of sender `origin`, `source` and message syntax
  for [`postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).

Therefore the following are defense in depth only and cannot satisfy Hosted Isolated admission:

- `node:vm`, SES-like object freezing without an OS/browser boundary, or an AST allowlist;
- a Worker thread in the Host process;
- a child process running under the same OS user with Host environment and mounts;
- Node Permission Model without an outer OS/container boundary;
- a sandboxed iframe served from the application origin;
- CSP without a separate origin/process boundary; or
- a guest-authored statement that it was isolated.

## 5. Trust Profile and authority ownership

### 5.1 Canonical names

`nativeSceneProfileRef` keeps its BNA-2 meaning: authoring/admission shape and structural resource
budget. BNA-5 must not overload it with security semantics.

The only trust selector is `nativeExecutionTrustProfileRef`, which resolves a locked
`NativeExecutionTrustProfileV1` Registry resource. No public `sandbox`, `safe`, `remote`, `hosted`,
`isTrusted`, `isUntrusted` or provider-name aliases are accepted.

The two initial refs are:

```text
worldkit://native-execution-trust-profile/trusted-local@1
worldkit://native-execution-trust-profile/hosted-isolated@1
```

The Profile is Host policy and is not added to WorldPackage root identity. The same immutable
Package may be evaluated under either lane; each execution receipt binds the chosen Profile.

### 5.2 Single-owner table

| Fact or resource | Sole owner | Consumer | Forbidden shadow owner |
|---|---|---|---|
| Package/Bundle/locks/Contribution identity | BNA-3 WorldPackage verifier | Host + enclave verifier | runner request path or Module |
| Native Scene structural budget | locked Package + BNA-2 Scene Profile | effective-budget resolver | tenant override |
| Trust Profile definition | Registry/Host policy | supervisor/provider | Module/package manifest |
| Host hard cap | deployment composition root | effective-budget resolver | guest or tenant |
| tenant entitlement/cap | authenticated Host tenant policy | effective-budget resolver | Package or client payload |
| effective budget | trusted Host resolver | provider + enclave recheck | guest self-report |
| sandbox provisioning and cleanup | isolation provider control plane | Host verifier | guest process |
| Runtime/Gameplay/Camera/Havok/fixed Tick | RuntimeHost inside active execution domain | protocol adapter | parent mirror or Module |
| public cross-domain command/event/snapshot semantics | existing Runtime Session Protocol V1 | parent bridge | Hosted-specific command dialect |
| usage observations | provider/cgroup/browser supervisor | receipt builder | Module |
| isolation attestation | trusted provider control plane | Host attestation verifier | guest filesystem/stdout |

## 6. Effective budget

### 6.1 Inputs

The Host resolves four independent inputs:

1. BNA-2 Profile limits;
2. exact `WorldPackageManifestV1.resourceBudget`;
3. deployment `NativeExecutionHostHardCapV1`; and
4. authenticated `NativeExecutionTenantCapV1`.

For `scene`, the effective value is the field-by-field minimum of Scene Profile, Package, Host and
tenant. For `assets`, `runtime`, `process` and `protocol`, which are not currently Package fields,
the effective value is the field-by-field minimum of Host and tenant caps, with the Trust Profile
requiring the corresponding provider enforcement capabilities. Missing, non-positive,
non-safe-integer or incomparable fields reject before provider allocation. A tenant can only reduce
a Host cap. A Package cannot request more resources by selecting another Trust Profile.

### 6.2 Budget groups

The canonical `NativeEffectiveExecutionBudgetV1` contains closed groups:

- `scene`: `maximumVertices`, `maximumTriangles`, `maximumColliders`;
- `assets`: `maximumAssetCount`, `maximumAssetBytes`, `maximumTextureCount`,
  `maximumTextureBytes`;
- `runtime`: `maximumSceneNodeCount`, `maximumMaterialCount`, `maximumShaderCount`,
  `maximumPhysicsBodyCount`;
- `process`: `maximumWallTimeMilliseconds`, `maximumCpuTimeMilliseconds`,
  `maximumMemoryBytes`, `maximumProcessCount`;
- `protocol`: `maximumInboundMessageBytes`, `maximumOutboundMessageBytes`,
  `maximumReceiptBytes`, `maximumDiagnosticCount`, `maximumLogBytes`.

Units remain in field names. The existing three Package resource fields are not renamed. The
effective value projects them into the `scene` group without a second parser or alias. All counts are
positive safe integers. Byte and time limits are enforced by both supervisor and provider where the
platform supports them; a provider that cannot prove one required limit is not eligible for the
Hosted Profile.

`NativeExecutionUsageV1` reports the same field names with `actual...` prefixes. An observed overage
terminates the session and cannot be downgraded to a warning.

## 7. Closed execution request, result and receipt

### 7.1 Request

`NativeIsolatedExecutionRequestV1` is canonical JSON and contains only:

- `kind`, `schemaVersion`, `id`;
- `runtimeSessionId` and `worldPackageRef`;
- `worldPackageRootHash`, `worldBuildIdentityHash`, `sceneModuleBundleHash` and
  `nativeSceneContributionHash`;
- `nativeExecutionTrustProfileRef` and locked content hash;
- `runnerIdentityRef`, `runnerImageDigest` and `sandboxPolicyHash` selected by the Host;
- `effectiveBudget` and `effectiveBudgetHash`;
- `requestedOperation` with exactly one mode: `check`, `capture`, or `interactive-session`; and
- a Host-generated `sessionNonce` used only for protocol binding.

It contains no absolute path, repository checkout, environment, credential, callback, file handle,
Babylon object, auth token or tenant secret. Package bytes are supplied through an immutable
provider-owned mount/object input keyed by the declared root hash, not embedded as arbitrary request
fields.

### 7.2 Result

`NativeIsolatedExecutionResultV1` is a closed union:

- `ready`: one verified initial Snapshot and protocol endpoint/lease;
- `completed`: operation output hashes plus final Snapshot hash;
- `rejected`: stable stage and diagnostics;
- `terminated`: stable termination reason (`host-cancelled`, `timeout`, `cpu-limit`, `memory-limit`, `process-limit`,
  `output-limit`, `protocol-violation`, `provider-lost`); or
- `cleanup-failed`: no reusable session and a stable quarantine identity.

Raw exception strings, stack traces, guest paths, stdout/stderr and provider handles never appear in
the public result.

### 7.3 Receipt and attestation

Every terminal attempt publishes one `NativeIsolatedExecutionReceiptV1` bound to:

- request hash and all Package/Bundle/Contribution identities;
- Trust Profile ref/hash;
- runner identity/image digest and sandbox policy hash;
- effective budget hash and observed usage;
- exact operation/outcome and output hashes;
- start/end monotonic durations, never guest wall-clock truth;
- cleanup status and quarantine identity when applicable; and
- `isolationAttestationRef` plus `isolationAttestationHash`.

The attestation is produced by the provider control plane after it observes provisioning and
cleanup; it is never accepted from guest files, stdout or the Module. The Host uses a
deployment-registered verifier for the exact runner identity. A reference-test fake may exercise
contract logic but can never satisfy a production Hosted disposition.

Receipt hashing uses the existing Canonical JSON/SHA-256 utility. Receipt bytes are transport
metadata and do not enter the already-frozen WorldPackage root.

## 8. Isolation-provider contract

The provider interface is Host capability, not public Authoring Schema:

```ts
interface NativeIsolationProviderV1 {
  readonly runnerIdentityRef: string;
  prepare(request: NativeIsolatedExecutionRequestV1, cancellationSignal: AbortSignal):
    Promise<PreparedNativeIsolationV1>;
}

interface PreparedNativeIsolationV1 {
  start(): Promise<NativeIsolatedExecutionResultV1>;
  submit(envelope: NativeIsolationTransportEnvelopeV1):
    Promise<NativeIsolationTransportEnvelopeV1>;
  terminate(reason: NativeIsolationTerminationReasonV1):
    Promise<NativeIsolatedExecutionResultV1>;
  collectReceipt(): Promise<{
    readonly result: NativeIsolatedExecutionResultV1;
    readonly receipt: NativeIsolatedExecutionReceiptV1;
    readonly attestationBytes: Uint8Array;
  }>;
  dispose(): Promise<void>;
}
```

The concrete interface may use opaque private handles internally, but they never cross package or
protocol boundaries. `prepare`, `start`, `submit`, `terminate`, `collectReceipt` and `dispose` are each
single-owner, bounded and idempotent at the Host boundary.

The Host supervisor owns a strict lifecycle:

```text
requested -> provisioning -> starting -> ready/running
          -> completed/rejected/terminated
          -> disposing -> disposed | quarantined
```

There is no resume-after-quarantine, provider migration, implicit retry or fallback to Trusted
Local. A retry is a new request ID, new nonce, new isolation domain and new receipt.

## 9. Linux container reference provider

The reference provider is acceptance evidence and an executable deployment example. It must use an
image pinned by digest and enforce at least:

- rootless/user-namespace execution and a non-root guest UID/GID distinct from Host services;
- read-only root filesystem and read-only exact Package mount;
- one bounded writable tmpfs owned by the request;
- no inherited environment except a closed non-secret allowlist;
- no home, SSH/Git/cloud credentials, service-account token, host path, device, Docker/container
  daemon socket or repository checkout;
- no network namespace attachment and no DNS/network fallback;
- all Linux capabilities dropped, no privilege escalation and a registered seccomp profile;
- separate PID namespace, process-count limit, memory limit, CPU quota and wall timeout;
- bounded stdout/stderr collection with truncation before Host logs;
- whole-cgroup/process-tree termination on timeout, protocol failure or cancellation; and
- removal of container, mounts and tmpfs before a successful cleanup attestation.

An ordinary rootful Docker daemon on a developer machine can run focused tests, but it does not by
itself prove the production Hosted profile. Exact-SHA acceptance must record runner engine/version,
rootless/user-namespace state, image digest and each enforced capability. Unsupported controls mean
Hosted No-Go, not a warning.

## 10. Dedicated browser-origin contract

An interactive Hosted surface runs the whole Runtime on a dedicated credentialless origin that is
different from the application shell. It is embedded with sandbox permissions limited to the exact
features required to render and receive input. The shell never injects Module source via `srcdoc`.

Minimum requirements:

- no application cookies, bearer tokens, local/session storage authority or service credentials on
  the runtime origin;
- CSP defaults deny all network destinations; scripts, workers, images and media are restricted to
  exact content-addressed same-runtime-origin assets required by the verified Package;
- no forms, popups, downloads, top navigation, presentation, pointer-lock or storage-access token
  unless separately designed and admitted;
- a dedicated cross-origin frame so script execution cannot access the parent DOM;
- exact `postMessage` target origin and receiver validation of `origin`, `source`, closed schema,
  `runtimeSessionId`, nonce and monotonically increasing sequence;
- after bootstrap, a transferred `MessagePort` is the only live channel;
- message bytes and rate are bounded by the effective protocol budget; and
- removing/navigating the frame invalidates the session and requires provider cleanup.

Origin isolation prevents data/DOM access; it is not the Host worker/capture resource boundary. Any
server-side build, check or capture still runs in the container provider. BNA-8 must state Hosted
browser and Hosted worker evidence separately if their accepted controls differ.

## 11. Protocol and Runtime authority

Hosted does not define a second command language. The isolation envelope carries the existing exact
`RuntimeSessionRequestV1`, `RuntimeSessionReceiptV1` and `RuntimeSessionEventV1` values. Browser
Protocol V5 remains the in-frame application facade; it is not a serialized message schema and is
not copied into a Hosted RPC dialect. Physical keyboard, pointer and camera input are captured inside
the isolated frame and continue through the existing SDK input owners. The envelope adds only
transport identity:

- `schemaVersion`;
- `runtimeSessionId`;
- `sessionNonce`;
- monotonic `messageSequence`; and
- one existing protocol payload.

The enclave parses the payload using the existing Runtime Session Protocol V1 parsers. The parent
validates returned Events, Snapshots and receipts using the same current-only types. Unknown keys, skipped/reused sequences,
wrong session/nonce, oversized messages or payloads not valid for the current phase terminate the
session.

The parent may cache the latest verified Snapshot for display, diagnostics or reconnection UI. That
cache is an observation, not a rollback/replay authority. Reset, Hash, Replay and Rollback remain
inside the enclave's RuntimeHost and use the exact existing representations. The isolation
supervisor owns only lease phase, provider usage, deadline, attestation and cleanup.

## 12. Threat model and required gates

| Threat | Mandatory prevention | Required evidence |
|---|---|---|
| read Host/repo/credential files | no host mounts; exact read-only Package mount; separate UID; empty env | canary paths/env/FD reads fail; Host canaries unchanged |
| network/DNS exfiltration | container has no network namespace; browser CSP allows only immutable content-addressed resources from its credentialless runtime origin; no proxy env | container TCP/UDP/DNS and browser external fetch/WebSocket/beacon attempts fail |
| child-process or inspector escape | PID/user namespaces, pids cap, dropped capabilities, seccomp, no same-user Host process | spawn/fork/worker/debug/ptrace attempts blocked or contained |
| filesystem persistence | read-only root + request tmpfs only | writes outside tmpfs fail; tmpfs removed after cleanup |
| CPU/infinite loop | cgroup CPU quota + supervisor wall timeout + whole-domain kill | busy loop terminates with stable timeout/CPU result |
| memory/process bomb | memory/pids hard limits | allocation/fork bomb terminates; Host survives; no orphan |
| output/log bomb | bounded protocol/stdout/stderr/receipt bytes | overage terminates and Host logs stay bounded/redacted |
| direct Babylon authority takeover | existing BNA-2 audit/replay and BNA-4 cutoff inside enclave | `scene.dispose/getEngine/registerBeforeRender/enablePhysics`, observables, extra Camera/Physics fail admission |
| post-ready mutation | BNA-2 retained-binding/instrumentation plus Runtime ownership | mutation attempt fails or terminates without published drift |
| protocol spoof/replay | exact source/origin, nonce, sequence, schema and phase | wrong source/origin/nonce/sequence/key rejected |
| cross-run/tenant leakage | unique domain, mount, tmpfs, nonce and no shared mutable cache | two concurrent tenants cannot observe each other; sequential canary absent |
| package/runner substitution | exact root/hash/image digest/policy hash and control-plane attestation | tamper at every identity edge rejects before ready |
| partial/throwing cleanup | supervisor finally + provider terminate/dispose + attested teardown | startup failure, ready failure and dispose failure leave no reusable domain |

Browser and container tests are separate evidence layers. A passing NullEngine security test does not
prove browser origin policy, and a browser CSP test does not prove cgroup/process cleanup.

## 13. Package and file ownership

BNA-5 adds **no Native-specific workspace package** and no duplicate checker/runtime package.
Responsibilities stay in existing owners:

- `packages/runtime-contracts/`: Trust Profile, effective budget, request/result/receipt and transport
  envelope data contracts;
- `packages/runtime-host/`: effective-budget resolver, provider-neutral supervisor and lifecycle;
- `packages/runtime-babylon/`: enclave composition that runs the existing verified BNA-4 path;
- `packages/world-package/`: unchanged exact Package verification; only receipt identity helpers if
  they are truly package-generic;
- `scripts/native-scene/hosted/`: Linux reference provider, hostile fixtures and stable developer
  commands under root `package.json`;
- `apps/native-scene-playground/`: dedicated-origin integration evidence only, not a second Runtime;
  and
- `docs/reviews/`: threat-model and exact-SHA review evidence.

If process-tree termination mechanics are shared later with PHO, extract only the generic bounded
process primitive after both call sites exist. PHO diagnostics never become BNA security authority,
and BNA isolation receipts never become project-health findings.

## 14. Diagnostics and privacy

The stable diagnostic family must distinguish at least:

- Trust Profile unavailable or not permitted;
- invalid/missing Host or tenant cap;
- Package/request/runner/policy/attestation identity mismatch;
- provider provisioning/start/protocol loss;
- timeout, CPU, memory, process, output or message limit;
- guest rejection from existing BNA-2/BNA-4 diagnostics;
- cleanup quarantine; and
- browser origin/source/session/sequence violation.

Diagnostics identify request, Package, Profile, stage and stable resource IDs. They never include
tenant secrets, Module source, raw logs, absolute paths, environment values, browser handles,
container IDs usable as capabilities, stack traces or unbounded guest messages.

## 15. Current-only clean break

The accepted tree must have:

- one `nativeExecutionTrustProfileRef` name and one exact parser;
- one effective-budget resolver and no caller-supplied “already effective” bypass;
- one Hosted supervisor lifecycle and no direct provider calls from apps;
- one existing BNA-2 Candidate checker and one existing BNA-4 Runtime composition inside the
  enclave;
- no in-process Hosted fallback, `vm` fallback, permissive “development Hosted” flag or silent
  downgrade to Trusted Local;
- no Docker/Kubernetes/provider fields in public Authoring or WorldPackage Schema;
- no raw Babylon handle or Hosted-specific Gameplay/Camera command in cross-domain DTOs; and
- no V1/V2, legacy/current or old/new aliases.

The repository is unreleased. If an earlier experimental Hosted entry conflicts with these
contracts, migrate all callers and delete it in the same merge candidate.

## 16. Verification contract

Focused RED-to-GREEN evidence must cover:

1. exact Trust Profile Registry resolution and clean rejection of aliases/unknown refs;
2. field-by-field minimum budget with asymmetric inputs, overflow, missing fields and tenant cannot
   raise Host limits;
3. exact request/receipt hashing and tamper rejection at every Package/runner/policy edge;
4. no provider allocation before Package/Profile/cap validation;
5. container environment/filesystem/network/process/resource attacks from §12;
6. timeout/cancel/provider-loss/partial-start/throwing-dispose cleanup with no orphan process, mount
   or tmpfs;
7. two concurrent and sequential tenant sessions with canary isolation;
8. Hosted execution of a real verified Native package through the same BNA-2/BNA-4 admission,
   RuntimeHost, Havok support and initial possession path;
9. protocol source/origin/nonce/sequence/size/phase negatives;
10. dedicated-origin browser readiness and interaction without parent DOM/storage/network access;
11. Trusted Local remains unchanged and never claims malicious-code isolation;
12. Canonical Runtime and WorldPackage regressions remain green; and
13. source census proves all forbidden fallbacks and aliases absent.

Before merge, run affected package tests, `pnpm typecheck`, production builds, workspace/clean-break
checks, container hostile suite, dedicated-origin Browser verifier, then one exact-SHA Cursor Cloud
full gate and one independent security + full-dimension/runtime-deep review. A Cloud worker that
cannot expose the required container controls may run ordinary gates but cannot provide the Hosted
security GO; that evidence must come from a capable runner and be attached to the exact SHA.

## 17. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / stable input -> output | Evidence | Mode |
|---|---|---|---|---|---|---|
| BNA5-00 | Freeze this design and executable implementation plan | accepted BNA-4 | all BNA5 tasks | BNA-5 docs only; accepted BNA-4 tree -> closed contracts/work graph | link, placeholder, contradiction and D1-D6 design review | `main-agent-only` |
| BNA5-10 | Add exact Trust Profile, budget, request/result/receipt and transport contracts | BNA5-00 | BNA5-20/30/40 | `runtime-contracts`; Registry/Host inputs -> canonical parsed/hashable DTOs | schema/alias/tamper/canonical-hash RED/GREEN | `sequential` |
| BNA5-20 | Implement one effective-budget resolver and fail-before-allocation policy | BNA5-10 | BNA5-30/40 | `runtime-host` policy only; Profile + Package + Host + tenant -> effective budget/diagnostic | asymmetric min/overflow/missing/entitlement tests | `sequential` |
| BNA5-30 | Implement provider-neutral supervisor, lifecycle, attestation verification and cleanup | BNA5-10/20 | BNA5-40/50/60 | `runtime-host`; exact request + provider -> bounded result/receipt | phase, timeout, cancellation, provider-loss, quarantine tests | `main-agent-only` |
| BNA5-40 | Compose the existing BNA-2/BNA-4 Runtime inside an enclave entry | BNA5-20/30 | BNA5-50/60 | `runtime-babylon` enclave composition; verified package + budget -> one RuntimeHost session | Package replay/Havok/possession/snapshot/cleanup tests | `main-agent-only` |
| BNA5-50 | Build Linux container reference provider and hostile suite | BNA5-30/40 | BNA5-70/90 | `scripts/native-scene/hosted`; pinned runner + immutable package -> control-plane receipt | env/fs/network/pids/cpu/memory/output/cross-tenant evidence | `sequential` |
| BNA5-60 | Build dedicated-origin browser bridge and verifier | BNA5-30/40 | BNA5-70/90 | Native Playground integration only; exact session -> isolated interactive surface | origin/source/nonce/sequence/CSP/storage/network/readiness tests | `sequential` |
| BNA5-70 | Delete Hosted shortcuts/fallbacks and add clean-break census | BNA5-50/60 | BNA5-90 | consumers/scripts/docs; current tree -> one Hosted path | source census, workspace boundaries, Canonical/Trusted Local regressions | `sequential` |
| BNA5-90 | Exact-SHA hostile gates, independent security/runtime review, PR, merge and status switch | BNA5-50..70 | BNA-6, BWB-5, BNA-8 | evidence/review/status only; candidate SHA -> scoped GO/NO-GO | full gates, container controls, Browser evidence, no open P0/P1/P2, ancestry | `main-agent-only` |

No task may weaken BNA-2 Source/Authority Admission, BNA-3 Package identity or BNA-4
Runtime/Surface/lifecycle gates to make isolation tests pass. A provider success status or guest
receipt is not proof without Host verification and control-plane attestation.

## 18. Completion definition

BNA-5 is complete only when the accepted `main` tree proves:

1. Trusted Local and Hosted Isolated use one canonical trust-profile term and remain separate claims;
2. Hosted has no in-process or weaker fallback;
3. one effective budget is the minimum of Profile, Package, Host and tenant limits;
4. an exact verified Package executes through the existing BNA-2/BNA-4 authorities inside one
   disposable isolation domain;
5. the parent owns lifecycle/attestation only and does not become a second Runtime authority;
6. container and browser boundaries pass their separate hostile suites;
7. timeout, limit, cancellation and partial failure leave no reusable guest or cross-tenant state;
8. request, output, receipt and control-plane attestation remain exact and tamper-evident;
9. the current-only census finds no Hosted shortcut, alias or second command/runtime dialect; and
10. exact-SHA gates and independent security/full-dimension/runtime review have no open P0/P1/P2.

BNA-5 completion enables BNA-6 evaluation and BWB-5 Hosted corpus work. It does not by itself publish
a final Hosted production claim; BNA-8 issues that scoped disposition from BNA-5 through BNA-7
evidence.
