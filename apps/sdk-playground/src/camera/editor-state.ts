import {
  parseCameraDocument,
  serializeCameraDocument,
  hashCameraDocument,
  type CameraDocument,
  type CameraInspection,
  type CameraEditSession,
  type CameraOpeningConfiguration,
  type ThreeWorld,
} from "@worldkit/three";
import type { CameraConfigurationId } from "./project-files";
import type { CameraFileClient } from "./file-client";
import type { CameraFileRead } from "./file-contract";
export type EditScope =
  | { kind: "view" }
  | { kind: "preset" | "subject"; id: string };
export interface CameraProjectInput {
  configurationId: CameraConfigurationId;
  document: CameraDocument;
  savedDocument: CameraDocument;
  importedFileSha256: string;
}
export const fieldInputKey = (scope: EditScope, view: string, path: string) =>
  JSON.stringify([scope, view, path]);
export const readPath = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (v, k) =>
        v && typeof v === "object"
          ? (v as Record<string, unknown>)[k]
          : undefined,
      value,
    );
function writePath(
  value: Record<string, unknown>,
  path: string,
  next: unknown,
) {
  const keys = path.split(".");
  let target = value;
  for (const k of keys.slice(0, -1))
    target = (target[k] ??= {}) as Record<string, unknown>;
  if (next === undefined) delete target[keys.at(-1)!];
  else target[keys.at(-1)!] = next;
}
export function scopeValues(
  document: CameraDocument,
  scope: EditScope,
  view: string,
): unknown {
  return scope.kind === "preset"
    ? document.presets?.[scope.id]?.values
    : scope.kind === "view"
      ? document.views[view]?.overrides
      : document.binding.subjectOverrides?.[scope.id]?.views[view]?.overrides;
}
const same = (a: CameraDocument, b: CameraDocument) =>
  serializeCameraDocument(a) === serializeCameraDocument(b);
type SaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict";
/** UI documents only. SDK owns checkpoints, validation and live resolution. */
export class CameraEditorState {
  private listeners = new Set<() => void>();
  private history: CameraDocument[] = [];
  private group: CameraDocument | undefined;
  private session: CameraEditSession | undefined;
  private world:
    | Pick<ThreeWorld, "beginCameraEdit" | "inspectCamera" | "setCameraView">
    | undefined;
  private cancelDocument: CameraDocument;
  private revision = 0;
  private fieldError = false;
  snapshot: {
    documentInput: { text: string; error: string } | undefined;
    invalidInputs: Record<string, string>;
    draft: CameraDocument;
    validDraft: CameraDocument;
    loadedDocument: CameraDocument;
    savedFileSha256: string;
    importedFileSha256: string;
    dirty: boolean;
    error: string;
    recovered: boolean;
    saveStatus: SaveStatus;
    conflict: CameraFileRead | undefined;
    inspection: CameraInspection | undefined;
    appliedDraftRevision: number | undefined;
    baselineRevision: number | undefined;
    bound: boolean;
  };
  constructor(readonly project: CameraProjectInput) {
    this.cancelDocument = project.document;
    this.snapshot = {
      documentInput: undefined,
      invalidInputs: {},
      draft: project.document,
      validDraft: project.document,
      loadedDocument: project.savedDocument,
      savedFileSha256: project.importedFileSha256,
      importedFileSha256: project.importedFileSha256,
      dirty: !same(project.document, project.savedDocument),
      error: "",
      recovered: false,
      saveStatus: "idle",
      conflict: undefined,
      inspection: undefined,
      appliedDraftRevision: undefined,
      baselineRevision: undefined,
      bound: false,
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private emit() {
    this.snapshot = {
      ...this.snapshot,
      dirty:
        !!this.snapshot.documentInput?.error ||
        Object.keys(this.snapshot.invalidInputs).length > 0 ||
        !same(this.snapshot.draft, this.snapshot.loadedDocument),
    };
    for (const listener of this.listeners) listener();
  }
  private attempt(action: () => void) {
    try {
      action();
      this.snapshot.error = "";
    } catch (error) {
      this.snapshot.error =
        error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }
  private invalidDraft() {
    return this.fieldError || !!this.snapshot.documentInput?.error;
  }
  editDocument(text: string) {
    try {
      const next = parseCameraDocument(JSON.parse(text));
      if (!this.group) this.history.push(this.snapshot.draft);
      this.snapshot.draft = next;
      this.snapshot.validDraft = next;
      this.snapshot.invalidInputs = {};
      this.fieldError = false;
      this.snapshot.documentInput = { text, error: "" };
      this.snapshot.error = "";
    } catch (error) {
      this.snapshot.documentInput = {
        text,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.emit();
  }
  discardDocumentInput() {
    this.snapshot.documentInput = undefined;
    this.snapshot.error = "";
    this.emit();
  }
  private syncDocumentInput() {
    if (!this.snapshot.documentInput?.error)
      this.snapshot.documentInput = undefined;
  }
  beginGroup() {
    this.group ??= this.snapshot.draft;
  }
  endGroup() {
    if (this.group && !same(this.group, this.snapshot.draft))
      this.history.push(this.group);
    this.group = undefined;
  }
  replace(input: unknown, preserveInvalid = false) {
    this.fieldError = true;
    this.attempt(() => {
      const next = parseCameraDocument(input);
      if (!this.group) this.history.push(this.snapshot.draft);
      this.snapshot.draft = next;
      this.snapshot.validDraft = next;
      if (!preserveInvalid) {
        this.snapshot.invalidInputs = {};
        this.snapshot.documentInput = undefined;
      } else this.syncDocumentInput();
      this.fieldError = Object.keys(this.snapshot.invalidInputs).length > 0;
    });
  }
  field(scope: EditScope, view: string, path: string, text: string) {
    const inputKey = fieldInputKey(scope, view, path);
    this.snapshot.invalidInputs = {
      ...this.snapshot.invalidInputs,
      [inputKey]: text,
    };
    this.fieldError = true;
    this.attempt(() => {
      let value: unknown;
      if (text === "") value = undefined;
      else {
        try {
          value = JSON.parse(text);
        } catch {
          value = text;
        }
      }
      const next = JSON.parse(
        serializeCameraDocument(this.snapshot.draft),
      ) as Record<string, unknown>;
      // IDs may contain dots; walk scope objects separately from metadata field paths.
      const draft = next as unknown as CameraDocument;
      let target: Record<string, unknown>;
      if (scope.kind === "preset")
        target = draft.presets![scope.id]!.values as Record<string, unknown>;
      else if (scope.kind === "view") {
        const v = (next.views as Record<string, Record<string, unknown>>)[
          view
        ]!;
        target = (v.overrides ??= {}) as Record<string, unknown>;
      } else {
        const binding = next.binding as Record<string, unknown>,
          subjects = (binding.subjectOverrides ??= {}) as Record<
            string,
            Record<string, unknown>
          >,
          subject = (subjects[scope.id] ??= { views: {} }),
          views = subject.views as Record<string, Record<string, unknown>>,
          v = (views[view] ??= {});
        target = (v.overrides ??= {}) as Record<string, unknown>;
      }
      writePath(target, path, value);
      const parsed = parseCameraDocument(next);
      if (!this.group) this.history.push(this.snapshot.draft);
      this.snapshot.draft = parsed;
      this.snapshot.validDraft = parsed;
      this.syncDocumentInput();
      delete this.snapshot.invalidInputs[inputKey];
      this.snapshot.invalidInputs = { ...this.snapshot.invalidInputs };
      this.fieldError = Object.keys(this.snapshot.invalidInputs).length > 0;
    });
  }
  undo() {
    if (this.snapshot.documentInput?.error) {
      this.discardDocumentInput();
      return;
    }
    this.snapshot.documentInput = undefined;
    if (this.fieldError) {
      this.fieldError = false;
      this.snapshot.invalidInputs = {};
      this.snapshot.error = "";
      this.emit();
      return;
    }
    const previous = this.history.pop();
    if (previous) {
      this.snapshot.draft = previous;
      this.snapshot.validDraft = previous;
    }
    this.emit();
  }
  bind(
    world: Pick<
      ThreeWorld,
      "beginCameraEdit" | "inspectCamera" | "setCameraView"
    >,
  ) {
    this.session?.dispose();
    this.session = undefined;
    this.world = world;
    this.snapshot.bound = false;
    this.attempt(() => {
      this.session = world.beginCameraEdit();
      this.snapshot.inspection = world.inspectCamera();
      this.revision = this.snapshot.inspection.configurationRevision;
      this.cancelDocument =
        this.snapshot.inspection.document ?? this.snapshot.draft;
      this.snapshot.bound = true;
    });
  }
  invalidate() {
    this.world = undefined;
    this.session?.dispose();
    this.session = undefined;
    this.snapshot.bound = false;
    this.snapshot.error = "世界或初态已变化；保留草稿，请重新绑定预览";
    this.emit();
  }
  apply() {
    this.attempt(() => {
      if (!this.session) throw Error("请重新绑定预览");
      if (this.invalidDraft())
        throw Error(this.snapshot.error || "草稿有非法字段");
      const result = this.session.applyDraft(
        this.snapshot.validDraft,
        this.revision,
      );
      this.revision = result.configurationRevision;
      this.snapshot.inspection = result;
      this.snapshot.appliedDraftRevision = result.configurationRevision;
    });
  }
  view(viewId: string) {
    this.attempt(() => {
      if (!this.world) throw Error("世界不可用");
      this.world.setCameraView(viewId);
      this.snapshot.inspection = this.world.inspectCamera();
    });
  }
  resumeAutomatic() {
    this.attempt(() => {
      if (!this.session) throw Error("请重新绑定预览");
      this.snapshot.inspection = this.session.resumeViewSelection();
      this.revision = this.snapshot.inspection.configurationRevision;
    });
  }
  commit() {
    this.attempt(() => {
      if (!this.session) throw Error("请重新绑定预览");
      if (
        !this.snapshot.inspection?.document ||
        !same(this.snapshot.draft, this.snapshot.inspection.document) ||
        this.invalidDraft()
      )
        throw Error("请先成功应用当前草稿");
      this.snapshot.inspection = this.session.commitBaseline(this.revision);
      this.snapshot.baselineRevision = this.revision;
      this.cancelDocument = this.snapshot.draft;
    });
  }
  cancel() {
    this.attempt(() => {
      if (!this.session) throw Error("请重新绑定预览");
      this.session.cancel();
      this.session = undefined;
      this.snapshot.bound = false;
      this.snapshot.draft = this.cancelDocument;
      this.snapshot.validDraft = this.cancelDocument;
      this.syncDocumentInput();
      this.snapshot.invalidInputs = {};
      this.fieldError = false;
      this.snapshot.inspection = this.world?.inspectCamera();
    });
  }
  opening(viewId: string, opening?: CameraOpeningConfiguration) {
    this.attempt(() => {
      if (!this.session) throw Error("请重新绑定预览");
      if (this.invalidDraft()) throw Error("草稿有非法字段");
      const next = this.session.createOpeningDraft(this.snapshot.validDraft, {
        viewId,
        ...(opening ? { opening } : {}),
      });
      this.history.push(this.snapshot.draft);
      this.snapshot.draft = next;
      this.snapshot.validDraft = next;
      this.syncDocumentInput();
      this.fieldError = false;
    });
  }
  async refresh(client: CameraFileClient) {
    try {
      this.external(await client.read(this.project.configurationId));
    } catch (error) {
      this.snapshot.error = String(error);
      this.emit();
    }
  }
  external(file: CameraFileRead) {
    if (
      file.status === "present" &&
      file.fileSha256 === this.snapshot.savedFileSha256
    )
      return;
    if (this.snapshot.dirty || file.status === "missing")
      this.snapshot.conflict = file;
    else {
      this.syncDocumentInput();
      this.snapshot.loadedDocument = file.document;
      this.snapshot.draft = file.document;
      this.snapshot.validDraft = file.document;
      this.snapshot.savedFileSha256 = file.fileSha256;
    }
    this.emit();
  }
  imported(document: CameraDocument, sha: string) {
    this.snapshot.importedFileSha256 = sha;
    this.external({ status: "present", document, fileSha256: sha });
    this.emit();
  }
  acceptExternal() {
    const file = this.snapshot.conflict;
    if (file?.status === "present") {
      this.history.push(this.snapshot.draft);
      this.snapshot.draft = file.document;
      this.snapshot.validDraft = file.document;
      this.snapshot.loadedDocument = file.document;
      this.snapshot.savedFileSha256 = file.fileSha256;
      this.snapshot.conflict = undefined;
      this.snapshot.documentInput = undefined;
      this.snapshot.invalidInputs = {};
      this.fieldError = false;
      this.snapshot.error = "";
      this.emit();
    }
  }
  keepDraft() {
    const file = this.snapshot.conflict;
    if (file?.status === "present") {
      this.snapshot.loadedDocument = file.document;
      this.snapshot.savedFileSha256 = file.fileSha256;
      this.snapshot.conflict = undefined;
      this.emit();
    }
  }
  async save(client: CameraFileClient) {
    if (this.invalidDraft() || this.snapshot.saveStatus === "saving") return;
    this.snapshot.error = "";
    this.snapshot.saveStatus = "saving";
    this.emit();
    const submitted = this.snapshot.validDraft;
    try {
      const result = await client.save(
        this.project.configurationId,
        this.snapshot.savedFileSha256,
        submitted,
      );
      if (result.status === "conflict") {
        this.snapshot.conflict = result.current;
        this.snapshot.saveStatus = "conflict";
      } else {
        this.snapshot.loadedDocument = result.document;
        this.snapshot.savedFileSha256 = result.fileSha256;
        this.snapshot.saveStatus = "saved";
        if (
          this.snapshot.conflict?.status === "present" &&
          this.snapshot.conflict.fileSha256 === result.fileSha256
        )
          this.snapshot.conflict = undefined;
      }
    } catch (error) {
      this.snapshot.saveStatus = "failed";
      this.snapshot.error = String(error);
    }
    this.emit();
  }
  adopted() {
    if (!this.world) return false;
    const s = this.snapshot,
      i = this.world?.inspectCamera() ?? s.inspection;
    return (
      s.importedFileSha256 === s.savedFileSha256 &&
      i?.documentHash === hashCameraDocument(s.loadedDocument) &&
      !!i.resolved &&
      !!i.current &&
      i.resolved.viewId === i.current.viewId
    );
  }
  recovery() {
    return JSON.stringify({
      document: this.snapshot.draft,
      loadedDocument: this.snapshot.loadedDocument,
      fileSha256: this.snapshot.savedFileSha256,
      invalidInputs: this.snapshot.invalidInputs,
      documentInput: this.snapshot.documentInput,
    });
  }
  recover(text: string) {
    this.attempt(() => {
      const data = JSON.parse(text) as {
        document: unknown;
        loadedDocument: unknown;
        fileSha256: string;
        invalidInputs?: Record<string, string>;
        documentInput?: { text: string; error: string };
      };
      const draft = parseCameraDocument(data.document),
        loaded = parseCameraDocument(data.loadedDocument);
      if (data.fileSha256 !== this.snapshot.savedFileSha256)
        this.snapshot.conflict = {
          status: "present",
          document: this.snapshot.loadedDocument,
          fileSha256: this.snapshot.savedFileSha256,
        };
      this.snapshot.draft = draft;
      this.snapshot.validDraft = draft;
      this.snapshot.loadedDocument = loaded;
      this.snapshot.savedFileSha256 = data.fileSha256;
      this.snapshot.recovered = true;
      if (data.documentInput) {
        const text = data.documentInput.text;
        let error = "";
        try {
          const input = parseCameraDocument(JSON.parse(text));
          if (!same(input, draft))
            error = "完整文档输入与当前草稿不同，请修正或放弃输入";
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
        this.snapshot.documentInput = { text, error };
      }
      this.snapshot.invalidInputs = data.invalidInputs ?? {};
      this.fieldError = Object.keys(this.snapshot.invalidInputs).length > 0;
    });
  }
}
