export interface StyledOpeningFramePanelV1 {
  dispose(): void;
}

export function styledOpeningFrameUrlV1(sceneId: string): string {
  return `/api/worlds/${encodeURIComponent(sceneId)}/deliverables/styled-opening-frame`;
}

export function installStyledOpeningFramePanelV1({
  root,
  sceneId,
}: {
  root: HTMLElement;
  sceneId: string;
}): StyledOpeningFramePanelV1 {
  const imageUrl = styledOpeningFrameUrlV1(sceneId);
  root.hidden = true;
  root.innerHTML = `<section class="styled-opening-panel" aria-labelledby="styled-opening-title">
    <header class="styled-opening-heading">
      <div><p class="eyebrow">FINAL LOOK</p><h2 id="styled-opening-title">最终样式首帧</h2></div>
      <a href="${imageUrl}" target="_blank" rel="noreferrer">查看原图 ↗</a>
    </header>
    <a class="styled-opening-preview" href="${imageUrl}" target="_blank" rel="noreferrer">
      <img alt="当前世界最终样式首帧" decoding="async" />
    </a>
    <p>白膜锁定空间与镜头，用户参考锁定主体、材质、风格和灯光。</p>
  </section>`;

  const image = root.querySelector<HTMLImageElement>("img");
  if (image === null) throw new Error("WORLDKIT_STYLED_OPENING_PANEL_IMAGE_MISSING");
  let disposed = false;
  const show = () => {
    if (!disposed) root.hidden = false;
  };
  const hide = () => {
    if (!disposed) root.hidden = true;
  };
  image.addEventListener("load", show);
  image.addEventListener("error", hide);
  image.src = imageUrl;
  if (image.complete) {
    if (image.naturalWidth > 0) show();
    else hide();
  }

  return {
    dispose() {
      disposed = true;
      image.removeEventListener("load", show);
      image.removeEventListener("error", hide);
    },
  };
}
