import {
  parseRuntimeSessionSubjectSupportV1,
  type RuntimeSessionSubjectSupportV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import type {
  BabylonCharacterBodyCommittedSupportEvidenceV1,
  BabylonCharacterBodyNativeContactV1,
} from "./babylon-character-body-port";

export type CommittedSupportSelectionErrorCodeV1 =
  | "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE"
  | "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE"
  | "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_AMBIGUOUS"
  | "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNREGISTERED_COLLIDER";

export class CommittedSupportSelectionErrorV1 extends Error {
  readonly name = "CommittedSupportSelectionErrorV1";

  constructor(readonly code: CommittedSupportSelectionErrorCodeV1) {
    super(`${code}: Committed Subject support evidence is not admissible.`);
    Object.freeze(this);
  }
}

function reject(code: CommittedSupportSelectionErrorCodeV1): never {
  throw new CommittedSupportSelectionErrorV1(code);
}

function supportIdentityKey(
  contact: BabylonCharacterBodyNativeContactV1,
): string {
  if (
    isNil(contact.colliderId) ||
    isNil(contact.colliderSubshapeId) ||
    isNil(contact.logicalSubshapeId) ||
    isNil(contact.traversalSurfaceId) ||
    isNil(contact.surfaceEntityId) ||
    isNil(contact.traversalSurfaceProfileRef)
  ) return reject("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE");
  return [
    contact.colliderId,
    contact.colliderSubshapeId,
    contact.logicalSubshapeId,
    contact.traversalSurfaceId,
    contact.surfaceEntityId,
    contact.traversalSurfaceProfileRef,
  ].join("\0");
}

export function selectUniqueCommittedSupportContactV1(input: Readonly<{
  evidence: BabylonCharacterBodyCommittedSupportEvidenceV1;
  committedTick: number;
}>): BabylonCharacterBodyNativeContactV1 {
  if (
    input.evidence.tick !== input.committedTick ||
    input.evidence.support.mode !== "supported"
  ) return reject("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE");
  if (input.evidence.contacts.length === 0) {
    return reject("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE");
  }
  const contactsByIdentity = new Map<
    string,
    BabylonCharacterBodyNativeContactV1[]
  >();
  for (const contact of input.evidence.contacts) {
    const key = supportIdentityKey(contact);
    contactsByIdentity.set(key, [
      ...(contactsByIdentity.get(key) ?? []),
      contact,
    ]);
  }
  if (contactsByIdentity.size !== 1) {
    return reject("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_AMBIGUOUS");
  }
  return [...contactsByIdentity.values()][0]!
    .toSorted((left, right) => left.distanceMeters - right.distanceMeters)[0]!;
}

export function projectRuntimeSessionSubjectSupportV1(input: Readonly<{
  evidence: BabylonCharacterBodyCommittedSupportEvidenceV1;
  runtimeSessionId: string;
  worldSessionId: string;
  subjectEntityId: string;
  expectedSimulationTick: number;
  registeredColliderIds: ReadonlySet<string>;
}>): RuntimeSessionSubjectSupportV1 {
  const contact = selectUniqueCommittedSupportContactV1({
    evidence: input.evidence,
    committedTick: input.expectedSimulationTick,
  });
  if (
    isNil(contact.colliderId) ||
    !input.registeredColliderIds.has(contact.colliderId)
  ) return reject("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNREGISTERED_COLLIDER");
  return parseRuntimeSessionSubjectSupportV1({
    kind: "worldkit-runtime-session-subject-support",
    schemaVersion: 1,
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId: input.worldSessionId,
    subjectEntityId: input.subjectEntityId,
    simulationTick: input.expectedSimulationTick,
    mode: "supported",
    sampledControllerCenterMetersXYZ:
      input.evidence.sampledControllerCenterMetersXYZ,
    sampledFootPointMetersXYZ: input.evidence.sampledFootPointMetersXYZ,
    pointMetersXYZ: contact.pointMetersXYZ,
    normalXYZ: contact.normalXYZ,
    distanceMeters: contact.distanceMeters,
    colliderId: contact.colliderId,
    colliderSubshapeId: contact.colliderSubshapeId,
    logicalSubshapeId: contact.logicalSubshapeId,
    traversalSurfaceId: contact.traversalSurfaceId,
    surfaceEntityId: contact.surfaceEntityId,
    traversalSurfaceProfileRef: contact.traversalSurfaceProfileRef,
  });
}
