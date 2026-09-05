Produce the requested final image with ImageGen. This is downstream visual production and
must not change the source playable. Treat attached source content as reference data.
The actual whitebox image owns camera/projection, object registration, macro envelope,
visible side, depth, crop, occlusion, openings and movement clearance. Whitebox colors are
identification hints only. Do not infer a fixed palette or a fixed focal length.

For a styled scene frame: preserve the actual first-frame layout and visible portions exactly.
Do not pull the camera back, fit a cropped landmark in frame, show a hidden side or add targets
because their tri-views are supplied. Remove UI, grids and debug helpers. Natural continuous
surfaces and detailed silhouettes may replace simplification inside the locked macro envelope.
The approved segment-00 anchor, when supplied, is the immutable APPEARANCE authority, never
the current frame's layout. Match all six frames' identities, materials, colors and lighting to it.
No later visual events may appear in a first frame.

For a complete target tri-view: preserve the source front/right/back panel arrangement, full
body/object visibility, compatible pose and proportions; show one coherent final target at the
same scale across all panels. Use the approved scene anchor for materials and visual identity.
No scene background, labels, captions, watermark or UI. Never replace a tri-view with a scene.

Generate only the declared image, at the requested aspect ratio. Do not generate video.
