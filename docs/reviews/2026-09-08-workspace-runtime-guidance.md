# Workspace runtime guidance verification

Base: `5258fcf4`. Creator compilation can use authored `sdk/` sources while the
former discovery implementation still returned Host declarations and evaluated
capability cards. A changed slide minimum therefore compiled as 5 m/s but was
advertised as 2.5 m/s.

Discovery now uses one validated workspace source snapshot and reports its
`runtimeSourceHash`. Public/Training declarations and actual factory source come
from that snapshot. Exported definitions remain source text, never Host-executed
initializers. Workspace output omits evaluated Host capability/condition/binding
cards; catalog search and examples explicitly remain baseline references. Host
policy, command transport and delivery validation remain fixed.

Local verification:

- New five-test regression suite passed, including real browser inspection: actual
  speed between 2.5 and 5 m/s is rejected by the modified 5 m/s condition, and the
  inspected runtimeSourceHash matches discovery.
- Current source edits refresh the hash and declarations; source initializer code
  is not executed; missing files and symlinks fail without Host fallback; changed
  createWorld parameters do not inherit a synthetic Host factory signature.
- Creator suite exercised 217 tests: 216 initially passed, one existing dependency
  integrity test exceeded its 5-second timeout. The unchanged asset-policy suite
  was rerun alone: all 16 passed. No timeouts or assertions were relaxed.
- 43 mocked cloud contract tests, typecheck, test census (62 files), workspace
  boundaries and documentation link/diff checks passed.
- Runtime prebuild passed with unchanged SDK bytes:
  `dddaf44c10743c4ffd5456ed224152d492b349917eb7e9e943aed815853c9e46`.
- Independent review found the synthetic factory issue; its regression failed
  before the fix and passed afterward. Final re-review found no actionable issue.

This change affects Host guidance and inspection identity, not SDK behavior or
provider dispatch. No cloud generation or deployment was run.
