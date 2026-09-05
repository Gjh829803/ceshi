import assert from "node:assert/strict";
import test from "node:test";
import { canOpenNativeRecording, wireNativeRecordingAction } from "../public/native-recording-action.js";

test("Native recording action uses published whitebox availability, not styled or strict success", () => {
  const world = { sceneSourceKind: "babylon-native", productionOutcome: "passed",
    publicationOutcome: "published", nativeLaunch: { command: "existing-command" },
    styledOpeningFrameStatus: "failed", strictDiagnosticOutcome: "failed" };
  assert.equal(canOpenNativeRecording(world), true);
  for (const patch of [{ sceneSourceKind: "canonical" }, { productionOutcome: "failed" },
    { publicationOutcome: "not-published" }, { nativeLaunch: null }]) {
    assert.equal(canOpenNativeRecording({ ...world, ...patch }), false);
  }
});

for (const outcome of ["ready", "failed", "closed", "invalid-url"]) {
  test(`Native recording page action ${outcome} uses one explicit POST and no automatic popup`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    let clicked;
    let replaced;
    let calls = 0;
    const button = { dataset: {}, disabled: false, isConnected: true,
      addEventListener: (_type, handler) => { clicked = handler; },
      replaceWith: link => { replaced = link; },
    };
    globalThis.document = { createElement: () => ({}) };
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "/api/worlds/palace/recording-preview");
      assert.deepEqual(options, { method: "POST" });
      if (outcome === "closed") button.isConnected = false;
      return { ok: outcome !== "failed", json: async () => ({ error: "stale Package",
        url: outcome === "invalid-url" ? "https://external.example/path" : "http://127.0.0.1:5000/?hosted=1" }) };
    };
    try {
      const root = { querySelector: () => button };
      wireNativeRecordingAction(root, "palace");
      const firstHandler = clicked;
      wireNativeRecordingAction(root, "palace");
      assert.equal(clicked, firstHandler);
      const pending = clicked();
      await clicked();
      await pending;
      assert.equal(calls, 1);
      if (outcome === "ready") {
        assert.equal(replaced.href, "http://127.0.0.1:5000/?hosted=1");
        assert.equal(replaced.rel, "noreferrer");
      } else {
        assert.equal(replaced, undefined);
        if (outcome !== "closed") assert.equal(button.disabled, false);
      }
    } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument; }
  });
}
