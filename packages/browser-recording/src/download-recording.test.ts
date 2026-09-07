import { afterEach, expect, it, vi } from "vitest";
import { downloadRecording } from "./download-recording.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("retains the original filename, exact Blob and delayed object URL release", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T01:02:03.000Z"));
  const link = { download: "", href: "", hidden: false, click: vi.fn(), remove: vi.fn() };
  const append = vi.fn(); const createObjectURL = vi.fn(() => "blob:original"); const revokeObjectURL = vi.fn();
  const setTimeout = vi.fn();
  vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { append } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL }); vi.stubGlobal("window", { setTimeout });
  const blob = new Blob(["unchanged bytes"]);
  expect(downloadRecording(blob, "webm", "palace")).toBe("palace-gameplay-2026-09-06T01-02-03.000Z.webm");
  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(link).toMatchObject({ href: "blob:original", hidden: true });
  expect(link.click).toHaveBeenCalledOnce(); expect(link.remove).toHaveBeenCalledOnce();
  expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  setTimeout.mock.calls[0]![0]();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:original");
  expect(downloadRecording(blob, "mp4")).toMatch(/^whitebox-world-gameplay-.*\.mp4$/);
});
