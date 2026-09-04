import { describe, expect, it } from "vitest";

import {
  parseCameraGeometryHitV2,
  parseCameraGeometryQueryRequestV2,
} from "./camera-domain.js";

const request = {
  schemaVersion: 2,
  committedTick: 41,
  startPositionMetersXYZ: [0, 0, 0],
  endPositionMetersXYZ: [0, 0, 4],
  radiusMeters: 0.5,
  collisionMask: "camera-hard",
  excludedEntityIds: ["g-bot-primary"],
  maximumHitCount: 1,
} as const;

describe("CameraGeometryQueryRequestV2", () => {
  it("strictly parses and deeply freezes one bounded sphere query", () => {
    const parsed = parseCameraGeometryQueryRequestV2(request);

    expect(parsed).toEqual(request);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.startPositionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(parsed.endPositionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(parsed.excludedEntityIds)).toBe(true);
  });

  it.each([
    ["zero radius", { ...request, radiusMeters: 0 }],
    ["non-finite radius", { ...request, radiusMeters: Number.NaN }],
    ["sparse vector", { ...request, startPositionMetersXYZ: new Array(3) }],
    ["unsupported mask", { ...request, collisionMask: "physics-hard" }],
    ["unbounded hit count", { ...request, maximumHitCount: 2 }],
    ["extra-key ids", { ...request, excludedEntityIds: Object.assign([], { provider: true }) }],
    ["duplicate excluded ids", {
      ...request,
      excludedEntityIds: ["g-bot-primary", "g-bot-primary"],
    }],
    ["non-NFC excluded id", { ...request, excludedEntityIds: ["g-bot-e\u0301"] }],
    ["oversized excluded ids", {
      ...request,
      excludedEntityIds: Array.from({ length: 65 }, (_, index) => `entity-${index}`),
    }],
    ["legacy request shape", {
      schemaVersion: 1,
      committedTick: 41,
      fromMetersXYZ: [0, 0, 0],
      toMetersXYZ: [0, 0, 4],
      radiusMeters: 0.5,
      excludedEntityIds: ["g-bot-primary"],
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCameraGeometryQueryRequestV2(input)).toThrow(
      "closed CameraGeometryQueryRequestV2 schema",
    );
  });
});

describe("CameraGeometryHitV2", () => {
  it.each([
    ["swept hard hit", {
      schemaVersion: 2,
      travelDistanceMeters: 2.5,
      travelFraction: 0.625,
      hitPointMetersXYZ: [0, 0, 3],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
    ["start overlap without a provider Entity id", {
      schemaVersion: 2,
      travelDistanceMeters: 0,
      travelFraction: 0,
      hitPointMetersXYZ: [0.25, 0, 0],
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.25,
      obstructionClass: "hard",
    }],
  ])("parses and freezes %s", (_label, result) => {
    const parsed = parseCameraGeometryHitV2(result, request);

    expect(parsed).toEqual(result);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.hitPointMetersXYZ)).toBe(true);
    expect(Object.isFrozen(parsed.hitNormalXYZ)).toBe(true);
  });

  it.each([
    ["non-finite distance", {
      schemaVersion: 2,
      travelDistanceMeters: Number.POSITIVE_INFINITY,
      travelFraction: 0.5,
      hitPointMetersXYZ: [0, 0, 2],
      hitNormalXYZ: [0, 1, 0],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
    ["non-unit normal", {
      schemaVersion: 2,
      travelDistanceMeters: 2,
      travelFraction: 0.5,
      hitPointMetersXYZ: [0, 0, 2],
      hitNormalXYZ: [0, 0, -2],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
    ["penetration on a non-overlap hit", {
      schemaVersion: 2,
      travelDistanceMeters: 2,
      travelFraction: 0.5,
      hitPointMetersXYZ: [0, 0, 2],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0.1,
      obstructionClass: "hard",
    }],
    ["positive travel on a start overlap", {
      schemaVersion: 2,
      travelDistanceMeters: 0.1,
      travelFraction: 0.025,
      hitPointMetersXYZ: [0, 0, 0],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
      startedOverlapping: true,
      penetrationDepthMeters: 0.1,
      obstructionClass: "hard",
    }],
    ["distance beyond arm", {
      schemaVersion: 2,
      travelDistanceMeters: 5,
      travelFraction: 1.25,
      hitPointMetersXYZ: [0, 0, 5],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
    ["distance and fraction mismatch", {
      schemaVersion: 2,
      travelDistanceMeters: 2,
      travelFraction: 0.25,
      hitPointMetersXYZ: [0, 0, 2],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
    ["excluded hit Entity", {
      schemaVersion: 2,
      travelDistanceMeters: 2,
      travelFraction: 0.5,
      hitPointMetersXYZ: [0, 0, 2],
      hitNormalXYZ: [0, 0, -1],
      hitEntityId: "g-bot-primary",
      startedOverlapping: false,
      penetrationDepthMeters: 0,
      obstructionClass: "hard",
    }],
  ])("rejects %s", (_label, result) => {
    expect(() => parseCameraGeometryHitV2(result, request)).toThrow(
      "closed CameraGeometryHitV2 schema",
    );
  });
});
