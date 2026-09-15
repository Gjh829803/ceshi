import { describe, it, expect, vi } from "vitest";
import {
  parseCameraDocument,
  resolveCameraConfiguration,
  serializeCameraDocument,
  type CameraEditSession,
  type CameraInspection,
} from "@worldkit/three";
import source from "../../config/camera.json";
import { CameraEditorState, fieldProvenance } from "./editor-state";
const document = () => parseCameraDocument(source);
const create = () =>
  new CameraEditorState({
    configurationId: "campus",
    document: document(),
    savedDocument: document(),
    importedFileSha256: "a".repeat(64),
  });
describe("camera document editor", () => {
  it("keeps the pre-edit document available to cancel after resuming automatic selection", () => {
    const state=create(), original=document();
    let current=original, revision=0;
    const inspect=()=>({document:current,configurationRevision:revision}) as CameraInspection;
    const beginCameraEdit=vi.fn(()=>{
      const checkpoint=current;
      return {
        applyDraft(next:typeof current){current=next;revision++;return inspect();},
        resumeViewSelection:()=>inspect(),
        cancel(){current=checkpoint;revision++;},
        dispose:vi.fn(),
      } as unknown as CameraEditSession;
    });
    state.bind({beginCameraEdit,inspectCamera:inspect,setCameraView:vi.fn()});
    state.field({kind:"view"},"third-person","lens.verticalFovDegrees","61");
    state.apply();state.resumeAutomatic();state.cancel();
    expect(current).toEqual(original);
    expect(state.snapshot.draft).toEqual(original);
    expect(beginCameraEdit).toHaveBeenCalledTimes(1);
  });
  it("edits preset scope without replacing project override", () => {
    const state = create(),
      viewId = "third-person",
      presetId =
        state.snapshot.draft.binding.subjectOverrides!.person!.views[viewId]!
          .presetId!;
    const before = state.snapshot.draft.views[viewId]!.overrides;
    state.field(
      { kind: "preset", id: presetId },
      viewId,
      "lens.verticalFovDegrees",
      "61",
    );
    expect(
      state.snapshot.draft.presets![presetId]!.values.lens?.verticalFovDegrees,
    ).toBe(61);
    expect(state.snapshot.draft.views[viewId]!.overrides).toEqual(before);
  });
  it("invalid draft retains last valid document and one undo for grouped changes", () => {
    const state = create(),
      scope = { kind: "view" as const };
    state.beginGroup();
    state.field(scope, "third-person", "lens.verticalFovDegrees", "61");
    state.field(scope, "third-person", "lens.verticalFovDegrees", "62");
    state.endGroup();
    const valid = serializeCameraDocument(state.snapshot.validDraft);
    state.field(scope, "third-person", "lens.verticalFovDegrees", "no");
    expect(state.snapshot.error).toBeTruthy();
    expect(serializeCameraDocument(state.snapshot.validDraft)).toBe(valid);
    state.undo();
    expect(state.snapshot.error).toBe("");
    state.undo();
    expect(state.snapshot.draft).toEqual(document());
  });
  it("external file and HMR preserve dirty draft and both versions", () => {
    const state = create();
    state.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "61",
    );
    const other = document();
    state.imported(other, "b".repeat(64));
    expect(
      state.snapshot.conflict?.status === "present"
        ? state.snapshot.conflict.document
        : undefined,
    ).toEqual(other);
    expect(
      state.snapshot.draft.views["third-person"]!.overrides?.lens
        ?.verticalFovDegrees,
    ).toBe(61);
    const restored = create();
    restored.recover(state.recovery());
    expect(restored.snapshot.draft).toEqual(state.snapshot.draft);
  });
  it("failed and conflicting saves never claim saved or adopted", async () => {
    const state = create();
    state.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "61",
    );
    await state.save({
      read: async () => ({ status: "missing" }),
      save: async () => {
        throw Error("cancelled");
      },
    });
    expect(state.snapshot.saveStatus).toBe("failed");
    expect(state.snapshot.dirty).toBe(true);
    await state.save({
      read: async () => ({ status: "missing" }),
      save: async () => ({
        status: "conflict",
        current: {
          status: "present",
          document: document(),
          fileSha256: "b".repeat(64),
        },
      }),
    });
    expect(state.snapshot.saveStatus).toBe("conflict");
    expect(state.snapshot.dirty).toBe(true);
    expect(state.adopted()).toBe(false);
  });
  it("pending save preserves newer edits and save completion does not touch the SDK", async () => {
    const state = create();
    state.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "61",
    );
    const submitted = state.snapshot.draft;
    let finish!: (value: {
      status: "saved";
      document: typeof submitted;
      fileSha256: string;
    }) => void;
    const saving = state.save({
      read: async () => ({ status: "missing" }),
      save: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    state.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "62",
    );
    finish({
      status: "saved",
      document: submitted,
      fileSha256: "b".repeat(64),
    });
    await saving;
    expect(
      state.snapshot.draft.views["third-person"]!.overrides?.lens
        ?.verticalFovDegrees,
    ).toBe(62);
    expect(state.snapshot.dirty).toBe(true);
    expect(state.snapshot.baselineRevision).toBeUndefined();
  });
  it("lease rejection keeps offline draft and applied revision; replacement requires explicit rebind", () => {
    const state = create();
    const inspection = {
      configurationRevision: 8,
      document: document(),
    } as CameraInspection;
    const applyDraft = vi.fn(() => {
      throw Error("WORLD_LEASE_CONFLICT");
    });
    const session = {
      applyDraft,
      dispose: vi.fn(),
    } as unknown as CameraEditSession;
    state.bind({
      beginCameraEdit: () => session,
      inspectCamera: () => inspection,
      setCameraView: vi.fn(),
    });
    state.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "61",
    );
    state.apply();
    expect(applyDraft).toHaveBeenCalledWith(state.snapshot.draft, 8);
    expect(state.snapshot.appliedDraftRevision).toBeUndefined();
    const draft = state.snapshot.draft;
    state.invalidate();
    state.apply();
    expect(state.snapshot.draft).toBe(draft);
    expect(applyDraft).toHaveBeenCalledTimes(1);
  });
  it("recovers invalid full document text and keeps apply/save blocked through unrelated field edits", async () => {
    const state = create(),
      raw = '{ "opening": unfinished';
    const before = state.snapshot.validDraft;
    state.editDocument(raw);
    expect(state.snapshot.documentInput?.text).toBe(raw);
    expect(state.snapshot.documentInput?.error).toBeTruthy();
    expect(state.snapshot.validDraft).toBe(before);
    const restored = create();
    restored.recover(state.recovery());
    const applyDraft = vi.fn();
    restored.bind({
      beginCameraEdit: () =>
        ({ applyDraft, dispose: vi.fn() }) as unknown as CameraEditSession,
      inspectCamera: () =>
        ({
          configurationRevision: 8,
          document: document(),
        }) as CameraInspection,
      setCameraView: vi.fn(),
    });
    restored.field(
      { kind: "view" },
      "third-person",
      "lens.verticalFovDegrees",
      "62",
    );
    expect(restored.snapshot.documentInput?.text).toBe(raw);
    const save = vi.fn();
    restored.apply();
    await restored.save({ read: async () => ({ status: "missing" }), save });
    expect(applyDraft).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(restored.snapshot.documentInput?.error).toBeTruthy();
    restored.undo();
    expect(restored.snapshot.documentInput).toBeUndefined();
    restored.editDocument(JSON.stringify(document()));
    expect(restored.snapshot.documentInput?.error).toBe("");
    restored.editDocument("");
    const empty = create();
    empty.recover(restored.recovery());
    expect(empty.snapshot.documentInput?.text).toBe("");
    expect(empty.snapshot.documentInput?.error).toBeTruthy();
    await empty.save({ read: async () => ({ status: "missing" }), save });
    expect(save).not.toHaveBeenCalled();
    empty.undo();
    expect(empty.snapshot.documentInput).toBeUndefined();
  });
});

it('shows a union field effective value and mixed provenance from the actual resolver',()=>{
 const configuration=resolveCameraConfiguration({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'person',subjectOverrides:{person:{views:{orbit:{overrides:{orientation:{recenter:{yawTarget:{yawRadians:.7}}}}}}}}},views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{recenter:{yawTarget:{kind:'world-forward',yawRadians:.2}}}}}}},
   {subjectId:'person',subjectGeneration:1,subjectKind:'ordinary',availableAnchors:[],headingAvailable:false});
 const field=fieldProvenance(configuration,'orientation.recenter.yawTarget')!;
 expect(field.effective).toEqual({kind:'world-forward',yawRadians:.7});
 expect(field.source).toBe('project-view / project-subject');
 expect(fieldProvenance(configuration,'missing')).toBeUndefined();
});
