# Three Creator service

Agent entry points are [task requirements](docs/agent/README.md),
[programming and checks](docs/agent/programming.md), [SDK index](docs/agent/sdk.md) and
[asset index](docs/agent/assets/README.md). The cloud runner injects task requirements;
`creator_describe_environment.readingGuide` routes to the same files through
`creator_get_authoring_schema`. Keep task policy in these sources rather than
copying it into tool wrappers or examples.

## Package layout

- `src/assets/`: asset admission, resource loading and catalog integration.
- `src/compiler/`: browser compilation and project-owned runtime builds.
- `src/discovery/` and `src/schema/`: source-backed guides, examples and tool schemas.
- `src/tools/`: tool execution, observations, recording feedback and delivery.
- `src/browser/`: the production browser bridge and capture transactions.
- `src/cli/`: CLI, MCP, prebuild and example-preview entrypoints.
- `tests/`: module tests, with cross-capability checks under `tests/integration/`.
- `scripts/assets/` and `scripts/smoke/`: maintainer import/export and manual regression utilities.
- `config/`: asset policy and example registry; `docs/agent/`: production Agent instructions.

Production capsules include runtime source, configuration and Agent documentation;
they exclude maintainer scripts and tests. Public package exports remain stable.

## Run the service

```sh
pnpm exec tsx packages/creator-host/src/cli/mcp.ts --workspace /absolute/author-project --profile three-sdk
pnpm exec tsx packages/creator-host/src/cli/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

Server: `worldkit_three_creator`. CLI sessions accept one JSON request per line:
`{"id":1,"name":"world_validate","arguments":{}}`. Keep the same session for
recording and submission. Long tools return operation IDs; poll with
`operations_get`. Failed calls return `error` plus structured `errorDetails`;
failed operations retain original identity and cause. Read evidence before retrying.

## Exploration and quality

The canonical [task requirements](docs/agent/README.md) define reference fidelity,
world scope, visual style and completion checks. The [programming guide](docs/agent/programming.md)
defines how tools collect the corresponding evidence.

## Project runtime source

`creator_materialize_runtime` copies browser SDK source into the author project.
Discovery reads that current source snapshot, identified by runtimeSourceHash;
Host examples are marked as baseline. Host asset policy, command transport and
project/episode validation remain independent. See
[workspace runtime implementation](src/compiler/workspace-runtime.ts) and
[SDK architecture](../../docs/three-sdk-architecture.md).

## Asset selection

The Host freezes [asset policy](config/asset-policy.json)
against the [catalog](../../assets/three-creator/asset-catalog.json).
Search/details and example dependencies respect that policy. Project assetIds
select resources without expanding permissions. Exact definitions, resource bytes
and policy hashes are verified when packaging and importing into Episode.
An externally pinned task uses `--asset-policy-snapshot` and `--asset-policy-sha256`.
The asset index links categories and their child documents. assets_describe.documentation
can enter a registered asset document directly; its bindingExample selects a minimal
variant under the corresponding capability. Flying mounts live under animals.
Asset producers follow [asset integration](../../docs/asset-production-integration.md).

## Verify and deliver

For a local test build, add `--debug-tools` to the CLI/MCP or prebuild command;
`pnpm dev:example /absolute/author-project 5175 --debug-tools` previews that variant.
The resulting SDK build includes a separate debug bundle and automatically mounts
the shared panel after the SDK observer is ready. Collider overlays are separate
from pure renderer pixels; recording stays opt-in. Incidents are stored locally
in IndexedDB and can be downloaded as JSON. The complete debug build identity is
used for replay comparisons. Neither a production build nor a raw Three profile
silently enables these tools. Debug builds are not eligible for `world_submit`.
The same source must be rebuilt and self-checked without the flag for delivery.

The [record and submit guide](docs/agent/programming.md#record-and-submit) is the Agent
workflow. The Host verifies current source/runtime/world/episode identity,
complete real-input video, files and captures; technical success is separate from
semantic/reference review. A local delivery contains `creator-result.json` and
`creator-delivery.tar.gz`, including playable, evidence, captures and source/runtime
identity. It does not publish or start external production.

Maintainers must verify direct schema consumers, source extraction, example
compilation, Creator and Episode behavior affected by a change, and toolkit
packaging. [Discovery](src/discovery/creator-discovery.ts) returns guides and referenced source;
[binding examples](src/discovery/binding-examples.ts) returns typed integration snippets and their hashed manifest; complete internal fixtures support maintainer regression.
Detailed SDK contracts stay in the [SDK manual](../three-world/README.md)
and actual source. Maintainer checks are not extra steps in each generation task.
