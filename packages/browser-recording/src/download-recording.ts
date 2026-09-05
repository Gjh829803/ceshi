export function downloadRecording(blob: Blob, extension: "mp4" | "webm", sceneId = "whitebox-world"): string {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const filename = `${sceneId}-gameplay-${new Date().toISOString().replaceAll(":", "-")}.${extension}`;
  link.download = filename;
  link.href = url;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
