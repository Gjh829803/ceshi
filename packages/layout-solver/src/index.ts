export {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  resolveLayoutSolverProfileV1,
} from "./profile-registry.js";
export {
  aabbOverlapDepthMetersXYZ,
  aabbSeparationMeters,
  pointInPolygonXZ,
  pointToPolygonBoundaryDistanceMeters,
  projectToScreenUv,
  quantizeFinite,
  sampleHeightfieldV1,
  sampleRoutePolylineV1,
  validatePolygonXZ,
} from "./geometry.js";
export { generateLayoutCandidatesV1 } from "./candidates.js";
export { evaluatePlacementConstraintV1 } from "./evaluators.js";
export { hashLayoutSolveReportV1 } from "./report.js";
export { solveLayoutV1 } from "./solve.js";
export type {
  LayoutSolverProfileV1,
  ResolvedLayoutSolverProfileV1,
  LayoutAabbV1,
  LayoutCameraV1,
  LayoutCandidateGenerationInputV1,
  LayoutCandidateSourceV1,
  LayoutCandidateV1,
  LayoutGeometryQueryV1,
  LayoutHeightfieldV1,
  LayoutRouteV1,
  LayoutScreenRegionV1,
  LayoutSpatialRegionV1,
  LayoutTransformV1,
  LayoutVec2V1,
  LayoutVec3V1,
  ResolvedLayoutEntityV1,
  ResolvedLayoutPlacementV1,
  ConstraintEvaluationV1,
  LayoutConstraintEvaluationContextV1,
  LayoutEvaluationEntityV1,
  PlacementConstraintViolationCodeV1,
  ResolvedPlacementConstraintV1,
  LayoutDiagnosticCodeV1,
  LayoutDiagnosticV1,
  LayoutPlacementResultV1,
  LayoutSolveReportV1,
  LayoutSolveResultV1,
  LayoutSolveStatusV1,
  ResolvedLayoutInputV1,
} from "./types.js";
