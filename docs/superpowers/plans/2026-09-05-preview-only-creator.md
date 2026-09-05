# Preview-first Creator change

User explicitly requested removing the self-test recording tool and letting the
Agent inspect the actual page. This supersedes the mandatory 180-second recorded
episode gate for new Creator deliveries. Existing v1 deliveries retain their
original evidence meaning; a new v2 delivery reports preview evidence and never
pretends to contain a playtest or video.

| ID | Goal / owned files | Depends on | Blocks | Evidence | Execution |
| --- | --- | --- | --- | --- | --- |
| P1 | Remove public world_playtest; add current-page keys/drag/click/wheel to world_preview; same-source preview submission v2. Own scripts/three-creator contract/tools/MCP and instructions. | none | P2,P3 | Real screenshots, trusted keyboard movement, release/reset and no recording/episode requirement | main-agent-only |
| P2 | Admit explicit v2 preview delivery through event verification, archive verification and gallery; keep old v1 checks. Own scripts/cloud delivery validators/stager/runtime doctor and gallery optional media. | P1 contract | P3 | v1 remains valid; v2 hash closure, no forged preview/old-source acceptance | main-agent-only |
| P3 | Test the actual no-video preview→input→preview→submit→unpack→stage path and installed cloud tools. | P1,P2 | completion | Targeted tests plus short real browser/cloud smoke, no new 180-second recording | main-agent-only |

Agent chooses what to inspect and where to move. The SDK continues to own input,
physics and camera runtime. The tool applies genuine browser input in the same
live page, returns a screenshot plus observable errors/state, and releases keys
at the end of each bounded action. No teleport, prescribed route, invented quality
score, minimum play duration or required episode file. Submission binds reviewed
opening and current source; there is no assistant or human review gate. Evaluate generated-world quality only
when the user explicitly requests it. Production syncing automatically exposes the
completed playable and never reads host-review records.
