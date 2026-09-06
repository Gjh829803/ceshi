import * as THREE from 'three';

// Case-repair adapter: SDK owns the original G-bot skeleton, clips and clock.
// The custom clothing/limbs remain ordinary visual descendants of its actor.
export function bindGbotVisualMotion(asset, visual, {legs, knees, arms, elbows}) {
  const actor = asset.object;
  const bones = new Map();
  const retired = [];
  actor.traverse(node => {
    bones.set(node.name.replace(/[^a-zA-Z0-9]/g, ''), node);
    if (node.isMesh) retired.push(node);
  });
  for (const mesh of retired) mesh.removeFromParent();
  actor.add(visual);
  const bone = name => {
    const value = bones.get('mixamorig' + name);
    if (!value) throw new Error('GBOT_MOTION_BONE_MISSING: ' + name);
    return value;
  };
  const bindings = [];
  actor.updateWorldMatrix(true,true);
  for (let i = 0; i < 2; i++) {
    const actorLocalHip = actor.worldToLocal(legs[i].getWorldPosition(new THREE.Vector3()));
    const side = actorLocalHip.x < 0 ? 'Left' : 'Right';
    for (const [joint, endpoint, from, to] of [
      [legs[i], knees[i].position.clone(), 'UpLeg', 'Leg'],
      [knees[i], new THREE.Vector3(0, -1, 0), 'Leg', 'Foot'],
      [arms[i], elbows[i].position.clone(), 'Arm', 'ForeArm'],
      [elbows[i], new THREE.Vector3(0, -1, 0), 'ForeArm', 'Hand'],
    ]) bindings.push({joint, axis: endpoint.normalize(), from: bone(side + from), to: bone(side + to)});
  }
  const rest = bindings.map(({joint}) => ({joint, quaternion: joint.quaternion.clone()}));
  const originalPosition = visual.position.clone();
  const rootInverse = new THREE.Matrix4(), parentInverse = new THREE.Quaternion();
  const from = new THREE.Vector3(), direction = new THREE.Vector3(), corner = new THREE.Vector3();
  // Bounds in each knee's local frame, computed before it ever animates.
  const soles = knees.map(knee => {
    knee.updateWorldMatrix(true, true);
    const inverse = knee.matrixWorld.clone().invert(), bounds = new THREE.Box3();
    knee.traverse(node => {
      if (!node.isMesh) return;
      node.geometry.computeBoundingBox();
      const b = node.geometry.boundingBox;
      for (const x of [b.min.x,b.max.x]) for (const y of [b.min.y,b.max.y]) for (const z of [b.min.z,b.max.z])
        bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(node.matrixWorld).applyMatrix4(inverse));
    });
    return {knee, points: [bounds.min.x,bounds.max.x].flatMap(x => [bounds.min.y,bounds.max.y].flatMap(y => [bounds.min.z,bounds.max.z].map(z => new THREE.Vector3(x,y,z))))};
  });
  let activated = false;
  function reset() {
    activated = false;
    visual.position.copy(originalPosition);
    for (const {joint,quaternion} of rest) joint.quaternion.copy(quaternion);
  }
  function update(motion) {
    const velocity = motion?.velocityWorldMetersPerSecondXYZ ?? [0,0,0];
    const grounded = motion?.isGrounded ?? true;
    activated ||= Math.hypot(velocity[0],velocity[2]) > .1 || velocity[1] > .3;
    if (!activated) return;
    actor.updateWorldMatrix(true, true);
    for (const binding of bindings) {
      binding.from.getWorldPosition(from);
      binding.to.getWorldPosition(direction).sub(from).normalize();
      binding.joint.parent.getWorldQuaternion(parentInverse).invert();
      direction.applyQuaternion(parentInverse);
      binding.joint.quaternion.setFromUnitVectors(binding.axis, direction);
      binding.joint.updateWorldMatrix(false, true);
    }
    visual.position.y = originalPosition.y;
    if (grounded) {
      actor.updateWorldMatrix(true,true); rootInverse.copy(actor.matrixWorld).invert();
      let lowest = Infinity;
      for (const {knee,points} of soles) for (const point of points)
        lowest = Math.min(lowest,corner.copy(point).applyMatrix4(knee.matrixWorld).applyMatrix4(rootInverse).y);
      // Cosmetic sole offset only. Ground support and actor height come from SDK physics.
      visual.position.y += .015 - lowest;
    }
  }
  return {update,reset,actor};
}
