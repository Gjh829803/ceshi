import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseWorkspaceBoundaryEvidenceV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../lib/workspace-boundary-contract";

export function parseWorkspaceBoundaryEvidenceInputV1(input: unknown): WorkspaceBoundaryEvidenceV1 {
  return parseWorkspaceBoundaryEvidenceV1(input);
}

export function workspaceBoundaryEvidenceRefV1(evidence: WorkspaceBoundaryEvidenceV1): string {
  return sha256CanonicalJson(parseWorkspaceBoundaryEvidenceV1(evidence));
}
