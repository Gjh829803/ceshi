import type {
  NormalizedWorldIRV4,
  ResolvedResourceKindV1,
} from "@whitebox-world/authoring";
import {
  worldResourceLockEntriesV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
  type WorldResourceLockEntryV1,
} from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  resolveTraversalLockV1,
  type ResolvedTraversalLockReceiptV1,
  type TraversalColliderSourceV1,
  type TraversalRuntimeImplementationIdentityV1,
} from "@whitebox-world/traversal";
import { isEqual, isNil } from "lodash-es";

const GROUND_LOCOMOTION_CAPABILITY_REF =
  "worldkit://capability/locomotion.ground@1";

export interface CompileResolvedTraversalLockInputV1 {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly traversingEntityId: string;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
}

function fail(message: string): never {
  throw new Error(`TRAVERSAL_LOCK_COMPILE_FAILED: ${message}`);
}

function indexResourceLock(
  rows: readonly WorldResourceLockEntryV1[],
): ReadonlyMap<string, WorldResourceLockEntryV1> {
  const rowsByRef = new Map<string, WorldResourceLockEntryV1>();
  for (const row of rows) {
    if (rowsByRef.has(row.resourceRef)) {
      fail(`duplicate resource-lock row '${row.resourceRef}'.`);
    }
    rowsByRef.set(row.resourceRef, row);
  }
  return rowsByRef;
}

function requireLockedResource(
  rowsByRef: ReadonlyMap<string, WorldResourceLockEntryV1>,
  resourceRef: string,
  expectedKind: ResolvedResourceKindV1,
): WorldResourceLockEntryV1 {
  const row = rowsByRef.get(resourceRef);
  if (isNil(row)) {
    fail(`missing ${expectedKind} '${resourceRef}'.`);
  }
  if (row.resourceKind !== expectedKind) {
    fail(
      `'${resourceRef}' is '${row.resourceKind}', expected '${expectedKind}'.`,
    );
  }
  return row;
}

export function compileResolvedTraversalLockV1(
  input: CompileResolvedTraversalLockInputV1,
): ResolvedTraversalLockReceiptV1 {
  let canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
  let worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  try {
    canonicalSceneExecutionPlan = parseCanonicalSceneExecutionPlanV1(
      input.canonicalSceneExecutionPlan,
    );
    worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(
      input.worldRuntimeBootstrap,
    );
  } catch {
    fail("Canonical Scene Plan or Runtime Bootstrap is invalid.");
  }
  if (
    canonicalSceneExecutionPlan.worldRuntimeBootstrapHash !==
      worldRuntimeBootstrap.contentHash
  ) {
    fail("Canonical Scene Plan does not link the supplied Runtime Bootstrap.");
  }
  const subjectInstance = canonicalSceneExecutionPlan.subjectInstances.find(
    (row) => row.entityId === input.traversingEntityId,
  );
  if (isNil(subjectInstance)) {
    fail("traversing Subject is not in the Canonical Scene Plan.");
  }
  const receipt = compileSubjectTraversalLockV1({
    resources: input.normalizedWorldIr.resources,
    worldRuntimeBootstrap,
    traversingEntityId: input.traversingEntityId,
    runtimeImplementationIdentity: input.runtimeImplementationIdentity,
  });
  let canonicalResourceLock: ReturnType<
    typeof worldResourceLockEntriesV1
  >;
  let canonicalSceneResourceLock: ReturnType<
    typeof worldResourceLockEntriesV1
  >;
  let canonicalRuntimeResourceLock: ReturnType<
    typeof worldResourceLockEntriesV1
  >;
  try {
    canonicalResourceLock = worldResourceLockEntriesV1(
      input.normalizedWorldIr.resources.resourceLock,
    );
    canonicalSceneResourceLock = worldResourceLockEntriesV1(
      canonicalSceneExecutionPlan.sceneResourceLockEntries,
    );
    canonicalRuntimeResourceLock = worldResourceLockEntriesV1(
      worldRuntimeBootstrap.runtimeResourceLockEntries,
    );
  } catch {
    fail("Resource Lock entries are invalid.");
  }
  const actualResourceLockHash = sha256CanonicalJson(canonicalResourceLock);
  const expectedSceneResourceLock = canonicalResourceLock.filter(
    (row) => row.resourceKind === "traversal-surface-profile",
  );
  const expectedRuntimeBaseResourceLock = canonicalResourceLock.filter(
    (row) => row.resourceKind !== "traversal-surface-profile",
  );
  const gameplayBootstrapRows = canonicalRuntimeResourceLock.filter(
    (row) => row.resourceKind === "gameplay-bootstrap",
  );
  const canonicalRuntimeBaseResourceLock = canonicalRuntimeResourceLock.filter(
    (row) => row.resourceKind !== "gameplay-bootstrap",
  );
  const actualSceneResourceLockHash = sha256CanonicalJson(
    canonicalSceneResourceLock,
  );
  if (input.normalizedWorldIr.resources.resourceLockHash !==
      actualResourceLockHash ||
    canonicalSceneExecutionPlan.sceneResourceLockHash !==
      actualSceneResourceLockHash ||
    !isEqual(
      canonicalSceneExecutionPlan.sceneResourceLockEntries,
      canonicalSceneResourceLock,
    ) ||
    !isEqual(canonicalSceneResourceLock, expectedSceneResourceLock) ||
    gameplayBootstrapRows.length !== 1 ||
    !isEqual(
      canonicalRuntimeBaseResourceLock,
      expectedRuntimeBaseResourceLock,
    )) {
    fail(
      "Resource Lock hash does not match the Normalized World, Canonical Scene Plan, or Runtime Bootstrap.",
    );
  }

  return receipt;
}

