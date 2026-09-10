import * as T from 'three';
import { GRAND_PRIX, START_FINISH } from './grand-prix';
import type { EnvironmentDefinition } from './types';

/** Race-specific batching keeps a large track from adding hundreds of draws. */
export function buildGrandPrixVisuals(map: EnvironmentDefinition) {
  const root = new T.Group(); root.name = 'grand-prix-track';
  const geometries: T.BufferGeometry[] = [], materials: T.Material[] = [], instances: T.InstancedMesh[] = [];
  const unit = new T.BoxGeometry(1, 1, 1); geometries.push(unit);
  const groups = new Map<string, typeof map.boxes[number][]>();
  for (const box of map.boxes) { const color = box.color ?? '#dce1df', group = groups.get(color) ?? []; group.push(box); groups.set(color, group); }
  for (const [color, boxes] of groups) {
    const material = new T.MeshStandardMaterial({ color, roughness: .95 }); materials.push(material);
    const mesh = new T.InstancedMesh(unit, material, boxes.length), dummy = new T.Object3D();
    mesh.name = 'gp-collision-geometry'; mesh.receiveShadow = true;
    boxes.forEach((box, i) => { dummy.position.set(...box.position); dummy.scale.set(...box.size); dummy.rotation.set(...(box.rotation ?? [0, 0, 0])); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.computeBoundingSphere(); instances.push(mesh); root.add(mesh);
  }
  const vertices: number[] = [], colors: number[] = [];
  function face(a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3, color: string) {
    const rgb = new T.Color(color);
    for (const p of [a, b, c, a, c, d]) { vertices.push(p.x, p.y, p.z); colors.push(rgb.r, rgb.g, rgb.b); }
  }
  function quad(a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3, color: string, y: number) {
    face(a.clone().setY(y), b.clone().setY(y), c.clone().setY(y), d.clone().setY(y), color);
  }
  const samples = GRAND_PRIX.samples;
  function ribbon(inner: number, outer: number, y: number, color: string, alternate?: string) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!, b = samples[i + 1]!;
      quad(a.position.clone().addScaledVector(a.normal, inner), b.position.clone().addScaledVector(b.normal, inner), b.position.clone().addScaledVector(b.normal, outer), a.position.clone().addScaledVector(a.normal, outer), alternate && i % 2 ? alternate : color, y);
    }
  }
  ribbon(-28, 28, .012, '#aebbb7');
  ribbon(-9, 9, .022, '#48535a');
  for (const side of [-1, 1]) {
    ribbon(side * 9, side * 10.6, .026, '#ebede8', '#bf635a');
    ribbon(side * 8.7, side * 9, .032, '#f4f1df');
  }
  // Pit apron and entry/exit lanes, all flush painted onto the same ground.
  const p = (x: number, z: number) => new T.Vector3(x, 0, z);
  quad(p(-590, -370), p(-590, -90), p(-536, -90), p(-536, -370), '#77858a', .022);
  quad(p(-627, -445), p(-583, -335), p(-569, -341), p(-613, -451), '#77858a', .023);
  quad(p(-583, -125), p(-627, 25), p(-613, 31), p(-569, -119), '#77858a', .023);
  // Chequered timing line is a visual landmark, not a lap-timer promise.
  for (let x = 0; x < 12; x++) for (let z = 0; z < 2; z++) {
    const left = START_FINISH.x - 9 + x * 1.5, back = START_FINISH.z - 1.5 + z * 1.5;
    quad(p(left, back), p(left, back + 1.5), p(left + 1.5, back + 1.5), p(left + 1.5, back), (x + z) % 2 ? '#eef0e8' : '#29363d', .04);
  }
  // Direction arrows and grid slots communicate direction on a wide road.
  for (const z of [-460, -200, 60]) {
    quad(p(-620.3, z - 5), p(-620.3, z + 3), p(-619.7, z + 3), p(-619.7, z - 5), '#f4f1df', .04);
    quad(p(-622, z + 1), p(-620, z + 5), p(-618, z + 1), p(-620, z + 2), '#f4f1df', .04);
  }
  for (const { x, z } of START_FINISH.grid) {
    // Open-backed grid boxes: a 3.6 m front line and two 5 m side lines.
    quad(p(x - 1.8, z), p(x - 1.8, z + .25), p(x + 1.8, z + .25), p(x + 1.8, z), '#f4f1df', .04);
    for (const side of [-1, 1]) {
      const edge = x + side * 1.8;
      quad(p(edge - .125, z - 5), p(edge - .125, z), p(edge + .125, z), p(edge + .125, z - 5), '#f4f1df', .04);
    }
  }
  // Checker panels flank the title on both faces of the start/finish gantry.
  for (const side of [-1, 1]) for (const front of [-1, 1]) for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++) {
    const x = START_FINISH.x + side * 13 - 1.8 + col * .9, y = 8.8 + row * .9, z = START_FINISH.z + front * .705;
    face(new T.Vector3(x,y,z),new T.Vector3(x+.9,y,z),new T.Vector3(x+.9,y+.9,z),new T.Vector3(x,y+.9,z),(col+row)%2?'#29363d':'#eef0e8');
  }
  // Five pairs of static red lenses identify the starting-light hardware.
  const lensGeometry = new T.CircleGeometry(.3, 20); geometries.push(lensGeometry);
  const lensMaterial = new T.MeshBasicMaterial({ color: '#bc433c' }); materials.push(lensMaterial);
  const lenses = new T.InstancedMesh(lensGeometry, lensMaterial, 10), lens = new T.Object3D();
  lenses.name = 'gp-start-light-lenses:collision-false';
  for (let col = 0; col < 5; col++) for (let row = 0; row < 2; row++) {
    lens.position.set(START_FINISH.x + (col - 2) * 1.8, 7.5 + row * .8, START_FINISH.z - .33);
    lens.rotation.y = Math.PI; lens.updateMatrix(); lenses.setMatrixAt(col * 2 + row, lens.matrix);
  }
  lenses.computeBoundingSphere();root.add(lenses);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometries.push(geometry);
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: T.DoubleSide }); materials.push(material);
  const paint = new T.Mesh(geometry, material); paint.name = 'gp-road-paint:collision-false'; paint.receiveShadow = true; root.add(paint);
  return { root, solids: instances as T.Object3D[], dispose() { root.removeFromParent(); lenses.dispose(); instances.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear(); } };
}
