export type NativeSceneDiagnosticMeasurementV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "count";
      actualCount: number;
      maximumCount: number;
    }>
  | Readonly<{
      kind: "bytes";
      actualBytes: number;
      maximumBytes: number;
    }>
  | Readonly<{
      kind: "duration-seconds";
      actualSeconds: number;
      maximumSeconds: number;
    }>;

export type NativeSceneDiagnosticStageV1 =
  | "routing"
  | "capability"
  | "bootstrap"
  | "tooling"
  | "dependency"
  | "typecheck"
  | "bundle"
  | "build"
  | "source-admission"
  | "contribution-admission"
  | "authority-audit"
  | "runtime-replay"
  | "runtime"
  | "capture";

export type NativeSceneDiagnosticLocationV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "bootstrap"; instancePath: string }>
  | Readonly<{
      kind: "source";
      sourcePath: string;
      lineNumber: number;
      columnNumber: number;
    }>
  | Readonly<{ kind: "registration"; registrationId: string }>
  | Readonly<{ kind: "asset-resource"; assetResourceRef: string }>
  | Readonly<{
      kind: "asset-lock";
      assetResourceRef: string;
      assetAdmissionReceiptRef: string;
      assetPublicationReceiptRef: string;
    }>
  | Readonly<{
      kind: "world";
      positionMetersXYZ: readonly [number, number, number];
    }>;

export interface NativeSceneDiagnosticV1 {
  readonly kind: "native-scene-diagnostic";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly severity: "warning" | "error";
  readonly stage: NativeSceneDiagnosticStageV1;
  readonly code: string;
  readonly location: NativeSceneDiagnosticLocationV1;
  readonly measurement: NativeSceneDiagnosticMeasurementV1;
  readonly message: string;
  readonly repairHint: string;
}

export type NativeSceneCheckedInputV1 =
  | Readonly<{ kind: "unresolved-world" }>
  | Readonly<{
      kind: "native-scene-module";
      sceneModuleRef: string;
    }>;

export interface NativeSceneCheckResultV1 {
  readonly kind: "native-scene-check-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly checkedInput: NativeSceneCheckedInputV1;
  readonly outcome: "passed" | "rejected" | "tool-error";
  readonly diagnostics: readonly NativeSceneDiagnosticV1[];
}

const DIAGNOSTIC_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "severity",
  "stage",
  "code",
  "location",
  "measurement",
  "message",
  "repairHint",
] as const);

const RESULT_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "checkedInput",
  "outcome",
  "diagnostics",
] as const);

const STAGES = new Set<NativeSceneDiagnosticStageV1>([
  "routing",
  "capability",
  "bootstrap",
  "tooling",
  "dependency",
  "typecheck",
  "bundle",
  "build",
  "source-admission",
  "contribution-admission",
  "authority-audit",
  "runtime-replay",
  "runtime",
  "capture",
]);

const RESOURCE_REF_PATTERN =
  /^worldkit:\/\/[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/;
const NATIVE_SCENE_REF_PATTERN =
  /^worldkit:\/\/native-scene\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@[1-9][0-9]*$/;

function invalidDiagnostic(): never {
  throw new TypeError("Value must match the closed NativeSceneDiagnosticV1 schema.");
}

function invalidResult(): never {
  throw new TypeError("Value must match the closed NativeSceneCheckResultV1 schema.");
}

function snapshotCanonicalData(
  input: unknown,
  invalid: () => never,
): unknown {
  if (input === null || typeof input === "boolean" || typeof input === "string") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) invalid();
    return input;
  }
  if (Array.isArray(input)) {
    try {
      if (
        Reflect.getPrototypeOf(input) !== Array.prototype ||
        Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
        Object.getOwnPropertyNames(input).length !== input.length + 1
      ) invalid();
      const output: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) invalid();
        output.push(snapshotCanonicalData(descriptor.value, invalid));
      }
      return output;
    } catch {
      return invalid();
    }
  }
  if (typeof input !== "object" || input === null) return invalid();
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) invalid();
    const output: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) invalid();
      output[key] = snapshotCanonicalData(descriptor.value, invalid);
    }
    return output;
  } catch {
    return invalid();
  }
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  invalid: () => never,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid();
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalid();
  return record;
}

function identity(input: unknown, invalid: () => never): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalid();
  return input;
}

function resourceRef(input: unknown, invalid: () => never): string {
  const value = identity(input, invalid);
  if (!RESOURCE_REF_PATTERN.test(value)) return invalid();
  return value;
}

