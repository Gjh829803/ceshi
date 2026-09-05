export function canOpenNativeRecording(world) {
  return world.sceneSourceKind === "babylon-native" && world.productionOutcome === "passed" &&
    world.publicationOutcome === "published" && Boolean(world.nativeLaunch);
}

export function wireNativeRecordingAction(root, sceneId) {
  const button = root.querySelector("[data-native-recording]");
  if (!button || button.dataset.wired === "true") return;
  button.dataset.wired = "true";
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "正在准备录制页…";
    try {
      const response = await fetch(`/api/worlds/${encodeURIComponent(sceneId)}/recording-preview`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "录制页启动失败");
      const url = new URL(payload.url);
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
          url.username || url.password) throw new Error("录制页地址无效");
      if (!button.isConnected) return;
      const link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "进入录制与视频生成 ↗";
      button.replaceWith(link);
    } catch (error) {
      if (!button.isConnected) return;
      button.textContent = `重试录制页 · ${error instanceof Error ? error.message : String(error)}`;
      button.disabled = false;
    }
  });
}
