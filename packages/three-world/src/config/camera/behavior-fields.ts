import {
  object,
  describe,
  number,
  nonnegative,
  positive,
  boolean,
  choice,
  vector,
  branch,
  angleLimits,
  distanceRange,
  speedLimit,
  type CameraFieldSchema,
} from "./field-primitives";
export const lensFields = {
  verticalFovDegrees: number("degrees", {
    exclusiveMinimum: 0,
    exclusiveMaximum: 180,
  }),
  nearMeters: positive("meters"),
  farMeters: positive("meters"),
};
export const anchorField: CameraFieldSchema = {
  oneOf: [
    branch("origin"),
    branch("eye"),
    branch("seat"),
    branch("follow-pivot"),
    branch("shoulder-eye"),
    branch("body", {
      heightRatio: number("ratio", { minimum: 0, maximum: 1 }),
    }),
    branch("subject-local", { positionMetersXYZ: vector }),
  ],
};
export const positionFields = {
  anchor: describe(anchorField, "跟随锚点", "指定环绕支点。eye/seat 等锚点需要主体实际提供；步行与骑乘的眼位由 SDK 主体适配器提供。"),
  anchorOffset: object({
    space: describe(choice("world", "heading", "subject", "orbit"), "偏移坐标空间", "world 固定世界轴；heading 跟随主体水平朝向；subject 跟随完整主体姿态；orbit 跟随当前环绕方向。偏移始终以米计。"),
    offsetMetersXYZ: vector,
  }),
  subjectTranslationHalfLifeSeconds: describe(nonnegative("seconds"), "主体平移半衰期", "主体平移误差减半所需秒数。0 立即跟随；值越大跟随越慢，不改变环绕方向。"),
  anchorHalfLifeSeconds: describe(nonnegative("seconds"), "锚点偏移半衰期", "相对主体的锚点偏移误差减半所需秒数，与主体整体平移的平滑分开。0 立即采用。"),
  armHalfLifeSeconds: describe(nonnegative("seconds"), "相机臂半衰期", "笛卡尔相机臂误差减半所需秒数。0 立即响应；碰撞安全收近仍立即执行，回伸由 recovery 控制。"),
};
export const orientationFields = {
  initialPitchRadians: number("radians"),
  pitchLimitsRadians: angleLimits,
  yawLimitsRadians: angleLimits,
  inheritSubjectYaw: describe(boolean, "继承主体水平转向", "在 subject-up/subject-heading 中是否随主体转向；world-up 不受此开关影响。关闭回正与关闭转向继承是不同操作。"),
  referenceFrame: describe(choice("world-up", "subject-up", "subject-heading"), "环绕参考坐标系", "world-up 使用世界坐标；subject-up 跟随完整主体姿态；subject-heading 仅跟随主体航向并保持世界竖直。"),
  recenter: object({
    enabled: boolean,
    delaySeconds: describe(nonnegative("seconds"), "回正等待时间", "停止相机环绕输入后等待的秒数。移动和驾驶可以继续；恢复环绕输入会重新计时。"),
    minimumSpeedMetersPerSecond: describe(nonnegative("meters/second"), "回正最低速度", "达到该速度才回正。movement-direction 使用水平速度；其他来源使用主体速度大小。"),
    yawHalfLifeSeconds: describe(nonnegative("seconds"), "水平回正半衰期", "朝向误差减半所需秒数，不是完全回正的总时长。0 立即回正，值越大响应越慢。"),
    yawTarget: describe({oneOf:[branch("subject-forward"),branch("movement-direction"),branch("world-forward",{yawRadians:{...number("radians"),default:0}})]}, "水平回正目标", "subject-forward 跟随主体朝向（默认）；movement-direction 跟随水平运动方向，倒车时也跟随倒车方向，停车或仅垂直运动时保持环绕；world-forward 使用 yawRadians，0 面向世界 -Z，PI/2 面向 -X。后两者结合当前俯仰在参考坐标系内求解；若当前俯仰和角度限制无法达到目标方向，保持偏航。"),
    pitch: object(
      {
        targetRadians: number("radians"),
        targetSource: describe(choice("configured", "subject"), "俯仰回正目标来源", "configured 使用 targetRadians；subject 使用主体姿态偏好，主体未提供时回退到 targetRadians。"),
        halfLifeSeconds: describe(nonnegative("seconds"), "响应半衰期", "误差减半所需秒数。0 立即采用目标；它不是完成变化的总时长。"),
      },
      ["targetRadians", "halfLifeSeconds"],
    ),
  }),
};
export const constraintFields = {
  collision: object({
    enabled: boolean,
    radiusMeters: positive("meters"),
    armClearanceMeters: nonnegative("meters"),
    pivotClearanceMeters: nonnegative("meters"),
  }),
  recovery: object({
    halfLifeSeconds: describe(nonnegative("seconds"), "响应半衰期", "误差减半所需秒数。0 立即采用目标；它不是完成变化的总时长。"),
    speedLimit,
    clearHoldSeconds: describe(nonnegative("seconds"), "清障后等待", "障碍消失后继续保持收近距离的时间，用于减少反复收缩和回伸。"),
    releaseDeadbandMeters: describe(nonnegative("meters"), "回伸距离死区", "可用距离变化小于该值时保持收近距离，避免接触边界的小幅抖动。"),
  }),
};
export const speedFovField = object({
  enabled: boolean,
  fullEffectSpeedMetersPerSecond: positive("meters/second"),
  maximumOffsetDegrees: nonnegative("degrees"),
  halfLifeSeconds: describe(nonnegative("seconds"), "响应半衰期", "误差减半所需秒数。0 立即采用目标；它不是完成变化的总时长。"),
});
export const speedDistanceField = object({
  enabled: boolean,
  fullEffectSpeedMetersPerSecond: positive("meters/second"),
  maximumOffsetMeters: nonnegative("meters"),
  extendHalfLifeSeconds: nonnegative("seconds"),
  retractHalfLifeSeconds: nonnegative("seconds"),
});
export const zoomField = object({
  range: distanceRange,
  halfLifeSeconds: describe(nonnegative("seconds"), "响应半衰期", "误差减半所需秒数。0 立即采用目标；它不是完成变化的总时长。"),
});
