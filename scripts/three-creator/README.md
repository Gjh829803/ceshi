# Three Creator service

Agent entry points are [task requirements](agent/README.md),
[programming and checks](agent/programming.md), [SDK index](agent/sdk.md) and
[asset index](agent/assets/README.md). The cloud runner injects task requirements;
`creator_describe_environment.readingGuide` routes to the same files through
`creator_get_authoring_schema`. Keep task policy in these sources rather than
copying it into tool wrappers or examples.

## Run the service

```sh
pnpm exec tsx scripts/three-creator/mcp.ts --workspace /absolute/author-project --profile three-sdk
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

Server: `worldkit_three_creator`. CLI sessions accept one JSON request per line:
`{"id":1,"name":"world_validate","arguments":{}}`. Keep the same session for
recording and submission. Long tools return operation IDs; poll with
`operations_get`. Failed calls return `error` plus structured `errorDetails`;
failed operations retain original identity and cause. Read evidence before retrying.

## Exploration and quality

The canonical [task requirements](agent/README.md) define reference fidelity,
world scope, visual style and completion checks. The [programming guide](agent/programming.md)
defines how tools collect the corresponding evidence.

## Project runtime source

`creator_materialize_runtime` copies browser SDK source into the author project.
Discovery reads that current source snapshot, identified by runtimeSourceHash;
Host examples are marked as baseline. Host asset policy, command transport and
project/episode validation remain independent. See
[workspace runtime implementation](workspace-runtime.ts) and
[SDK architecture](../../docs/three-sdk-architecture.md).

## Asset selection

The Host freezes [asset policy](../../config/three-creator/asset-policy.json)
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

The [record and submit guide](agent/programming.md#record-and-submit) is the Agent
workflow. The Host verifies current source/runtime/world/episode identity,
complete real-input video, files and captures; technical success is separate from
semantic/reference review. A local delivery contains `creator-result.json` and
`creator-delivery.tar.gz`, including playable, evidence, captures and source/runtime
identity. It does not publish or start external production.

Maintainers must verify direct schema consumers, source extraction, example
compilation, Creator and Episode behavior affected by a change, and toolkit
packaging. [Discovery](creator-discovery.ts) returns guides and referenced source;
[binding examples](binding-examples.ts) returns typed integration snippets and their hashed manifest; complete internal fixtures support maintainer regression.
Detailed SDK contracts stay in the [SDK manual](../../packages/three-world/README.md)
and actual source. Maintainer checks are not extra steps in each generation task.
