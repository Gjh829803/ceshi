# GPT-6 cloud capability probe — 2026-09-05

This directory records actual LWDP execution and read-only deployment evidence.
It does not certify the proposed `worldkit-creator` runtime profile or a playable
world. Account identifiers and credential metadata are excluded from committed
evidence. Full task-local logs remain under `.codex-tmp/gpt6-cloud-probe/`.

## Attempt 1: deployed default CLI

- Job: `gen_c356c2f62481a6a2`.
- Request: `gpt6-creator-probe-20260905-a1-c83fd126`.
- Requested model/effort: `gpt-6-astra / xhigh`.
- Provider result: `completed`, one failed item, no successful items.
- Ray result: `SUCCEEDED`; this only means the job driver completed reporting.
- Queue: 157.990 seconds; remote processing: 6.418 seconds.
- Installed default CLI: `0.144.2`.
- Actual model error: `The 'gpt-6-astra' model requires a newer version of Codex.`
- The model did not start; image input, image viewing, shell invocation and MCP
  were **not tested by the model** in this attempt.

See [sanitized attempt evidence](./attempt-1.json).

## Isolated version fix

The official npm package `@openai/codex@0.153.3-linux-x64` was downloaded using its
fixed version, verified against the registry's SHA-512 integrity, and copied into:

```text
/fsx/pipeline/worldkit-creator-experiments/gpt6-probe-20260905-c83fd126/codex-0.153.3-linux-x64/
```

All six installed bundle files match their local SHA-256 values. Running the new
binary on a cloud worker returned `codex-cli 0.153.3`. Its binary SHA-256 is:

```text
f9d4eab23d0e0726340e084ed22d668885c1dcabeb29ec508b8962e5e29b8dc6
```

The existing deployed `codex_job.py` accepts `options.codex_bin`. Attempt 2 uses
that existing field to select this exact binary for one request. No shared
deployment, default binary, global `PATH`, or account configuration was changed.
This is an experimental per-request executable override, not a new runtime
profile or a production admission mechanism.

See the [official source lock](./codex-0.153.3-linux-x64-source-lock.json) and
[cloud file/version verification](./codex-0.153.3-linux-x64-cloud-lock.json).

The [official CLI documentation](https://learn.chatgpt.com/docs/codex/cli)
documents installing/updating the CLI; it does not establish an exact minimum
CLI version for GPT-6. The selected `0.153.3` is qualified here only by the
actual model probe reported below.
The [model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)
lists `xhigh` support; account availability remains an execution check.

## Deployed environment evidence

Read-only checks against a running worker using the current generic image found:

| Capability | Observed worker state |
| --- | --- |
| OS/ABI | Linux x86_64, Ubuntu glibc 2.35 |
| Node | 20.20.2 at `/codex-tools/bin/node` |
| npm / pnpm | Absent from `PATH` |
| Chromium / Chrome | Absent from `PATH` |
| Python Playwright / Pillow | Not installed |
| Node Playwright / Babylon / Havok | Not resolvable from the worker directory |
| ffmpeg / ffprobe | Present |
| `/opt/worldkit`, `/opt/worldkit-assets`, `/ms-playwright` | Absent |
| Dedicated Creator worker group | Not present in the inspected RayCluster |

These checks describe a worker image, not a complete per-task capability or
isolation proof. Libraries at an explicit task-private package path may still be
provided later. [Worker evidence](./worker-binary-audit.jsonl),
[Ray deployment](./ray-deployment-audit.json),
[LWDP deployment](./lwdp-deployment-audit.json).

The deployed LWDP API/code root is `c730fd0`. Source checks confirm no implemented
`runtime_profile` or MCP registration in `codex_runner.py`. The runner accepts a
per-request `codex_bin`; generic API request options preserve it. Generation
job-level Ray `runtime_env` is disabled by default, so saving an environment
override in config does not prove it was applied. [Source hashes](./deployed-source-audit.json).

The deployed account helper still copies non-skipped account-home contents and
the process environment. No account files were read during this audit. This
existing behavior does not meet the proposed clean Creator configuration and
untrusted-code isolation contract by itself.

## Probe fixture and repeat policy

[Probe instructions](https://github.com/seedleap/agent-whitebox-world-sdk/blob/22ddb16d00b25a2014c231237d17c6a65d7e78f3/scripts/cloud/creator-runtime-probe.prompt.md)
attach a visual nonce, execute a small non-secret
[Python environment/PNG fixture](https://github.com/seedleap/agent-whitebox-world-sdk/blob/22ddb16d00b25a2014c231237d17c6a65d7e78f3/scripts/cloud/creator-runtime-probe.py),
require an actual image-viewing tool call, and record exposed tool/skill names.
The generated PNG is explicitly a software graphics fixture, never a WorldKit
Runtime screenshot. Input pixels are checked against a separate host oracle.

[Attempt 2 launcher](https://github.com/seedleap/agent-whitebox-world-sdk/blob/22ddb16d00b25a2014c231237d17c6a65d7e78f3/scripts/cloud/creator-runtime-probe.mjs) uses
the existing project-local client and credentials. It writes a submission intent
before a single POST and reconciles subsequent invocations by the same request ID.
It refuses to retry before the previous attempt is confirmed terminal. This
experiment allows only one retry after the first version incompatibility.

## Attempt 2: verified result and limits

- Job: `gen_8e7ff0916ebd95d6`.
- Request: `gpt6-creator-probe-20260905-a2-c83fd126`.
- Result: `succeeded`, one successful item, all three declared outputs delivered.
- API config and the actual invocation select the task-private `0.153.3` binary,
  `gpt-6-astra`, and `xhigh`. The CLI exits zero.
- Queue: 131.527 seconds; remote processing: 117.807 seconds.
- The returned six-digit visual nonce matches the separate Host oracle.
- The returned machine report records successful Node arithmetic (`sum: 10`).
- The returned 640×360 PNG exactly matches the independent local fixture bytes.
- A Host-side visual inspection confirms the reported shapes and positions.

The model reports opening the fresh PNG with `view_image`, but the actual early
tool-call event is **not independently retained**: LWDP keeps only the final
8,000 characters of stderr, and the long inventory JSON patch displaced it. The
matching description and self-report do not prove that invocation. The next
Creator launcher must retain the full `--json` event stream before long cases
can qualify real preview/inspection/repair loops.

The session reports 147 exposed tools, including generic shell/image tools and
unrelated account-side connector families. It reports no WorldKit tools. Image
generation is exposed but was not invoked. A minimal controlled Creator launcher
should explicitly load the required WorldKit tool set and suppress unrelated
inherited capabilities; this probe does not qualify that isolation.

The fixture's `codex --version` still resolves to the default `0.144.2` on
`PATH`. This is expected: the task launcher invoked `0.153.3` by its pinned
absolute path, and the experiment deliberately did not change global `PATH`.

See [sanitized attempt 2 evidence](./attempt-2.json) and
[returned machine report](./machine-report-attempt-2.json).

No probe jobs remain active. Do not launch a third capability probe merely to
repeat these checks. Continue the authorized five-case evaluation only after
the new runtime supplies browser/SDK/assets and preserves actual tool evidence.
