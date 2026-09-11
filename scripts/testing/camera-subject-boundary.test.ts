import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { expect, it } from 'vitest';

const sdk = new URL('../../packages/three-world/src/', import.meta.url);
const forbiddenCalls = new Set(['addEventListener', 'requestAnimationFrame', 'setTimeout', 'setInterval']);
const cameraTypes = new Set(['Camera', 'PerspectiveCamera', 'OrthographicCamera']);
const cameraBindings = new Set(['camera', 'mainCamera', 'activeCamera']);

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('subject.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node); node.forEachChild(child => walk(child, visit));
}
function name(node: ts.Node): string | undefined {
  return (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
}

/** Deliberately scoped to adapters; authoring and camera owners may write cameras. */
function adapterViolations(source: string): { adapters: number; violations: string[] } {
  const file = parse(source), variables = new Map<string, ts.Expression>(), adapterBodies: ts.Node[] = [];
  walk(file, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer);
  });
  walk(file, node => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'ThreeCameraRig') {
      let adapter = node.arguments?.[2];
      if (adapter && ts.isIdentifier(adapter)) adapter = variables.get(adapter.text);
      if (!adapter || !ts.isObjectLiteralExpression(adapter)) throw new Error('Camera subject adapter must have an inspectable object declaration');
      adapterBodies.push(adapter);
    }
  });
  // Humanoid sampling and collider exclusions are delegated from its adapter.
  walk(file, node => {
    if (ts.isMethodDeclaration(node) && node.body && ['sampleCameraSubject', 'adaptSubjectCollision'].includes(name(node.name) ?? '')) adapterBodies.push(node.body);
  });
  const violations: string[] = [];
  for (const body of adapterBodies) walk(body, node => {
    if (ts.isIdentifier(node) && (cameraTypes.has(node.text) || cameraBindings.has(node.text))) violations.push(`camera ownership: ${node.text}`);
    if (ts.isCallExpression(node)) {
      const called = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : name(node.expression);
      if (called && forbiddenCalls.has(called)) violations.push(`execution ownership: ${called}`);
    }
  });
  return { adapters: adapterBodies.length, violations };
}

it('keeps camera subject declarations limited to readonly subject and collision data', () => {
  const file = parse(readFileSync(new URL('camera-subject.ts', sdk), 'utf8'));
  const adapters = file.statements.filter((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === 'CameraSubjectAdapter');
  expect(adapters).toHaveLength(1);
  const adapter = adapters[0]!;
  expect(ts.isTypeReferenceNode(adapter.type) && adapter.type.typeName.getText(file)).toBe('Readonly');
  const forbidden: string[] = [];
  walk(file, node => { if (ts.isIdentifier(node) && (cameraTypes.has(node.text) || cameraBindings.has(node.text))) forbidden.push(node.text); });
  expect(forbidden).toEqual([]);
});

it('keeps actual ordinary and Humanoid subject adapters free of camera, input and clock ownership', () => {
  const paths = ['engine.ts', 'humanoid-runtime/camera.ts', 'humanoid-runtime/runtime.ts'];
  let adapters = 0;
  for (const path of paths) {
    const result = adapterViolations(readFileSync(new URL(path, sdk), 'utf8'));
    adapters += result.adapters;
    expect(result.violations, fileURLToPath(new URL(path, sdk))).toEqual([]);
  }
  // Two real adapters plus the Humanoid data and collision providers.
  expect(adapters).toBeGreaterThanOrEqual(4);
});

it('catches camera writes and private execution in adapters without forbidding authored cameras', () => {
  const legal = `
    camera.position.set(1, 2, 3);
    const subject = { sample: id => ({ id, positionWorldMetersXYZ: [0, 1, 0] }) };
    new ThreeCameraRig(camera, cast, subject);
  `;
  expect(adapterViolations(legal)).toEqual({ adapters: 1, violations: [] });
  for (const statement of [
    'camera.position.set(1, 2, 3);',
    'this.mainCamera.quaternion.copy(rotation);',
    'canvas.addEventListener("keydown", callback);',
    'requestAnimationFrame(callback);',
    'setInterval(callback, 16);',
  ]) {
    const source = `new ThreeCameraRig(camera, cast, { sample(id) { ${statement} return undefined; } });`;
    expect(adapterViolations(source).violations, statement).not.toEqual([]);
  }
});
