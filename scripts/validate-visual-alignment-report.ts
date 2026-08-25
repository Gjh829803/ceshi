import { readFile } from "node:fs/promises";

import {
  validateVisualAlignmentReportV1,
  type VisualAlignmentReportV1,
} from "@whitebox-world/runtime-contracts";

const reportPath = process.argv[2];
const sceneId = process.argv[3];
if (reportPath === undefined || sceneId === undefined) throw new Error("Usage: <report-path> <scene-id>");
const report = JSON.parse(await readFile(reportPath, "utf8")) as VisualAlignmentReportV1;
if (report.sceneId !== sceneId) throw new Error("Visual alignment report sceneId is invalid.");
const errors = validateVisualAlignmentReportV1(report);
if (errors.length > 0) throw new Error(errors.join("\n"));
process.stdout.write("ok\n");
