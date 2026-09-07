# Restore smooth opening follow with original accounts

User authorization: merge the previous smooth camera version and repeat the two
cloud cases using original good-result accounts. Base: a2e2c488 (current xhigh
self-check prompt and account records). Feature source: 2a7a2f9b.

The five camera implementation/test/contract/README/example files are copied
exactly from that commit. Ordinary follow inherits authored pose and framing,
smooths player translation, and fixes the legacy destination-quaternion alias.
No broader collision/UI/recovery migration or new normal prompt edits belong here.
Explicit orbit settings continue to select intentional target framing.

| Task | Dependencies | Resources and output | Verification | Execution |
| --- | --- | --- | --- | --- |
| C1 | none | Isolated branch codex/creator-opening-good-accounts; five feature files and this authority | Exact donor byte comparison; focused camera/SDK and Creator tests; typecheck | main-agent-only |
| C2 | C1 | Existing immutable c45b168a runtime; verification receipts only | Installed lock, all SDK/Creator source and launchers match audited source; SDK d9c8496e | sequential |
| C3 | C2 | New isolated two-case run; unchanged 77f48b60 prompt; A/B account pins | Explicit lock on prepare/run; payload diff; actual CLI/model/account evidence | sequential; cases concurrent |
| C4 | C3 | Distinct eval publication and account ledger entries | Deliveries directly playable; actual account versus requested; no assistant gate | main-agent-only |

Keep the active no-camera control run and its processes intact. New results must
not race its gallery publisher. Use a separate run URL while both are active,
or move the main gallery after the control publisher is finished and archived.
Do not send generated Agents case-specific repair hints or modify their worlds.
Failed or unavailable account attempts retain their IDs and diagnostics; never
silently switch accounts. User quality feedback and technical status stay separate.
