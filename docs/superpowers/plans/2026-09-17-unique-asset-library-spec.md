# Unique asset library migration

User requirement: on codex/subject-library-demo, make asset-library the only authoring asset library, remove previous asset folders and live source paths, and use the new chain for all subsequent work.

The existing worktree is the requested branch. Do not delete other worktrees, the main checkout, original purchased packages or unrelated authored-project assets. Delete this branch's assets/ only after a hash coverage report accounts for every old file. Content-addressed assets/ inside immutable compiled deliveries are generated output and remain supported.

Authoritative subject resources, bindings, metadata, dedicated content parameters and sources belong in asset-library. SDK algorithms and general controller defaults remain code. Catalogs, compiled adapters and package snapshots are generated output, never separately maintained source. No fallback reads the previous folders. Preserve asset IDs, resource bytes, production policy and fixed-runtime ownership.

The library can be local, relocated with ASSET_LIBRARY_ROOT, or served through ASSET_LIBRARY_URL. Public Creator synchronous policy access must consume a prepared remote catalog or fail explicitly, never read a different local catalog. Production startup prepares remote metadata before constructing the service. Read and hash resource bytes from the same selected source. Immutable Episode deliveries retain their original hashes and do not rebind to a live library.

Acceptance: old assets directory absent; operational old-path references absent; exact-byte coverage saved; new-source failure never falls back; source metadata edits regenerate adapters; local/remote/relocated Creator resource reads pass; Playground, Creator compilation, asset policy and Episode delivery contracts pass; docs point to the sole source.
