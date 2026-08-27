export interface PrepareVisualReconstructionOptions {
  scene_id: string;
  scene_root: string;
  video: string;
  user_frame: string;
  opening_frame: string;
  triview_manifest: string;
}

export function prepareVisualReconstruction(options: PrepareVisualReconstructionOptions): Promise<{
  outputPath: string;
  videoTarget: string;
  userFrameTarget: string;
  contactSheetPath: string;
  draft: {
    motionReference: { token: "@视频1" };
    supplementalTriviews: readonly { token: string }[];
  };
}>;
