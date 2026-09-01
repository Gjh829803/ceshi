"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://worldkit.dev/schemas/world-runtime-bootstrap-v1.schema.json","title":"WorldRuntimeBootstrapV1","type":"object","additionalProperties":false,"required":["kind","schemaVersion","id","gameplayBootstrapRef","gameplayBootstrapHash","initialControlledEntityId","gravityMetersPerSecondSquaredXYZ","initialCamera","subjectAssets","rigProfiles","animationSets","colliderProfiles","actionPresentationRegistry","subjectRuntimeDescriptors","runtimeResourceLockEntries","contentHash"],"properties":{"kind":{"const":"world-runtime-bootstrap"},"schemaVersion":{"const":1},"id":{"$ref":"#/$defs/nonEmptyString"},"gameplayBootstrapRef":{"$ref":"#/$defs/nonEmptyString"},"gameplayBootstrapHash":{"$ref":"#/$defs/hash"},"initialControlledEntityId":{"$ref":"#/$defs/nonEmptyString"},"gravityMetersPerSecondSquaredXYZ":{"$ref":"#/$defs/vec3"},"initialCamera":{"$ref":"#/$defs/initialCamera"},"subjectAssets":{"type":"array","items":{"$ref":"#/$defs/subjectAsset"}},"rigProfiles":{"type":"array","items":{"$ref":"#/$defs/rigProfile"}},"animationSets":{"type":"array","items":{"$ref":"#/$defs/animationSet"}},"colliderProfiles":{"type":"array","items":{"$ref":"#/$defs/colliderProfile"}},"actionPresentationRegistry":{"$ref":"#/$defs/actionPresentationRegistry"},"subjectRuntimeDescriptors":{"type":"array","items":{"$ref":"#/$defs/subjectDescriptor"}},"runtimeResourceLockEntries":{"type":"array","items":{"$ref":"#/$defs/resourceLockEntry"}},"contentHash":{"$ref":"#/$defs/hash"}},"$defs":{"nonEmptyString":{"type":"string","minLength":1},"hash":{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},"vec3":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3},"stringArray":{"type":"array","items":{"$ref":"#/$defs/nonEmptyString"}},"cameraActionRef":{"type":"string","pattern":"^worldkit://semantic-action/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128},"cameraModifierRef":{"type":"string","pattern":"^worldkit://camera-modifier/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128},"cameraProfileRef":{"type":"string","pattern":"^worldkit://camera-profile/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128},"initialCamera":{"type":"object","additionalProperties":false,"required":["mode","cameraEntityId","targetEntityId","cameraRigProfileRef","pitchRadians","distanceMeters","targetHeightMeters","fovDegrees","manualSwitchAllowed"],"properties":{"mode":{"const":"third-person"},"cameraEntityId":{"$ref":"#/$defs/nonEmptyString"},"targetEntityId":{"$ref":"#/$defs/nonEmptyString"},"cameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"pitchRadians":{"type":"number"},"distanceMeters":{"type":"number","exclusiveMinimum":0},"targetHeightMeters":{"type":"number"},"fovDegrees":{"type":"number","exclusiveMinimum":0,"exclusiveMaximum":180},"manualSwitchAllowed":{"type":"boolean"}}},"subjectAssetInventory":{"type":"object","additionalProperties":false,"required":["meshCount","vertexCount","triangleCount","skeletonCount","boneCount","animationClipNames"],"properties":{"meshCount":{"type":"integer","minimum":0},"vertexCount":{"type":"integer","minimum":0},"triangleCount":{"type":"integer","minimum":0},"skeletonCount":{"type":"integer","minimum":0},"boneCount":{"type":"integer","minimum":0},"animationClipNames":{"$ref":"#/$defs/stringArray"}}},"subjectAsset":{"type":"object","additionalProperties":false,"required":["subjectAssetRef","artifactContentHash","byteLength","mediaType","format","inventory"],"properties":{"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"artifactContentHash":{"$ref":"#/$defs/hash"},"byteLength":{"type":"integer","minimum":0},"mediaType":{"const":"model/gltf-binary"},"format":{"const":"glb"},"inventory":{"$ref":"#/$defs/subjectAssetInventory"}}},"rigProfile":{"type":"object","additionalProperties":false,"required":["rigProfileRef","bodyTopology","skeletonRootBoneName","requiredBoneIds","sourceNodeNameByBoneId"],"properties":{"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"bodyTopology":{"const":"biped"},"skeletonRootBoneName":{"$ref":"#/$defs/nonEmptyString"},"requiredBoneIds":{"$ref":"#/$defs/stringArray"},"sourceNodeNameByBoneId":{"type":"object","propertyNames":{"$ref":"#/$defs/nonEmptyString"},"additionalProperties":{"$ref":"#/$defs/nonEmptyString"}}}},"animationBinding":{"type":"object","additionalProperties":false,"required":["actionId","sourceClipName","semanticFamily","automaticPresentationKeys","loopMode","playbackSpeedRatio","blendDurationSeconds","rootMotionMode"],"properties":{"actionId":{"$ref":"#/$defs/nonEmptyString"},"sourceClipName":{"$ref":"#/$defs/nonEmptyString"},"semanticFamily":{"enum":["ground","airborne","flight","water","posture","combat","emote","dance"]},"automaticPresentationKeys":{"$ref":"#/$defs/stringArray"},"loopMode":{"enum":["repeat","once"]},"playbackSpeedRatio":{"type":"number"},"blendDurationSeconds":{"type":"number"},"rootMotionMode":{"const":"in-place"}}},"animationSet":{"type":"object","additionalProperties":false,"required":["animationSetRef","subjectAssetRef","rigProfileRef","defaultActionId","requiredActionIds","animationBindings"],"properties":{"animationSetRef":{"$ref":"#/$defs/nonEmptyString"},"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"defaultActionId":{"$ref":"#/$defs/nonEmptyString"},"requiredActionIds":{"$ref":"#/$defs/stringArray"},"animationBindings":{"type":"array","items":{"$ref":"#/$defs/animationBinding"}}}},"subjectCapsule":{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters","centerOffsetFromSubjectOriginMetersXYZ"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0},"centerOffsetFromSubjectOriginMetersXYZ":{"$ref":"#/$defs/vec3"}}},"colliderProfile":{"type":"object","additionalProperties":false,"required":["colliderProfileRef","supportedBodyTopologies","collider"],"properties":{"colliderProfileRef":{"$ref":"#/$defs/nonEmptyString"},"supportedBodyTopologies":{"$ref":"#/$defs/stringArray"},"collider":{"$ref":"#/$defs/subjectCapsule"}}},"primitiveShape":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","sizeMetersXYZ"],"properties":{"kind":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/vec3"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters"],"properties":{"kind":{"const":"sphere"},"radiusMeters":{"type":"number","exclusiveMinimum":0}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"enum":["cylinder","capsule"]},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0}}}]},"localTransform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ","rotationEulerRadiansXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"}}},"subjectVisualPart":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","shape","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"primitive"},"shape":{"$ref":"#/$defs/primitiveShape"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","appearance","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"asset"},"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"localTransform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ","rotationEulerRadiansXYZ","scaleXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/vec3"}}},"appearance":{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"whitebox-neutral"}}},"semanticTags":{"$ref":"#/$defs/stringArray"}}}]},"subjectSocket":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"local"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["id","kind","boneId","offsetTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"bone"},"boneId":{"$ref":"#/$defs/nonEmptyString"},"offsetTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}}]},"mountSlot":{"type":"object","additionalProperties":false,"required":["id","kind","mode","mountSocketId","riderSubjectOriginOffsetMetersXYZ","dismountCandidateOffsetsMetersXYZ"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"mount-slot"},"mode":{"const":"stand"},"mountSocketId":{"$ref":"#/$defs/nonEmptyString"},"riderSubjectOriginOffsetMetersXYZ":{"$ref":"#/$defs/vec3"},"dismountCandidateOffsetsMetersXYZ":{"type":"array","items":{"$ref":"#/$defs/vec3"}}}},"subjectCollider":{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters","centerOffsetFromSubjectOriginMetersXYZ","massKilograms","maxSlopeDegrees","maxStepHeightMeters"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0},"centerOffsetFromSubjectOriginMetersXYZ":{"$ref":"#/$defs/vec3"},"massKilograms":{"type":"number","exclusiveMinimum":0},"maxSlopeDegrees":{"type":"number","minimum":0},"maxStepHeightMeters":{"type":"number","minimum":0}}},"controlFeel":{"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","jumpVariantPolicy","walkSpeedMetersPerSecond","runSpeedMetersPerSecond","jumpSpeedMetersPerSecond","accelerationMetersPerSecondSquared","decelerationMetersPerSecondSquared","turnRateRadiansPerSecond","moveResponseExponent","airControlRatio","coyoteTimeSeconds","jumpBufferSeconds","variableJumpHoldSeconds","jumpHoldGravityRatio","jumpReleaseGravityRatio"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"jumpVariantPolicy":{"$ref":"#/$defs/jumpVariantPolicy"},"walkSpeedMetersPerSecond":{"type":"number"},"runSpeedMetersPerSecond":{"type":"number"},"jumpSpeedMetersPerSecond":{"type":"number"},"accelerationMetersPerSecondSquared":{"type":"number"},"decelerationMetersPerSecondSquared":{"type":"number"},"turnRateRadiansPerSecond":{"type":"number"},"moveResponseExponent":{"type":"number"},"airControlRatio":{"type":"number"},"coyoteTimeSeconds":{"type":"number"},"jumpBufferSeconds":{"type":"number"},"variableJumpHoldSeconds":{"type":"number"},"jumpHoldGravityRatio":{"type":"number"},"jumpReleaseGravityRatio":{"type":"number"}}},"jumpVariantPolicy":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"hold-height"}}},{"type":"object","additionalProperties":false,"required":["mode","smallAnticipationSeconds","largeAnticipationSeconds"],"properties":{"mode":{"const":"run-selects-variant"},"smallAnticipationSeconds":{"type":"number","minimum":0,"maximum":1.5},"largeAnticipationSeconds":{"type":"number","minimum":0,"maximum":1.5}}}]},"motionProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","motionKernelRef","motionTags"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"motionKernelRef":{"$ref":"#/$defs/nonEmptyString"},"motionTags":{"$ref":"#/$defs/stringArray"}}},"motionKernel":{"type":"object","additionalProperties":false,"required":["resourceRef","implementationId","commandKind","supportedMediums","fallbackMotionProfileRef","deterministic"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"implementationId":{"enum":["free-ground","forward-steer","wheeled-arcade","surface-slide","water-surface","unpowered-glide"]},"commandKind":{"$ref":"#/$defs/motionCommandKind"},"supportedMediums":{"type":"array","items":{"enum":["ground","water","air"]}},"fallbackMotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"deterministic":{"const":true}}},"motionCommandKind":{"enum":["planar-vector","throttle-steer","flight-attitude","none"]},"controlProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","commandKind","inputSpace","facingPolicy","lateralMovementPolicy","moveDeadzoneRatio"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"commandKind":{"$ref":"#/$defs/motionCommandKind"},"inputSpace":{"enum":["camera-relative","subject-local","flight-frame","none"]},"facingPolicy":{"enum":["align-to-move","align-to-view","steering-derived","flight-derived","fixed"]},"lateralMovementPolicy":{"enum":["allowed","forbidden"]},"moveDeadzoneRatio":{"type":"number"}}},"cameraParameters":{"type":"object","additionalProperties":false,"required":["distanceMeters","minimumDistanceMeters","maximumDistanceMeters","targetHeightMeters","shoulderOffsetMeters","pitchRadians","minimumPitchRadians","maximumPitchRadians","positionDampingPerSecond","horizontalPositionDampingPerSecond","verticalPositionDampingPerSecond","maximumPositionLagMeters","rotationDampingPerSecond","yawDampingPerSecond","pitchDampingPerSecond","collisionRadiusMeters","collisionRetractionMetersPerSecond","collisionRecoveryMetersPerSecond","baseFovDegrees","speedFovDegreesPerMeterPerSecond","maximumSpeedFovDegrees","lookAheadSeconds","accelerationLookAheadSecondsSquared","transitionSeconds","minimumHeadingSpeedMetersPerSecond","velocityHeadingDampingPerSecond","fovDampingPerSecond","horizontalDeadZoneRatio","verticalDeadZoneRatio","recenterDelaySeconds","recenterDurationSeconds","recenterMinimumSpeedMetersPerSecond","teleportSnapDistanceMeters","lookSensitivityXRatio","lookSensitivityYRatio"],"properties":{"distanceMeters":{"type":"number"},"minimumDistanceMeters":{"type":"number"},"maximumDistanceMeters":{"type":"number"},"targetHeightMeters":{"type":"number"},"shoulderOffsetMeters":{"type":"number"},"pitchRadians":{"type":"number"},"minimumPitchRadians":{"type":"number"},"maximumPitchRadians":{"type":"number"},"positionDampingPerSecond":{"type":"number"},"horizontalPositionDampingPerSecond":{"type":"number"},"verticalPositionDampingPerSecond":{"type":"number"},"maximumPositionLagMeters":{"type":"number"},"rotationDampingPerSecond":{"type":"number"},"yawDampingPerSecond":{"type":"number"},"pitchDampingPerSecond":{"type":"number"},"collisionRadiusMeters":{"type":"number"},"collisionRetractionMetersPerSecond":{"type":"number"},"collisionRecoveryMetersPerSecond":{"type":"number"},"baseFovDegrees":{"type":"number"},"speedFovDegreesPerMeterPerSecond":{"type":"number"},"maximumSpeedFovDegrees":{"type":"number"},"lookAheadSeconds":{"type":"number"},"accelerationLookAheadSecondsSquared":{"type":"number"},"transitionSeconds":{"type":"number"},"minimumHeadingSpeedMetersPerSecond":{"type":"number"},"velocityHeadingDampingPerSecond":{"type":"number"},"fovDampingPerSecond":{"type":"number"},"horizontalDeadZoneRatio":{"type":"number"},"verticalDeadZoneRatio":{"type":"number"},"recenterDelaySeconds":{"type":"number"},"recenterDurationSeconds":{"type":"number"},"recenterMinimumSpeedMetersPerSecond":{"type":"number"},"teleportSnapDistanceMeters":{"type":"number"},"lookSensitivityXRatio":{"type":"number"},"lookSensitivityYRatio":{"type":"number"}}},"cameraRigProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","baseMode","algorithmRef","headingSource","reverseHeadingPolicy","recenterMode","preferredSocketIds","parameters"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"baseMode":{"enum":["first-person","free-orbit","stable-follow","speed-chase","flight-horizon"]},"algorithmRef":{"$ref":"#/$defs/nonEmptyString"},"headingSource":{"enum":["view","target-forward","target-velocity"]},"reverseHeadingPolicy":{"enum":["follow-velocity","preserve-target-forward"]},"recenterMode":{"enum":["off","forward-motion","always"]},"preferredSocketIds":{"$ref":"#/$defs/stringArray"},"parameters":{"$ref":"#/$defs/cameraParameters"},"authoringRanges":{"type":"object","propertyNames":{"enum":["distanceMeters","minimumDistanceMeters","maximumDistanceMeters","targetHeightMeters","shoulderOffsetMeters","pitchRadians","minimumPitchRadians","maximumPitchRadians","positionDampingPerSecond","horizontalPositionDampingPerSecond","verticalPositionDampingPerSecond","maximumPositionLagMeters","rotationDampingPerSecond","yawDampingPerSecond","pitchDampingPerSecond","collisionRadiusMeters","collisionRetractionMetersPerSecond","collisionRecoveryMetersPerSecond","baseFovDegrees","speedFovDegreesPerMeterPerSecond","maximumSpeedFovDegrees","lookAheadSeconds","accelerationLookAheadSecondsSquared","transitionSeconds","minimumHeadingSpeedMetersPerSecond","velocityHeadingDampingPerSecond","fovDampingPerSecond","horizontalDeadZoneRatio","verticalDeadZoneRatio","recenterDelaySeconds","recenterDurationSeconds","recenterMinimumSpeedMetersPerSecond","teleportSnapDistanceMeters","lookSensitivityXRatio","lookSensitivityYRatio"]},"additionalProperties":{"type":"object","additionalProperties":false,"required":["minimum","maximum","step"],"properties":{"minimum":{"type":"number"},"maximum":{"type":"number"},"step":{"type":"number"}}}}}},"cameraModifierProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","parameterOverrides"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"parameterOverrides":{"type":"object","propertyNames":{"$ref":"#/$defs/nonEmptyString"},"additionalProperties":{"type":"number"}},"headingSourceOverride":{"enum":["view","target-forward","target-velocity"]},"reverseHeadingPolicyOverride":{"enum":["follow-velocity","preserve-target-forward"]},"recenterModeOverride":{"enum":["off","forward-motion","always"]}}},"cameraRelationshipCondition":{"oneOf":[{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"possessedBy"},"entityRole":{"enum":["controlled","controller"]}}},{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"mountedOn"},"entityRole":{"const":"rider"}}},{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"equippedAt"},"entityRole":{"enum":["item","wearer"]}}}]},"cameraContextRule":{"type":"object","additionalProperties":false,"required":["id","priority","when"],"properties":{"id":{"type":"string","minLength":1,"maxLength":256},"priority":{"type":"integer"},"when":{"type":"object","additionalProperties":false,"properties":{"allRelationshipConditions":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraRelationshipCondition"}},"locomotionStatuses":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["active","suspended"]}},"mobilityModes":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["grounded","airborne"]}},"gaits":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["none","idle","walk","run"]}},"verticalPhases":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["none","takeoff","rising","apex","falling","landing"]}},"requiredActiveActionRefs":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraActionRef"}},"actionInterruptibility":{"enum":["interruptible","non-interruptible"]},"movementMediums":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["ground","air"]}},"minimumSpeedMetersPerSecond":{"type":"number","minimum":0},"maximumSpeedMetersPerSecond":{"type":"number","minimum":0},"requiredSocketIds":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$"}},"requiredCameraContextTags":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[a-z0-9]+(?:[.-][a-z0-9]+)*$"}}}},"cameraRigProfileRef":{"$ref":"#/$defs/cameraProfileRef"},"cameraModifierRefs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraModifierRef"}}}},"relationshipProfile":{"oneOf":[{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredRiderSocketIds","requiredMountSocketIds","controlTransferMode","cameraTargetRole"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"mountedOn"},"requiredRiderSocketIds":{"$ref":"#/$defs/stringArray"},"requiredMountSocketIds":{"$ref":"#/$defs/stringArray"},"controlTransferMode":{"enum":["keep-rider","to-mount","none"]},"cameraTargetRole":{"enum":["controlled-entity","rider","mount"]},"maximumMountDistanceMeters":{"type":"number"}}},{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredOccupantSocketIds","requiredSeatSocketIds"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"seat"},"requiredOccupantSocketIds":{"$ref":"#/$defs/stringArray"},"requiredSeatSocketIds":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredTetheredSocketIds","requiredTetherAnchorSocketIds"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"tether"},"requiredTetheredSocketIds":{"$ref":"#/$defs/stringArray"},"requiredTetherAnchorSocketIds":{"$ref":"#/$defs/stringArray"}}}]},"capabilityAssembly":{"type":"object","additionalProperties":false,"required":["authoringAvailability","physicsBodyProfileRef","locomotionProfileRef","defaultMotionProfile","optionalMotionProfiles","fallbackMotionProfile","motionKernels","controlProfile","cameraContext","mediumProfile","relationshipProfiles","harnessProfileRef","requiredHarnessCheckIds","actionOrPoseSetRef","renderBindingProfileRef"],"properties":{"authoringAvailability":{"enum":["recommended","advanced","experimental"]},"physicsBodyProfileRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"defaultMotionProfile":{"$ref":"#/$defs/motionProfile"},"optionalMotionProfiles":{"type":"array","items":{"$ref":"#/$defs/motionProfile"}},"fallbackMotionProfile":{"$ref":"#/$defs/motionProfile"},"motionKernels":{"type":"array","items":{"$ref":"#/$defs/motionKernel"}},"controlProfile":{"$ref":"#/$defs/controlProfile"},"cameraContext":{"type":"object","additionalProperties":false,"required":["resourceRef","defaultCameraRigProfileRef","rules","cameraRigProfiles","cameraModifierProfiles"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"defaultCameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"firstPersonCameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"rules":{"type":"array","items":{"$ref":"#/$defs/cameraContextRule"}},"cameraRigProfiles":{"type":"array","items":{"$ref":"#/$defs/cameraRigProfile"}},"cameraModifierProfiles":{"type":"array","items":{"$ref":"#/$defs/cameraModifierProfile"}}}},"mediumProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","air"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"air":{"type":"object","additionalProperties":false,"required":["gravityRatio","linearDragPerSecond"],"properties":{"gravityRatio":{"type":"number"},"linearDragPerSecond":{"type":"number"}}}}},"relationshipProfiles":{"type":"array","items":{"$ref":"#/$defs/relationshipProfile"}},"harnessProfileRef":{"$ref":"#/$defs/nonEmptyString"},"requiredHarnessCheckIds":{"$ref":"#/$defs/stringArray"},"actionOrPoseSetRef":{"$ref":"#/$defs/nonEmptyString"},"renderBindingProfileRef":{"$ref":"#/$defs/nonEmptyString"}}},"subjectDescriptor":{"type":"object","additionalProperties":false,"required":["entityId","subjectDefinitionRef","subjectDefinitionHash","bodyTopology","semanticClassId","forwardDirection","visualParts","visualBinding","sockets","mountSlots","collider","locomotion","locomotionCapabilityRef","locomotionCapabilityHash","physicsBodyProfileRef","locomotionProfileRef","controlFeel","availableControlFeels","capabilityAssembly"],"properties":{"entityId":{"$ref":"#/$defs/nonEmptyString"},"subjectDefinitionRef":{"$ref":"#/$defs/nonEmptyString"},"subjectDefinitionHash":{"$ref":"#/$defs/hash"},"bodyTopology":{"enum":["biped","quadruped","four-wheel","surface-craft","watercraft","glider","composite","custom"]},"semanticClassId":{"$ref":"#/$defs/nonEmptyString"},"forwardDirection":{"const":"-z"},"visualParts":{"type":"array","items":{"$ref":"#/$defs/subjectVisualPart"}},"visualBinding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"static"}}},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"animationSetRef":{"$ref":"#/$defs/nonEmptyString"}}}]},"sockets":{"type":"array","items":{"$ref":"#/$defs/subjectSocket"}},"mountSlots":{"type":"array","items":{"$ref":"#/$defs/mountSlot"}},"collider":{"$ref":"#/$defs/subjectCollider"},"locomotion":{"type":"object","additionalProperties":false,"required":["allowWalk","allowRun","allowJump"],"properties":{"allowWalk":{"type":"boolean"},"allowRun":{"type":"boolean"},"allowJump":{"type":"boolean"}}},"locomotionCapabilityRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionCapabilityHash":{"$ref":"#/$defs/hash"},"physicsBodyProfileRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"controlFeel":{"$ref":"#/$defs/controlFeel"},"availableControlFeels":{"type":"array","items":{"$ref":"#/$defs/controlFeel"}},"capabilityAssembly":{"$ref":"#/$defs/capabilityAssembly"}}},"actionPresentationRegistry":{"type":"object","additionalProperties":false,"required":["schemaVersion","bindings","rootMotionSources"],"properties":{"schemaVersion":{"const":1},"bindings":{"type":"array","items":{"$ref":"#/$defs/actionPresentationBinding"}},"rootMotionSources":{"type":"array","items":{"$ref":"#/$defs/rootMotionSource"}}}},"actionPresentationBinding":{"type":"object","additionalProperties":false,"required":["kind","schemaVersion","resourceRef","presentationKey","semanticActionRef","semanticActionHash","isInterruptible","clip","rootMotion","contentHash"],"properties":{"kind":{"const":"action-presentation-binding"},"schemaVersion":{"const":1},"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"presentationKey":{"type":"string","pattern":"^action\\..+$"},"semanticActionRef":{"$ref":"#/$defs/nonEmptyString"},"semanticActionHash":{"$ref":"#/$defs/hash"},"isInterruptible":{"type":"boolean"},"clip":{"type":"object","additionalProperties":false,"required":["sourceClipName","loopMode","playbackSpeedRatio","blendDurationTicks"],"properties":{"sourceClipName":{"$ref":"#/$defs/nonEmptyString"},"loopMode":{"enum":["repeat","once"]},"playbackSpeedRatio":{"type":"number"},"blendDurationTicks":{"type":"integer","minimum":0}}},"rootMotion":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"none"}}},{"type":"object","additionalProperties":false,"required":["mode","rootMotionSourceRef","rootMotionSourceHash","priority"],"properties":{"mode":{"const":"locked"},"rootMotionSourceRef":{"$ref":"#/$defs/nonEmptyString"},"rootMotionSourceHash":{"$ref":"#/$defs/hash"},"priority":{"type":"number"}}}]},"contentHash":{"$ref":"#/$defs/hash"}}},"rootMotionSource":{"type":"object","additionalProperties":false,"required":["schemaVersion","resourceRef","fixedDeltaSeconds","samples","contentHash"],"properties":{"schemaVersion":{"const":1},"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"fixedDeltaSeconds":{"type":"number","exclusiveMinimum":0},"samples":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["translationDeltaMetersXYZ","facingYawDeltaRadians"],"properties":{"translationDeltaMetersXYZ":{"$ref":"#/$defs/vec3"},"facingYawDeltaRadians":{"type":"number"}}}},"contentHash":{"$ref":"#/$defs/hash"}}},"resourceLockEntry":{"type":"object","additionalProperties":false,"required":["resourceRef","resourceKind","resolvedVersion","contentHash"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"resourceKind":{"enum":["subject-definition","subject-asset","rig-profile","animation-set","collider-profile","capability","physics-body-profile","locomotion-profile","control-feel-profile","collider-derivation-profile","motion-kernel","motion-profile","control-profile","camera-rig-algorithm","camera-rig-profile","camera-modifier-profile","camera-context-profile","medium-profile","relationship-profile","harness-profile","pose-set-profile","render-binding-profile","ai-schema-projection-profile","gameplay-bootstrap"]},"resolvedVersion":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"}}}}};
const schema32 = {"type":"string","minLength":1};
const schema34 = {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"};
const schema36 = {"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3};
const func1 = Object.prototype.hasOwnProperty;
import func2Module from "ajv/dist/runtime/ucs2length.js";
const func2 = typeof func2Module === "function" ? func2Module : func2Module.default;
const pattern4 = new RegExp("^sha256:[a-f0-9]{64}$", "u");
const schema37 = {"type":"object","additionalProperties":false,"required":["mode","cameraEntityId","targetEntityId","cameraRigProfileRef","pitchRadians","distanceMeters","targetHeightMeters","fovDegrees","manualSwitchAllowed"],"properties":{"mode":{"const":"third-person"},"cameraEntityId":{"$ref":"#/$defs/nonEmptyString"},"targetEntityId":{"$ref":"#/$defs/nonEmptyString"},"cameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"pitchRadians":{"type":"number"},"distanceMeters":{"type":"number","exclusiveMinimum":0},"targetHeightMeters":{"type":"number"},"fovDegrees":{"type":"number","exclusiveMinimum":0,"exclusiveMaximum":180},"manualSwitchAllowed":{"type":"boolean"}}};

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.mode === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.cameraEntityId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cameraEntityId"},message:"must have required property '"+"cameraEntityId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.targetEntityId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "targetEntityId"},message:"must have required property '"+"targetEntityId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.cameraRigProfileRef === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cameraRigProfileRef"},message:"must have required property '"+"cameraRigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.pitchRadians === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "pitchRadians"},message:"must have required property '"+"pitchRadians"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.distanceMeters === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "distanceMeters"},message:"must have required property '"+"distanceMeters"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.targetHeightMeters === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "targetHeightMeters"},message:"must have required property '"+"targetHeightMeters"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.fovDegrees === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fovDegrees"},message:"must have required property '"+"fovDegrees"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.manualSwitchAllowed === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "manualSwitchAllowed"},message:"must have required property '"+"manualSwitchAllowed"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema37.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.mode !== undefined){
if("third-person" !== data.mode){
const err10 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "third-person"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.cameraEntityId !== undefined){
let data1 = data.cameraEntityId;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err11 = {instancePath:instancePath+"/cameraEntityId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/cameraEntityId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.targetEntityId !== undefined){
let data2 = data.targetEntityId;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err13 = {instancePath:instancePath+"/targetEntityId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/targetEntityId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.cameraRigProfileRef !== undefined){
let data3 = data.cameraRigProfileRef;
if(typeof data3 === "string"){
if(func2(data3) < 1){
const err15 = {instancePath:instancePath+"/cameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/cameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.pitchRadians !== undefined){
let data4 = data.pitchRadians;
if(!((typeof data4 == "number") && (isFinite(data4)))){
const err17 = {instancePath:instancePath+"/pitchRadians",schemaPath:"#/properties/pitchRadians/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.distanceMeters !== undefined){
let data5 = data.distanceMeters;
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 <= 0 || isNaN(data5)){
const err18 = {instancePath:instancePath+"/distanceMeters",schemaPath:"#/properties/distanceMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/distanceMeters",schemaPath:"#/properties/distanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.targetHeightMeters !== undefined){
let data6 = data.targetHeightMeters;
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err20 = {instancePath:instancePath+"/targetHeightMeters",schemaPath:"#/properties/targetHeightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.fovDegrees !== undefined){
let data7 = data.fovDegrees;
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 >= 180 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/fovDegrees",schemaPath:"#/properties/fovDegrees/exclusiveMaximum",keyword:"exclusiveMaximum",params:{comparison: "<", limit: 180},message:"must be < 180"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data7 <= 0 || isNaN(data7)){
const err22 = {instancePath:instancePath+"/fovDegrees",schemaPath:"#/properties/fovDegrees/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/fovDegrees",schemaPath:"#/properties/fovDegrees/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.manualSwitchAllowed !== undefined){
if(typeof data.manualSwitchAllowed !== "boolean"){
const err24 = {instancePath:instancePath+"/manualSwitchAllowed",schemaPath:"#/properties/manualSwitchAllowed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema41 = {"type":"object","additionalProperties":false,"required":["subjectAssetRef","artifactContentHash","byteLength","mediaType","format","inventory"],"properties":{"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"artifactContentHash":{"$ref":"#/$defs/hash"},"byteLength":{"type":"integer","minimum":0},"mediaType":{"const":"model/gltf-binary"},"format":{"const":"glb"},"inventory":{"$ref":"#/$defs/subjectAssetInventory"}}};
const schema44 = {"type":"object","additionalProperties":false,"required":["meshCount","vertexCount","triangleCount","skeletonCount","boneCount","animationClipNames"],"properties":{"meshCount":{"type":"integer","minimum":0},"vertexCount":{"type":"integer","minimum":0},"triangleCount":{"type":"integer","minimum":0},"skeletonCount":{"type":"integer","minimum":0},"boneCount":{"type":"integer","minimum":0},"animationClipNames":{"$ref":"#/$defs/stringArray"}}};
const schema45 = {"type":"array","items":{"$ref":"#/$defs/nonEmptyString"}};

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err0 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
else {
const err2 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.meshCount === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "meshCount"},message:"must have required property '"+"meshCount"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.vertexCount === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "vertexCount"},message:"must have required property '"+"vertexCount"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.triangleCount === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "triangleCount"},message:"must have required property '"+"triangleCount"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.skeletonCount === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "skeletonCount"},message:"must have required property '"+"skeletonCount"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.boneCount === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "boneCount"},message:"must have required property '"+"boneCount"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.animationClipNames === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "animationClipNames"},message:"must have required property '"+"animationClipNames"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "meshCount") || (key0 === "vertexCount")) || (key0 === "triangleCount")) || (key0 === "skeletonCount")) || (key0 === "boneCount")) || (key0 === "animationClipNames"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.meshCount !== undefined){
let data0 = data.meshCount;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err7 = {instancePath:instancePath+"/meshCount",schemaPath:"#/properties/meshCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((typeof data0 == "number") && (isFinite(data0))){
if(data0 < 0 || isNaN(data0)){
const err8 = {instancePath:instancePath+"/meshCount",schemaPath:"#/properties/meshCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
if(data.vertexCount !== undefined){
let data1 = data.vertexCount;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err9 = {instancePath:instancePath+"/vertexCount",schemaPath:"#/properties/vertexCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 0 || isNaN(data1)){
const err10 = {instancePath:instancePath+"/vertexCount",schemaPath:"#/properties/vertexCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
if(data.triangleCount !== undefined){
let data2 = data.triangleCount;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/triangleCount",schemaPath:"#/properties/triangleCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/triangleCount",schemaPath:"#/properties/triangleCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.skeletonCount !== undefined){
let data3 = data.skeletonCount;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err13 = {instancePath:instancePath+"/skeletonCount",schemaPath:"#/properties/skeletonCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 0 || isNaN(data3)){
const err14 = {instancePath:instancePath+"/skeletonCount",schemaPath:"#/properties/skeletonCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.boneCount !== undefined){
let data4 = data.boneCount;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err15 = {instancePath:instancePath+"/boneCount",schemaPath:"#/properties/boneCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err16 = {instancePath:instancePath+"/boneCount",schemaPath:"#/properties/boneCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
if(data.animationClipNames !== undefined){
if(!(validate25(data.animationClipNames, {instancePath:instancePath+"/animationClipNames",parentData:data,parentDataProperty:"animationClipNames",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.subjectAssetRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectAssetRef"},message:"must have required property '"+"subjectAssetRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.artifactContentHash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "artifactContentHash"},message:"must have required property '"+"artifactContentHash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.byteLength === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "byteLength"},message:"must have required property '"+"byteLength"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.mediaType === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mediaType"},message:"must have required property '"+"mediaType"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.format === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.inventory === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "inventory"},message:"must have required property '"+"inventory"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "subjectAssetRef") || (key0 === "artifactContentHash")) || (key0 === "byteLength")) || (key0 === "mediaType")) || (key0 === "format")) || (key0 === "inventory"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.subjectAssetRef !== undefined){
let data0 = data.subjectAssetRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err7 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.artifactContentHash !== undefined){
let data1 = data.artifactContentHash;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err9 = {instancePath:instancePath+"/artifactContentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/artifactContentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.byteLength !== undefined){
let data2 = data.byteLength;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/byteLength",schemaPath:"#/properties/byteLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/byteLength",schemaPath:"#/properties/byteLength/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.mediaType !== undefined){
if("model/gltf-binary" !== data.mediaType){
const err13 = {instancePath:instancePath+"/mediaType",schemaPath:"#/properties/mediaType/const",keyword:"const",params:{allowedValue: "model/gltf-binary"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.format !== undefined){
if("glb" !== data.format){
const err14 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/const",keyword:"const",params:{allowedValue: "glb"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.inventory !== undefined){
if(!(validate24(data.inventory, {instancePath:instancePath+"/inventory",parentData:data,parentDataProperty:"inventory",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema47 = {"type":"object","additionalProperties":false,"required":["rigProfileRef","bodyTopology","skeletonRootBoneName","requiredBoneIds","sourceNodeNameByBoneId"],"properties":{"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"bodyTopology":{"const":"biped"},"skeletonRootBoneName":{"$ref":"#/$defs/nonEmptyString"},"requiredBoneIds":{"$ref":"#/$defs/stringArray"},"sourceNodeNameByBoneId":{"type":"object","propertyNames":{"$ref":"#/$defs/nonEmptyString"},"additionalProperties":{"$ref":"#/$defs/nonEmptyString"}}}};

function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate29.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.rigProfileRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rigProfileRef"},message:"must have required property '"+"rigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bodyTopology === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bodyTopology"},message:"must have required property '"+"bodyTopology"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.skeletonRootBoneName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "skeletonRootBoneName"},message:"must have required property '"+"skeletonRootBoneName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.requiredBoneIds === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requiredBoneIds"},message:"must have required property '"+"requiredBoneIds"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.sourceNodeNameByBoneId === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceNodeNameByBoneId"},message:"must have required property '"+"sourceNodeNameByBoneId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "rigProfileRef") || (key0 === "bodyTopology")) || (key0 === "skeletonRootBoneName")) || (key0 === "requiredBoneIds")) || (key0 === "sourceNodeNameByBoneId"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.rigProfileRef !== undefined){
let data0 = data.rigProfileRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err6 = {instancePath:instancePath+"/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.bodyTopology !== undefined){
if("biped" !== data.bodyTopology){
const err8 = {instancePath:instancePath+"/bodyTopology",schemaPath:"#/properties/bodyTopology/const",keyword:"const",params:{allowedValue: "biped"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.skeletonRootBoneName !== undefined){
let data2 = data.skeletonRootBoneName;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err9 = {instancePath:instancePath+"/skeletonRootBoneName",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/skeletonRootBoneName",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.requiredBoneIds !== undefined){
if(!(validate25(data.requiredBoneIds, {instancePath:instancePath+"/requiredBoneIds",parentData:data,parentDataProperty:"requiredBoneIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.sourceNodeNameByBoneId !== undefined){
let data4 = data.sourceNodeNameByBoneId;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
for(const key1 in data4){
const _errs12 = errors;
if(typeof key1 === "string"){
if(func2(key1) < 1){
const err11 = {instancePath:instancePath+"/sourceNodeNameByBoneId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters",propertyName:key1};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/sourceNodeNameByBoneId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs12 === errors;
if(!valid3){
const err13 = {instancePath:instancePath+"/sourceNodeNameByBoneId",schemaPath:"#/properties/sourceNodeNameByBoneId/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
for(const key2 in data4){
let data5 = data4[key2];
if(typeof data5 === "string"){
if(func2(data5) < 1){
const err14 = {instancePath:instancePath+"/sourceNodeNameByBoneId/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/sourceNodeNameByBoneId/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/sourceNodeNameByBoneId",schemaPath:"#/properties/sourceNodeNameByBoneId/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate29.errors = vErrors;
return errors === 0;
}
validate29.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema52 = {"type":"object","additionalProperties":false,"required":["animationSetRef","subjectAssetRef","rigProfileRef","defaultActionId","requiredActionIds","animationBindings"],"properties":{"animationSetRef":{"$ref":"#/$defs/nonEmptyString"},"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"defaultActionId":{"$ref":"#/$defs/nonEmptyString"},"requiredActionIds":{"$ref":"#/$defs/stringArray"},"animationBindings":{"type":"array","items":{"$ref":"#/$defs/animationBinding"}}}};
const schema57 = {"type":"object","additionalProperties":false,"required":["actionId","sourceClipName","semanticFamily","automaticPresentationKeys","loopMode","playbackSpeedRatio","blendDurationSeconds","rootMotionMode"],"properties":{"actionId":{"$ref":"#/$defs/nonEmptyString"},"sourceClipName":{"$ref":"#/$defs/nonEmptyString"},"semanticFamily":{"enum":["ground","airborne","flight","water","posture","combat","emote","dance"]},"automaticPresentationKeys":{"$ref":"#/$defs/stringArray"},"loopMode":{"enum":["repeat","once"]},"playbackSpeedRatio":{"type":"number"},"blendDurationSeconds":{"type":"number"},"rootMotionMode":{"const":"in-place"}}};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.actionId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actionId"},message:"must have required property '"+"actionId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.sourceClipName === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceClipName"},message:"must have required property '"+"sourceClipName"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.semanticFamily === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticFamily"},message:"must have required property '"+"semanticFamily"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.automaticPresentationKeys === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "automaticPresentationKeys"},message:"must have required property '"+"automaticPresentationKeys"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.loopMode === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "loopMode"},message:"must have required property '"+"loopMode"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.playbackSpeedRatio === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "playbackSpeedRatio"},message:"must have required property '"+"playbackSpeedRatio"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.blendDurationSeconds === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "blendDurationSeconds"},message:"must have required property '"+"blendDurationSeconds"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.rootMotionMode === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rootMotionMode"},message:"must have required property '"+"rootMotionMode"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "actionId") || (key0 === "sourceClipName")) || (key0 === "semanticFamily")) || (key0 === "automaticPresentationKeys")) || (key0 === "loopMode")) || (key0 === "playbackSpeedRatio")) || (key0 === "blendDurationSeconds")) || (key0 === "rootMotionMode"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.actionId !== undefined){
let data0 = data.actionId;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err9 = {instancePath:instancePath+"/actionId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/actionId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.sourceClipName !== undefined){
let data1 = data.sourceClipName;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err11 = {instancePath:instancePath+"/sourceClipName",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/sourceClipName",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.semanticFamily !== undefined){
let data2 = data.semanticFamily;
if(!((((((((data2 === "ground") || (data2 === "airborne")) || (data2 === "flight")) || (data2 === "water")) || (data2 === "posture")) || (data2 === "combat")) || (data2 === "emote")) || (data2 === "dance"))){
const err13 = {instancePath:instancePath+"/semanticFamily",schemaPath:"#/properties/semanticFamily/enum",keyword:"enum",params:{allowedValues: schema57.properties.semanticFamily.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.automaticPresentationKeys !== undefined){
if(!(validate25(data.automaticPresentationKeys, {instancePath:instancePath+"/automaticPresentationKeys",parentData:data,parentDataProperty:"automaticPresentationKeys",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.loopMode !== undefined){
let data4 = data.loopMode;
if(!((data4 === "repeat") || (data4 === "once"))){
const err14 = {instancePath:instancePath+"/loopMode",schemaPath:"#/properties/loopMode/enum",keyword:"enum",params:{allowedValues: schema57.properties.loopMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.playbackSpeedRatio !== undefined){
let data5 = data.playbackSpeedRatio;
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err15 = {instancePath:instancePath+"/playbackSpeedRatio",schemaPath:"#/properties/playbackSpeedRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.blendDurationSeconds !== undefined){
let data6 = data.blendDurationSeconds;
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err16 = {instancePath:instancePath+"/blendDurationSeconds",schemaPath:"#/properties/blendDurationSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.rootMotionMode !== undefined){
if("in-place" !== data.rootMotionMode){
const err17 = {instancePath:instancePath+"/rootMotionMode",schemaPath:"#/properties/rootMotionMode/const",keyword:"const",params:{allowedValue: "in-place"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.animationSetRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "animationSetRef"},message:"must have required property '"+"animationSetRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.subjectAssetRef === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectAssetRef"},message:"must have required property '"+"subjectAssetRef"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.rigProfileRef === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rigProfileRef"},message:"must have required property '"+"rigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.defaultActionId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "defaultActionId"},message:"must have required property '"+"defaultActionId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.requiredActionIds === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requiredActionIds"},message:"must have required property '"+"requiredActionIds"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.animationBindings === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "animationBindings"},message:"must have required property '"+"animationBindings"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "animationSetRef") || (key0 === "subjectAssetRef")) || (key0 === "rigProfileRef")) || (key0 === "defaultActionId")) || (key0 === "requiredActionIds")) || (key0 === "animationBindings"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.animationSetRef !== undefined){
let data0 = data.animationSetRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err7 = {instancePath:instancePath+"/animationSetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/animationSetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.subjectAssetRef !== undefined){
let data1 = data.subjectAssetRef;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err9 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.rigProfileRef !== undefined){
let data2 = data.rigProfileRef;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err11 = {instancePath:instancePath+"/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.defaultActionId !== undefined){
let data3 = data.defaultActionId;
if(typeof data3 === "string"){
if(func2(data3) < 1){
const err13 = {instancePath:instancePath+"/defaultActionId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/defaultActionId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.requiredActionIds !== undefined){
if(!(validate25(data.requiredActionIds, {instancePath:instancePath+"/requiredActionIds",parentData:data,parentDataProperty:"requiredActionIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.animationBindings !== undefined){
let data5 = data.animationBindings;
if(Array.isArray(data5)){
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
if(!(validate34(data5[i0], {instancePath:instancePath+"/animationBindings/" + i0,parentData:data5,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
errors = vErrors.length;
}
}
}
else {
const err15 = {instancePath:instancePath+"/animationBindings",schemaPath:"#/properties/animationBindings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate32.errors = vErrors;
return errors === 0;
}
validate32.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema60 = {"type":"object","additionalProperties":false,"required":["colliderProfileRef","supportedBodyTopologies","collider"],"properties":{"colliderProfileRef":{"$ref":"#/$defs/nonEmptyString"},"supportedBodyTopologies":{"$ref":"#/$defs/stringArray"},"collider":{"$ref":"#/$defs/subjectCapsule"}}};
const schema62 = {"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters","centerOffsetFromSubjectOriginMetersXYZ"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0},"centerOffsetFromSubjectOriginMetersXYZ":{"$ref":"#/$defs/vec3"}}};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.radiusMeters === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.heightMeters === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "heightMeters"},message:"must have required property '"+"heightMeters"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.centerOffsetFromSubjectOriginMetersXYZ === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "centerOffsetFromSubjectOriginMetersXYZ"},message:"must have required property '"+"centerOffsetFromSubjectOriginMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "kind") || (key0 === "radiusMeters")) || (key0 === "heightMeters")) || (key0 === "centerOffsetFromSubjectOriginMetersXYZ"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.kind !== undefined){
if("capsule" !== data.kind){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "capsule"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data1 = data.radiusMeters;
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 <= 0 || isNaN(data1)){
const err6 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/properties/radiusMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/properties/radiusMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.heightMeters !== undefined){
let data2 = data.heightMeters;
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 <= 0 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/properties/heightMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/properties/heightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.centerOffsetFromSubjectOriginMetersXYZ !== undefined){
let data3 = data.centerOffsetFromSubjectOriginMetersXYZ;
if(Array.isArray(data3)){
if(data3.length > 3){
const err10 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data3.length < 3){
const err11 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data3.length;
if(len0 > 0){
let data4 = data3[0];
if(!((typeof data4 == "number") && (isFinite(data4)))){
const err12 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(len0 > 1){
let data5 = data3[1];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err13 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(len0 > 2){
let data6 = data3[2];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err14 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
const len1 = data3.length;
if(!(len1 <= 3)){
const err15 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.colliderProfileRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "colliderProfileRef"},message:"must have required property '"+"colliderProfileRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.supportedBodyTopologies === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "supportedBodyTopologies"},message:"must have required property '"+"supportedBodyTopologies"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.collider === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "collider"},message:"must have required property '"+"collider"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "colliderProfileRef") || (key0 === "supportedBodyTopologies")) || (key0 === "collider"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.colliderProfileRef !== undefined){
let data0 = data.colliderProfileRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err4 = {instancePath:instancePath+"/colliderProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/colliderProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.supportedBodyTopologies !== undefined){
if(!(validate25(data.supportedBodyTopologies, {instancePath:instancePath+"/supportedBodyTopologies",parentData:data,parentDataProperty:"supportedBodyTopologies",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.collider !== undefined){
if(!(validate40(data.collider, {instancePath:instancePath+"/collider",parentData:data,parentDataProperty:"collider",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema64 = {"type":"object","additionalProperties":false,"required":["schemaVersion","bindings","rootMotionSources"],"properties":{"schemaVersion":{"const":1},"bindings":{"type":"array","items":{"$ref":"#/$defs/actionPresentationBinding"}},"rootMotionSources":{"type":"array","items":{"$ref":"#/$defs/rootMotionSource"}}}};
const schema65 = {"type":"object","additionalProperties":false,"required":["kind","schemaVersion","resourceRef","presentationKey","semanticActionRef","semanticActionHash","isInterruptible","clip","rootMotion","contentHash"],"properties":{"kind":{"const":"action-presentation-binding"},"schemaVersion":{"const":1},"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"presentationKey":{"type":"string","pattern":"^action\\..+$"},"semanticActionRef":{"$ref":"#/$defs/nonEmptyString"},"semanticActionHash":{"$ref":"#/$defs/hash"},"isInterruptible":{"type":"boolean"},"clip":{"type":"object","additionalProperties":false,"required":["sourceClipName","loopMode","playbackSpeedRatio","blendDurationTicks"],"properties":{"sourceClipName":{"$ref":"#/$defs/nonEmptyString"},"loopMode":{"enum":["repeat","once"]},"playbackSpeedRatio":{"type":"number"},"blendDurationTicks":{"type":"integer","minimum":0}}},"rootMotion":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"none"}}},{"type":"object","additionalProperties":false,"required":["mode","rootMotionSourceRef","rootMotionSourceHash","priority"],"properties":{"mode":{"const":"locked"},"rootMotionSourceRef":{"$ref":"#/$defs/nonEmptyString"},"rootMotionSourceHash":{"$ref":"#/$defs/hash"},"priority":{"type":"number"}}}]},"contentHash":{"$ref":"#/$defs/hash"}}};
const pattern6 = new RegExp("^action\\..+$", "u");

function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.schemaVersion === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.resourceRef === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.presentationKey === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "presentationKey"},message:"must have required property '"+"presentationKey"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.semanticActionRef === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticActionRef"},message:"must have required property '"+"semanticActionRef"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.semanticActionHash === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticActionHash"},message:"must have required property '"+"semanticActionHash"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.isInterruptible === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "isInterruptible"},message:"must have required property '"+"isInterruptible"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.clip === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "clip"},message:"must have required property '"+"clip"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rootMotion === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rootMotion"},message:"must have required property '"+"rootMotion"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.contentHash === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema65.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
if("action-presentation-binding" !== data.kind){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "action-presentation-binding"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
if(1 !== data.schemaVersion){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data2 = data.resourceRef;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err13 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.presentationKey !== undefined){
let data3 = data.presentationKey;
if(typeof data3 === "string"){
if(!pattern6.test(data3)){
const err15 = {instancePath:instancePath+"/presentationKey",schemaPath:"#/properties/presentationKey/pattern",keyword:"pattern",params:{pattern: "^action\\..+$"},message:"must match pattern \""+"^action\\..+$"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/presentationKey",schemaPath:"#/properties/presentationKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.semanticActionRef !== undefined){
let data4 = data.semanticActionRef;
if(typeof data4 === "string"){
if(func2(data4) < 1){
const err17 = {instancePath:instancePath+"/semanticActionRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/semanticActionRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.semanticActionHash !== undefined){
let data5 = data.semanticActionHash;
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err19 = {instancePath:instancePath+"/semanticActionHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/semanticActionHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.isInterruptible !== undefined){
if(typeof data.isInterruptible !== "boolean"){
const err21 = {instancePath:instancePath+"/isInterruptible",schemaPath:"#/properties/isInterruptible/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.clip !== undefined){
let data7 = data.clip;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.sourceClipName === undefined){
const err22 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/required",keyword:"required",params:{missingProperty: "sourceClipName"},message:"must have required property '"+"sourceClipName"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data7.loopMode === undefined){
const err23 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/required",keyword:"required",params:{missingProperty: "loopMode"},message:"must have required property '"+"loopMode"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data7.playbackSpeedRatio === undefined){
const err24 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/required",keyword:"required",params:{missingProperty: "playbackSpeedRatio"},message:"must have required property '"+"playbackSpeedRatio"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data7.blendDurationTicks === undefined){
const err25 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/required",keyword:"required",params:{missingProperty: "blendDurationTicks"},message:"must have required property '"+"blendDurationTicks"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
for(const key1 in data7){
if(!((((key1 === "sourceClipName") || (key1 === "loopMode")) || (key1 === "playbackSpeedRatio")) || (key1 === "blendDurationTicks"))){
const err26 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data7.sourceClipName !== undefined){
let data8 = data7.sourceClipName;
if(typeof data8 === "string"){
if(func2(data8) < 1){
const err27 = {instancePath:instancePath+"/clip/sourceClipName",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/clip/sourceClipName",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data7.loopMode !== undefined){
let data9 = data7.loopMode;
if(!((data9 === "repeat") || (data9 === "once"))){
const err29 = {instancePath:instancePath+"/clip/loopMode",schemaPath:"#/properties/clip/properties/loopMode/enum",keyword:"enum",params:{allowedValues: schema65.properties.clip.properties.loopMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data7.playbackSpeedRatio !== undefined){
let data10 = data7.playbackSpeedRatio;
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err30 = {instancePath:instancePath+"/clip/playbackSpeedRatio",schemaPath:"#/properties/clip/properties/playbackSpeedRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data7.blendDurationTicks !== undefined){
let data11 = data7.blendDurationTicks;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err31 = {instancePath:instancePath+"/clip/blendDurationTicks",schemaPath:"#/properties/clip/properties/blendDurationTicks/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err32 = {instancePath:instancePath+"/clip/blendDurationTicks",schemaPath:"#/properties/clip/properties/blendDurationTicks/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
}
else {
const err33 = {instancePath:instancePath+"/clip",schemaPath:"#/properties/clip/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.rootMotion !== undefined){
let data12 = data.rootMotion;
const _errs29 = errors;
let valid6 = false;
let passing0 = null;
const _errs30 = errors;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.mode === undefined){
const err34 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
for(const key2 in data12){
if(!(key2 === "mode")){
const err35 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data12.mode !== undefined){
if("none" !== data12.mode){
const err36 = {instancePath:instancePath+"/rootMotion/mode",schemaPath:"#/properties/rootMotion/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "none"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid0 = _errs30 === errors;
if(_valid0){
valid6 = true;
passing0 = 0;
var props0 = true;
}
const _errs34 = errors;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.mode === undefined){
const err38 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data12.rootMotionSourceRef === undefined){
const err39 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/required",keyword:"required",params:{missingProperty: "rootMotionSourceRef"},message:"must have required property '"+"rootMotionSourceRef"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data12.rootMotionSourceHash === undefined){
const err40 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/required",keyword:"required",params:{missingProperty: "rootMotionSourceHash"},message:"must have required property '"+"rootMotionSourceHash"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data12.priority === undefined){
const err41 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/required",keyword:"required",params:{missingProperty: "priority"},message:"must have required property '"+"priority"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
for(const key3 in data12){
if(!((((key3 === "mode") || (key3 === "rootMotionSourceRef")) || (key3 === "rootMotionSourceHash")) || (key3 === "priority"))){
const err42 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data12.mode !== undefined){
if("locked" !== data12.mode){
const err43 = {instancePath:instancePath+"/rootMotion/mode",schemaPath:"#/properties/rootMotion/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "locked"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data12.rootMotionSourceRef !== undefined){
let data15 = data12.rootMotionSourceRef;
if(typeof data15 === "string"){
if(func2(data15) < 1){
const err44 = {instancePath:instancePath+"/rootMotion/rootMotionSourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/rootMotion/rootMotionSourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data12.rootMotionSourceHash !== undefined){
let data16 = data12.rootMotionSourceHash;
if(typeof data16 === "string"){
if(!pattern4.test(data16)){
const err46 = {instancePath:instancePath+"/rootMotion/rootMotionSourceHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/rootMotion/rootMotionSourceHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data12.priority !== undefined){
let data17 = data12.priority;
if(!((typeof data17 == "number") && (isFinite(data17)))){
const err48 = {instancePath:instancePath+"/rootMotion/priority",schemaPath:"#/properties/rootMotion/oneOf/1/properties/priority/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var _valid0 = _errs34 === errors;
if(_valid0 && valid6){
valid6 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid6 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid6){
const err50 = {instancePath:instancePath+"/rootMotion",schemaPath:"#/properties/rootMotion/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
errors = _errs29;
if(vErrors !== null){
if(_errs29){
vErrors.length = _errs29;
}
else {
vErrors = null;
}
}
}
}
if(data.contentHash !== undefined){
let data18 = data.contentHash;
if(typeof data18 === "string"){
if(!pattern4.test(data18)){
const err51 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
else {
const err53 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema73 = {"type":"object","additionalProperties":false,"required":["schemaVersion","resourceRef","fixedDeltaSeconds","samples","contentHash"],"properties":{"schemaVersion":{"const":1},"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"fixedDeltaSeconds":{"type":"number","exclusiveMinimum":0},"samples":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["translationDeltaMetersXYZ","facingYawDeltaRadians"],"properties":{"translationDeltaMetersXYZ":{"$ref":"#/$defs/vec3"},"facingYawDeltaRadians":{"type":"number"}}}},"contentHash":{"$ref":"#/$defs/hash"}}};

function validate46(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate46.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.resourceRef === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.fixedDeltaSeconds === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixedDeltaSeconds"},message:"must have required property '"+"fixedDeltaSeconds"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.samples === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "samples"},message:"must have required property '"+"samples"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.contentHash === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "schemaVersion") || (key0 === "resourceRef")) || (key0 === "fixedDeltaSeconds")) || (key0 === "samples")) || (key0 === "contentHash"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
if(1 !== data.schemaVersion){
const err6 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data1 = data.resourceRef;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err7 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.fixedDeltaSeconds !== undefined){
let data2 = data.fixedDeltaSeconds;
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 <= 0 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/fixedDeltaSeconds",schemaPath:"#/properties/fixedDeltaSeconds/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/fixedDeltaSeconds",schemaPath:"#/properties/fixedDeltaSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.samples !== undefined){
let data3 = data.samples;
if(Array.isArray(data3)){
if(data3.length < 1){
const err11 = {instancePath:instancePath+"/samples",schemaPath:"#/properties/samples/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.translationDeltaMetersXYZ === undefined){
const err12 = {instancePath:instancePath+"/samples/" + i0,schemaPath:"#/properties/samples/items/required",keyword:"required",params:{missingProperty: "translationDeltaMetersXYZ"},message:"must have required property '"+"translationDeltaMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data4.facingYawDeltaRadians === undefined){
const err13 = {instancePath:instancePath+"/samples/" + i0,schemaPath:"#/properties/samples/items/required",keyword:"required",params:{missingProperty: "facingYawDeltaRadians"},message:"must have required property '"+"facingYawDeltaRadians"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key1 in data4){
if(!((key1 === "translationDeltaMetersXYZ") || (key1 === "facingYawDeltaRadians"))){
const err14 = {instancePath:instancePath+"/samples/" + i0,schemaPath:"#/properties/samples/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data4.translationDeltaMetersXYZ !== undefined){
let data5 = data4.translationDeltaMetersXYZ;
if(Array.isArray(data5)){
if(data5.length > 3){
const err15 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data5.length < 3){
const err16 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len1 = data5.length;
if(len1 > 0){
let data6 = data5[0];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err17 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(len1 > 1){
let data7 = data5[1];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err18 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(len1 > 2){
let data8 = data5[2];
if(!((typeof data8 == "number") && (isFinite(data8)))){
const err19 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
const len2 = data5.length;
if(!(len2 <= 3)){
const err20 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/samples/" + i0+"/translationDeltaMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data4.facingYawDeltaRadians !== undefined){
let data9 = data4.facingYawDeltaRadians;
if(!((typeof data9 == "number") && (isFinite(data9)))){
const err22 = {instancePath:instancePath+"/samples/" + i0+"/facingYawDeltaRadians",schemaPath:"#/properties/samples/items/properties/facingYawDeltaRadians/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath:instancePath+"/samples/" + i0,schemaPath:"#/properties/samples/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath:instancePath+"/samples",schemaPath:"#/properties/samples/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data10 = data.contentHash;
if(typeof data10 === "string"){
if(!pattern4.test(data10)){
const err25 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
else {
const err27 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
validate46.errors = vErrors;
return errors === 0;
}
validate46.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate43.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bindings === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bindings"},message:"must have required property '"+"bindings"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.rootMotionSources === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rootMotionSources"},message:"must have required property '"+"rootMotionSources"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "schemaVersion") || (key0 === "bindings")) || (key0 === "rootMotionSources"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
if(1 !== data.schemaVersion){
const err4 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.bindings !== undefined){
let data1 = data.bindings;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
if(!(validate44(data1[i0], {instancePath:instancePath+"/bindings/" + i0,parentData:data1,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath:instancePath+"/bindings",schemaPath:"#/properties/bindings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.rootMotionSources !== undefined){
let data3 = data.rootMotionSources;
if(Array.isArray(data3)){
const len1 = data3.length;
for(let i1=0; i1<len1; i1++){
if(!(validate46(data3[i1], {instancePath:instancePath+"/rootMotionSources/" + i1,parentData:data3,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
errors = vErrors.length;
}
}
}
else {
const err6 = {instancePath:instancePath+"/rootMotionSources",schemaPath:"#/properties/rootMotionSources/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate43.errors = vErrors;
return errors === 0;
}
validate43.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema77 = {"type":"object","additionalProperties":false,"required":["entityId","subjectDefinitionRef","subjectDefinitionHash","bodyTopology","semanticClassId","forwardDirection","visualParts","visualBinding","sockets","mountSlots","collider","locomotion","locomotionCapabilityRef","locomotionCapabilityHash","physicsBodyProfileRef","locomotionProfileRef","controlFeel","availableControlFeels","capabilityAssembly"],"properties":{"entityId":{"$ref":"#/$defs/nonEmptyString"},"subjectDefinitionRef":{"$ref":"#/$defs/nonEmptyString"},"subjectDefinitionHash":{"$ref":"#/$defs/hash"},"bodyTopology":{"enum":["biped","quadruped","four-wheel","surface-craft","watercraft","glider","composite","custom"]},"semanticClassId":{"$ref":"#/$defs/nonEmptyString"},"forwardDirection":{"const":"-z"},"visualParts":{"type":"array","items":{"$ref":"#/$defs/subjectVisualPart"}},"visualBinding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"static"}}},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"animationSetRef":{"$ref":"#/$defs/nonEmptyString"}}}]},"sockets":{"type":"array","items":{"$ref":"#/$defs/subjectSocket"}},"mountSlots":{"type":"array","items":{"$ref":"#/$defs/mountSlot"}},"collider":{"$ref":"#/$defs/subjectCollider"},"locomotion":{"type":"object","additionalProperties":false,"required":["allowWalk","allowRun","allowJump"],"properties":{"allowWalk":{"type":"boolean"},"allowRun":{"type":"boolean"},"allowJump":{"type":"boolean"}}},"locomotionCapabilityRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionCapabilityHash":{"$ref":"#/$defs/hash"},"physicsBodyProfileRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"controlFeel":{"$ref":"#/$defs/controlFeel"},"availableControlFeels":{"type":"array","items":{"$ref":"#/$defs/controlFeel"}},"capabilityAssembly":{"$ref":"#/$defs/capabilityAssembly"}}};
const schema82 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","shape","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"primitive"},"shape":{"$ref":"#/$defs/primitiveShape"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","appearance","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"asset"},"subjectAssetRef":{"$ref":"#/$defs/nonEmptyString"},"localTransform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ","rotationEulerRadiansXYZ","scaleXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/vec3"}}},"appearance":{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"whitebox-neutral"}}},"semanticTags":{"$ref":"#/$defs/stringArray"}}}]};
const schema84 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","sizeMetersXYZ"],"properties":{"kind":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/vec3"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters"],"properties":{"kind":{"const":"sphere"},"radiusMeters":{"type":"number","exclusiveMinimum":0}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"enum":["cylinder","capsule"]},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0}}}]};

function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate51.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.sizeMetersXYZ === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "sizeMetersXYZ"},message:"must have required property '"+"sizeMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "sizeMetersXYZ"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("box" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "box"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.sizeMetersXYZ !== undefined){
let data1 = data.sizeMetersXYZ;
if(Array.isArray(data1)){
if(data1.length > 3){
const err4 = {instancePath:instancePath+"/sizeMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.length < 3){
const err5 = {instancePath:instancePath+"/sizeMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data1.length;
if(len0 > 0){
let data2 = data1[0];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/sizeMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(len0 > 1){
let data3 = data1[1];
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err7 = {instancePath:instancePath+"/sizeMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(len0 > 2){
let data4 = data1[2];
if(!((typeof data4 == "number") && (isFinite(data4)))){
const err8 = {instancePath:instancePath+"/sizeMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
const len1 = data1.length;
if(!(len1 <= 3)){
const err9 = {instancePath:instancePath+"/sizeMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/sizeMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.radiusMeters === undefined){
const err13 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "radiusMeters"))){
const err14 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.kind !== undefined){
if("sphere" !== data.kind){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "sphere"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data6 = data.radiusMeters;
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 <= 0 || isNaN(data6)){
const err16 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/oneOf/1/properties/radiusMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/oneOf/1/properties/radiusMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs20 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err19 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.radiusMeters === undefined){
const err20 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.heightMeters === undefined){
const err21 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "heightMeters"},message:"must have required property '"+"heightMeters"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
for(const key2 in data){
if(!(((key2 === "kind") || (key2 === "radiusMeters")) || (key2 === "heightMeters"))){
const err22 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.kind !== undefined){
let data7 = data.kind;
if(!((data7 === "cylinder") || (data7 === "capsule"))){
const err23 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema84.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data8 = data.radiusMeters;
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 <= 0 || isNaN(data8)){
const err24 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/oneOf/2/properties/radiusMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/oneOf/2/properties/radiusMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.heightMeters !== undefined){
let data9 = data.heightMeters;
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 <= 0 || isNaN(data9)){
const err26 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/oneOf/2/properties/heightMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/oneOf/2/properties/heightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs20 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err29 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate51.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate51.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema86 = {"type":"object","additionalProperties":false,"required":["positionMetersXYZ","rotationEulerRadiansXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"}}};

function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate53.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.positionMetersXYZ === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "positionMetersXYZ"},message:"must have required property '"+"positionMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.rotationEulerRadiansXYZ === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rotationEulerRadiansXYZ"},message:"must have required property '"+"rotationEulerRadiansXYZ"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "positionMetersXYZ") || (key0 === "rotationEulerRadiansXYZ"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.positionMetersXYZ !== undefined){
let data0 = data.positionMetersXYZ;
if(Array.isArray(data0)){
if(data0.length > 3){
const err3 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 3){
const err4 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
if(len0 > 0){
let data1 = data0[0];
if(!((typeof data1 == "number") && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/positionMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(len0 > 1){
let data2 = data0[1];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/positionMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(len0 > 2){
let data3 = data0[2];
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err7 = {instancePath:instancePath+"/positionMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
const len1 = data0.length;
if(!(len1 <= 3)){
const err8 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.rotationEulerRadiansXYZ !== undefined){
let data4 = data.rotationEulerRadiansXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err10 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data4.length < 3){
const err11 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len2 = data4.length;
if(len2 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err12 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(len2 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err13 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(len2 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err14 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
const len3 = data4.length;
if(!(len3 <= 3)){
const err15 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate53.errors = vErrors;
return errors === 0;
}
validate53.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate50.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.shape === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "shape"},message:"must have required property '"+"shape"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.localTransform === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.semanticTags === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "kind")) || (key0 === "shape")) || (key0 === "localTransform")) || (key0 === "semanticTags"))){
const err5 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
if("primitive" !== data.kind){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "primitive"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.shape !== undefined){
if(!(validate51(data.shape, {instancePath:instancePath+"/shape",parentData:data,parentDataProperty:"shape",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
errors = vErrors.length;
}
}
if(data.localTransform !== undefined){
if(!(validate53(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
if(!(validate25(data.semanticTags, {instancePath:instancePath+"/semanticTags",parentData:data,parentDataProperty:"semanticTags",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props1 = true;
}
const _errs11 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.kind === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.subjectAssetRef === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "subjectAssetRef"},message:"must have required property '"+"subjectAssetRef"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.localTransform === undefined){
const err13 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.appearance === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "appearance"},message:"must have required property '"+"appearance"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.semanticTags === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data){
if(!((((((key1 === "id") || (key1 === "kind")) || (key1 === "subjectAssetRef")) || (key1 === "localTransform")) || (key1 === "appearance")) || (key1 === "semanticTags"))){
const err16 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.id !== undefined){
let data5 = data.id;
if(typeof data5 === "string"){
if(func2(data5) < 1){
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.kind !== undefined){
if("asset" !== data.kind){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.subjectAssetRef !== undefined){
let data7 = data.subjectAssetRef;
if(typeof data7 === "string"){
if(func2(data7) < 1){
const err20 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.localTransform !== undefined){
let data8 = data.localTransform;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.positionMetersXYZ === undefined){
const err22 = {instancePath:instancePath+"/localTransform",schemaPath:"#/oneOf/1/properties/localTransform/required",keyword:"required",params:{missingProperty: "positionMetersXYZ"},message:"must have required property '"+"positionMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data8.rotationEulerRadiansXYZ === undefined){
const err23 = {instancePath:instancePath+"/localTransform",schemaPath:"#/oneOf/1/properties/localTransform/required",keyword:"required",params:{missingProperty: "rotationEulerRadiansXYZ"},message:"must have required property '"+"rotationEulerRadiansXYZ"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data8.scaleXYZ === undefined){
const err24 = {instancePath:instancePath+"/localTransform",schemaPath:"#/oneOf/1/properties/localTransform/required",keyword:"required",params:{missingProperty: "scaleXYZ"},message:"must have required property '"+"scaleXYZ"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key2 in data8){
if(!(((key2 === "positionMetersXYZ") || (key2 === "rotationEulerRadiansXYZ")) || (key2 === "scaleXYZ"))){
const err25 = {instancePath:instancePath+"/localTransform",schemaPath:"#/oneOf/1/properties/localTransform/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data8.positionMetersXYZ !== undefined){
let data9 = data8.positionMetersXYZ;
if(Array.isArray(data9)){
if(data9.length > 3){
const err26 = {instancePath:instancePath+"/localTransform/positionMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data9.length < 3){
const err27 = {instancePath:instancePath+"/localTransform/positionMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
const len0 = data9.length;
if(len0 > 0){
let data10 = data9[0];
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err28 = {instancePath:instancePath+"/localTransform/positionMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(len0 > 1){
let data11 = data9[1];
if(!((typeof data11 == "number") && (isFinite(data11)))){
const err29 = {instancePath:instancePath+"/localTransform/positionMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(len0 > 2){
let data12 = data9[2];
if(!((typeof data12 == "number") && (isFinite(data12)))){
const err30 = {instancePath:instancePath+"/localTransform/positionMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
const len1 = data9.length;
if(!(len1 <= 3)){
const err31 = {instancePath:instancePath+"/localTransform/positionMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/localTransform/positionMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data8.rotationEulerRadiansXYZ !== undefined){
let data13 = data8.rotationEulerRadiansXYZ;
if(Array.isArray(data13)){
if(data13.length > 3){
const err33 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data13.length < 3){
const err34 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
const len2 = data13.length;
if(len2 > 0){
let data14 = data13[0];
if(!((typeof data14 == "number") && (isFinite(data14)))){
const err35 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(len2 > 1){
let data15 = data13[1];
if(!((typeof data15 == "number") && (isFinite(data15)))){
const err36 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(len2 > 2){
let data16 = data13[2];
if(!((typeof data16 == "number") && (isFinite(data16)))){
const err37 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
const len3 = data13.length;
if(!(len3 <= 3)){
const err38 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/localTransform/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data8.scaleXYZ !== undefined){
let data17 = data8.scaleXYZ;
if(Array.isArray(data17)){
if(data17.length > 3){
const err40 = {instancePath:instancePath+"/localTransform/scaleXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data17.length < 3){
const err41 = {instancePath:instancePath+"/localTransform/scaleXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
const len4 = data17.length;
if(len4 > 0){
let data18 = data17[0];
if(!((typeof data18 == "number") && (isFinite(data18)))){
const err42 = {instancePath:instancePath+"/localTransform/scaleXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(len4 > 1){
let data19 = data17[1];
if(!((typeof data19 == "number") && (isFinite(data19)))){
const err43 = {instancePath:instancePath+"/localTransform/scaleXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(len4 > 2){
let data20 = data17[2];
if(!((typeof data20 == "number") && (isFinite(data20)))){
const err44 = {instancePath:instancePath+"/localTransform/scaleXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
const len5 = data17.length;
if(!(len5 <= 3)){
const err45 = {instancePath:instancePath+"/localTransform/scaleXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/localTransform/scaleXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/localTransform",schemaPath:"#/oneOf/1/properties/localTransform/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.appearance !== undefined){
let data21 = data.appearance;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
if(data21.mode === undefined){
const err48 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
for(const key3 in data21){
if(!(key3 === "mode")){
const err49 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data21.mode !== undefined){
if("whitebox-neutral" !== data21.mode){
const err50 = {instancePath:instancePath+"/appearance/mode",schemaPath:"#/oneOf/1/properties/appearance/properties/mode/const",keyword:"const",params:{allowedValue: "whitebox-neutral"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
else {
const err51 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.semanticTags !== undefined){
if(!(validate25(data.semanticTags, {instancePath:instancePath+"/semanticTags",parentData:data,parentDataProperty:"semanticTags",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err52 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var _valid0 = _errs11 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props1 !== true){
props1 = true;
}
}
}
if(!valid0){
const err53 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate50.errors = vErrors;
evaluated0.props = props1;
return errors === 0;
}
validate50.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema96 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"local"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["id","kind","boneId","offsetTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"bone"},"boneId":{"$ref":"#/$defs/nonEmptyString"},"offsetTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/stringArray"}}}]};

function validate58(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate58.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.localTransform === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.semanticTags === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "kind")) || (key0 === "localTransform")) || (key0 === "semanticTags"))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.kind !== undefined){
if("local" !== data.kind){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "local"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.localTransform !== undefined){
if(!(validate53(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
if(!(validate25(data.semanticTags, {instancePath:instancePath+"/semanticTags",parentData:data,parentDataProperty:"semanticTags",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs10 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.kind === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.boneId === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "boneId"},message:"must have required property '"+"boneId"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.offsetTransform === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "offsetTransform"},message:"must have required property '"+"offsetTransform"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.semanticTags === undefined){
const err13 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key1 in data){
if(!(((((key1 === "id") || (key1 === "kind")) || (key1 === "boneId")) || (key1 === "offsetTransform")) || (key1 === "semanticTags"))){
const err14 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.id !== undefined){
let data4 = data.id;
if(typeof data4 === "string"){
if(func2(data4) < 1){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.kind !== undefined){
if("bone" !== data.kind){
const err17 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "bone"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.boneId !== undefined){
let data6 = data.boneId;
if(typeof data6 === "string"){
if(func2(data6) < 1){
const err18 = {instancePath:instancePath+"/boneId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/boneId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.offsetTransform !== undefined){
if(!(validate53(data.offsetTransform, {instancePath:instancePath+"/offsetTransform",parentData:data,parentDataProperty:"offsetTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
if(!(validate25(data.semanticTags, {instancePath:instancePath+"/semanticTags",parentData:data,parentDataProperty:"semanticTags",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err20 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs10 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err21 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate58.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate58.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema100 = {"type":"object","additionalProperties":false,"required":["id","kind","mode","mountSocketId","riderSubjectOriginOffsetMetersXYZ","dismountCandidateOffsetsMetersXYZ"],"properties":{"id":{"$ref":"#/$defs/nonEmptyString"},"kind":{"const":"mount-slot"},"mode":{"const":"stand"},"mountSocketId":{"$ref":"#/$defs/nonEmptyString"},"riderSubjectOriginOffsetMetersXYZ":{"$ref":"#/$defs/vec3"},"dismountCandidateOffsetsMetersXYZ":{"type":"array","items":{"$ref":"#/$defs/vec3"}}}};

function validate64(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate64.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.mode === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.mountSocketId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mountSocketId"},message:"must have required property '"+"mountSocketId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.riderSubjectOriginOffsetMetersXYZ === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "riderSubjectOriginOffsetMetersXYZ"},message:"must have required property '"+"riderSubjectOriginOffsetMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.dismountCandidateOffsetsMetersXYZ === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "dismountCandidateOffsetsMetersXYZ"},message:"must have required property '"+"dismountCandidateOffsetsMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "mode")) || (key0 === "mountSocketId")) || (key0 === "riderSubjectOriginOffsetMetersXYZ")) || (key0 === "dismountCandidateOffsetsMetersXYZ"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
if("mount-slot" !== data.kind){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "mount-slot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.mode !== undefined){
if("stand" !== data.mode){
const err10 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "stand"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.mountSocketId !== undefined){
let data3 = data.mountSocketId;
if(typeof data3 === "string"){
if(func2(data3) < 1){
const err11 = {instancePath:instancePath+"/mountSocketId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/mountSocketId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.riderSubjectOriginOffsetMetersXYZ !== undefined){
let data4 = data.riderSubjectOriginOffsetMetersXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err13 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data4.length < 3){
const err14 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len0 = data4.length;
if(len0 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err15 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(len0 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err16 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(len0 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err17 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
const len1 = data4.length;
if(!(len1 <= 3)){
const err18 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.dismountCandidateOffsetsMetersXYZ !== undefined){
let data8 = data.dismountCandidateOffsetsMetersXYZ;
if(Array.isArray(data8)){
const len2 = data8.length;
for(let i0=0; i0<len2; i0++){
let data9 = data8[i0];
if(Array.isArray(data9)){
if(data9.length > 3){
const err20 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data9.length < 3){
const err21 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
const len3 = data9.length;
if(len3 > 0){
let data10 = data9[0];
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err22 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(len3 > 1){
let data11 = data9[1];
if(!((typeof data11 == "number") && (isFinite(data11)))){
const err23 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(len3 > 2){
let data12 = data9[2];
if(!((typeof data12 == "number") && (isFinite(data12)))){
const err24 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
const len4 = data9.length;
if(!(len4 <= 3)){
const err25 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
else {
const err27 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ",schemaPath:"#/properties/dismountCandidateOffsetsMetersXYZ/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
validate64.errors = vErrors;
return errors === 0;
}
validate64.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema105 = {"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters","centerOffsetFromSubjectOriginMetersXYZ","massKilograms","maxSlopeDegrees","maxStepHeightMeters"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"type":"number","exclusiveMinimum":0},"heightMeters":{"type":"number","exclusiveMinimum":0},"centerOffsetFromSubjectOriginMetersXYZ":{"$ref":"#/$defs/vec3"},"massKilograms":{"type":"number","exclusiveMinimum":0},"maxSlopeDegrees":{"type":"number","minimum":0},"maxStepHeightMeters":{"type":"number","minimum":0}}};

function validate66(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate66.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.radiusMeters === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.heightMeters === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "heightMeters"},message:"must have required property '"+"heightMeters"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.centerOffsetFromSubjectOriginMetersXYZ === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "centerOffsetFromSubjectOriginMetersXYZ"},message:"must have required property '"+"centerOffsetFromSubjectOriginMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.massKilograms === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "massKilograms"},message:"must have required property '"+"massKilograms"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.maxSlopeDegrees === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "maxSlopeDegrees"},message:"must have required property '"+"maxSlopeDegrees"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.maxStepHeightMeters === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "maxStepHeightMeters"},message:"must have required property '"+"maxStepHeightMeters"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "kind") || (key0 === "radiusMeters")) || (key0 === "heightMeters")) || (key0 === "centerOffsetFromSubjectOriginMetersXYZ")) || (key0 === "massKilograms")) || (key0 === "maxSlopeDegrees")) || (key0 === "maxStepHeightMeters"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
if("capsule" !== data.kind){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "capsule"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data1 = data.radiusMeters;
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 <= 0 || isNaN(data1)){
const err9 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/properties/radiusMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/properties/radiusMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.heightMeters !== undefined){
let data2 = data.heightMeters;
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 <= 0 || isNaN(data2)){
const err11 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/properties/heightMeters/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/properties/heightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.centerOffsetFromSubjectOriginMetersXYZ !== undefined){
let data3 = data.centerOffsetFromSubjectOriginMetersXYZ;
if(Array.isArray(data3)){
if(data3.length > 3){
const err13 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data3.length < 3){
const err14 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len0 = data3.length;
if(len0 > 0){
let data4 = data3[0];
if(!((typeof data4 == "number") && (isFinite(data4)))){
const err15 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(len0 > 1){
let data5 = data3[1];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err16 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(len0 > 2){
let data6 = data3[2];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err17 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
const len1 = data3.length;
if(!(len1 <= 3)){
const err18 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/centerOffsetFromSubjectOriginMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.massKilograms !== undefined){
let data7 = data.massKilograms;
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 <= 0 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/massKilograms",schemaPath:"#/properties/massKilograms/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/massKilograms",schemaPath:"#/properties/massKilograms/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.maxSlopeDegrees !== undefined){
let data8 = data.maxSlopeDegrees;
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 0 || isNaN(data8)){
const err22 = {instancePath:instancePath+"/maxSlopeDegrees",schemaPath:"#/properties/maxSlopeDegrees/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/maxSlopeDegrees",schemaPath:"#/properties/maxSlopeDegrees/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.maxStepHeightMeters !== undefined){
let data9 = data.maxStepHeightMeters;
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 < 0 || isNaN(data9)){
const err24 = {instancePath:instancePath+"/maxStepHeightMeters",schemaPath:"#/properties/maxStepHeightMeters/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/maxStepHeightMeters",schemaPath:"#/properties/maxStepHeightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate66.errors = vErrors;
return errors === 0;
}
validate66.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema111 = {"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","jumpVariantPolicy","walkSpeedMetersPerSecond","runSpeedMetersPerSecond","jumpSpeedMetersPerSecond","accelerationMetersPerSecondSquared","decelerationMetersPerSecondSquared","turnRateRadiansPerSecond","moveResponseExponent","airControlRatio","coyoteTimeSeconds","jumpBufferSeconds","variableJumpHoldSeconds","jumpHoldGravityRatio","jumpReleaseGravityRatio"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"jumpVariantPolicy":{"$ref":"#/$defs/jumpVariantPolicy"},"walkSpeedMetersPerSecond":{"type":"number"},"runSpeedMetersPerSecond":{"type":"number"},"jumpSpeedMetersPerSecond":{"type":"number"},"accelerationMetersPerSecondSquared":{"type":"number"},"decelerationMetersPerSecondSquared":{"type":"number"},"turnRateRadiansPerSecond":{"type":"number"},"moveResponseExponent":{"type":"number"},"airControlRatio":{"type":"number"},"coyoteTimeSeconds":{"type":"number"},"jumpBufferSeconds":{"type":"number"},"variableJumpHoldSeconds":{"type":"number"},"jumpHoldGravityRatio":{"type":"number"},"jumpReleaseGravityRatio":{"type":"number"}}};
const schema114 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"hold-height"}}},{"type":"object","additionalProperties":false,"required":["mode","smallAnticipationSeconds","largeAnticipationSeconds"],"properties":{"mode":{"const":"run-selects-variant"},"smallAnticipationSeconds":{"type":"number","minimum":0,"maximum":1.5},"largeAnticipationSeconds":{"type":"number","minimum":0,"maximum":1.5}}}]};

function validate68(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate68.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.contentHash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.jumpVariantPolicy === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "jumpVariantPolicy"},message:"must have required property '"+"jumpVariantPolicy"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.walkSpeedMetersPerSecond === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "walkSpeedMetersPerSecond"},message:"must have required property '"+"walkSpeedMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.runSpeedMetersPerSecond === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "runSpeedMetersPerSecond"},message:"must have required property '"+"runSpeedMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.jumpSpeedMetersPerSecond === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "jumpSpeedMetersPerSecond"},message:"must have required property '"+"jumpSpeedMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.accelerationMetersPerSecondSquared === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "accelerationMetersPerSecondSquared"},message:"must have required property '"+"accelerationMetersPerSecondSquared"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.decelerationMetersPerSecondSquared === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decelerationMetersPerSecondSquared"},message:"must have required property '"+"decelerationMetersPerSecondSquared"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.turnRateRadiansPerSecond === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "turnRateRadiansPerSecond"},message:"must have required property '"+"turnRateRadiansPerSecond"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.moveResponseExponent === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "moveResponseExponent"},message:"must have required property '"+"moveResponseExponent"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.airControlRatio === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "airControlRatio"},message:"must have required property '"+"airControlRatio"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.coyoteTimeSeconds === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coyoteTimeSeconds"},message:"must have required property '"+"coyoteTimeSeconds"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.jumpBufferSeconds === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "jumpBufferSeconds"},message:"must have required property '"+"jumpBufferSeconds"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.variableJumpHoldSeconds === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "variableJumpHoldSeconds"},message:"must have required property '"+"variableJumpHoldSeconds"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.jumpHoldGravityRatio === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "jumpHoldGravityRatio"},message:"must have required property '"+"jumpHoldGravityRatio"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.jumpReleaseGravityRatio === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "jumpReleaseGravityRatio"},message:"must have required property '"+"jumpReleaseGravityRatio"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema111.properties, key0))){
const err16 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err17 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data1 = data.contentHash;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err19 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.jumpVariantPolicy !== undefined){
let data2 = data.jumpVariantPolicy;
const _errs10 = errors;
let valid4 = false;
let passing0 = null;
const _errs11 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.mode === undefined){
const err21 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
for(const key1 in data2){
if(!(key1 === "mode")){
const err22 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data2.mode !== undefined){
if("hold-height" !== data2.mode){
const err23 = {instancePath:instancePath+"/jumpVariantPolicy/mode",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "hold-height"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid0 = _errs11 === errors;
if(_valid0){
valid4 = true;
passing0 = 0;
var props0 = true;
}
const _errs15 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.mode === undefined){
const err25 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data2.smallAnticipationSeconds === undefined){
const err26 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/required",keyword:"required",params:{missingProperty: "smallAnticipationSeconds"},message:"must have required property '"+"smallAnticipationSeconds"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data2.largeAnticipationSeconds === undefined){
const err27 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/required",keyword:"required",params:{missingProperty: "largeAnticipationSeconds"},message:"must have required property '"+"largeAnticipationSeconds"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
for(const key2 in data2){
if(!(((key2 === "mode") || (key2 === "smallAnticipationSeconds")) || (key2 === "largeAnticipationSeconds"))){
const err28 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data2.mode !== undefined){
if("run-selects-variant" !== data2.mode){
const err29 = {instancePath:instancePath+"/jumpVariantPolicy/mode",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "run-selects-variant"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data2.smallAnticipationSeconds !== undefined){
let data5 = data2.smallAnticipationSeconds;
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 > 1.5 || isNaN(data5)){
const err30 = {instancePath:instancePath+"/jumpVariantPolicy/smallAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/smallAnticipationSeconds/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1.5},message:"must be <= 1.5"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data5 < 0 || isNaN(data5)){
const err31 = {instancePath:instancePath+"/jumpVariantPolicy/smallAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/smallAnticipationSeconds/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/jumpVariantPolicy/smallAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/smallAnticipationSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data2.largeAnticipationSeconds !== undefined){
let data6 = data2.largeAnticipationSeconds;
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 1.5 || isNaN(data6)){
const err33 = {instancePath:instancePath+"/jumpVariantPolicy/largeAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/largeAnticipationSeconds/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1.5},message:"must be <= 1.5"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err34 = {instancePath:instancePath+"/jumpVariantPolicy/largeAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/largeAnticipationSeconds/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/jumpVariantPolicy/largeAnticipationSeconds",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/properties/largeAnticipationSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid4){
valid4 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid4 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid4){
const err37 = {instancePath:instancePath+"/jumpVariantPolicy",schemaPath:"#/$defs/jumpVariantPolicy/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
if(data.walkSpeedMetersPerSecond !== undefined){
let data7 = data.walkSpeedMetersPerSecond;
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err38 = {instancePath:instancePath+"/walkSpeedMetersPerSecond",schemaPath:"#/properties/walkSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.runSpeedMetersPerSecond !== undefined){
let data8 = data.runSpeedMetersPerSecond;
if(!((typeof data8 == "number") && (isFinite(data8)))){
const err39 = {instancePath:instancePath+"/runSpeedMetersPerSecond",schemaPath:"#/properties/runSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.jumpSpeedMetersPerSecond !== undefined){
let data9 = data.jumpSpeedMetersPerSecond;
if(!((typeof data9 == "number") && (isFinite(data9)))){
const err40 = {instancePath:instancePath+"/jumpSpeedMetersPerSecond",schemaPath:"#/properties/jumpSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.accelerationMetersPerSecondSquared !== undefined){
let data10 = data.accelerationMetersPerSecondSquared;
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err41 = {instancePath:instancePath+"/accelerationMetersPerSecondSquared",schemaPath:"#/properties/accelerationMetersPerSecondSquared/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.decelerationMetersPerSecondSquared !== undefined){
let data11 = data.decelerationMetersPerSecondSquared;
if(!((typeof data11 == "number") && (isFinite(data11)))){
const err42 = {instancePath:instancePath+"/decelerationMetersPerSecondSquared",schemaPath:"#/properties/decelerationMetersPerSecondSquared/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.turnRateRadiansPerSecond !== undefined){
let data12 = data.turnRateRadiansPerSecond;
if(!((typeof data12 == "number") && (isFinite(data12)))){
const err43 = {instancePath:instancePath+"/turnRateRadiansPerSecond",schemaPath:"#/properties/turnRateRadiansPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.moveResponseExponent !== undefined){
let data13 = data.moveResponseExponent;
if(!((typeof data13 == "number") && (isFinite(data13)))){
const err44 = {instancePath:instancePath+"/moveResponseExponent",schemaPath:"#/properties/moveResponseExponent/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data.airControlRatio !== undefined){
let data14 = data.airControlRatio;
if(!((typeof data14 == "number") && (isFinite(data14)))){
const err45 = {instancePath:instancePath+"/airControlRatio",schemaPath:"#/properties/airControlRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.coyoteTimeSeconds !== undefined){
let data15 = data.coyoteTimeSeconds;
if(!((typeof data15 == "number") && (isFinite(data15)))){
const err46 = {instancePath:instancePath+"/coyoteTimeSeconds",schemaPath:"#/properties/coyoteTimeSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.jumpBufferSeconds !== undefined){
let data16 = data.jumpBufferSeconds;
if(!((typeof data16 == "number") && (isFinite(data16)))){
const err47 = {instancePath:instancePath+"/jumpBufferSeconds",schemaPath:"#/properties/jumpBufferSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.variableJumpHoldSeconds !== undefined){
let data17 = data.variableJumpHoldSeconds;
if(!((typeof data17 == "number") && (isFinite(data17)))){
const err48 = {instancePath:instancePath+"/variableJumpHoldSeconds",schemaPath:"#/properties/variableJumpHoldSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.jumpHoldGravityRatio !== undefined){
let data18 = data.jumpHoldGravityRatio;
if(!((typeof data18 == "number") && (isFinite(data18)))){
const err49 = {instancePath:instancePath+"/jumpHoldGravityRatio",schemaPath:"#/properties/jumpHoldGravityRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.jumpReleaseGravityRatio !== undefined){
let data19 = data.jumpReleaseGravityRatio;
if(!((typeof data19 == "number") && (isFinite(data19)))){
const err50 = {instancePath:instancePath+"/jumpReleaseGravityRatio",schemaPath:"#/properties/jumpReleaseGravityRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
else {
const err51 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
validate68.errors = vErrors;
return errors === 0;
}
validate68.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema115 = {"type":"object","additionalProperties":false,"required":["authoringAvailability","physicsBodyProfileRef","locomotionProfileRef","defaultMotionProfile","optionalMotionProfiles","fallbackMotionProfile","motionKernels","controlProfile","cameraContext","mediumProfile","relationshipProfiles","harnessProfileRef","requiredHarnessCheckIds","actionOrPoseSetRef","renderBindingProfileRef"],"properties":{"authoringAvailability":{"enum":["recommended","advanced","experimental"]},"physicsBodyProfileRef":{"$ref":"#/$defs/nonEmptyString"},"locomotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"defaultMotionProfile":{"$ref":"#/$defs/motionProfile"},"optionalMotionProfiles":{"type":"array","items":{"$ref":"#/$defs/motionProfile"}},"fallbackMotionProfile":{"$ref":"#/$defs/motionProfile"},"motionKernels":{"type":"array","items":{"$ref":"#/$defs/motionKernel"}},"controlProfile":{"$ref":"#/$defs/controlProfile"},"cameraContext":{"type":"object","additionalProperties":false,"required":["resourceRef","defaultCameraRigProfileRef","rules","cameraRigProfiles","cameraModifierProfiles"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"defaultCameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"firstPersonCameraRigProfileRef":{"$ref":"#/$defs/nonEmptyString"},"rules":{"type":"array","items":{"$ref":"#/$defs/cameraContextRule"}},"cameraRigProfiles":{"type":"array","items":{"$ref":"#/$defs/cameraRigProfile"}},"cameraModifierProfiles":{"type":"array","items":{"$ref":"#/$defs/cameraModifierProfile"}}}},"mediumProfile":{"type":"object","additionalProperties":false,"required":["resourceRef","air"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"air":{"type":"object","additionalProperties":false,"required":["gravityRatio","linearDragPerSecond"],"properties":{"gravityRatio":{"type":"number"},"linearDragPerSecond":{"type":"number"}}}}},"relationshipProfiles":{"type":"array","items":{"$ref":"#/$defs/relationshipProfile"}},"harnessProfileRef":{"$ref":"#/$defs/nonEmptyString"},"requiredHarnessCheckIds":{"$ref":"#/$defs/stringArray"},"actionOrPoseSetRef":{"$ref":"#/$defs/nonEmptyString"},"renderBindingProfileRef":{"$ref":"#/$defs/nonEmptyString"}}};
const schema118 = {"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","motionKernelRef","motionTags"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"motionKernelRef":{"$ref":"#/$defs/nonEmptyString"},"motionTags":{"$ref":"#/$defs/stringArray"}}};

function validate72(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate72.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.contentHash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.motionKernelRef === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "motionKernelRef"},message:"must have required property '"+"motionKernelRef"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.motionTags === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "motionTags"},message:"must have required property '"+"motionTags"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "resourceRef") || (key0 === "contentHash")) || (key0 === "motionKernelRef")) || (key0 === "motionTags"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err5 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data1 = data.contentHash;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.motionKernelRef !== undefined){
let data2 = data.motionKernelRef;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err9 = {instancePath:instancePath+"/motionKernelRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/motionKernelRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.motionTags !== undefined){
if(!(validate25(data.motionTags, {instancePath:instancePath+"/motionTags",parentData:data,parentDataProperty:"motionTags",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate72.errors = vErrors;
return errors === 0;
}
validate72.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema122 = {"type":"object","additionalProperties":false,"required":["resourceRef","implementationId","commandKind","supportedMediums","fallbackMotionProfileRef","deterministic"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"implementationId":{"enum":["free-ground","forward-steer","wheeled-arcade","surface-slide","water-surface","unpowered-glide"]},"commandKind":{"$ref":"#/$defs/motionCommandKind"},"supportedMediums":{"type":"array","items":{"enum":["ground","water","air"]}},"fallbackMotionProfileRef":{"$ref":"#/$defs/nonEmptyString"},"deterministic":{"const":true}}};
const schema124 = {"enum":["planar-vector","throttle-steer","flight-attitude","none"]};

function validate77(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate77.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.implementationId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "implementationId"},message:"must have required property '"+"implementationId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.commandKind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandKind"},message:"must have required property '"+"commandKind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.supportedMediums === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "supportedMediums"},message:"must have required property '"+"supportedMediums"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.fallbackMotionProfileRef === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fallbackMotionProfileRef"},message:"must have required property '"+"fallbackMotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.deterministic === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "deterministic"},message:"must have required property '"+"deterministic"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "resourceRef") || (key0 === "implementationId")) || (key0 === "commandKind")) || (key0 === "supportedMediums")) || (key0 === "fallbackMotionProfileRef")) || (key0 === "deterministic"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err7 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.implementationId !== undefined){
let data1 = data.implementationId;
if(!((((((data1 === "free-ground") || (data1 === "forward-steer")) || (data1 === "wheeled-arcade")) || (data1 === "surface-slide")) || (data1 === "water-surface")) || (data1 === "unpowered-glide"))){
const err9 = {instancePath:instancePath+"/implementationId",schemaPath:"#/properties/implementationId/enum",keyword:"enum",params:{allowedValues: schema122.properties.implementationId.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.commandKind !== undefined){
let data2 = data.commandKind;
if(!((((data2 === "planar-vector") || (data2 === "throttle-steer")) || (data2 === "flight-attitude")) || (data2 === "none"))){
const err10 = {instancePath:instancePath+"/commandKind",schemaPath:"#/$defs/motionCommandKind/enum",keyword:"enum",params:{allowedValues: schema124.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.supportedMediums !== undefined){
let data3 = data.supportedMediums;
if(Array.isArray(data3)){
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(!(((data4 === "ground") || (data4 === "water")) || (data4 === "air"))){
const err11 = {instancePath:instancePath+"/supportedMediums/" + i0,schemaPath:"#/properties/supportedMediums/items/enum",keyword:"enum",params:{allowedValues: schema122.properties.supportedMediums.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath:instancePath+"/supportedMediums",schemaPath:"#/properties/supportedMediums/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.fallbackMotionProfileRef !== undefined){
let data5 = data.fallbackMotionProfileRef;
if(typeof data5 === "string"){
if(func2(data5) < 1){
const err13 = {instancePath:instancePath+"/fallbackMotionProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/fallbackMotionProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.deterministic !== undefined){
if(true !== data.deterministic){
const err15 = {instancePath:instancePath+"/deterministic",schemaPath:"#/properties/deterministic/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate77.errors = vErrors;
return errors === 0;
}
validate77.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema126 = {"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","commandKind","inputSpace","facingPolicy","lateralMovementPolicy","moveDeadzoneRatio"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"commandKind":{"$ref":"#/$defs/motionCommandKind"},"inputSpace":{"enum":["camera-relative","subject-local","flight-frame","none"]},"facingPolicy":{"enum":["align-to-move","align-to-view","steering-derived","flight-derived","fixed"]},"lateralMovementPolicy":{"enum":["allowed","forbidden"]},"moveDeadzoneRatio":{"type":"number"}}};

function validate79(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate79.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.contentHash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.commandKind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandKind"},message:"must have required property '"+"commandKind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.inputSpace === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "inputSpace"},message:"must have required property '"+"inputSpace"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.facingPolicy === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "facingPolicy"},message:"must have required property '"+"facingPolicy"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.lateralMovementPolicy === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lateralMovementPolicy"},message:"must have required property '"+"lateralMovementPolicy"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.moveDeadzoneRatio === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "moveDeadzoneRatio"},message:"must have required property '"+"moveDeadzoneRatio"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "resourceRef") || (key0 === "contentHash")) || (key0 === "commandKind")) || (key0 === "inputSpace")) || (key0 === "facingPolicy")) || (key0 === "lateralMovementPolicy")) || (key0 === "moveDeadzoneRatio"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err8 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data1 = data.contentHash;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err10 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.commandKind !== undefined){
let data2 = data.commandKind;
if(!((((data2 === "planar-vector") || (data2 === "throttle-steer")) || (data2 === "flight-attitude")) || (data2 === "none"))){
const err12 = {instancePath:instancePath+"/commandKind",schemaPath:"#/$defs/motionCommandKind/enum",keyword:"enum",params:{allowedValues: schema124.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.inputSpace !== undefined){
let data3 = data.inputSpace;
if(!((((data3 === "camera-relative") || (data3 === "subject-local")) || (data3 === "flight-frame")) || (data3 === "none"))){
const err13 = {instancePath:instancePath+"/inputSpace",schemaPath:"#/properties/inputSpace/enum",keyword:"enum",params:{allowedValues: schema126.properties.inputSpace.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.facingPolicy !== undefined){
let data4 = data.facingPolicy;
if(!(((((data4 === "align-to-move") || (data4 === "align-to-view")) || (data4 === "steering-derived")) || (data4 === "flight-derived")) || (data4 === "fixed"))){
const err14 = {instancePath:instancePath+"/facingPolicy",schemaPath:"#/properties/facingPolicy/enum",keyword:"enum",params:{allowedValues: schema126.properties.facingPolicy.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.lateralMovementPolicy !== undefined){
let data5 = data.lateralMovementPolicy;
if(!((data5 === "allowed") || (data5 === "forbidden"))){
const err15 = {instancePath:instancePath+"/lateralMovementPolicy",schemaPath:"#/properties/lateralMovementPolicy/enum",keyword:"enum",params:{allowedValues: schema126.properties.lateralMovementPolicy.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.moveDeadzoneRatio !== undefined){
let data6 = data.moveDeadzoneRatio;
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err16 = {instancePath:instancePath+"/moveDeadzoneRatio",schemaPath:"#/properties/moveDeadzoneRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate79.errors = vErrors;
return errors === 0;
}
validate79.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema133 = {"type":"object","additionalProperties":false,"required":["id","priority","when"],"properties":{"id":{"type":"string","minLength":1,"maxLength":256},"priority":{"type":"integer"},"when":{"type":"object","additionalProperties":false,"properties":{"allRelationshipConditions":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraRelationshipCondition"}},"locomotionStatuses":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["active","suspended"]}},"mobilityModes":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["grounded","airborne"]}},"gaits":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["none","idle","walk","run"]}},"verticalPhases":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["none","takeoff","rising","apex","falling","landing"]}},"requiredActiveActionRefs":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraActionRef"}},"actionInterruptibility":{"enum":["interruptible","non-interruptible"]},"movementMediums":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"enum":["ground","air"]}},"minimumSpeedMetersPerSecond":{"type":"number","minimum":0},"maximumSpeedMetersPerSecond":{"type":"number","minimum":0},"requiredSocketIds":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$"}},"requiredCameraContextTags":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[a-z0-9]+(?:[.-][a-z0-9]+)*$"}}}},"cameraRigProfileRef":{"$ref":"#/$defs/cameraProfileRef"},"cameraModifierRefs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/cameraModifierRef"}}}};
const schema134 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"possessedBy"},"entityRole":{"enum":["controlled","controller"]}}},{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"mountedOn"},"entityRole":{"const":"rider"}}},{"type":"object","additionalProperties":false,"required":["type","entityRole"],"properties":{"type":{"const":"equippedAt"},"entityRole":{"enum":["item","wearer"]}}}]};
const schema135 = {"type":"string","pattern":"^worldkit://semantic-action/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128};
const schema136 = {"type":"string","pattern":"^worldkit://camera-profile/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128};
const schema137 = {"type":"string","pattern":"^worldkit://camera-modifier/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$","maxLength":128};
import func0Module from "ajv/dist/runtime/equal.js";
const func0 = typeof func0Module === "function" ? func0Module : func0Module.default;
const pattern16 = new RegExp("^worldkit://semantic-action/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$", "u");
const pattern17 = new RegExp("^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$", "u");
const pattern18 = new RegExp("^[a-z0-9]+(?:[.-][a-z0-9]+)*$", "u");
const pattern19 = new RegExp("^worldkit://camera-profile/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$", "u");
const pattern20 = new RegExp("^worldkit://camera-modifier/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$", "u");

function validate81(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate81.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.priority === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "priority"},message:"must have required property '"+"priority"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.when === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "when"},message:"must have required property '"+"when"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "priority")) || (key0 === "when")) || (key0 === "cameraRigProfileRef")) || (key0 === "cameraModifierRefs"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) > 256){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.priority !== undefined){
let data1 = data.priority;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err7 = {instancePath:instancePath+"/priority",schemaPath:"#/properties/priority/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.when !== undefined){
let data2 = data.when;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
for(const key1 in data2){
if(!(func1.call(schema133.properties.when.properties, key1))){
const err8 = {instancePath:instancePath+"/when",schemaPath:"#/properties/when/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data2.allRelationshipConditions !== undefined){
let data3 = data2.allRelationshipConditions;
if(Array.isArray(data3)){
if(data3.length > 64){
const err9 = {instancePath:instancePath+"/when/allRelationshipConditions",schemaPath:"#/properties/when/properties/allRelationshipConditions/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data3.length < 1){
const err10 = {instancePath:instancePath+"/when/allRelationshipConditions",schemaPath:"#/properties/when/properties/allRelationshipConditions/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
const _errs13 = errors;
let valid5 = false;
let passing0 = null;
const _errs14 = errors;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.type === undefined){
const err11 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data4.entityRole === undefined){
const err12 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/required",keyword:"required",params:{missingProperty: "entityRole"},message:"must have required property '"+"entityRole"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key2 in data4){
if(!((key2 === "type") || (key2 === "entityRole"))){
const err13 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data4.type !== undefined){
if("possessedBy" !== data4.type){
const err14 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/type",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/properties/type/const",keyword:"const",params:{allowedValue: "possessedBy"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data4.entityRole !== undefined){
let data6 = data4.entityRole;
if(!((data6 === "controlled") || (data6 === "controller"))){
const err15 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/entityRole",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/properties/entityRole/enum",keyword:"enum",params:{allowedValues: schema134.oneOf[0].properties.entityRole.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
var props0 = true;
}
const _errs19 = errors;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.type === undefined){
const err17 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data4.entityRole === undefined){
const err18 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/required",keyword:"required",params:{missingProperty: "entityRole"},message:"must have required property '"+"entityRole"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key3 in data4){
if(!((key3 === "type") || (key3 === "entityRole"))){
const err19 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data4.type !== undefined){
if("mountedOn" !== data4.type){
const err20 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/type",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/properties/type/const",keyword:"const",params:{allowedValue: "mountedOn"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data4.entityRole !== undefined){
if("rider" !== data4.entityRole){
const err21 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/entityRole",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/properties/entityRole/const",keyword:"const",params:{allowedValue: "rider"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs19 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs24 = errors;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.type === undefined){
const err23 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data4.entityRole === undefined){
const err24 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/required",keyword:"required",params:{missingProperty: "entityRole"},message:"must have required property '"+"entityRole"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key4 in data4){
if(!((key4 === "type") || (key4 === "entityRole"))){
const err25 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data4.type !== undefined){
if("equippedAt" !== data4.type){
const err26 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/type",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/properties/type/const",keyword:"const",params:{allowedValue: "equippedAt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data4.entityRole !== undefined){
let data10 = data4.entityRole;
if(!((data10 === "item") || (data10 === "wearer"))){
const err27 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0+"/entityRole",schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/properties/entityRole/enum",keyword:"enum",params:{allowedValues: schema134.oneOf[2].properties.entityRole.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid5 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid5){
const err29 = {instancePath:instancePath+"/when/allRelationshipConditions/" + i0,schemaPath:"#/$defs/cameraRelationshipCondition/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs13;
if(vErrors !== null){
if(_errs13){
vErrors.length = _errs13;
}
else {
vErrors = null;
}
}
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
const err30 = {instancePath:instancePath+"/when/allRelationshipConditions",schemaPath:"#/properties/when/properties/allRelationshipConditions/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err31 = {instancePath:instancePath+"/when/allRelationshipConditions",schemaPath:"#/properties/when/properties/allRelationshipConditions/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data2.locomotionStatuses !== undefined){
let data11 = data2.locomotionStatuses;
if(Array.isArray(data11)){
if(data11.length > 64){
const err32 = {instancePath:instancePath+"/when/locomotionStatuses",schemaPath:"#/properties/when/properties/locomotionStatuses/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(data11.length < 1){
const err33 = {instancePath:instancePath+"/when/locomotionStatuses",schemaPath:"#/properties/when/properties/locomotionStatuses/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len1 = data11.length;
for(let i2=0; i2<len1; i2++){
let data12 = data11[i2];
if(!((data12 === "active") || (data12 === "suspended"))){
const err34 = {instancePath:instancePath+"/when/locomotionStatuses/" + i2,schemaPath:"#/properties/when/properties/locomotionStatuses/items/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.locomotionStatuses.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
let i3 = data11.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func0(data11[i3], data11[j1])){
const err35 = {instancePath:instancePath+"/when/locomotionStatuses",schemaPath:"#/properties/when/properties/locomotionStatuses/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err36 = {instancePath:instancePath+"/when/locomotionStatuses",schemaPath:"#/properties/when/properties/locomotionStatuses/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data2.mobilityModes !== undefined){
let data13 = data2.mobilityModes;
if(Array.isArray(data13)){
if(data13.length > 64){
const err37 = {instancePath:instancePath+"/when/mobilityModes",schemaPath:"#/properties/when/properties/mobilityModes/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data13.length < 1){
const err38 = {instancePath:instancePath+"/when/mobilityModes",schemaPath:"#/properties/when/properties/mobilityModes/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
const len2 = data13.length;
for(let i4=0; i4<len2; i4++){
let data14 = data13[i4];
if(!((data14 === "grounded") || (data14 === "airborne"))){
const err39 = {instancePath:instancePath+"/when/mobilityModes/" + i4,schemaPath:"#/properties/when/properties/mobilityModes/items/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.mobilityModes.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
let i5 = data13.length;
let j2;
if(i5 > 1){
outer2:
for(;i5--;){
for(j2 = i5; j2--;){
if(func0(data13[i5], data13[j2])){
const err40 = {instancePath:instancePath+"/when/mobilityModes",schemaPath:"#/properties/when/properties/mobilityModes/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err41 = {instancePath:instancePath+"/when/mobilityModes",schemaPath:"#/properties/when/properties/mobilityModes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data2.gaits !== undefined){
let data15 = data2.gaits;
if(Array.isArray(data15)){
if(data15.length > 64){
const err42 = {instancePath:instancePath+"/when/gaits",schemaPath:"#/properties/when/properties/gaits/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data15.length < 1){
const err43 = {instancePath:instancePath+"/when/gaits",schemaPath:"#/properties/when/properties/gaits/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
const len3 = data15.length;
for(let i6=0; i6<len3; i6++){
let data16 = data15[i6];
if(!((((data16 === "none") || (data16 === "idle")) || (data16 === "walk")) || (data16 === "run"))){
const err44 = {instancePath:instancePath+"/when/gaits/" + i6,schemaPath:"#/properties/when/properties/gaits/items/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.gaits.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
let i7 = data15.length;
let j3;
if(i7 > 1){
outer3:
for(;i7--;){
for(j3 = i7; j3--;){
if(func0(data15[i7], data15[j3])){
const err45 = {instancePath:instancePath+"/when/gaits",schemaPath:"#/properties/when/properties/gaits/uniqueItems",keyword:"uniqueItems",params:{i: i7, j: j3},message:"must NOT have duplicate items (items ## "+j3+" and "+i7+" are identical)"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
break outer3;
}
}
}
}
}
else {
const err46 = {instancePath:instancePath+"/when/gaits",schemaPath:"#/properties/when/properties/gaits/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data2.verticalPhases !== undefined){
let data17 = data2.verticalPhases;
if(Array.isArray(data17)){
if(data17.length > 64){
const err47 = {instancePath:instancePath+"/when/verticalPhases",schemaPath:"#/properties/when/properties/verticalPhases/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(data17.length < 1){
const err48 = {instancePath:instancePath+"/when/verticalPhases",schemaPath:"#/properties/when/properties/verticalPhases/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
const len4 = data17.length;
for(let i8=0; i8<len4; i8++){
let data18 = data17[i8];
if(!((((((data18 === "none") || (data18 === "takeoff")) || (data18 === "rising")) || (data18 === "apex")) || (data18 === "falling")) || (data18 === "landing"))){
const err49 = {instancePath:instancePath+"/when/verticalPhases/" + i8,schemaPath:"#/properties/when/properties/verticalPhases/items/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.verticalPhases.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
let i9 = data17.length;
let j4;
if(i9 > 1){
outer4:
for(;i9--;){
for(j4 = i9; j4--;){
if(func0(data17[i9], data17[j4])){
const err50 = {instancePath:instancePath+"/when/verticalPhases",schemaPath:"#/properties/when/properties/verticalPhases/uniqueItems",keyword:"uniqueItems",params:{i: i9, j: j4},message:"must NOT have duplicate items (items ## "+j4+" and "+i9+" are identical)"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
break outer4;
}
}
}
}
}
else {
const err51 = {instancePath:instancePath+"/when/verticalPhases",schemaPath:"#/properties/when/properties/verticalPhases/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data2.requiredActiveActionRefs !== undefined){
let data19 = data2.requiredActiveActionRefs;
if(Array.isArray(data19)){
if(data19.length > 64){
const err52 = {instancePath:instancePath+"/when/requiredActiveActionRefs",schemaPath:"#/properties/when/properties/requiredActiveActionRefs/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data19.length < 1){
const err53 = {instancePath:instancePath+"/when/requiredActiveActionRefs",schemaPath:"#/properties/when/properties/requiredActiveActionRefs/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
const len5 = data19.length;
for(let i10=0; i10<len5; i10++){
let data20 = data19[i10];
if(typeof data20 === "string"){
if(func2(data20) > 128){
const err54 = {instancePath:instancePath+"/when/requiredActiveActionRefs/" + i10,schemaPath:"#/$defs/cameraActionRef/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!pattern16.test(data20)){
const err55 = {instancePath:instancePath+"/when/requiredActiveActionRefs/" + i10,schemaPath:"#/$defs/cameraActionRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://semantic-action/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://semantic-action/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/when/requiredActiveActionRefs/" + i10,schemaPath:"#/$defs/cameraActionRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
let i11 = data19.length;
let j5;
if(i11 > 1){
outer5:
for(;i11--;){
for(j5 = i11; j5--;){
if(func0(data19[i11], data19[j5])){
const err57 = {instancePath:instancePath+"/when/requiredActiveActionRefs",schemaPath:"#/properties/when/properties/requiredActiveActionRefs/uniqueItems",keyword:"uniqueItems",params:{i: i11, j: j5},message:"must NOT have duplicate items (items ## "+j5+" and "+i11+" are identical)"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break outer5;
}
}
}
}
}
else {
const err58 = {instancePath:instancePath+"/when/requiredActiveActionRefs",schemaPath:"#/properties/when/properties/requiredActiveActionRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data2.actionInterruptibility !== undefined){
let data21 = data2.actionInterruptibility;
if(!((data21 === "interruptible") || (data21 === "non-interruptible"))){
const err59 = {instancePath:instancePath+"/when/actionInterruptibility",schemaPath:"#/properties/when/properties/actionInterruptibility/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.actionInterruptibility.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data2.movementMediums !== undefined){
let data22 = data2.movementMediums;
if(Array.isArray(data22)){
if(data22.length > 64){
const err60 = {instancePath:instancePath+"/when/movementMediums",schemaPath:"#/properties/when/properties/movementMediums/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data22.length < 1){
const err61 = {instancePath:instancePath+"/when/movementMediums",schemaPath:"#/properties/when/properties/movementMediums/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
const len6 = data22.length;
for(let i12=0; i12<len6; i12++){
let data23 = data22[i12];
if(!((data23 === "ground") || (data23 === "air"))){
const err62 = {instancePath:instancePath+"/when/movementMediums/" + i12,schemaPath:"#/properties/when/properties/movementMediums/items/enum",keyword:"enum",params:{allowedValues: schema133.properties.when.properties.movementMediums.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
let i13 = data22.length;
let j6;
if(i13 > 1){
outer6:
for(;i13--;){
for(j6 = i13; j6--;){
if(func0(data22[i13], data22[j6])){
const err63 = {instancePath:instancePath+"/when/movementMediums",schemaPath:"#/properties/when/properties/movementMediums/uniqueItems",keyword:"uniqueItems",params:{i: i13, j: j6},message:"must NOT have duplicate items (items ## "+j6+" and "+i13+" are identical)"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
break outer6;
}
}
}
}
}
else {
const err64 = {instancePath:instancePath+"/when/movementMediums",schemaPath:"#/properties/when/properties/movementMediums/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data2.minimumSpeedMetersPerSecond !== undefined){
let data24 = data2.minimumSpeedMetersPerSecond;
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 0 || isNaN(data24)){
const err65 = {instancePath:instancePath+"/when/minimumSpeedMetersPerSecond",schemaPath:"#/properties/when/properties/minimumSpeedMetersPerSecond/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
else {
const err66 = {instancePath:instancePath+"/when/minimumSpeedMetersPerSecond",schemaPath:"#/properties/when/properties/minimumSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data2.maximumSpeedMetersPerSecond !== undefined){
let data25 = data2.maximumSpeedMetersPerSecond;
if((typeof data25 == "number") && (isFinite(data25))){
if(data25 < 0 || isNaN(data25)){
const err67 = {instancePath:instancePath+"/when/maximumSpeedMetersPerSecond",schemaPath:"#/properties/when/properties/maximumSpeedMetersPerSecond/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
else {
const err68 = {instancePath:instancePath+"/when/maximumSpeedMetersPerSecond",schemaPath:"#/properties/when/properties/maximumSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data2.requiredSocketIds !== undefined){
let data26 = data2.requiredSocketIds;
if(Array.isArray(data26)){
if(data26.length > 64){
const err69 = {instancePath:instancePath+"/when/requiredSocketIds",schemaPath:"#/properties/when/properties/requiredSocketIds/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(data26.length < 1){
const err70 = {instancePath:instancePath+"/when/requiredSocketIds",schemaPath:"#/properties/when/properties/requiredSocketIds/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
const len7 = data26.length;
for(let i14=0; i14<len7; i14++){
let data27 = data26[i14];
if(typeof data27 === "string"){
if(func2(data27) > 128){
const err71 = {instancePath:instancePath+"/when/requiredSocketIds/" + i14,schemaPath:"#/properties/when/properties/requiredSocketIds/items/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(func2(data27) < 1){
const err72 = {instancePath:instancePath+"/when/requiredSocketIds/" + i14,schemaPath:"#/properties/when/properties/requiredSocketIds/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if(!pattern17.test(data27)){
const err73 = {instancePath:instancePath+"/when/requiredSocketIds/" + i14,schemaPath:"#/properties/when/properties/requiredSocketIds/items/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$"},message:"must match pattern \""+"^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
else {
const err74 = {instancePath:instancePath+"/when/requiredSocketIds/" + i14,schemaPath:"#/properties/when/properties/requiredSocketIds/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
let i15 = data26.length;
let j7;
if(i15 > 1){
const indices0 = {};
for(;i15--;){
let item0 = data26[i15];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j7 = indices0[item0];
const err75 = {instancePath:instancePath+"/when/requiredSocketIds",schemaPath:"#/properties/when/properties/requiredSocketIds/uniqueItems",keyword:"uniqueItems",params:{i: i15, j: j7},message:"must NOT have duplicate items (items ## "+j7+" and "+i15+" are identical)"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
break;
}
indices0[item0] = i15;
}
}
}
else {
const err76 = {instancePath:instancePath+"/when/requiredSocketIds",schemaPath:"#/properties/when/properties/requiredSocketIds/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data2.requiredCameraContextTags !== undefined){
let data28 = data2.requiredCameraContextTags;
if(Array.isArray(data28)){
if(data28.length > 64){
const err77 = {instancePath:instancePath+"/when/requiredCameraContextTags",schemaPath:"#/properties/when/properties/requiredCameraContextTags/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(data28.length < 1){
const err78 = {instancePath:instancePath+"/when/requiredCameraContextTags",schemaPath:"#/properties/when/properties/requiredCameraContextTags/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
const len8 = data28.length;
for(let i16=0; i16<len8; i16++){
let data29 = data28[i16];
if(typeof data29 === "string"){
if(func2(data29) > 128){
const err79 = {instancePath:instancePath+"/when/requiredCameraContextTags/" + i16,schemaPath:"#/properties/when/properties/requiredCameraContextTags/items/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(func2(data29) < 1){
const err80 = {instancePath:instancePath+"/when/requiredCameraContextTags/" + i16,schemaPath:"#/properties/when/properties/requiredCameraContextTags/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(!pattern18.test(data29)){
const err81 = {instancePath:instancePath+"/when/requiredCameraContextTags/" + i16,schemaPath:"#/properties/when/properties/requiredCameraContextTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:[.-][a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/when/requiredCameraContextTags/" + i16,schemaPath:"#/properties/when/properties/requiredCameraContextTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
let i17 = data28.length;
let j8;
if(i17 > 1){
const indices1 = {};
for(;i17--;){
let item1 = data28[i17];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j8 = indices1[item1];
const err83 = {instancePath:instancePath+"/when/requiredCameraContextTags",schemaPath:"#/properties/when/properties/requiredCameraContextTags/uniqueItems",keyword:"uniqueItems",params:{i: i17, j: j8},message:"must NOT have duplicate items (items ## "+j8+" and "+i17+" are identical)"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
break;
}
indices1[item1] = i17;
}
}
}
else {
const err84 = {instancePath:instancePath+"/when/requiredCameraContextTags",schemaPath:"#/properties/when/properties/requiredCameraContextTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
}
else {
const err85 = {instancePath:instancePath+"/when",schemaPath:"#/properties/when/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data.cameraRigProfileRef !== undefined){
let data30 = data.cameraRigProfileRef;
if(typeof data30 === "string"){
if(func2(data30) > 128){
const err86 = {instancePath:instancePath+"/cameraRigProfileRef",schemaPath:"#/$defs/cameraProfileRef/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
if(!pattern19.test(data30)){
const err87 = {instancePath:instancePath+"/cameraRigProfileRef",schemaPath:"#/$defs/cameraProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://camera-profile/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://camera-profile/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
else {
const err88 = {instancePath:instancePath+"/cameraRigProfileRef",schemaPath:"#/$defs/cameraProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data.cameraModifierRefs !== undefined){
let data31 = data.cameraModifierRefs;
if(Array.isArray(data31)){
if(data31.length > 64){
const err89 = {instancePath:instancePath+"/cameraModifierRefs",schemaPath:"#/properties/cameraModifierRefs/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
const len9 = data31.length;
for(let i18=0; i18<len9; i18++){
let data32 = data31[i18];
if(typeof data32 === "string"){
if(func2(data32) > 128){
const err90 = {instancePath:instancePath+"/cameraModifierRefs/" + i18,schemaPath:"#/$defs/cameraModifierRef/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if(!pattern20.test(data32)){
const err91 = {instancePath:instancePath+"/cameraModifierRefs/" + i18,schemaPath:"#/$defs/cameraModifierRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://camera-modifier/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://camera-modifier/[a-z0-9]+(?:[.-][a-z0-9]+)*@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
else {
const err92 = {instancePath:instancePath+"/cameraModifierRefs/" + i18,schemaPath:"#/$defs/cameraModifierRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
let i19 = data31.length;
let j9;
if(i19 > 1){
outer7:
for(;i19--;){
for(j9 = i19; j9--;){
if(func0(data31[i19], data31[j9])){
const err93 = {instancePath:instancePath+"/cameraModifierRefs",schemaPath:"#/properties/cameraModifierRefs/uniqueItems",keyword:"uniqueItems",params:{i: i19, j: j9},message:"must NOT have duplicate items (items ## "+j9+" and "+i19+" are identical)"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
break outer7;
}
}
}
}
}
else {
const err94 = {instancePath:instancePath+"/cameraModifierRefs",schemaPath:"#/properties/cameraModifierRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
}
else {
const err95 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
validate81.errors = vErrors;
return errors === 0;
}
validate81.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema138 = {"type":"object","additionalProperties":false,"required":["resourceRef","contentHash","baseMode","algorithmRef","headingSource","reverseHeadingPolicy","recenterMode","preferredSocketIds","parameters"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"},"baseMode":{"enum":["first-person","free-orbit","stable-follow","speed-chase","flight-horizon"]},"algorithmRef":{"$ref":"#/$defs/nonEmptyString"},"headingSource":{"enum":["view","target-forward","target-velocity"]},"reverseHeadingPolicy":{"enum":["follow-velocity","preserve-target-forward"]},"recenterMode":{"enum":["off","forward-motion","always"]},"preferredSocketIds":{"$ref":"#/$defs/stringArray"},"parameters":{"$ref":"#/$defs/cameraParameters"},"authoringRanges":{"type":"object","propertyNames":{"enum":["distanceMeters","minimumDistanceMeters","maximumDistanceMeters","targetHeightMeters","shoulderOffsetMeters","pitchRadians","minimumPitchRadians","maximumPitchRadians","positionDampingPerSecond","horizontalPositionDampingPerSecond","verticalPositionDampingPerSecond","maximumPositionLagMeters","rotationDampingPerSecond","yawDampingPerSecond","pitchDampingPerSecond","collisionRadiusMeters","collisionRetractionMetersPerSecond","collisionRecoveryMetersPerSecond","baseFovDegrees","speedFovDegreesPerMeterPerSecond","maximumSpeedFovDegrees","lookAheadSeconds","accelerationLookAheadSecondsSquared","transitionSeconds","minimumHeadingSpeedMetersPerSecond","velocityHeadingDampingPerSecond","fovDampingPerSecond","horizontalDeadZoneRatio","verticalDeadZoneRatio","recenterDelaySeconds","recenterDurationSeconds","recenterMinimumSpeedMetersPerSecond","teleportSnapDistanceMeters","lookSensitivityXRatio","lookSensitivityYRatio"]},"additionalProperties":{"type":"object","additionalProperties":false,"required":["minimum","maximum","step"],"properties":{"minimum":{"type":"number"},"maximum":{"type":"number"},"step":{"type":"number"}}}}}};
const schema142 = {"type":"object","additionalProperties":false,"required":["distanceMeters","minimumDistanceMeters","maximumDistanceMeters","targetHeightMeters","shoulderOffsetMeters","pitchRadians","minimumPitchRadians","maximumPitchRadians","positionDampingPerSecond","horizontalPositionDampingPerSecond","verticalPositionDampingPerSecond","maximumPositionLagMeters","rotationDampingPerSecond","yawDampingPerSecond","pitchDampingPerSecond","collisionRadiusMeters","collisionRetractionMetersPerSecond","collisionRecoveryMetersPerSecond","baseFovDegrees","speedFovDegreesPerMeterPerSecond","maximumSpeedFovDegrees","lookAheadSeconds","accelerationLookAheadSecondsSquared","transitionSeconds","minimumHeadingSpeedMetersPerSecond","velocityHeadingDampingPerSecond","fovDampingPerSecond","horizontalDeadZoneRatio","verticalDeadZoneRatio","recenterDelaySeconds","recenterDurationSeconds","recenterMinimumSpeedMetersPerSecond","teleportSnapDistanceMeters","lookSensitivityXRatio","lookSensitivityYRatio"],"properties":{"distanceMeters":{"type":"number"},"minimumDistanceMeters":{"type":"number"},"maximumDistanceMeters":{"type":"number"},"targetHeightMeters":{"type":"number"},"shoulderOffsetMeters":{"type":"number"},"pitchRadians":{"type":"number"},"minimumPitchRadians":{"type":"number"},"maximumPitchRadians":{"type":"number"},"positionDampingPerSecond":{"type":"number"},"horizontalPositionDampingPerSecond":{"type":"number"},"verticalPositionDampingPerSecond":{"type":"number"},"maximumPositionLagMeters":{"type":"number"},"rotationDampingPerSecond":{"type":"number"},"yawDampingPerSecond":{"type":"number"},"pitchDampingPerSecond":{"type":"number"},"collisionRadiusMeters":{"type":"number"},"collisionRetractionMetersPerSecond":{"type":"number"},"collisionRecoveryMetersPerSecond":{"type":"number"},"baseFovDegrees":{"type":"number"},"speedFovDegreesPerMeterPerSecond":{"type":"number"},"maximumSpeedFovDegrees":{"type":"number"},"lookAheadSeconds":{"type":"number"},"accelerationLookAheadSecondsSquared":{"type":"number"},"transitionSeconds":{"type":"number"},"minimumHeadingSpeedMetersPerSecond":{"type":"number"},"velocityHeadingDampingPerSecond":{"type":"number"},"fovDampingPerSecond":{"type":"number"},"horizontalDeadZoneRatio":{"type":"number"},"verticalDeadZoneRatio":{"type":"number"},"recenterDelaySeconds":{"type":"number"},"recenterDurationSeconds":{"type":"number"},"recenterMinimumSpeedMetersPerSecond":{"type":"number"},"teleportSnapDistanceMeters":{"type":"number"},"lookSensitivityXRatio":{"type":"number"},"lookSensitivityYRatio":{"type":"number"}}};

function validate83(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate83.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.contentHash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.baseMode === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "baseMode"},message:"must have required property '"+"baseMode"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.algorithmRef === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "algorithmRef"},message:"must have required property '"+"algorithmRef"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.headingSource === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "headingSource"},message:"must have required property '"+"headingSource"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.reverseHeadingPolicy === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reverseHeadingPolicy"},message:"must have required property '"+"reverseHeadingPolicy"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.recenterMode === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "recenterMode"},message:"must have required property '"+"recenterMode"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.preferredSocketIds === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preferredSocketIds"},message:"must have required property '"+"preferredSocketIds"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.parameters === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "parameters"},message:"must have required property '"+"parameters"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema138.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err10 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data1 = data.contentHash;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err12 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.baseMode !== undefined){
let data2 = data.baseMode;
if(!(((((data2 === "first-person") || (data2 === "free-orbit")) || (data2 === "stable-follow")) || (data2 === "speed-chase")) || (data2 === "flight-horizon"))){
const err14 = {instancePath:instancePath+"/baseMode",schemaPath:"#/properties/baseMode/enum",keyword:"enum",params:{allowedValues: schema138.properties.baseMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.algorithmRef !== undefined){
let data3 = data.algorithmRef;
if(typeof data3 === "string"){
if(func2(data3) < 1){
const err15 = {instancePath:instancePath+"/algorithmRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/algorithmRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.headingSource !== undefined){
let data4 = data.headingSource;
if(!(((data4 === "view") || (data4 === "target-forward")) || (data4 === "target-velocity"))){
const err17 = {instancePath:instancePath+"/headingSource",schemaPath:"#/properties/headingSource/enum",keyword:"enum",params:{allowedValues: schema138.properties.headingSource.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.reverseHeadingPolicy !== undefined){
let data5 = data.reverseHeadingPolicy;
if(!((data5 === "follow-velocity") || (data5 === "preserve-target-forward"))){
const err18 = {instancePath:instancePath+"/reverseHeadingPolicy",schemaPath:"#/properties/reverseHeadingPolicy/enum",keyword:"enum",params:{allowedValues: schema138.properties.reverseHeadingPolicy.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.recenterMode !== undefined){
let data6 = data.recenterMode;
if(!(((data6 === "off") || (data6 === "forward-motion")) || (data6 === "always"))){
const err19 = {instancePath:instancePath+"/recenterMode",schemaPath:"#/properties/recenterMode/enum",keyword:"enum",params:{allowedValues: schema138.properties.recenterMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.preferredSocketIds !== undefined){
if(!(validate25(data.preferredSocketIds, {instancePath:instancePath+"/preferredSocketIds",parentData:data,parentDataProperty:"preferredSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.parameters !== undefined){
let data8 = data.parameters;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.distanceMeters === undefined){
const err20 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "distanceMeters"},message:"must have required property '"+"distanceMeters"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data8.minimumDistanceMeters === undefined){
const err21 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "minimumDistanceMeters"},message:"must have required property '"+"minimumDistanceMeters"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data8.maximumDistanceMeters === undefined){
const err22 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "maximumDistanceMeters"},message:"must have required property '"+"maximumDistanceMeters"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data8.targetHeightMeters === undefined){
const err23 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "targetHeightMeters"},message:"must have required property '"+"targetHeightMeters"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data8.shoulderOffsetMeters === undefined){
const err24 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "shoulderOffsetMeters"},message:"must have required property '"+"shoulderOffsetMeters"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data8.pitchRadians === undefined){
const err25 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "pitchRadians"},message:"must have required property '"+"pitchRadians"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data8.minimumPitchRadians === undefined){
const err26 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "minimumPitchRadians"},message:"must have required property '"+"minimumPitchRadians"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data8.maximumPitchRadians === undefined){
const err27 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "maximumPitchRadians"},message:"must have required property '"+"maximumPitchRadians"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data8.positionDampingPerSecond === undefined){
const err28 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "positionDampingPerSecond"},message:"must have required property '"+"positionDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data8.horizontalPositionDampingPerSecond === undefined){
const err29 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "horizontalPositionDampingPerSecond"},message:"must have required property '"+"horizontalPositionDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data8.verticalPositionDampingPerSecond === undefined){
const err30 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "verticalPositionDampingPerSecond"},message:"must have required property '"+"verticalPositionDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data8.maximumPositionLagMeters === undefined){
const err31 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "maximumPositionLagMeters"},message:"must have required property '"+"maximumPositionLagMeters"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(data8.rotationDampingPerSecond === undefined){
const err32 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "rotationDampingPerSecond"},message:"must have required property '"+"rotationDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(data8.yawDampingPerSecond === undefined){
const err33 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "yawDampingPerSecond"},message:"must have required property '"+"yawDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data8.pitchDampingPerSecond === undefined){
const err34 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "pitchDampingPerSecond"},message:"must have required property '"+"pitchDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(data8.collisionRadiusMeters === undefined){
const err35 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "collisionRadiusMeters"},message:"must have required property '"+"collisionRadiusMeters"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data8.collisionRetractionMetersPerSecond === undefined){
const err36 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "collisionRetractionMetersPerSecond"},message:"must have required property '"+"collisionRetractionMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data8.collisionRecoveryMetersPerSecond === undefined){
const err37 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "collisionRecoveryMetersPerSecond"},message:"must have required property '"+"collisionRecoveryMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data8.baseFovDegrees === undefined){
const err38 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "baseFovDegrees"},message:"must have required property '"+"baseFovDegrees"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data8.speedFovDegreesPerMeterPerSecond === undefined){
const err39 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "speedFovDegreesPerMeterPerSecond"},message:"must have required property '"+"speedFovDegreesPerMeterPerSecond"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data8.maximumSpeedFovDegrees === undefined){
const err40 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "maximumSpeedFovDegrees"},message:"must have required property '"+"maximumSpeedFovDegrees"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data8.lookAheadSeconds === undefined){
const err41 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "lookAheadSeconds"},message:"must have required property '"+"lookAheadSeconds"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data8.accelerationLookAheadSecondsSquared === undefined){
const err42 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "accelerationLookAheadSecondsSquared"},message:"must have required property '"+"accelerationLookAheadSecondsSquared"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data8.transitionSeconds === undefined){
const err43 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "transitionSeconds"},message:"must have required property '"+"transitionSeconds"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data8.minimumHeadingSpeedMetersPerSecond === undefined){
const err44 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "minimumHeadingSpeedMetersPerSecond"},message:"must have required property '"+"minimumHeadingSpeedMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data8.velocityHeadingDampingPerSecond === undefined){
const err45 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "velocityHeadingDampingPerSecond"},message:"must have required property '"+"velocityHeadingDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data8.fovDampingPerSecond === undefined){
const err46 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "fovDampingPerSecond"},message:"must have required property '"+"fovDampingPerSecond"+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data8.horizontalDeadZoneRatio === undefined){
const err47 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "horizontalDeadZoneRatio"},message:"must have required property '"+"horizontalDeadZoneRatio"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(data8.verticalDeadZoneRatio === undefined){
const err48 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "verticalDeadZoneRatio"},message:"must have required property '"+"verticalDeadZoneRatio"+"'"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(data8.recenterDelaySeconds === undefined){
const err49 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "recenterDelaySeconds"},message:"must have required property '"+"recenterDelaySeconds"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data8.recenterDurationSeconds === undefined){
const err50 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "recenterDurationSeconds"},message:"must have required property '"+"recenterDurationSeconds"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data8.recenterMinimumSpeedMetersPerSecond === undefined){
const err51 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "recenterMinimumSpeedMetersPerSecond"},message:"must have required property '"+"recenterMinimumSpeedMetersPerSecond"+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data8.teleportSnapDistanceMeters === undefined){
const err52 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "teleportSnapDistanceMeters"},message:"must have required property '"+"teleportSnapDistanceMeters"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data8.lookSensitivityXRatio === undefined){
const err53 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "lookSensitivityXRatio"},message:"must have required property '"+"lookSensitivityXRatio"+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data8.lookSensitivityYRatio === undefined){
const err54 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/required",keyword:"required",params:{missingProperty: "lookSensitivityYRatio"},message:"must have required property '"+"lookSensitivityYRatio"+"'"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
for(const key1 in data8){
if(!(func1.call(schema142.properties, key1))){
const err55 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data8.distanceMeters !== undefined){
let data9 = data8.distanceMeters;
if(!((typeof data9 == "number") && (isFinite(data9)))){
const err56 = {instancePath:instancePath+"/parameters/distanceMeters",schemaPath:"#/$defs/cameraParameters/properties/distanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data8.minimumDistanceMeters !== undefined){
let data10 = data8.minimumDistanceMeters;
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err57 = {instancePath:instancePath+"/parameters/minimumDistanceMeters",schemaPath:"#/$defs/cameraParameters/properties/minimumDistanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data8.maximumDistanceMeters !== undefined){
let data11 = data8.maximumDistanceMeters;
if(!((typeof data11 == "number") && (isFinite(data11)))){
const err58 = {instancePath:instancePath+"/parameters/maximumDistanceMeters",schemaPath:"#/$defs/cameraParameters/properties/maximumDistanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data8.targetHeightMeters !== undefined){
let data12 = data8.targetHeightMeters;
if(!((typeof data12 == "number") && (isFinite(data12)))){
const err59 = {instancePath:instancePath+"/parameters/targetHeightMeters",schemaPath:"#/$defs/cameraParameters/properties/targetHeightMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data8.shoulderOffsetMeters !== undefined){
let data13 = data8.shoulderOffsetMeters;
if(!((typeof data13 == "number") && (isFinite(data13)))){
const err60 = {instancePath:instancePath+"/parameters/shoulderOffsetMeters",schemaPath:"#/$defs/cameraParameters/properties/shoulderOffsetMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data8.pitchRadians !== undefined){
let data14 = data8.pitchRadians;
if(!((typeof data14 == "number") && (isFinite(data14)))){
const err61 = {instancePath:instancePath+"/parameters/pitchRadians",schemaPath:"#/$defs/cameraParameters/properties/pitchRadians/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data8.minimumPitchRadians !== undefined){
let data15 = data8.minimumPitchRadians;
if(!((typeof data15 == "number") && (isFinite(data15)))){
const err62 = {instancePath:instancePath+"/parameters/minimumPitchRadians",schemaPath:"#/$defs/cameraParameters/properties/minimumPitchRadians/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data8.maximumPitchRadians !== undefined){
let data16 = data8.maximumPitchRadians;
if(!((typeof data16 == "number") && (isFinite(data16)))){
const err63 = {instancePath:instancePath+"/parameters/maximumPitchRadians",schemaPath:"#/$defs/cameraParameters/properties/maximumPitchRadians/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data8.positionDampingPerSecond !== undefined){
let data17 = data8.positionDampingPerSecond;
if(!((typeof data17 == "number") && (isFinite(data17)))){
const err64 = {instancePath:instancePath+"/parameters/positionDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/positionDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data8.horizontalPositionDampingPerSecond !== undefined){
let data18 = data8.horizontalPositionDampingPerSecond;
if(!((typeof data18 == "number") && (isFinite(data18)))){
const err65 = {instancePath:instancePath+"/parameters/horizontalPositionDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/horizontalPositionDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data8.verticalPositionDampingPerSecond !== undefined){
let data19 = data8.verticalPositionDampingPerSecond;
if(!((typeof data19 == "number") && (isFinite(data19)))){
const err66 = {instancePath:instancePath+"/parameters/verticalPositionDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/verticalPositionDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data8.maximumPositionLagMeters !== undefined){
let data20 = data8.maximumPositionLagMeters;
if(!((typeof data20 == "number") && (isFinite(data20)))){
const err67 = {instancePath:instancePath+"/parameters/maximumPositionLagMeters",schemaPath:"#/$defs/cameraParameters/properties/maximumPositionLagMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data8.rotationDampingPerSecond !== undefined){
let data21 = data8.rotationDampingPerSecond;
if(!((typeof data21 == "number") && (isFinite(data21)))){
const err68 = {instancePath:instancePath+"/parameters/rotationDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/rotationDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data8.yawDampingPerSecond !== undefined){
let data22 = data8.yawDampingPerSecond;
if(!((typeof data22 == "number") && (isFinite(data22)))){
const err69 = {instancePath:instancePath+"/parameters/yawDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/yawDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data8.pitchDampingPerSecond !== undefined){
let data23 = data8.pitchDampingPerSecond;
if(!((typeof data23 == "number") && (isFinite(data23)))){
const err70 = {instancePath:instancePath+"/parameters/pitchDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/pitchDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data8.collisionRadiusMeters !== undefined){
let data24 = data8.collisionRadiusMeters;
if(!((typeof data24 == "number") && (isFinite(data24)))){
const err71 = {instancePath:instancePath+"/parameters/collisionRadiusMeters",schemaPath:"#/$defs/cameraParameters/properties/collisionRadiusMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data8.collisionRetractionMetersPerSecond !== undefined){
let data25 = data8.collisionRetractionMetersPerSecond;
if(!((typeof data25 == "number") && (isFinite(data25)))){
const err72 = {instancePath:instancePath+"/parameters/collisionRetractionMetersPerSecond",schemaPath:"#/$defs/cameraParameters/properties/collisionRetractionMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data8.collisionRecoveryMetersPerSecond !== undefined){
let data26 = data8.collisionRecoveryMetersPerSecond;
if(!((typeof data26 == "number") && (isFinite(data26)))){
const err73 = {instancePath:instancePath+"/parameters/collisionRecoveryMetersPerSecond",schemaPath:"#/$defs/cameraParameters/properties/collisionRecoveryMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data8.baseFovDegrees !== undefined){
let data27 = data8.baseFovDegrees;
if(!((typeof data27 == "number") && (isFinite(data27)))){
const err74 = {instancePath:instancePath+"/parameters/baseFovDegrees",schemaPath:"#/$defs/cameraParameters/properties/baseFovDegrees/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data8.speedFovDegreesPerMeterPerSecond !== undefined){
let data28 = data8.speedFovDegreesPerMeterPerSecond;
if(!((typeof data28 == "number") && (isFinite(data28)))){
const err75 = {instancePath:instancePath+"/parameters/speedFovDegreesPerMeterPerSecond",schemaPath:"#/$defs/cameraParameters/properties/speedFovDegreesPerMeterPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data8.maximumSpeedFovDegrees !== undefined){
let data29 = data8.maximumSpeedFovDegrees;
if(!((typeof data29 == "number") && (isFinite(data29)))){
const err76 = {instancePath:instancePath+"/parameters/maximumSpeedFovDegrees",schemaPath:"#/$defs/cameraParameters/properties/maximumSpeedFovDegrees/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data8.lookAheadSeconds !== undefined){
let data30 = data8.lookAheadSeconds;
if(!((typeof data30 == "number") && (isFinite(data30)))){
const err77 = {instancePath:instancePath+"/parameters/lookAheadSeconds",schemaPath:"#/$defs/cameraParameters/properties/lookAheadSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data8.accelerationLookAheadSecondsSquared !== undefined){
let data31 = data8.accelerationLookAheadSecondsSquared;
if(!((typeof data31 == "number") && (isFinite(data31)))){
const err78 = {instancePath:instancePath+"/parameters/accelerationLookAheadSecondsSquared",schemaPath:"#/$defs/cameraParameters/properties/accelerationLookAheadSecondsSquared/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data8.transitionSeconds !== undefined){
let data32 = data8.transitionSeconds;
if(!((typeof data32 == "number") && (isFinite(data32)))){
const err79 = {instancePath:instancePath+"/parameters/transitionSeconds",schemaPath:"#/$defs/cameraParameters/properties/transitionSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data8.minimumHeadingSpeedMetersPerSecond !== undefined){
let data33 = data8.minimumHeadingSpeedMetersPerSecond;
if(!((typeof data33 == "number") && (isFinite(data33)))){
const err80 = {instancePath:instancePath+"/parameters/minimumHeadingSpeedMetersPerSecond",schemaPath:"#/$defs/cameraParameters/properties/minimumHeadingSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data8.velocityHeadingDampingPerSecond !== undefined){
let data34 = data8.velocityHeadingDampingPerSecond;
if(!((typeof data34 == "number") && (isFinite(data34)))){
const err81 = {instancePath:instancePath+"/parameters/velocityHeadingDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/velocityHeadingDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data8.fovDampingPerSecond !== undefined){
let data35 = data8.fovDampingPerSecond;
if(!((typeof data35 == "number") && (isFinite(data35)))){
const err82 = {instancePath:instancePath+"/parameters/fovDampingPerSecond",schemaPath:"#/$defs/cameraParameters/properties/fovDampingPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data8.horizontalDeadZoneRatio !== undefined){
let data36 = data8.horizontalDeadZoneRatio;
if(!((typeof data36 == "number") && (isFinite(data36)))){
const err83 = {instancePath:instancePath+"/parameters/horizontalDeadZoneRatio",schemaPath:"#/$defs/cameraParameters/properties/horizontalDeadZoneRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data8.verticalDeadZoneRatio !== undefined){
let data37 = data8.verticalDeadZoneRatio;
if(!((typeof data37 == "number") && (isFinite(data37)))){
const err84 = {instancePath:instancePath+"/parameters/verticalDeadZoneRatio",schemaPath:"#/$defs/cameraParameters/properties/verticalDeadZoneRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data8.recenterDelaySeconds !== undefined){
let data38 = data8.recenterDelaySeconds;
if(!((typeof data38 == "number") && (isFinite(data38)))){
const err85 = {instancePath:instancePath+"/parameters/recenterDelaySeconds",schemaPath:"#/$defs/cameraParameters/properties/recenterDelaySeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data8.recenterDurationSeconds !== undefined){
let data39 = data8.recenterDurationSeconds;
if(!((typeof data39 == "number") && (isFinite(data39)))){
const err86 = {instancePath:instancePath+"/parameters/recenterDurationSeconds",schemaPath:"#/$defs/cameraParameters/properties/recenterDurationSeconds/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data8.recenterMinimumSpeedMetersPerSecond !== undefined){
let data40 = data8.recenterMinimumSpeedMetersPerSecond;
if(!((typeof data40 == "number") && (isFinite(data40)))){
const err87 = {instancePath:instancePath+"/parameters/recenterMinimumSpeedMetersPerSecond",schemaPath:"#/$defs/cameraParameters/properties/recenterMinimumSpeedMetersPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data8.teleportSnapDistanceMeters !== undefined){
let data41 = data8.teleportSnapDistanceMeters;
if(!((typeof data41 == "number") && (isFinite(data41)))){
const err88 = {instancePath:instancePath+"/parameters/teleportSnapDistanceMeters",schemaPath:"#/$defs/cameraParameters/properties/teleportSnapDistanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data8.lookSensitivityXRatio !== undefined){
let data42 = data8.lookSensitivityXRatio;
if(!((typeof data42 == "number") && (isFinite(data42)))){
const err89 = {instancePath:instancePath+"/parameters/lookSensitivityXRatio",schemaPath:"#/$defs/cameraParameters/properties/lookSensitivityXRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data8.lookSensitivityYRatio !== undefined){
let data43 = data8.lookSensitivityYRatio;
if(!((typeof data43 == "number") && (isFinite(data43)))){
const err90 = {instancePath:instancePath+"/parameters/lookSensitivityYRatio",schemaPath:"#/$defs/cameraParameters/properties/lookSensitivityYRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
}
else {
const err91 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/cameraParameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data.authoringRanges !== undefined){
let data44 = data.authoringRanges;
if(data44 && typeof data44 == "object" && !Array.isArray(data44)){
for(const key2 in data44){
const _errs92 = errors;
if(!(((((((((((((((((((((((((((((((((((key2 === "distanceMeters") || (key2 === "minimumDistanceMeters")) || (key2 === "maximumDistanceMeters")) || (key2 === "targetHeightMeters")) || (key2 === "shoulderOffsetMeters")) || (key2 === "pitchRadians")) || (key2 === "minimumPitchRadians")) || (key2 === "maximumPitchRadians")) || (key2 === "positionDampingPerSecond")) || (key2 === "horizontalPositionDampingPerSecond")) || (key2 === "verticalPositionDampingPerSecond")) || (key2 === "maximumPositionLagMeters")) || (key2 === "rotationDampingPerSecond")) || (key2 === "yawDampingPerSecond")) || (key2 === "pitchDampingPerSecond")) || (key2 === "collisionRadiusMeters")) || (key2 === "collisionRetractionMetersPerSecond")) || (key2 === "collisionRecoveryMetersPerSecond")) || (key2 === "baseFovDegrees")) || (key2 === "speedFovDegreesPerMeterPerSecond")) || (key2 === "maximumSpeedFovDegrees")) || (key2 === "lookAheadSeconds")) || (key2 === "accelerationLookAheadSecondsSquared")) || (key2 === "transitionSeconds")) || (key2 === "minimumHeadingSpeedMetersPerSecond")) || (key2 === "velocityHeadingDampingPerSecond")) || (key2 === "fovDampingPerSecond")) || (key2 === "horizontalDeadZoneRatio")) || (key2 === "verticalDeadZoneRatio")) || (key2 === "recenterDelaySeconds")) || (key2 === "recenterDurationSeconds")) || (key2 === "recenterMinimumSpeedMetersPerSecond")) || (key2 === "teleportSnapDistanceMeters")) || (key2 === "lookSensitivityXRatio")) || (key2 === "lookSensitivityYRatio"))){
const err92 = {instancePath:instancePath+"/authoringRanges",schemaPath:"#/properties/authoringRanges/propertyNames/enum",keyword:"enum",params:{allowedValues: schema138.properties.authoringRanges.propertyNames.enum},message:"must be equal to one of the allowed values",propertyName:key2};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var valid6 = _errs92 === errors;
if(!valid6){
const err93 = {instancePath:instancePath+"/authoringRanges",schemaPath:"#/properties/authoringRanges/propertyNames",keyword:"propertyNames",params:{propertyName: key2},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
for(const key3 in data44){
let data45 = data44[key3];
if(data45 && typeof data45 == "object" && !Array.isArray(data45)){
if(data45.minimum === undefined){
const err94 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/authoringRanges/additionalProperties/required",keyword:"required",params:{missingProperty: "minimum"},message:"must have required property '"+"minimum"+"'"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data45.maximum === undefined){
const err95 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/authoringRanges/additionalProperties/required",keyword:"required",params:{missingProperty: "maximum"},message:"must have required property '"+"maximum"+"'"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if(data45.step === undefined){
const err96 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/authoringRanges/additionalProperties/required",keyword:"required",params:{missingProperty: "step"},message:"must have required property '"+"step"+"'"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
for(const key4 in data45){
if(!(((key4 === "minimum") || (key4 === "maximum")) || (key4 === "step"))){
const err97 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/authoringRanges/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data45.minimum !== undefined){
let data46 = data45.minimum;
if(!((typeof data46 == "number") && (isFinite(data46)))){
const err98 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/minimum",schemaPath:"#/properties/authoringRanges/additionalProperties/properties/minimum/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
if(data45.maximum !== undefined){
let data47 = data45.maximum;
if(!((typeof data47 == "number") && (isFinite(data47)))){
const err99 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/maximum",schemaPath:"#/properties/authoringRanges/additionalProperties/properties/maximum/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
if(data45.step !== undefined){
let data48 = data45.step;
if(!((typeof data48 == "number") && (isFinite(data48)))){
const err100 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/step",schemaPath:"#/properties/authoringRanges/additionalProperties/properties/step/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
}
else {
const err101 = {instancePath:instancePath+"/authoringRanges/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/authoringRanges/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
else {
const err102 = {instancePath:instancePath+"/authoringRanges",schemaPath:"#/properties/authoringRanges/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
}
else {
const err103 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
validate83.errors = vErrors;
return errors === 0;
}
validate83.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema143 = {"type":"object","additionalProperties":false,"required":["resourceRef","parameterOverrides"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"parameterOverrides":{"type":"object","propertyNames":{"$ref":"#/$defs/nonEmptyString"},"additionalProperties":{"type":"number"}},"headingSourceOverride":{"enum":["view","target-forward","target-velocity"]},"reverseHeadingPolicyOverride":{"enum":["follow-velocity","preserve-target-forward"]},"recenterModeOverride":{"enum":["off","forward-motion","always"]}}};

function validate86(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate86.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.parameterOverrides === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "parameterOverrides"},message:"must have required property '"+"parameterOverrides"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "resourceRef") || (key0 === "parameterOverrides")) || (key0 === "headingSourceOverride")) || (key0 === "reverseHeadingPolicyOverride")) || (key0 === "recenterModeOverride"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err3 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.parameterOverrides !== undefined){
let data1 = data.parameterOverrides;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
const _errs7 = errors;
if(typeof key1 === "string"){
if(func2(key1) < 1){
const err5 = {instancePath:instancePath+"/parameterOverrides",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters",propertyName:key1};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/parameterOverrides",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var valid2 = _errs7 === errors;
if(!valid2){
const err7 = {instancePath:instancePath+"/parameterOverrides",schemaPath:"#/properties/parameterOverrides/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
for(const key2 in data1){
let data2 = data1[key2];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err8 = {instancePath:instancePath+"/parameterOverrides/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/parameterOverrides/additionalProperties/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath:instancePath+"/parameterOverrides",schemaPath:"#/properties/parameterOverrides/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.headingSourceOverride !== undefined){
let data3 = data.headingSourceOverride;
if(!(((data3 === "view") || (data3 === "target-forward")) || (data3 === "target-velocity"))){
const err10 = {instancePath:instancePath+"/headingSourceOverride",schemaPath:"#/properties/headingSourceOverride/enum",keyword:"enum",params:{allowedValues: schema143.properties.headingSourceOverride.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.reverseHeadingPolicyOverride !== undefined){
let data4 = data.reverseHeadingPolicyOverride;
if(!((data4 === "follow-velocity") || (data4 === "preserve-target-forward"))){
const err11 = {instancePath:instancePath+"/reverseHeadingPolicyOverride",schemaPath:"#/properties/reverseHeadingPolicyOverride/enum",keyword:"enum",params:{allowedValues: schema143.properties.reverseHeadingPolicyOverride.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.recenterModeOverride !== undefined){
let data5 = data.recenterModeOverride;
if(!(((data5 === "off") || (data5 === "forward-motion")) || (data5 === "always"))){
const err12 = {instancePath:instancePath+"/recenterModeOverride",schemaPath:"#/properties/recenterModeOverride/enum",keyword:"enum",params:{allowedValues: schema143.properties.recenterModeOverride.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate86.errors = vErrors;
return errors === 0;
}
validate86.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema147 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredRiderSocketIds","requiredMountSocketIds","controlTransferMode","cameraTargetRole"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"mountedOn"},"requiredRiderSocketIds":{"$ref":"#/$defs/stringArray"},"requiredMountSocketIds":{"$ref":"#/$defs/stringArray"},"controlTransferMode":{"enum":["keep-rider","to-mount","none"]},"cameraTargetRole":{"enum":["controlled-entity","rider","mount"]},"maximumMountDistanceMeters":{"type":"number"}}},{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredOccupantSocketIds","requiredSeatSocketIds"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"seat"},"requiredOccupantSocketIds":{"$ref":"#/$defs/stringArray"},"requiredSeatSocketIds":{"$ref":"#/$defs/stringArray"}}},{"type":"object","additionalProperties":false,"required":["resourceRef","relationshipType","requiredTetheredSocketIds","requiredTetherAnchorSocketIds"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"relationshipType":{"const":"tether"},"requiredTetheredSocketIds":{"$ref":"#/$defs/stringArray"},"requiredTetherAnchorSocketIds":{"$ref":"#/$defs/stringArray"}}}]};

function validate88(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate88.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.relationshipType === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "relationshipType"},message:"must have required property '"+"relationshipType"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.requiredRiderSocketIds === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "requiredRiderSocketIds"},message:"must have required property '"+"requiredRiderSocketIds"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.requiredMountSocketIds === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "requiredMountSocketIds"},message:"must have required property '"+"requiredMountSocketIds"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.controlTransferMode === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "controlTransferMode"},message:"must have required property '"+"controlTransferMode"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.cameraTargetRole === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "cameraTargetRole"},message:"must have required property '"+"cameraTargetRole"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "resourceRef") || (key0 === "relationshipType")) || (key0 === "requiredRiderSocketIds")) || (key0 === "requiredMountSocketIds")) || (key0 === "controlTransferMode")) || (key0 === "cameraTargetRole")) || (key0 === "maximumMountDistanceMeters"))){
const err6 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err7 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.relationshipType !== undefined){
if("mountedOn" !== data.relationshipType){
const err9 = {instancePath:instancePath+"/relationshipType",schemaPath:"#/oneOf/0/properties/relationshipType/const",keyword:"const",params:{allowedValue: "mountedOn"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.requiredRiderSocketIds !== undefined){
if(!(validate25(data.requiredRiderSocketIds, {instancePath:instancePath+"/requiredRiderSocketIds",parentData:data,parentDataProperty:"requiredRiderSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.requiredMountSocketIds !== undefined){
if(!(validate25(data.requiredMountSocketIds, {instancePath:instancePath+"/requiredMountSocketIds",parentData:data,parentDataProperty:"requiredMountSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.controlTransferMode !== undefined){
let data4 = data.controlTransferMode;
if(!(((data4 === "keep-rider") || (data4 === "to-mount")) || (data4 === "none"))){
const err10 = {instancePath:instancePath+"/controlTransferMode",schemaPath:"#/oneOf/0/properties/controlTransferMode/enum",keyword:"enum",params:{allowedValues: schema147.oneOf[0].properties.controlTransferMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.cameraTargetRole !== undefined){
let data5 = data.cameraTargetRole;
if(!(((data5 === "controlled-entity") || (data5 === "rider")) || (data5 === "mount"))){
const err11 = {instancePath:instancePath+"/cameraTargetRole",schemaPath:"#/oneOf/0/properties/cameraTargetRole/enum",keyword:"enum",params:{allowedValues: schema147.oneOf[0].properties.cameraTargetRole.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.maximumMountDistanceMeters !== undefined){
let data6 = data.maximumMountDistanceMeters;
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err12 = {instancePath:instancePath+"/maximumMountDistanceMeters",schemaPath:"#/oneOf/0/properties/maximumMountDistanceMeters/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.relationshipType === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "relationshipType"},message:"must have required property '"+"relationshipType"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.requiredOccupantSocketIds === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "requiredOccupantSocketIds"},message:"must have required property '"+"requiredOccupantSocketIds"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.requiredSeatSocketIds === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "requiredSeatSocketIds"},message:"must have required property '"+"requiredSeatSocketIds"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
for(const key1 in data){
if(!((((key1 === "resourceRef") || (key1 === "relationshipType")) || (key1 === "requiredOccupantSocketIds")) || (key1 === "requiredSeatSocketIds"))){
const err18 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data7 = data.resourceRef;
if(typeof data7 === "string"){
if(func2(data7) < 1){
const err19 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.relationshipType !== undefined){
if("seat" !== data.relationshipType){
const err21 = {instancePath:instancePath+"/relationshipType",schemaPath:"#/oneOf/1/properties/relationshipType/const",keyword:"const",params:{allowedValue: "seat"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.requiredOccupantSocketIds !== undefined){
if(!(validate25(data.requiredOccupantSocketIds, {instancePath:instancePath+"/requiredOccupantSocketIds",parentData:data,parentDataProperty:"requiredOccupantSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.requiredSeatSocketIds !== undefined){
if(!(validate25(data.requiredSeatSocketIds, {instancePath:instancePath+"/requiredSeatSocketIds",parentData:data,parentDataProperty:"requiredSeatSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs23 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.relationshipType === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "relationshipType"},message:"must have required property '"+"relationshipType"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.requiredTetheredSocketIds === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "requiredTetheredSocketIds"},message:"must have required property '"+"requiredTetheredSocketIds"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.requiredTetherAnchorSocketIds === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "requiredTetherAnchorSocketIds"},message:"must have required property '"+"requiredTetherAnchorSocketIds"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key2 in data){
if(!((((key2 === "resourceRef") || (key2 === "relationshipType")) || (key2 === "requiredTetheredSocketIds")) || (key2 === "requiredTetherAnchorSocketIds"))){
const err27 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data11 = data.resourceRef;
if(typeof data11 === "string"){
if(func2(data11) < 1){
const err28 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.relationshipType !== undefined){
if("tether" !== data.relationshipType){
const err30 = {instancePath:instancePath+"/relationshipType",schemaPath:"#/oneOf/2/properties/relationshipType/const",keyword:"const",params:{allowedValue: "tether"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.requiredTetheredSocketIds !== undefined){
if(!(validate25(data.requiredTetheredSocketIds, {instancePath:instancePath+"/requiredTetheredSocketIds",parentData:data,parentDataProperty:"requiredTetheredSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.requiredTetherAnchorSocketIds !== undefined){
if(!(validate25(data.requiredTetherAnchorSocketIds, {instancePath:instancePath+"/requiredTetherAnchorSocketIds",parentData:data,parentDataProperty:"requiredTetherAnchorSocketIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var _valid0 = _errs23 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err32 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate88.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate88.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate71.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.authoringAvailability === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "authoringAvailability"},message:"must have required property '"+"authoringAvailability"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.physicsBodyProfileRef === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "physicsBodyProfileRef"},message:"must have required property '"+"physicsBodyProfileRef"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.locomotionProfileRef === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locomotionProfileRef"},message:"must have required property '"+"locomotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.defaultMotionProfile === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "defaultMotionProfile"},message:"must have required property '"+"defaultMotionProfile"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.optionalMotionProfiles === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "optionalMotionProfiles"},message:"must have required property '"+"optionalMotionProfiles"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.fallbackMotionProfile === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fallbackMotionProfile"},message:"must have required property '"+"fallbackMotionProfile"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.motionKernels === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "motionKernels"},message:"must have required property '"+"motionKernels"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.controlProfile === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlProfile"},message:"must have required property '"+"controlProfile"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.cameraContext === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cameraContext"},message:"must have required property '"+"cameraContext"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.mediumProfile === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mediumProfile"},message:"must have required property '"+"mediumProfile"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.relationshipProfiles === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "relationshipProfiles"},message:"must have required property '"+"relationshipProfiles"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.harnessProfileRef === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "harnessProfileRef"},message:"must have required property '"+"harnessProfileRef"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.requiredHarnessCheckIds === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requiredHarnessCheckIds"},message:"must have required property '"+"requiredHarnessCheckIds"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.actionOrPoseSetRef === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actionOrPoseSetRef"},message:"must have required property '"+"actionOrPoseSetRef"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.renderBindingProfileRef === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "renderBindingProfileRef"},message:"must have required property '"+"renderBindingProfileRef"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema115.properties, key0))){
const err15 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.authoringAvailability !== undefined){
let data0 = data.authoringAvailability;
if(!(((data0 === "recommended") || (data0 === "advanced")) || (data0 === "experimental"))){
const err16 = {instancePath:instancePath+"/authoringAvailability",schemaPath:"#/properties/authoringAvailability/enum",keyword:"enum",params:{allowedValues: schema115.properties.authoringAvailability.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.physicsBodyProfileRef !== undefined){
let data1 = data.physicsBodyProfileRef;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err17 = {instancePath:instancePath+"/physicsBodyProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/physicsBodyProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.locomotionProfileRef !== undefined){
let data2 = data.locomotionProfileRef;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err19 = {instancePath:instancePath+"/locomotionProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/locomotionProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.defaultMotionProfile !== undefined){
if(!(validate72(data.defaultMotionProfile, {instancePath:instancePath+"/defaultMotionProfile",parentData:data,parentDataProperty:"defaultMotionProfile",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
errors = vErrors.length;
}
}
if(data.optionalMotionProfiles !== undefined){
let data4 = data.optionalMotionProfiles;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(!(validate72(data4[i0], {instancePath:instancePath+"/optionalMotionProfiles/" + i0,parentData:data4,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
errors = vErrors.length;
}
}
}
else {
const err21 = {instancePath:instancePath+"/optionalMotionProfiles",schemaPath:"#/properties/optionalMotionProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.fallbackMotionProfile !== undefined){
if(!(validate72(data.fallbackMotionProfile, {instancePath:instancePath+"/fallbackMotionProfile",parentData:data,parentDataProperty:"fallbackMotionProfile",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
errors = vErrors.length;
}
}
if(data.motionKernels !== undefined){
let data7 = data.motionKernels;
if(Array.isArray(data7)){
const len1 = data7.length;
for(let i1=0; i1<len1; i1++){
if(!(validate77(data7[i1], {instancePath:instancePath+"/motionKernels/" + i1,parentData:data7,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
errors = vErrors.length;
}
}
}
else {
const err22 = {instancePath:instancePath+"/motionKernels",schemaPath:"#/properties/motionKernels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.controlProfile !== undefined){
if(!(validate79(data.controlProfile, {instancePath:instancePath+"/controlProfile",parentData:data,parentDataProperty:"controlProfile",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
errors = vErrors.length;
}
}
if(data.cameraContext !== undefined){
let data10 = data.cameraContext;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.resourceRef === undefined){
const err23 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data10.defaultCameraRigProfileRef === undefined){
const err24 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/required",keyword:"required",params:{missingProperty: "defaultCameraRigProfileRef"},message:"must have required property '"+"defaultCameraRigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data10.rules === undefined){
const err25 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/required",keyword:"required",params:{missingProperty: "rules"},message:"must have required property '"+"rules"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data10.cameraRigProfiles === undefined){
const err26 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/required",keyword:"required",params:{missingProperty: "cameraRigProfiles"},message:"must have required property '"+"cameraRigProfiles"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data10.cameraModifierProfiles === undefined){
const err27 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/required",keyword:"required",params:{missingProperty: "cameraModifierProfiles"},message:"must have required property '"+"cameraModifierProfiles"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
for(const key1 in data10){
if(!((((((key1 === "resourceRef") || (key1 === "defaultCameraRigProfileRef")) || (key1 === "firstPersonCameraRigProfileRef")) || (key1 === "rules")) || (key1 === "cameraRigProfiles")) || (key1 === "cameraModifierProfiles"))){
const err28 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data10.resourceRef !== undefined){
let data11 = data10.resourceRef;
if(typeof data11 === "string"){
if(func2(data11) < 1){
const err29 = {instancePath:instancePath+"/cameraContext/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/cameraContext/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data10.defaultCameraRigProfileRef !== undefined){
let data12 = data10.defaultCameraRigProfileRef;
if(typeof data12 === "string"){
if(func2(data12) < 1){
const err31 = {instancePath:instancePath+"/cameraContext/defaultCameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/cameraContext/defaultCameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data10.firstPersonCameraRigProfileRef !== undefined){
let data13 = data10.firstPersonCameraRigProfileRef;
if(typeof data13 === "string"){
if(func2(data13) < 1){
const err33 = {instancePath:instancePath+"/cameraContext/firstPersonCameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/cameraContext/firstPersonCameraRigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data10.rules !== undefined){
let data14 = data10.rules;
if(Array.isArray(data14)){
const len2 = data14.length;
for(let i2=0; i2<len2; i2++){
if(!(validate81(data14[i2], {instancePath:instancePath+"/cameraContext/rules/" + i2,parentData:data14,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
errors = vErrors.length;
}
}
}
else {
const err35 = {instancePath:instancePath+"/cameraContext/rules",schemaPath:"#/properties/cameraContext/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data10.cameraRigProfiles !== undefined){
let data16 = data10.cameraRigProfiles;
if(Array.isArray(data16)){
const len3 = data16.length;
for(let i3=0; i3<len3; i3++){
if(!(validate83(data16[i3], {instancePath:instancePath+"/cameraContext/cameraRigProfiles/" + i3,parentData:data16,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate83.errors : vErrors.concat(validate83.errors);
errors = vErrors.length;
}
}
}
else {
const err36 = {instancePath:instancePath+"/cameraContext/cameraRigProfiles",schemaPath:"#/properties/cameraContext/properties/cameraRigProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data10.cameraModifierProfiles !== undefined){
let data18 = data10.cameraModifierProfiles;
if(Array.isArray(data18)){
const len4 = data18.length;
for(let i4=0; i4<len4; i4++){
if(!(validate86(data18[i4], {instancePath:instancePath+"/cameraContext/cameraModifierProfiles/" + i4,parentData:data18,parentDataProperty:i4,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
errors = vErrors.length;
}
}
}
else {
const err37 = {instancePath:instancePath+"/cameraContext/cameraModifierProfiles",schemaPath:"#/properties/cameraContext/properties/cameraModifierProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath:instancePath+"/cameraContext",schemaPath:"#/properties/cameraContext/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.mediumProfile !== undefined){
let data20 = data.mediumProfile;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if(data20.resourceRef === undefined){
const err39 = {instancePath:instancePath+"/mediumProfile",schemaPath:"#/properties/mediumProfile/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data20.air === undefined){
const err40 = {instancePath:instancePath+"/mediumProfile",schemaPath:"#/properties/mediumProfile/required",keyword:"required",params:{missingProperty: "air"},message:"must have required property '"+"air"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key2 in data20){
if(!((key2 === "resourceRef") || (key2 === "air"))){
const err41 = {instancePath:instancePath+"/mediumProfile",schemaPath:"#/properties/mediumProfile/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data20.resourceRef !== undefined){
let data21 = data20.resourceRef;
if(typeof data21 === "string"){
if(func2(data21) < 1){
const err42 = {instancePath:instancePath+"/mediumProfile/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/mediumProfile/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data20.air !== undefined){
let data22 = data20.air;
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
if(data22.gravityRatio === undefined){
const err44 = {instancePath:instancePath+"/mediumProfile/air",schemaPath:"#/properties/mediumProfile/properties/air/required",keyword:"required",params:{missingProperty: "gravityRatio"},message:"must have required property '"+"gravityRatio"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data22.linearDragPerSecond === undefined){
const err45 = {instancePath:instancePath+"/mediumProfile/air",schemaPath:"#/properties/mediumProfile/properties/air/required",keyword:"required",params:{missingProperty: "linearDragPerSecond"},message:"must have required property '"+"linearDragPerSecond"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key3 in data22){
if(!((key3 === "gravityRatio") || (key3 === "linearDragPerSecond"))){
const err46 = {instancePath:instancePath+"/mediumProfile/air",schemaPath:"#/properties/mediumProfile/properties/air/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data22.gravityRatio !== undefined){
let data23 = data22.gravityRatio;
if(!((typeof data23 == "number") && (isFinite(data23)))){
const err47 = {instancePath:instancePath+"/mediumProfile/air/gravityRatio",schemaPath:"#/properties/mediumProfile/properties/air/properties/gravityRatio/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data22.linearDragPerSecond !== undefined){
let data24 = data22.linearDragPerSecond;
if(!((typeof data24 == "number") && (isFinite(data24)))){
const err48 = {instancePath:instancePath+"/mediumProfile/air/linearDragPerSecond",schemaPath:"#/properties/mediumProfile/properties/air/properties/linearDragPerSecond/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/mediumProfile/air",schemaPath:"#/properties/mediumProfile/properties/air/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
else {
const err50 = {instancePath:instancePath+"/mediumProfile",schemaPath:"#/properties/mediumProfile/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.relationshipProfiles !== undefined){
let data25 = data.relationshipProfiles;
if(Array.isArray(data25)){
const len5 = data25.length;
for(let i5=0; i5<len5; i5++){
if(!(validate88(data25[i5], {instancePath:instancePath+"/relationshipProfiles/" + i5,parentData:data25,parentDataProperty:i5,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
}
else {
const err51 = {instancePath:instancePath+"/relationshipProfiles",schemaPath:"#/properties/relationshipProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.harnessProfileRef !== undefined){
let data27 = data.harnessProfileRef;
if(typeof data27 === "string"){
if(func2(data27) < 1){
const err52 = {instancePath:instancePath+"/harnessProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/harnessProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.requiredHarnessCheckIds !== undefined){
if(!(validate25(data.requiredHarnessCheckIds, {instancePath:instancePath+"/requiredHarnessCheckIds",parentData:data,parentDataProperty:"requiredHarnessCheckIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.actionOrPoseSetRef !== undefined){
let data29 = data.actionOrPoseSetRef;
if(typeof data29 === "string"){
if(func2(data29) < 1){
const err54 = {instancePath:instancePath+"/actionOrPoseSetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
else {
const err55 = {instancePath:instancePath+"/actionOrPoseSetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data.renderBindingProfileRef !== undefined){
let data30 = data.renderBindingProfileRef;
if(typeof data30 === "string"){
if(func2(data30) < 1){
const err56 = {instancePath:instancePath+"/renderBindingProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
else {
const err57 = {instancePath:instancePath+"/renderBindingProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
}
else {
const err58 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
validate71.errors = vErrors;
return errors === 0;
}
validate71.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate49.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.entityId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "entityId"},message:"must have required property '"+"entityId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.subjectDefinitionRef === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectDefinitionRef"},message:"must have required property '"+"subjectDefinitionRef"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.subjectDefinitionHash === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectDefinitionHash"},message:"must have required property '"+"subjectDefinitionHash"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.bodyTopology === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bodyTopology"},message:"must have required property '"+"bodyTopology"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.semanticClassId === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticClassId"},message:"must have required property '"+"semanticClassId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.forwardDirection === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "forwardDirection"},message:"must have required property '"+"forwardDirection"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.visualParts === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualParts"},message:"must have required property '"+"visualParts"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.visualBinding === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualBinding"},message:"must have required property '"+"visualBinding"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.sockets === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sockets"},message:"must have required property '"+"sockets"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.mountSlots === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mountSlots"},message:"must have required property '"+"mountSlots"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.collider === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "collider"},message:"must have required property '"+"collider"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.locomotion === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locomotion"},message:"must have required property '"+"locomotion"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.locomotionCapabilityRef === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locomotionCapabilityRef"},message:"must have required property '"+"locomotionCapabilityRef"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.locomotionCapabilityHash === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locomotionCapabilityHash"},message:"must have required property '"+"locomotionCapabilityHash"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.physicsBodyProfileRef === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "physicsBodyProfileRef"},message:"must have required property '"+"physicsBodyProfileRef"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.locomotionProfileRef === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locomotionProfileRef"},message:"must have required property '"+"locomotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.controlFeel === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlFeel"},message:"must have required property '"+"controlFeel"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.availableControlFeels === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "availableControlFeels"},message:"must have required property '"+"availableControlFeels"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.capabilityAssembly === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "capabilityAssembly"},message:"must have required property '"+"capabilityAssembly"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema77.properties, key0))){
const err19 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.entityId !== undefined){
let data0 = data.entityId;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err20 = {instancePath:instancePath+"/entityId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/entityId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.subjectDefinitionRef !== undefined){
let data1 = data.subjectDefinitionRef;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err22 = {instancePath:instancePath+"/subjectDefinitionRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/subjectDefinitionRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.subjectDefinitionHash !== undefined){
let data2 = data.subjectDefinitionHash;
if(typeof data2 === "string"){
if(!pattern4.test(data2)){
const err24 = {instancePath:instancePath+"/subjectDefinitionHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/subjectDefinitionHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.bodyTopology !== undefined){
let data3 = data.bodyTopology;
if(!((((((((data3 === "biped") || (data3 === "quadruped")) || (data3 === "four-wheel")) || (data3 === "surface-craft")) || (data3 === "watercraft")) || (data3 === "glider")) || (data3 === "composite")) || (data3 === "custom"))){
const err26 = {instancePath:instancePath+"/bodyTopology",schemaPath:"#/properties/bodyTopology/enum",keyword:"enum",params:{allowedValues: schema77.properties.bodyTopology.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.semanticClassId !== undefined){
let data4 = data.semanticClassId;
if(typeof data4 === "string"){
if(func2(data4) < 1){
const err27 = {instancePath:instancePath+"/semanticClassId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/semanticClassId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.forwardDirection !== undefined){
if("-z" !== data.forwardDirection){
const err29 = {instancePath:instancePath+"/forwardDirection",schemaPath:"#/properties/forwardDirection/const",keyword:"const",params:{allowedValue: "-z"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.visualParts !== undefined){
let data6 = data.visualParts;
if(Array.isArray(data6)){
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
if(!(validate50(data6[i0], {instancePath:instancePath+"/visualParts/" + i0,parentData:data6,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
}
}
else {
const err30 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.visualBinding !== undefined){
let data8 = data.visualBinding;
const _errs20 = errors;
let valid7 = false;
let passing0 = null;
const _errs21 = errors;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.mode === undefined){
const err31 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key1 in data8){
if(!(key1 === "mode")){
const err32 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data8.mode !== undefined){
if("static" !== data8.mode){
const err33 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"#/properties/visualBinding/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "static"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0){
valid7 = true;
passing0 = 0;
var props1 = true;
}
const _errs25 = errors;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.mode === undefined){
const err35 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data8.rigProfileRef === undefined){
const err36 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "rigProfileRef"},message:"must have required property '"+"rigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data8.animationSetRef === undefined){
const err37 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "animationSetRef"},message:"must have required property '"+"animationSetRef"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
for(const key2 in data8){
if(!(((key2 === "mode") || (key2 === "rigProfileRef")) || (key2 === "animationSetRef"))){
const err38 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data8.mode !== undefined){
if("rigged" !== data8.mode){
const err39 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"#/properties/visualBinding/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "rigged"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data8.rigProfileRef !== undefined){
let data11 = data8.rigProfileRef;
if(typeof data11 === "string"){
if(func2(data11) < 1){
const err40 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
else {
const err41 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data8.animationSetRef !== undefined){
let data12 = data8.animationSetRef;
if(typeof data12 === "string"){
if(func2(data12) < 1){
const err42 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs25 === errors;
if(_valid0 && valid7){
valid7 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid7 = true;
passing0 = 1;
if(props1 !== true){
props1 = true;
}
}
}
if(!valid7){
const err45 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
errors = _errs20;
if(vErrors !== null){
if(_errs20){
vErrors.length = _errs20;
}
else {
vErrors = null;
}
}
}
}
if(data.sockets !== undefined){
let data13 = data.sockets;
if(Array.isArray(data13)){
const len1 = data13.length;
for(let i1=0; i1<len1; i1++){
if(!(validate58(data13[i1], {instancePath:instancePath+"/sockets/" + i1,parentData:data13,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate58.errors : vErrors.concat(validate58.errors);
errors = vErrors.length;
}
}
}
else {
const err46 = {instancePath:instancePath+"/sockets",schemaPath:"#/properties/sockets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.mountSlots !== undefined){
let data15 = data.mountSlots;
if(Array.isArray(data15)){
const len2 = data15.length;
for(let i2=0; i2<len2; i2++){
if(!(validate64(data15[i2], {instancePath:instancePath+"/mountSlots/" + i2,parentData:data15,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
errors = vErrors.length;
}
}
}
else {
const err47 = {instancePath:instancePath+"/mountSlots",schemaPath:"#/properties/mountSlots/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.collider !== undefined){
if(!(validate66(data.collider, {instancePath:instancePath+"/collider",parentData:data,parentDataProperty:"collider",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate66.errors : vErrors.concat(validate66.errors);
errors = vErrors.length;
}
}
if(data.locomotion !== undefined){
let data18 = data.locomotion;
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
if(data18.allowWalk === undefined){
const err48 = {instancePath:instancePath+"/locomotion",schemaPath:"#/properties/locomotion/required",keyword:"required",params:{missingProperty: "allowWalk"},message:"must have required property '"+"allowWalk"+"'"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(data18.allowRun === undefined){
const err49 = {instancePath:instancePath+"/locomotion",schemaPath:"#/properties/locomotion/required",keyword:"required",params:{missingProperty: "allowRun"},message:"must have required property '"+"allowRun"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data18.allowJump === undefined){
const err50 = {instancePath:instancePath+"/locomotion",schemaPath:"#/properties/locomotion/required",keyword:"required",params:{missingProperty: "allowJump"},message:"must have required property '"+"allowJump"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
for(const key3 in data18){
if(!(((key3 === "allowWalk") || (key3 === "allowRun")) || (key3 === "allowJump"))){
const err51 = {instancePath:instancePath+"/locomotion",schemaPath:"#/properties/locomotion/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data18.allowWalk !== undefined){
if(typeof data18.allowWalk !== "boolean"){
const err52 = {instancePath:instancePath+"/locomotion/allowWalk",schemaPath:"#/properties/locomotion/properties/allowWalk/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data18.allowRun !== undefined){
if(typeof data18.allowRun !== "boolean"){
const err53 = {instancePath:instancePath+"/locomotion/allowRun",schemaPath:"#/properties/locomotion/properties/allowRun/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data18.allowJump !== undefined){
if(typeof data18.allowJump !== "boolean"){
const err54 = {instancePath:instancePath+"/locomotion/allowJump",schemaPath:"#/properties/locomotion/properties/allowJump/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
else {
const err55 = {instancePath:instancePath+"/locomotion",schemaPath:"#/properties/locomotion/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data.locomotionCapabilityRef !== undefined){
let data22 = data.locomotionCapabilityRef;
if(typeof data22 === "string"){
if(func2(data22) < 1){
const err56 = {instancePath:instancePath+"/locomotionCapabilityRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
else {
const err57 = {instancePath:instancePath+"/locomotionCapabilityRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.locomotionCapabilityHash !== undefined){
let data23 = data.locomotionCapabilityHash;
if(typeof data23 === "string"){
if(!pattern4.test(data23)){
const err58 = {instancePath:instancePath+"/locomotionCapabilityHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
else {
const err59 = {instancePath:instancePath+"/locomotionCapabilityHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.physicsBodyProfileRef !== undefined){
let data24 = data.physicsBodyProfileRef;
if(typeof data24 === "string"){
if(func2(data24) < 1){
const err60 = {instancePath:instancePath+"/physicsBodyProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
else {
const err61 = {instancePath:instancePath+"/physicsBodyProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.locomotionProfileRef !== undefined){
let data25 = data.locomotionProfileRef;
if(typeof data25 === "string"){
if(func2(data25) < 1){
const err62 = {instancePath:instancePath+"/locomotionProfileRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/locomotionProfileRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.controlFeel !== undefined){
if(!(validate68(data.controlFeel, {instancePath:instancePath+"/controlFeel",parentData:data,parentDataProperty:"controlFeel",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
errors = vErrors.length;
}
}
if(data.availableControlFeels !== undefined){
let data27 = data.availableControlFeels;
if(Array.isArray(data27)){
const len3 = data27.length;
for(let i3=0; i3<len3; i3++){
if(!(validate68(data27[i3], {instancePath:instancePath+"/availableControlFeels/" + i3,parentData:data27,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
errors = vErrors.length;
}
}
}
else {
const err64 = {instancePath:instancePath+"/availableControlFeels",schemaPath:"#/properties/availableControlFeels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.capabilityAssembly !== undefined){
if(!(validate71(data.capabilityAssembly, {instancePath:instancePath+"/capabilityAssembly",parentData:data,parentDataProperty:"capabilityAssembly",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
errors = vErrors.length;
}
}
}
else {
const err65 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
validate49.errors = vErrors;
return errors === 0;
}
validate49.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema154 = {"type":"object","additionalProperties":false,"required":["resourceRef","resourceKind","resolvedVersion","contentHash"],"properties":{"resourceRef":{"$ref":"#/$defs/nonEmptyString"},"resourceKind":{"enum":["subject-definition","subject-asset","rig-profile","animation-set","collider-profile","capability","physics-body-profile","locomotion-profile","control-feel-profile","collider-derivation-profile","motion-kernel","motion-profile","control-profile","camera-rig-algorithm","camera-rig-profile","camera-modifier-profile","camera-context-profile","medium-profile","relationship-profile","harness-profile","pose-set-profile","render-binding-profile","ai-schema-projection-profile","gameplay-bootstrap"]},"resolvedVersion":{"$ref":"#/$defs/nonEmptyString"},"contentHash":{"$ref":"#/$defs/hash"}}};

function validate99(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate99.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.resourceRef === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceRef"},message:"must have required property '"+"resourceRef"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.resourceKind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resourceKind"},message:"must have required property '"+"resourceKind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.resolvedVersion === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resolvedVersion"},message:"must have required property '"+"resolvedVersion"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.contentHash === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "resourceRef") || (key0 === "resourceKind")) || (key0 === "resolvedVersion")) || (key0 === "contentHash"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.resourceRef !== undefined){
let data0 = data.resourceRef;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err5 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/resourceRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.resourceKind !== undefined){
let data1 = data.resourceKind;
if(!((((((((((((((((((((((((data1 === "subject-definition") || (data1 === "subject-asset")) || (data1 === "rig-profile")) || (data1 === "animation-set")) || (data1 === "collider-profile")) || (data1 === "capability")) || (data1 === "physics-body-profile")) || (data1 === "locomotion-profile")) || (data1 === "control-feel-profile")) || (data1 === "collider-derivation-profile")) || (data1 === "motion-kernel")) || (data1 === "motion-profile")) || (data1 === "control-profile")) || (data1 === "camera-rig-algorithm")) || (data1 === "camera-rig-profile")) || (data1 === "camera-modifier-profile")) || (data1 === "camera-context-profile")) || (data1 === "medium-profile")) || (data1 === "relationship-profile")) || (data1 === "harness-profile")) || (data1 === "pose-set-profile")) || (data1 === "render-binding-profile")) || (data1 === "ai-schema-projection-profile")) || (data1 === "gameplay-bootstrap"))){
const err7 = {instancePath:instancePath+"/resourceKind",schemaPath:"#/properties/resourceKind/enum",keyword:"enum",params:{allowedValues: schema154.properties.resourceKind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.resolvedVersion !== undefined){
let data2 = data.resolvedVersion;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err8 = {instancePath:instancePath+"/resolvedVersion",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/resolvedVersion",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data3 = data.contentHash;
if(typeof data3 === "string"){
if(!pattern4.test(data3)){
const err10 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate99.errors = vErrors;
return errors === 0;
}
validate99.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://worldkit.dev/schemas/world-runtime-bootstrap-v1.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.schemaVersion === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.id === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.gameplayBootstrapRef === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameplayBootstrapRef"},message:"must have required property '"+"gameplayBootstrapRef"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.gameplayBootstrapHash === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameplayBootstrapHash"},message:"must have required property '"+"gameplayBootstrapHash"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.initialControlledEntityId === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "initialControlledEntityId"},message:"must have required property '"+"initialControlledEntityId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.gravityMetersPerSecondSquaredXYZ === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gravityMetersPerSecondSquaredXYZ"},message:"must have required property '"+"gravityMetersPerSecondSquaredXYZ"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.initialCamera === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "initialCamera"},message:"must have required property '"+"initialCamera"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.subjectAssets === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectAssets"},message:"must have required property '"+"subjectAssets"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.rigProfiles === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rigProfiles"},message:"must have required property '"+"rigProfiles"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.animationSets === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "animationSets"},message:"must have required property '"+"animationSets"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.colliderProfiles === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "colliderProfiles"},message:"must have required property '"+"colliderProfiles"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.actionPresentationRegistry === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actionPresentationRegistry"},message:"must have required property '"+"actionPresentationRegistry"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.subjectRuntimeDescriptors === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectRuntimeDescriptors"},message:"must have required property '"+"subjectRuntimeDescriptors"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.runtimeResourceLockEntries === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "runtimeResourceLockEntries"},message:"must have required property '"+"runtimeResourceLockEntries"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.contentHash === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentHash"},message:"must have required property '"+"contentHash"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err16 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.kind !== undefined){
if("world-runtime-bootstrap" !== data.kind){
const err17 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "world-runtime-bootstrap"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
if(1 !== data.schemaVersion){
const err18 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.id !== undefined){
let data2 = data.id;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err19 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.gameplayBootstrapRef !== undefined){
let data3 = data.gameplayBootstrapRef;
if(typeof data3 === "string"){
if(func2(data3) < 1){
const err21 = {instancePath:instancePath+"/gameplayBootstrapRef",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/gameplayBootstrapRef",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.gameplayBootstrapHash !== undefined){
let data4 = data.gameplayBootstrapHash;
if(typeof data4 === "string"){
if(!pattern4.test(data4)){
const err23 = {instancePath:instancePath+"/gameplayBootstrapHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/gameplayBootstrapHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.initialControlledEntityId !== undefined){
let data5 = data.initialControlledEntityId;
if(typeof data5 === "string"){
if(func2(data5) < 1){
const err25 = {instancePath:instancePath+"/initialControlledEntityId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/initialControlledEntityId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.gravityMetersPerSecondSquaredXYZ !== undefined){
let data6 = data.gravityMetersPerSecondSquaredXYZ;
if(Array.isArray(data6)){
if(data6.length > 3){
const err27 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data6.length < 3){
const err28 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
const len0 = data6.length;
if(len0 > 0){
let data7 = data6[0];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err29 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(len0 > 1){
let data8 = data6[1];
if(!((typeof data8 == "number") && (isFinite(data8)))){
const err30 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(len0 > 2){
let data9 = data6[2];
if(!((typeof data9 == "number") && (isFinite(data9)))){
const err31 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
const len1 = data6.length;
if(!(len1 <= 3)){
const err32 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/gravityMetersPerSecondSquaredXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.initialCamera !== undefined){
if(!(validate21(data.initialCamera, {instancePath:instancePath+"/initialCamera",parentData:data,parentDataProperty:"initialCamera",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data.subjectAssets !== undefined){
let data11 = data.subjectAssets;
if(Array.isArray(data11)){
const len2 = data11.length;
for(let i0=0; i0<len2; i0++){
if(!(validate23(data11[i0], {instancePath:instancePath+"/subjectAssets/" + i0,parentData:data11,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err34 = {instancePath:instancePath+"/subjectAssets",schemaPath:"#/properties/subjectAssets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.rigProfiles !== undefined){
let data13 = data.rigProfiles;
if(Array.isArray(data13)){
const len3 = data13.length;
for(let i1=0; i1<len3; i1++){
if(!(validate29(data13[i1], {instancePath:instancePath+"/rigProfiles/" + i1,parentData:data13,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
errors = vErrors.length;
}
}
}
else {
const err35 = {instancePath:instancePath+"/rigProfiles",schemaPath:"#/properties/rigProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.animationSets !== undefined){
let data15 = data.animationSets;
if(Array.isArray(data15)){
const len4 = data15.length;
for(let i2=0; i2<len4; i2++){
if(!(validate32(data15[i2], {instancePath:instancePath+"/animationSets/" + i2,parentData:data15,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
errors = vErrors.length;
}
}
}
else {
const err36 = {instancePath:instancePath+"/animationSets",schemaPath:"#/properties/animationSets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.colliderProfiles !== undefined){
let data17 = data.colliderProfiles;
if(Array.isArray(data17)){
const len5 = data17.length;
for(let i3=0; i3<len5; i3++){
if(!(validate38(data17[i3], {instancePath:instancePath+"/colliderProfiles/" + i3,parentData:data17,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
}
}
else {
const err37 = {instancePath:instancePath+"/colliderProfiles",schemaPath:"#/properties/colliderProfiles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.actionPresentationRegistry !== undefined){
if(!(validate43(data.actionPresentationRegistry, {instancePath:instancePath+"/actionPresentationRegistry",parentData:data,parentDataProperty:"actionPresentationRegistry",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
errors = vErrors.length;
}
}
if(data.subjectRuntimeDescriptors !== undefined){
let data20 = data.subjectRuntimeDescriptors;
if(Array.isArray(data20)){
const len6 = data20.length;
for(let i4=0; i4<len6; i4++){
if(!(validate49(data20[i4], {instancePath:instancePath+"/subjectRuntimeDescriptors/" + i4,parentData:data20,parentDataProperty:i4,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
errors = vErrors.length;
}
}
}
else {
const err38 = {instancePath:instancePath+"/subjectRuntimeDescriptors",schemaPath:"#/properties/subjectRuntimeDescriptors/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.runtimeResourceLockEntries !== undefined){
let data22 = data.runtimeResourceLockEntries;
if(Array.isArray(data22)){
const len7 = data22.length;
for(let i5=0; i5<len7; i5++){
if(!(validate99(data22[i5], {instancePath:instancePath+"/runtimeResourceLockEntries/" + i5,parentData:data22,parentDataProperty:i5,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err39 = {instancePath:instancePath+"/runtimeResourceLockEntries",schemaPath:"#/properties/runtimeResourceLockEntries/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.contentHash !== undefined){
let data24 = data.contentHash;
if(typeof data24 === "string"){
if(!pattern4.test(data24)){
const err40 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
else {
const err41 = {instancePath:instancePath+"/contentHash",schemaPath:"#/$defs/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
}
else {
const err42 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
