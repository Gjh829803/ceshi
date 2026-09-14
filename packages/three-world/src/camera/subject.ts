import { Quaternion, Vector3 } from "three";
import type {
  CameraAnchor,
  CameraPosition,
  CameraVector3,
} from "../config/camera/index";

export type CameraQuaternion = readonly [number, number, number, number];
/** Fixed or display facts supplied by the binding adapter. Geometry axes are never semantic axes. */
export interface CameraSubjectFacts {
  readonly id: string;
  readonly generation: number;
  readonly kind: string;
  readonly positionWorldMetersXYZ: CameraVector3;
  readonly geometryQuaternionWorldXYZW: CameraQuaternion;
  readonly geometryScaleXYZ: CameraVector3;
  /** Optional measured semantic orientation: local -Z forward, +Y up. */
  readonly semanticQuaternionWorldXYZW?: CameraQuaternion;
  readonly speedMetersPerSecond: number;
  /** Native committed gameplay facts. Omission means unavailable, never false. */
  readonly states?: { readonly swimming?: boolean };
  /** Aircraft yaw fact used only to seed continuous world-up twist after a cut. */
  readonly continuousHeadingSeedRadians?: number;
  /** Local, already metre-valued body height range; not multiplied by model scale. */
  readonly body?: {
    readonly minimumHeightMeters: number;
    readonly maximumHeightMeters: number;
  };
  readonly eyeWorldMetersXYZ?: CameraVector3;
  readonly followPivotWorldMetersXYZ?: CameraVector3;
  readonly shoulderEyeWorldMetersXYZ?: CameraVector3;
  /** Optional native posture preference, used only by an opted-in recenter profile. */
  readonly preferredOrbitPitchRadians?: number;
  readonly seatWorldMetersXYZ?: CameraVector3;
}

/** Capabilities that affect strategy admission; pose/state changes are sampled separately. */
export function cameraSubjectCapabilities(subject:CameraSubjectFacts) {
  return {kind:subject.kind,body:subject.body,eye:!!subject.eyeWorldMetersXYZ,
    seat:!!subject.seatWorldMetersXYZ,followPivot:!!subject.followPivotWorldMetersXYZ,
    shoulderEye:!!subject.shoulderEyeWorldMetersXYZ,heading:!!subject.semanticQuaternionWorldXYZW};
}

export function subjectAnchor(
  subject: CameraSubjectFacts,
  anchor: CameraAnchor,
): Vector3 {
  const origin = new Vector3(...subject.positionWorldMetersXYZ);
  switch (anchor.kind) {
    case "origin":
      return origin;
    case "follow-pivot":
    case "shoulder-eye":
    case "eye":
    case "seat": {
      const point =
        anchor.kind === "follow-pivot" ? subject.followPivotWorldMetersXYZ :
        anchor.kind === "shoulder-eye" ? subject.shoulderEyeWorldMetersXYZ :
        anchor.kind === "eye"
          ? subject.eyeWorldMetersXYZ
          : subject.seatWorldMetersXYZ;
      if (!point) throw new Error(`CAMERA_ANCHOR_UNAVAILABLE: ${anchor.kind}`);
      return new Vector3(...point);
    }
    case "body": {
      if (!subject.body) throw new Error("CAMERA_ANCHOR_UNAVAILABLE: body");
      const height =
        subject.body.minimumHeightMeters +
        anchor.heightRatio *
          (subject.body.maximumHeightMeters - subject.body.minimumHeightMeters);
      return origin.add(
        new Vector3(0, height, 0).applyQuaternion(
          new Quaternion(...subject.geometryQuaternionWorldXYZW),
        ),
      );
    }
    case "subject-local":
      return new Vector3(...anchor.positionMetersXYZ)
        .multiply(new Vector3(...subject.geometryScaleXYZ))
        .applyQuaternion(new Quaternion(...subject.geometryQuaternionWorldXYZW))
        .add(origin);
  }
}

/** Undefined at a vertical semantic forward; caller retains the previous valid heading. */
export function subjectHeading(
  subject: CameraSubjectFacts,
): number | undefined {
  if (!subject.semanticQuaternionWorldXYZW) return undefined;
  const front = new Vector3(0, 0, -1).applyQuaternion(
    new Quaternion(...subject.semanticQuaternionWorldXYZW),
  );
  return front.x * front.x + front.z * front.z > 1e-12
    ? Math.atan2(-front.x, -front.z)
    : undefined;
}

export function anchorOffset(
  subject: CameraSubjectFacts,
  offset: CameraPosition["anchorOffset"],
  heading: number,
  orbit?: {readonly yawRadians:number;readonly referenceQuaternionWorldXYZW:CameraQuaternion},
): Vector3 {
  const value = new Vector3(...offset.offsetMetersXYZ);
  if (offset.space === "heading")
    value.applyAxisAngle(new Vector3(0, 1, 0), heading);
  if (offset.space === "orbit")
    value.applyAxisAngle(new Vector3(0,1,0),orbit?.yawRadians??heading).applyQuaternion(new Quaternion(...(orbit?.referenceQuaternionWorldXYZW??[0,0,0,1])));
  if (offset.space === "subject")
    value.applyQuaternion(
      new Quaternion(...subject.geometryQuaternionWorldXYZW),
    );
  return value;
}

/** One unsmoothed anchor for opening measurement, strategies and display samples. */
export function cameraPositionAnchor(subject: CameraSubjectFacts, position: CameraPosition, fallbackHeading?: number, orbit?: {readonly yawRadians:number;readonly referenceQuaternionWorldXYZW:CameraQuaternion}): Vector3 {
  return subjectAnchor(subject, position.anchor).add(
    anchorOffset(subject, position.anchorOffset, subject.continuousHeadingSeedRadians !== undefined ? fallbackHeading ?? subject.continuousHeadingSeedRadians : subjectHeading(subject) ?? fallbackHeading ?? 0,orbit),
  );
}
