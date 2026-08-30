const TRANSITION_ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
const SEMANTIC_MARKER = ".space-transition.";
const DESTINATION_ANCHOR_PREFIX = "block-transition-destination-";

export const BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2 = 1.25;

export function isBlockWorldSpaceTransitionIdV2(value: string): boolean {
  return TRANSITION_ID.test(value);
}

export function blockWorldSpaceTransitionSemanticClassIdV2(
  baseSemanticClassId: string,
  transitionId: string,
): string {
  if (!isBlockWorldSpaceTransitionIdV2(transitionId)) {
    throw new RangeError("Block World space-transition ID is invalid.");
  }
  return `${baseSemanticClassId}${SEMANTIC_MARKER}${transitionId}`;
}

export function parseBlockWorldSpaceTransitionSemanticClassIdV2(
  semanticClassId: string,
): string | undefined {
  const markerIndex = semanticClassId.lastIndexOf(SEMANTIC_MARKER);
  if (markerIndex < 0) return undefined;
  const transitionId = semanticClassId.slice(markerIndex + SEMANTIC_MARKER.length);
  return isBlockWorldSpaceTransitionIdV2(transitionId)
    ? transitionId
    : undefined;
}

export function blockWorldSpaceTransitionDestinationAnchorEntityIdV2(
  transitionId: string,
): string {
  if (!isBlockWorldSpaceTransitionIdV2(transitionId)) {
    throw new RangeError("Block World space-transition ID is invalid.");
  }
  return `${DESTINATION_ANCHOR_PREFIX}${transitionId}`;
}