function nonNegativeNumber(input: unknown, invalid: () => never): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    Object.is(input, -0) ||
    input < 0
  ) return invalid();
  return input;
}

function nonNegativeInteger(input: unknown, invalid: () => never): number {
  const value = nonNegativeNumber(input, invalid);
  if (!Number.isSafeInteger(value)) return invalid();
  return value;
}

function positiveInteger(input: unknown, invalid: () => never): number {
  const value = nonNegativeInteger(input, invalid);
  if (value < 1) return invalid();
  return value;
}

function parseMeasurement(
  input: unknown,
): NativeSceneDiagnosticMeasurementV1 {
  const source = input as Record<string, unknown>;
  if (source?.kind === "none") {
    exactRecord(input, ["kind"], invalidDiagnostic);
    return Object.freeze({ kind: "none" });
  }
  if (source?.kind === "count") {
    const record = exactRecord(
      input,
      ["kind", "actualCount", "maximumCount"],
      invalidDiagnostic,
    );
    return Object.freeze({
      kind: "count",
      actualCount: nonNegativeInteger(record.actualCount, invalidDiagnostic),
      maximumCount: nonNegativeInteger(record.maximumCount, invalidDiagnostic),
    });
  }
  if (source?.kind === "bytes") {
    const record = exactRecord(
      input,
      ["kind", "actualBytes", "maximumBytes"],
      invalidDiagnostic,
    );
    return Object.freeze({
      kind: "bytes",
      actualBytes: nonNegativeInteger(record.actualBytes, invalidDiagnostic),
      maximumBytes: nonNegativeInteger(record.maximumBytes, invalidDiagnostic),
    });
  }
  if (source?.kind === "duration-seconds") {
    const record = exactRecord(
      input,
      ["kind", "actualSeconds", "maximumSeconds"],
      invalidDiagnostic,
    );
    return Object.freeze({
      kind: "duration-seconds",
      actualSeconds: nonNegativeNumber(record.actualSeconds, invalidDiagnostic),
      maximumSeconds: nonNegativeNumber(record.maximumSeconds, invalidDiagnostic),
    });
  }
  return invalidDiagnostic();
}

function canonicalSourcePath(input: unknown): string {
  const sourcePath = identity(input, invalidDiagnostic);
  const segments = sourcePath.split("/");
  if (
    sourcePath.startsWith("/") ||
    sourcePath.includes("\\") ||
    /^[A-Za-z]:/.test(sourcePath) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) return invalidDiagnostic();
  return sourcePath;
}

function worldPosition(
  input: unknown,
): readonly [number, number, number] {
  if (!Array.isArray(input) || input.length !== 3) return invalidDiagnostic();
  return Object.freeze([
    nonNegativeOrSignedFinite(input[0]),
    nonNegativeOrSignedFinite(input[1]),
    nonNegativeOrSignedFinite(input[2]),
  ] as const);
}

function nonNegativeOrSignedFinite(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    Object.is(input, -0)
  ) return invalidDiagnostic();
  return input;
}

function parseLocation(input: unknown): NativeSceneDiagnosticLocationV1 {
  const source = input as Record<string, unknown>;
  if (source?.kind === "none") {
    exactRecord(input, ["kind"], invalidDiagnostic);
    return Object.freeze({ kind: "none" });
  }
  if (source?.kind === "bootstrap") {
    const record = exactRecord(input, ["kind", "instancePath"], invalidDiagnostic);
    if (typeof record.instancePath !== "string") return invalidDiagnostic();
    return Object.freeze({ kind: "bootstrap", instancePath: record.instancePath });
  }
  if (source?.kind === "source") {
    const record = exactRecord(
      input,
      ["kind", "sourcePath", "lineNumber", "columnNumber"],
      invalidDiagnostic,
    );
    return Object.freeze({
      kind: "source",
      sourcePath: canonicalSourcePath(record.sourcePath),
      lineNumber: positiveInteger(record.lineNumber, invalidDiagnostic),
      columnNumber: positiveInteger(record.columnNumber, invalidDiagnostic),
    });
  }
  if (source?.kind === "registration") {
    const record = exactRecord(input, ["kind", "registrationId"], invalidDiagnostic);
    return Object.freeze({
      kind: "registration",
      registrationId: identity(record.registrationId, invalidDiagnostic),
    });
  }
  if (source?.kind === "asset-resource") {
    const record = exactRecord(input, ["kind", "assetResourceRef"], invalidDiagnostic);
    return Object.freeze({
      kind: "asset-resource",
      assetResourceRef: resourceRef(record.assetResourceRef, invalidDiagnostic),
    });
  }
  if (source?.kind === "asset-lock") {
    const record = exactRecord(
      input,
      [
        "kind",
        "assetResourceRef",
        "assetAdmissionReceiptRef",
        "assetPublicationReceiptRef",
      ],
      invalidDiagnostic,
    );
    return Object.freeze({
      kind: "asset-lock",
      assetResourceRef: resourceRef(record.assetResourceRef, invalidDiagnostic),
      assetAdmissionReceiptRef: resourceRef(
        record.assetAdmissionReceiptRef,
        invalidDiagnostic,
      ),
      assetPublicationReceiptRef: resourceRef(
        record.assetPublicationReceiptRef,
        invalidDiagnostic,
      ),
    });
  }
  if (source?.kind === "world") {
    const record = exactRecord(input, ["kind", "positionMetersXYZ"], invalidDiagnostic);
    return Object.freeze({
      kind: "world",
      positionMetersXYZ: worldPosition(record.positionMetersXYZ),
    });
  }
  return invalidDiagnostic();
}

