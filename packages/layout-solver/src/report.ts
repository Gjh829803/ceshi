import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { LayoutSolveReportV1 } from "./types.js";

export function hashLayoutSolveReportV1(
  report: LayoutSolveReportV1,
): `sha256:${string}` {
  if (Object.hasOwn(report, "layoutSolveReportHash")) {
    throw new Error("LAYOUT_REPORT_SELF_HASH_FORBIDDEN");
  }
  return sha256CanonicalJson(report) as `sha256:${string}`;
}
