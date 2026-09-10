# Optional humanoid attachments

`HumanoidCharacter` exposes rigid visual slots after loading Source101:
`head`, `back`, `handLeft`, `handRight`, `footLeft`, `footRight`.
`attachmentPoints` lists the available slots.
They follow the existing animated skeleton and display interpolation without
another update loop. Slot axes are calibrated once when the source is adopted
(+Y up, +Z forward). Source101 has already sampled its initial idle frame at this
point; this is the attachment reference pose, not the mesh skinning bind pose.
Offsets use model-local metres before actor scaling; children inherit their
character's scale. The head anchor is above the head bone; the back anchor is
behind the upper spine. Hand anchors start at the hand bones; foot anchors start
at the ankle bones (`foot_l`, `foot_r`), with toes extending along reference +Z.
These presets target Source101. Custom rigs require compatible bone names, units
and a validated initial reference pose; this API does not perform retargeting.

```ts
const character = new HumanoidCharacter();
const world = await createHumanoidWorld({ scene, camera, canvas, map, character });
const detach = character.attach('head', hat, {
  positionMetersXYZ: [0, 0.02, 0],
  rotationRadiansXYZ: [0, 0, 0],
  scale: 1,
});
// Later:
detach(); // Idempotent. The object is unparented and can be reused.
```

Use an unparented object. Its own local transform is preserved; the optional
transform is applied by a separate mount node. Multiple objects can share a slot.
Invalid slots/transforms and ancestor cycles fail before changing the hierarchy.

The caller owns attachment geometry, materials and textures. Character/world
shutdown detaches accessories before releasing the source model; release your
accessory resources separately. Reset and movement/mount changes retain attachments.

These are cosmetic attachments. A hand-held visual does not make the character
carry an interactive object or change empty-hand skill eligibility. Use the existing
pickup/put-down system for gameplay objects. Grip poses, two-handed IK, accessory
colliders and cloth simulation are outside this API. Foot attachments do not
change ground contact or add foot IK. Rideable boards remain vehicles with their
own movement and rider anchors.

Playground: open **人物装备**. Rotate/zoom the independent model preview, select a body slot or marker, then equip or remove its sample. All accessories start unequipped. These local previews
are not persisted into `project.json` or an Episode delivery; durable attachments
must be authored into the scene source. Agent tools/default generation remain unchanged.