export type NormalizedSubjectTraversalResourcesV1 = Pick<
  NormalizedWorldIRV4["resources"], "subjectDefinitions" | "colliderProfiles"
> & {
  readonly resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"] |
    readonly WorldResourceLockEntryV1[];
};

export interface CompileSubjectTraversalLockInputV1 {
  readonly resources: NormalizedSubjectTraversalResourcesV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly traversingEntityId: string;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
}

/** Shared trusted Subject/resource projection for Canonical and Native Ground. */
export function compileSubjectTraversalLockV1(
  input: CompileSubjectTraversalLockInputV1,
): ResolvedTraversalLockReceiptV1 {
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
  const subject = worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
    (row) => row.entityId === input.traversingEntityId,
  );
  if (isNil(subject)) {
    fail(`traversing Subject '${input.traversingEntityId}' is not compiled.`);
  }
  const definition = input.resources.subjectDefinitions.find(
    (row) => row.subjectDefinitionRef === subject.subjectDefinitionRef,
  );
  if (isNil(definition) ||
    definition.subjectDefinitionHash !== subject.subjectDefinitionHash) {
    fail(`Subject Definition '${subject.subjectDefinitionRef}' is not locked consistently.`);
  }
  if (isNil(subject.capabilityAssembly) ||
    isNil(definition.capabilityAssembly)) {
    fail("capability-driven Subject assembly is required.");
  }
  if (!isEqual(subject.collider, definition.collider)) {
    fail("compiled Subject collider does not match the normalized Subject collider authority.");
  }

  const groundCapabilities = definition.capabilityRefs.filter(
    (resourceRef) => resourceRef === GROUND_LOCOMOTION_CAPABILITY_REF,
  );
  if (groundCapabilities.length !== 1) {
    fail("exactly one compatible ground-locomotion capability is required.");
  }

  const rowsByRef = indexResourceLock(worldResourceLockEntriesV1(input.resources.resourceLock));
  const locked = (
    resourceRef: string,
    kind: ResolvedResourceKindV1,
  ): WorldResourceLockEntryV1 => requireLockedResource(rowsByRef, resourceRef, kind);

  // Resource locks hash source Definition bytes; the normalized Definition hash
  // is joined to the compiled descriptor above. Those are distinct identities.
  locked(subject.subjectDefinitionRef, "subject-definition");
  const policy = definition.colliderPolicy;
  let colliderSource: TraversalColliderSourceV1;
  if (policy.kind === "profile") {
    const colliderProfile = locked(policy.colliderProfileRef, "collider-profile");
    const normalizedColliderProfile = input.resources.colliderProfiles.find(
      (row) => row.colliderProfileRef === policy.colliderProfileRef,
    );
    if (isNil(normalizedColliderProfile) ||
      !isEqual(normalizedColliderProfile.collider, {
        kind: definition.collider.kind,
        radiusMeters: definition.collider.radiusMeters,
        heightMeters: definition.collider.heightMeters,
        centerOffsetFromSubjectOriginMetersXYZ:
          definition.collider.centerOffsetFromSubjectOriginMetersXYZ,
      })) {
      fail("normalized Subject collider does not match its locked Collider Profile.");
    }
    colliderSource = {
      kind: "profile",
      colliderProfileRef: colliderProfile.resourceRef,
      colliderProfileHash: colliderProfile.contentHash as `sha256:${string}`,
    };
  } else {
    const derivation = locked(policy.colliderDerivationProfileRef, "collider-derivation-profile");
    colliderSource = {
      kind: "derive",
      colliderDerivationProfileRef: derivation.resourceRef,
      colliderDerivationProfileHash: derivation.contentHash as `sha256:${string}`,
    };
  }
  const physicsBodyProfile = locked(
    subject.physicsBodyProfileRef,
    "physics-body-profile",
  );
  const locomotionProfile = locked(
    subject.locomotionProfileRef,
    "locomotion-profile",
  );
  const locomotionCapability = locked(
    groundCapabilities[0]!,
    "capability",
  );
  if (locomotionCapability.resourceRef !== subject.locomotionCapabilityRef ||
    locomotionCapability.contentHash !== subject.locomotionCapabilityHash) {
    fail("compiled Subject locomotion capability identity is stale.");
  }
  const controlFeelProfile = locked(
    subject.controlFeel.resourceRef,
    "control-feel-profile",
  );
  if (controlFeelProfile.contentHash !== subject.controlFeel.contentHash) {
    fail(`Control Feel Profile '${subject.controlFeel.resourceRef}' hash does not match the plan.`);
  }
  const assembly = subject.capabilityAssembly;
  const definitionAssembly = definition.capabilityAssembly;
  if (isNil(assembly.controlProfile) ||
    isNil(assembly.defaultMotionProfile) ||
    isNil(assembly.mediumProfile) ||
    isNil(definitionAssembly.controlProfile) ||
    isNil(definitionAssembly.defaultMotionProfile) ||
    isNil(definitionAssembly.mediumProfile)) {
    fail("capability-driven Subject assembly is incomplete.");
  }
  if (subject.physicsBodyProfileRef !== definition.profiles.physicsBodyProfileRef ||
    assembly.physicsBodyProfileRef !== definitionAssembly.physicsBodyProfileRef ||
    subject.locomotionProfileRef !== definition.profiles.locomotionProfileRef ||
    assembly.locomotionProfileRef !== definitionAssembly.locomotionProfileRef ||
    subject.controlFeel.resourceRef !== definition.controlFeel.resourceRef ||
    subject.controlFeel.contentHash !== definition.controlFeel.contentHash) {
    fail("compiled Subject Profile identities do not match the normalized Definition.");
  }
  const controlProfile = locked(assembly.controlProfile.resourceRef, "control-profile");
  if (controlProfile.contentHash !== assembly.controlProfile.contentHash ||
    assembly.controlProfile.resourceRef !== definitionAssembly.controlProfile.resourceRef ||
    assembly.controlProfile.contentHash !== definitionAssembly.controlProfile.contentHash) {
    fail(`Control Profile '${assembly.controlProfile.resourceRef}' hash does not match the plan.`);
  }
  const motionProfile = locked(
    assembly.defaultMotionProfile.resourceRef,
    "motion-profile",
  );
  if (motionProfile.contentHash !== assembly.defaultMotionProfile.contentHash ||
    assembly.defaultMotionProfile.resourceRef !==
      definitionAssembly.defaultMotionProfile.resourceRef ||
    assembly.defaultMotionProfile.contentHash !==
      definitionAssembly.defaultMotionProfile.contentHash ||
    assembly.defaultMotionProfile.motionKernelRef !==
      definitionAssembly.defaultMotionProfile.motionKernelRef) {
    fail(`Motion Profile '${assembly.defaultMotionProfile.resourceRef}' hash does not match the plan.`);
  }
  const motionKernel = locked(
    assembly.defaultMotionProfile.motionKernelRef,
    "motion-kernel",
  );
  const mediumProfile = locked(
    assembly.mediumProfile.resourceRef,
    "medium-profile",
  );
  if (mediumProfile.contentHash !== definitionAssembly.mediumProfile.contentHash ||
    assembly.mediumProfile.resourceRef !== definitionAssembly.mediumProfile.resourceRef ||
    !isEqual(assembly.mediumProfile.air, definitionAssembly.mediumProfile.air)) {
    fail(`Medium Profile '${assembly.mediumProfile.resourceRef}' does not match the plan.`);
  }
  return resolveTraversalLockV1({
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: subject.entityId,
    resourceLockHash: sha256CanonicalJson(worldResourceLockEntriesV1(input.resources.resourceLock)),
    subjectDefinitionRef: subject.subjectDefinitionRef,
    subjectDefinitionHash: subject.subjectDefinitionHash,
    colliderSource,
    physicsBodyProfileRef: physicsBodyProfile.resourceRef,
    physicsBodyProfileHash: physicsBodyProfile.contentHash,
    locomotionProfileRef: locomotionProfile.resourceRef,
    locomotionProfileHash: locomotionProfile.contentHash,
    locomotionCapabilityRef: locomotionCapability.resourceRef,
    locomotionCapabilityHash: locomotionCapability.contentHash,
    controlFeelProfileRef: controlFeelProfile.resourceRef,
    controlFeelProfileHash: controlFeelProfile.contentHash,
    controlProfileRef: controlProfile.resourceRef,
    controlProfileHash: controlProfile.contentHash,
    motionProfileRef: motionProfile.resourceRef,
    motionProfileHash: motionProfile.contentHash,
    motionKernelRef: motionKernel.resourceRef,
    motionKernelHash: motionKernel.contentHash,
    mediumProfileRef: mediumProfile.resourceRef,
    mediumProfileHash: mediumProfile.contentHash,
    ...input.runtimeImplementationIdentity,
    capsuleRadiusMeters: subject.collider.radiusMeters,
    capsuleHeightMeters: subject.collider.heightMeters,
    colliderCenterOffsetMetersXYZ:
      subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    maxSlopeDegrees: subject.collider.maxSlopeDegrees,
    maxStepHeightMeters: subject.collider.maxStepHeightMeters,
  });
}
