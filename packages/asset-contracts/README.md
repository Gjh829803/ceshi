# Asset contracts

This package owns the Registry v1 wire schemas, portable types and canonical JSON rules. It has no dependency on Three, Creator, engine presets or specific assets.

Use the main export in browser-safe code, and the `./validate` export for full Node schema validation. Errors expose code, status, retryable and details.

The standalone asset library receives a generated copy through `node scripts/assets/sync-asset-contracts.mjs`. Its validator uses the library's vendored Ajv; all contract data remains generated from this package. Run the command with `--check` to detect drift.

`RuntimeEvidence` pins verified asset/runtime/adapter/preset identities. `RuntimeValidation` permits report-path strings for diagnostics but requires structured evidence for verified runtime claims. Authoring and manifest validation share `assertValidationEvidence`; another asset/version cannot borrow a record.
