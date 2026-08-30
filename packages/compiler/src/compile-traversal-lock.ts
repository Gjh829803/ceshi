import type {
  NormalizedWorldIRV4,
  ResolvedResourceKindV1,
  ResolvedResourceLockEntryV1,
} from "@whitebox-world/authoring";
import {
  worldResourceLockEntriesV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  resolveTraversalLockV1,
  type ResolvedTraversalLockReceiptV1,
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
  world: NormalizedWorldIRV4,
): ReadonlyMap<string, ResolvedResourceLockEntryV1> {
  const rowsByRef = new Map<string, ResolvedResourceLockEntryV1>();
  for (const row of world.resources.resourceLock) {
    if (rowsByRef.has(row.resourceRef)) {
      fail(`duplicate resource-lock row '${row.resourceRef}'.`);
    }
    rowsByRef.set(row.resourceRef, row);
  }
  return rowsByRef;
}

function requireLockedResource(
  rowsByRef: ReadonlyMap<string, ResolvedResourceLockEntryV1>,
  resourceRef: string,
  expectedKind: ResolvedResourceKindV1,
): ResolvedResourceLockEntryV1 {
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
  const subject = worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
    (row) => row.entityId === input.traversingEntityId,
  );
  if (isNil(subjectInstance) || isNil(subject)) {
    fail(`traversing Subject '${input.traversingEntityId}' is not compiled.`);
  }
  const definition = input.normalizedWorldIr.resources.subjectDefinitions.find(
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
  if (definition.colliderPolicy.kind !== "profile") {
    fail("an explicit Collider Profile is required.");
  }
  const colliderProfileRef = definition.colliderPolicy.colliderProfileRef;
  if (!isEqual(subject.collider, definition.collider)) {
    fail("compiled Subject collider does not match the normalized Subject collider authority.");
  }

  const normalizedColliderProfile = input.normalizedWorldIr.resources.colliderProfiles.find(
    (row) => row.colliderProfileRef === colliderProfileRef,
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

  const groundCapabilities = definition.capabilityRefs.filter(
    (resourceRef) => resourceRef === GROUND_LOCOMOTION_CAPABILITY_REF,
  );
  if (groundCapabilities.length !== 1) {
    fail("exactly one compatible ground-locomotion capability is required.");
  }

  const rowsByRef = indexResourceLock(input.normalizedWorldIr);
  const locked = (
    resourceRef: string,
    kind: ResolvedResourceKindV1,
  ): ResolvedResourceLockEntryV1 => requireLockedResource(rowsByRef, resourceRef, kind);

  locked(subject.subjectDefinitionRef, "subject-definition");
  const colliderProfile = locked(
    colliderProfileRef,
    "collider-profile",
  );
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

  return resolveTraversalLockV1({
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: subject.entityId,
    resourceLockHash: actualResourceLockHash as `sha256:${string}`,
    subjectDefinitionRef: subject.subjectDefinitionRef,
    subjectDefinitionHash: subject.subjectDefinitionHash,
    colliderProfileRef: colliderProfile.resourceRef,
    colliderProfileHash: colliderProfile.contentHash,
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