export function parseNativeSceneDiagnosticV1(
  input: unknown,
): NativeSceneDiagnosticV1 {
  const record = exactRecord(
    snapshotCanonicalData(input, invalidDiagnostic),
    DIAGNOSTIC_FIELDS,
    invalidDiagnostic,
  );
  if (
    record.kind !== "native-scene-diagnostic" ||
    record.schemaVersion !== 1 ||
    (record.severity !== "warning" && record.severity !== "error") ||
    typeof record.stage !== "string" ||
    !STAGES.has(record.stage as NativeSceneDiagnosticStageV1)
  ) return invalidDiagnostic();

  return Object.freeze({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: identity(record.id, invalidDiagnostic),
    severity: record.severity,
    stage: record.stage as NativeSceneDiagnosticStageV1,
    code: identity(record.code, invalidDiagnostic),
    location: parseLocation(record.location),
    measurement: parseMeasurement(record.measurement),
    message: identity(record.message, invalidDiagnostic),
    repairHint: identity(record.repairHint, invalidDiagnostic),
  });
}

function parseCheckedInput(input: unknown): NativeSceneCheckedInputV1 {
  const source = input as Record<string, unknown>;
  if (source?.kind === "unresolved-world") {
    exactRecord(input, ["kind"], invalidResult);
    return Object.freeze({ kind: "unresolved-world" });
  }
  if (source?.kind === "native-scene-module") {
    const record = exactRecord(input, ["kind", "sceneModuleRef"], invalidResult);
    const sceneModuleRef = identity(record.sceneModuleRef, invalidResult);
    if (!NATIVE_SCENE_REF_PATTERN.test(sceneModuleRef)) return invalidResult();
    return Object.freeze({ kind: "native-scene-module", sceneModuleRef });
  }
  return invalidResult();
}

export function parseNativeSceneCheckResultV1(
  input: unknown,
): NativeSceneCheckResultV1 {
  const record = exactRecord(
    snapshotCanonicalData(input, invalidResult),
    RESULT_FIELDS,
    invalidResult,
  );
  if (
    record.kind !== "native-scene-check-result" ||
    record.schemaVersion !== 1 ||
    !["passed", "rejected", "tool-error"].includes(record.outcome as string) ||
    !Array.isArray(record.diagnostics)
  ) return invalidResult();

  let diagnostics: readonly NativeSceneDiagnosticV1[];
  try {
    diagnostics = Object.freeze(
      record.diagnostics.map((diagnostic) => parseNativeSceneDiagnosticV1(diagnostic)),
    );
  } catch {
    return invalidResult();
  }

  const outcome = record.outcome as NativeSceneCheckResultV1["outcome"];
  const errors = diagnostics.filter(({ severity }) => severity === "error");
  if (
    (outcome === "passed" && errors.length > 0) ||
    (outcome === "rejected" && errors.length === 0) ||
    (outcome === "tool-error" && !errors.some(({ stage }) => stage === "tooling"))
  ) return invalidResult();

  return Object.freeze({
    kind: "native-scene-check-result",
    schemaVersion: 1,
    id: identity(record.id, invalidResult),
    checkedInput: parseCheckedInput(record.checkedInput),
    outcome,
    diagnostics,
  });
}
