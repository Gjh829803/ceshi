import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ThreeCreatorTools } from '../../src/tools/tools.js';

const root = path.resolve('.codex-tmp/three-creator-smoke/triview-orientation'); await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'index.html'), '<html><head></head><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
const source = (semanticYaw: number | null) => `import * as THREE from 'three';
const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,0.1,100);camera.position.set(4,3,7);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer();renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const parent=new THREE.Group();parent.rotation.set(-0.28,0.91,0.19);scene.add(parent);
const specimen=new THREE.Mesh(new THREE.BoxGeometry(1,2,0.6),[0x00ff00,0xffff00,0xff00ff,0x00ffff,0x0000ff,0xff0000].map(color=>new THREE.MeshBasicMaterial({color})));specimen.rotation.set(0.23,-0.37,-0.16);parent.add(specimen);
const render=()=>renderer.render(scene,camera);window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,controlledObject:specimen,targets:{specimen},${semanticYaw === null ? '' : `targetFrontYawRadiansById:{specimen:${semanticYaw}},`}startLive:render,stopLive:()=>{},reset:render};render();`;
const cases = [
  { id: 'default-local-minus-z', semanticYaw: null, override: undefined, expected: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] },
  { id: 'entity-yaw-through-player-alias', semanticYaw: Math.PI / 2, override: undefined, expected: [[255, 255, 0], [255, 0, 0], [0, 255, 0]] },
  { id: 'explicit-local-yaw-override', semanticYaw: Math.PI / 2, override: 0, expected: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] },
];
const service = new ThreeCreatorTools(root, 'three-raw'), results = [];
try {
  for (const test of cases) {
    await writeFile(path.join(root, 'main.ts'), source(test.semanticYaw)); const result = await service.preview('entity-triview', ['player'], test.override);
    const pixels = []; for (let panel = 0; panel < 3; panel++) { const bytes = await sharp(result.image.path).extract({ left: panel * 512 + 256, top: 320, width: 1, height: 1 }).removeAlpha().raw().toBuffer(); pixels.push([...bytes]); }
    if (JSON.stringify(pixels) !== JSON.stringify(test.expected)) throw new Error(`${test.id}: expected front/right/back RGB ${JSON.stringify(test.expected)}, observed ${JSON.stringify(pixels)}`);
    results.push({ id: test.id, status: 'passed', expectedPanelRgb: test.expected, actualPanelRgb: pixels, capture: result });
  }
  await writeFile(path.join(root, 'triview-orientation-report.json'), JSON.stringify({ status: 'passed', cases: results }, null, 2));
  process.stdout.write(`${JSON.stringify({ status: 'passed', cases: results.length, report: path.join(root, 'triview-orientation-report.json') }, null, 2)}\n`);
} finally { await service.close(); }
