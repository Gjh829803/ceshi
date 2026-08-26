import {
  hashAuthoringEditPolicyProjectionV1,
  type AuthoringEditScopeV1,
  type Sha256HashV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeRequestV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";

import { worldChangeDiagnostic } from "../diagnostics.js";
import type { AuthoringEditSessionV1 } from "./types.js";

export function requiredWorldChangeScopesV1(
  request: WorldChangeRequestV1,
): readonly AuthoringEditScopeV1[] {
  if (request.mode === "validate") return ["authoring.change.validate"];
  if (request.mode === "dry-run") return ["authoring.change.dry-run"];
  if (request.requestedOutcome === "publish-runtime") {
    return ["authoring.change.apply", "authoring.runtime.publish"];
  }
  return ["authoring.change.apply"];
}

function hasScopes(
  session: AuthoringEditSessionV1,
  scopes: readonly AuthoringEditScopeV1[],
): boolean {
  return scopes.every((scope) => session.scopes.includes(scope));
}

export function sessionAuthorizationDiagnosticV1(input: {
  readonly session: AuthoringEditSessionV1;
  readonly expectedSessionId: string;
  readonly requiredScopes: readonly AuthoringEditScopeV1[];
  readonly nowUnixMilliseconds: number;
  readonly worldId?: string;
  readonly expectedAuthorizationEpoch?: number;
  readonly expectedPolicyHash?: Sha256HashV1;
  readonly allowExpiredSession?: boolean;
}): WorldChangeDiagnosticV1 | undefined {
  const session = input.session;
  if (session.authoringEditSessionId !== input.expectedSessionId) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/authoringEditSessionId",
      "Authoring/Edit Session does not match the durable request.",
      { kind: "authorization-stale", reason: "session-revoked" },
    );
  }
  if (!session.isActive) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/authoringEditSessionId",
      "Authoring/Edit Session is no longer active.",
      { kind: "authorization-stale", reason: "session-revoked" },
    );
  }
  if (
    input.allowExpiredSession !== true &&
    input.nowUnixMilliseconds >= session.expiresAtUnixMilliseconds
  ) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/authoringEditSessionId",
      "Authoring/Edit Session expired.",
      { kind: "authorization-stale", reason: "session-expired" },
    );
  }
  if (!hasScopes(session, input.requiredScopes)) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED",
      "/authoringEditSessionId",
      "Authoring/Edit Session is missing a required Scope.",
    );
  }
  if (
    !isNil(input.worldId) &&
    !session.policy.allowedWorldIds.includes(input.worldId)
  ) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/worldId",
      "Authoring/Edit Session does not allow this World.",
    );
  }
  if (
    !isNil(input.expectedAuthorizationEpoch) &&
    session.authorizationEpoch !== input.expectedAuthorizationEpoch
  ) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/authoringEditSessionId",
      "Authoring/Edit authorization epoch drifted.",
      { kind: "authorization-stale", reason: "session-revoked" },
    );
  }
  if (
    !isNil(input.expectedPolicyHash) &&
    hashAuthoringEditPolicyProjectionV1(session.policy) !== input.expectedPolicyHash
  ) {
    return worldChangeDiagnostic(
      "WORLD_CHANGE_AUTHORIZATION_STALE",
      "/authoringEditPolicyHash",
      "Authoring/Edit Policy Hash drifted.",
      { kind: "authorization-stale", reason: "policy-hash-changed" },
    );
  }
  return undefined;
}
