import assert from "node:assert/strict";
import test from "node:test";

import { selectCloudBatchCases } from "./run-worldkit-cloud-scene-batch.mjs";

test("selects exactly the requested non-duplicate integrity-clean test cases", () => {
  const record = {
    images: [
      { id: "image-001", fileName: "images/1.png", duplicateOf: null, integrityError: null },
      { id: "image-002", fileName: "images/2.png", duplicateOf: "image-001", integrityError: null },
      { id: "image-003", fileName: "images/3.png", duplicateOf: null, integrityError: "bad hash" },
      { id: "image-004", fileName: "images/4.png", duplicateOf: null, integrityError: null },
      { id: "image-005", fileName: "images/5.png", duplicateOf: null, integrityError: null },
    ],
  };
  assert.deepEqual(
    selectCloudBatchCases(record, { count: 2, offset: 1 }).map((image) => image.id),
    ["image-004", "image-005"],
  );
  assert.throws(() => selectCloudBatchCases(record, { count: 4 }), /only 3/);
});
