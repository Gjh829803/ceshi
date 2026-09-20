# Contract changes

## Unreleased — v1 authoring and publication validation

The `1.0.0` Manifest read contract retains its original opaque `sections.validation`
object. Empty records, `runtime: unknown`, and older report-only records can still
be described, fetched and replayed from an immutable cache. Reading does not
normalize metadata or alter the manifest digest.

New publications and authoring validation require RuntimeValidation and exact
RuntimeEvidence through `assertValidationEvidence`. Report strings alone cannot
justify `runtime: verified`. Registry compatibility accepts only well-formed
structured evidence matching the asset, Runtime, adapter, preset and overrides;
missing or malformed evidence produces unknown. Unsupported contracts and explicit
incompatibility continue to be reported separately.

This preserves v1 transport compatibility without weakening the new write contract
or requiring old snapshots to be rewritten.
