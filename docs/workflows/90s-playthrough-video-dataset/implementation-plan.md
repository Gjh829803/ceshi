# Six-start Episode implementation plan

| ID | Deliverable | Depends on | Execution | Verification |
|---|---|---|---|---|
| E1 | Plan V3 constants, Skill and structural checker | — | main-agent-only | six starts, 180s, 4320 frames |
| E2 | Host capture relocation in Runtime/Browser adapter | E1 | sequential | reset-safe exact start pose |
| E3 | Six independent deterministic 720-frame recordings | E2 | sequential | real frame count, Tick/motion health |
| E4 | Reconstruct six styled openings and one shared tri-view set | E3 | sequential | input hashes and shared tri-view manifest |
| E5 | One Gemini request for 5 events at 0.25fps | E4 | sequential | one call, 2/2/1 slots, schema closure |
| E6 | Detailed tri-view-aware Seedance prompts | E5 | parallel-safe by Segment | locked video/camera/space authority |
| E7 | Direct Seedance 2.5 + MG/CF fallback router | E6 | parallel-safe by Segment | one primary durable Job ID; fallback only after confirmed terminal failure; audio, 30s, final 720p |
| E8 | Final media conformance, Studio, ZIP and S3 | E3/E7 | sequential | six comparisons, six whiteboxes, manifest |

E1–E8 are implemented in the current branch. Production acceptance additionally requires focused
tests, typecheck/build, project credential verification, an updated digest-pinned Cloud Episode
Worker image and one real end-to-end case visible in Studio.

The current release explicitly removes the former 31-second segment/reset-buffer contract, MG
480p generation, CF upscaling and AI MediaKit enhancement from the active Episode path. Legacy
artifact names remain read-only in Studio so historical review cases continue to open.
