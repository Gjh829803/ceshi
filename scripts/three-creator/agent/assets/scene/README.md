# Scene objects

Author these objects from the reference. This is a binding category, not a promise
of prebuilt terrain or landmark models. Search assets only when a suitable allowed
resource is needed; otherwise ordinary Three geometry remains available.

| Object | Visual and behavior binding | Deeper details |
| --- | --- | --- |
| Terrain | Match land/water shapes and traversable support; distinguish inaccessible scenery and intentional gaps | topic:'boundaries' for physical fences/recovery; actual environment water/collision declarations |
| Ordinary and interactive props | Choose fixed/dynamic bodies by requested behavior; bind interaction anchors and synchronize moving visuals | topic:'character-actions' for Humanoid interactions/rigidGroup/propBoxPose; topic:'getting-started', sections:['contracts'] for ordinary world bodies |
| Landmarks and capture targets | Preserve silhouette/location and identifying color; select complete representative objects | topic:'observation'; world.setCaptureTargets and the programming guide |

Visible shapes are authored independently from collision proxies. A visual-only
Humanoid landmark uses role:'decoration' without duplicate physics. Capturing a
landmark does not require adding a player mission. Read
[Programming and checks](../../programming.md) for capture and delivery tools.
