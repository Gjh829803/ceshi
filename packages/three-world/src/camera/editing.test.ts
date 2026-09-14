import * as THREE from 'three';
import { describe, it, expect, vi } from 'vitest';
import { createWorld } from '../world';
import type { CameraDocument } from '../config/camera/index';
function document(distance = 4): CameraDocument { return { kind: 'world-camera', schemaVersion: 1, defaultViewId: 'third', binding: { targetEntityId: 'actor' }, activation: 'immediate', input: { cycleViewIds: ['third', 'shoulder'] }, views: { third: { kind: 'third-person', overrides: { position: { distanceMeters: distance }, orientation: { recenter: { enabled: false } } } }, shoulder: { kind: 'shoulder' } } }; }
async function fixture() { const world = await createWorld({ navigation: false }); world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 }, eyePositionLocalMetersXYZ: [0, 1.6, 0] }); world.setControlledEntity('actor'); world.setCameraFollow({ configuration: document() }); world.step({}, 0); return world; }
describe('World camera editing sessions', () => {
    it('resumes automatic selection without losing the original cancel checkpoint', async () => {
        const world = await fixture();
        try {
            const original = {...document(), viewSelection: {rules: []}};
            world.setCameraFollow({configuration: original});
            const before = world.inspectCamera(), edit = world.beginCameraEdit();
            edit.applyDraft({...document(6), viewSelection: {rules: []}}, before.configurationRevision);
            expect(world.inspectCamera().viewSelection?.suspendedBy).toBe('editing');
            edit.resumeViewSelection();
            expect(world.inspectCamera().viewSelection?.suspendedBy).toBeUndefined();
            edit.cancel();
            expect(world.inspectCamera().document).toEqual(original);
            expect(world.inspectCamera().intent).toEqual(before.intent);
        } finally { world.dispose(); }
    });
    it('rejects cancel after an external configuration and reports its current revision', async () => {
        const world = await fixture();
        try {
            const edit = world.beginCameraEdit();
            edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
            world.setCameraFollow({ configuration: document(8) });
            const current = world.inspectCamera();
            expect(() => edit.cancel()).toThrow();
            expect(world.inspectCamera()).toEqual(current);
            expect(() => edit.applyDraft(document(5), current.configurationRevision)).toThrow();
        }
        finally {
            world.dispose();
        }
    });
    it('restores an untouched checkpoint with monotonic revisions and idempotent cancellation', async () => {
        const world = await fixture();
        try {
            const base = world.inspectCamera(), edit = world.beginCameraEdit();
            const applied = edit.applyDraft(document(6), base.configurationRevision);
            expect(applied.configurationRevision).toBeGreaterThan(base.configurationRevision);
            edit.cancel();
            const restored = world.inspectCamera();
            expect(restored.document).toEqual(base.document);
            expect(restored.intent).toEqual(base.intent);
            expect(restored.current?.positionWorldMetersXYZ).toEqual(base.current?.positionWorldMetersXYZ);
            expect(restored.configurationRevision).toBeGreaterThan(applied.configurationRevision);
            expect(restored.cameraCommitRevision).toBeGreaterThan(applied.cameraCommitRevision);
            edit.cancel();
            expect(world.inspectCamera()).toEqual(restored);
            expect(() => edit.applyDraft(document(), restored.configurationRevision)).toThrow();
        }
        finally {
            world.dispose();
        }
    });
    it('rebases cancel after baseline commit and reset restores that camera without changing actor baseline', async () => {
        const world = await fixture();
        try {
            const initial = new THREE.Vector3(...world.getEntityState('actor').positionWorldMetersXYZ).clone(), edit = world.beginCameraEdit();
            edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
            world.step({ moveZRatio: -1 }, 4);
            edit.commitBaseline(world.inspectCamera().configurationRevision);
            const base = world.inspectCamera();
            edit.applyDraft(document(8), base.configurationRevision);
            edit.cancel();
            expect(world.inspectCamera().document).toEqual(base.document);
            await world.reset();
            expect(world.inspectCamera().intent?.distanceMeters).toBe(6);
            expect(new THREE.Vector3(...world.getEntityState('actor').positionWorldMetersXYZ).distanceTo(initial)).toBeLessThan(.001);
        }
        finally {
            world.dispose();
        }
    });
    it('undoes configuration while preserving later movement, orbit, zoom and selected view', async () => {
        const world = await fixture();
        try {
            const base = world.inspectCamera(), edit = world.beginCameraEdit();
            edit.applyDraft(document(6), base.configurationRevision);
            world.setCameraView('shoulder');
            world.step({ cameraYawRatio: .5, moveZRatio: -1 }, 3);
            const later = world.inspectCamera(), position = new THREE.Vector3(...world.getEntityState('actor').positionWorldMetersXYZ).clone();
            edit.cancel();
            expect(world.inspectCamera().resolved?.viewId).toBe('shoulder');
            expect(world.inspectCamera().intent).toEqual(later.intent);
            expect(world.inspectCamera().document).toEqual(base.document);
            expect(new THREE.Vector3(...world.getEntityState('actor').positionWorldMetersXYZ)).toEqual(position);
        }
        finally {
            world.dispose();
        }
    });
    it('preserves later active-view distance even when undo removes an explicit distance edit', async () => {
        const world = await fixture();
        try {
            const edit = world.beginCameraEdit();
            edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
            world.step({ cameraYawRatio: .5 }, 2);
            const intent = world.inspectCamera().intent;
            edit.cancel();
            expect(world.inspectCamera().intent).toEqual(intent);
            expect(world.inspectCamera().document).toEqual(document());
        }
        finally {
            world.dispose();
        }
    });
    it('invalidates sessions on reset and dispose never rolls back', async () => {
        const world = await fixture();
        try {
            const edit = world.beginCameraEdit();
            edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
            edit.dispose();
            edit.dispose();
            expect(world.inspectCamera().intent?.distanceMeters).toBe(6);
            const stale = world.beginCameraEdit();
            await world.reset();
            expect(() => stale.cancel()).toThrow();
            expect(() => stale.applyDraft(document(8), world.inspectCamera().configurationRevision)).toThrow();
        }
        finally {
            world.dispose();
        }
    });
    it('rejects a changed baseline identity even when configuration has not changed', async () => {
        const world = await fixture();
        try {
            const a = world.beginCameraEdit(), b = world.beginCameraEdit();
            b.commitBaseline(world.inspectCamera().configurationRevision);
            expect(() => a.cancel()).toThrow();
            expect(() => a.commitBaseline(world.inspectCamera().configurationRevision)).toThrow();
        }
        finally {
            world.dispose();
        }
    });
});
describe('opening drafts', () => {
    it('targets an explicit view, transforms a played camera back to initial reference and never applies', async () => {
        const world = await fixture();
        try {
            const edit = world.beginCameraEdit();
            world.step({ moveZRatio: -1 }, 5);
            const before = world.inspectCamera(), position = world.getEntityState('actor').positionWorldMetersXYZ;
            const draft: CameraDocument = { ...document(), views: { ...document().views, opening: { kind: 'third-person', overrides: { framing: { kind: 'preserve-opening' } } } } };
            const result = edit.createOpeningDraft(draft, { viewId: 'opening', opening: { positionWorldMetersXYZ: [position[0] + 2, position[1] + 3, position[2] + 8], lookAtWorldMetersXYZ: [position[0], position[1] + 1, position[2]], fovDegrees: 47 } });
            expect(result.views.third).toEqual(draft.views.third);
            expect(result.views.opening).toMatchObject({ opening: { positionWorldMetersXYZ: [2, 3, 8], lookAtWorldMetersXYZ: [0, 1, 0], fovDegrees: 47 } });
            expect(Object.isFrozen(result)).toBe(true);
            expect(world.inspectCamera()).toEqual(before);
            const current = edit.createOpeningDraft(draft, { viewId: 'opening' });
            expect(current.views.opening!.kind).toBe('third-person');
            expect(world.inspectCamera()).toEqual(before);
        }
        finally {
            world.dispose();
        }
    });
    it('rejects unsupported views, missing references and stale sessions without mutation', async () => {
        const world = await fixture();
        try {
            const edit = world.beginCameraEdit(), before = world.inspectCamera();
            expect(() => edit.createOpeningDraft(document(), { viewId: 'third' })).toThrow();
            expect(() => edit.createOpeningDraft(document(), { viewId: 'missing' })).toThrow();
            expect(world.inspectCamera()).toEqual(before);
            await world.reset();
            expect(() => edit.createOpeningDraft(document(), { viewId: 'third' })).toThrow();
        }
        finally {
            world.dispose();
        }
    });
});
it('rejects baseline commit after retarget and accepts a fresh session after valid reset', async () => {
    const world = await fixture();
    try {
        const edit = world.beginCameraEdit();
        world.addCharacter({ id: 'other', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        edit.applyDraft({ ...document(), binding: { targetEntityId: 'other' } }, world.inspectCamera().configurationRevision);
        const before = world.inspectCamera();
        expect(() => edit.commitBaseline(before.configurationRevision)).toThrow();
        expect(world.inspectCamera()).toEqual(before);
        await world.reset();
        const fresh = world.beginCameraEdit();
        expect(() => fresh.commitBaseline(world.inspectCamera().configurationRevision)).not.toThrow();
    }
    finally {
        world.dispose();
    }
});
it('rejects config-only undo when the later view or distance cannot fit the base document', async () => {
    const world = await fixture();
    try {
        const edit = world.beginCameraEdit();
        const expanded: CameraDocument = { ...document(16), views: { ...document(16).views, third: { kind: 'third-person', overrides: { position: { distanceMeters: 16 }, zoom: { range: { kind: 'unbounded' } } } }, extra: { kind: 'shoulder' } } };
        edit.applyDraft(expanded, world.inspectCamera().configurationRevision);
        world.step({ cameraYawRatio: .2 });
        const later = world.inspectCamera();
        expect(() => edit.cancel()).toThrow();
        expect(world.inspectCamera()).toEqual(later);
        world.setCameraView('extra');
        const extra = world.inspectCamera();
        expect(() => edit.cancel()).toThrow();
        expect(world.inspectCamera()).toEqual(extra);
    }
    finally {
        world.dispose();
    }
});
it('does not reclaim externally released authored ownership on cancel', async () => {
    const world = await fixture();
    try {
        const edit = world.beginCameraEdit();
        edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
        world.useAuthoredCamera();
        const before = world.inspectCamera();
        expect(() => edit.cancel()).toThrow();
        expect(world.inspectCamera()).toEqual(before);
    }
    finally {
        world.dispose();
    }
});
it('restores an authored baseline checkpoint from follow and commits authored baselines without moving actors', async () => {
    const world = await createWorld({ navigation: false });
    try {
        world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        world.setControlledEntity('actor');
        world.camera.position.set(2, 3, 8);
        world.camera.lookAt(0, 1, 0);
        world.step({}, 0);
        const edit = world.beginCameraEdit(), before = world.camera.position.clone();
        edit.applyDraft(document(), world.inspectCamera().configurationRevision);
        edit.cancel();
        expect(world.cameraMode).toBe('authored');
        expect(world.camera.position).toEqual(before);
        const authored = world.beginCameraEdit();
        world.camera.position.set(4, 5, 9);
        world.camera.lookAt(0, 1, 0);
        authored.commitBaseline(world.inspectCamera().configurationRevision);
        await world.reset();
        expect(world.camera.position.toArray()).toEqual([4, 5, 9]);
    }
    finally {
        world.dispose();
    }
});
it('refuses a same-ID replacement reference but rebinds reference identity after reset', async () => {
    const world = await fixture();
    try {
        world.addCharacter({ id: 'keeper', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        world.setControlledEntity('keeper');
        await world.execute({ type: 'entity.despawn', entityId: 'actor' });
        world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        world.setCameraFollow({ configuration: document() });
        const edit = world.beginCameraEdit(), before = world.inspectCamera(), draft: CameraDocument = { ...document(), views: { third: { kind: 'third-person', overrides: { framing: { kind: 'preserve-opening' } } }, shoulder: { kind: 'shoulder' } } };
        expect(() => edit.commitBaseline(before.configurationRevision)).toThrow();
        expect(() => edit.createOpeningDraft(draft, { viewId: 'third' })).toThrow();
        expect(world.inspectCamera()).toEqual(before);
        await world.reset();
        const fresh = world.beginCameraEdit();
        expect(fresh.createOpeningDraft(draft, { viewId: 'third' }).views.third).toHaveProperty('opening');
        fresh.commitBaseline(world.inspectCamera().configurationRevision);
    }
    finally {
        world.dispose();
    }
});
it('requires a sealed camera baseline without implicitly sealing World state', async () => {
    const world = await createWorld({ navigation: false });
    try {
        expect(() => world.beginCameraEdit()).toThrow();
        world.camera.position.set(7, 4, 8);
        world.step({}, 0);
        world.camera.position.set(1, 2, 3);
        await world.reset();
        expect(world.camera.position.toArray()).toEqual([7, 4, 8]);
    }
    finally {
        world.dispose();
    }
});
it('Episode lease blocks apply, baseline commit and cancel while allowing offline opening drafts', async () => {
    const windowTarget = new EventTarget(), documentTarget = Object.assign(new EventTarget(), { defaultView: windowTarget, activeElement: null, body: {}, documentElement: {}, hidden: false });
    Object.assign(windowTarget, { document: documentTarget });
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => { });
    const canvas = Object.assign(new EventTarget(), { width: 800, height: 600, ownerDocument: documentTarget, getAttribute: () => null, removeAttribute: () => { }, setAttribute: () => { }, style: { getPropertyValue: () => '', getPropertyPriority: () => '', setProperty: () => { }, removeProperty: () => { } } });
    let ratio = 1;
    const size = new THREE.Vector2(800, 600), renderer = { shadowMap: { enabled: false, type: THREE.PCFShadowMap, needsUpdate: false }, domElement: canvas, render: () => { }, getSize: (out: THREE.Vector2) => out.copy(size), getPixelRatio: () => ratio, setPixelRatio: (value: number) => { ratio = value; }, setSize: (x: number, y: number) => { size.set(x, y); } } as unknown as THREE.WebGLRenderer;
    const world = await createWorld({ navigation: false, renderer });
    try {
        world.addEntity({ id: 'floor', object: new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshBasicMaterial()).translateY(-.5), role: 'terrain' });
        world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        world.setControlledEntity('actor');
        world.setCameraFollow({ configuration: document() });
        await world.start();
        world.stop();
        const port = (windowTarget as unknown as {
            __WORLDKIT_EVAL__: import('../contracts').WorldObservation;
        }).__WORLDKIT_EVAL__.episode!;
        await port.prepareSegment({ positionWorldMetersXYZ: [0, 0, 0], facingYawRadians: 0 }, { widthPixels: 320, heightPixels: 180 });
        const edit = world.beginCameraEdit(), before = world.inspectCamera();
        const draft: CameraDocument = { ...document(), views: { ...document().views, third: { kind: 'third-person', overrides: { framing: { kind: 'preserve-opening' } } } } };
        expect(edit.createOpeningDraft(draft, { viewId: 'third' }).views.third).toHaveProperty('opening');
        for (const operation of [() => edit.applyDraft(document(6), before.configurationRevision), () => edit.commitBaseline(before.configurationRevision), () => edit.cancel()])
            expect(operation).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
        expect(world.inspectCamera()).toEqual(before);
        port.release();
        edit.applyDraft(document(6), before.configurationRevision);
        edit.cancel();
    }
    finally {
        world.dispose();
        vi.unstubAllGlobals();
    }
});
it('does not erase input between successive draft applications when cancel matches the last draft commit', async () => {
    const world = await fixture();
    try {
        const edit = world.beginCameraEdit();
        edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
        world.step({ cameraYawRatio: .7 }, 3);
        const yaw = world.inspectCamera().intent!.yawRadians;
        edit.applyDraft({ ...document(6), transition: { durationSeconds: .4 } }, world.inspectCamera().configurationRevision);
        const latest = world.inspectCamera();
        edit.cancel();
        expect(world.inspectCamera().intent!.yawRadians).toBe(yaw);
        expect(world.inspectCamera().intent).toEqual(latest.intent);
    }
    finally {
        world.dispose();
    }
});
it('commits vehicle parameter edits while retaining the initial person reference and rejects mounted opening adoption', async () => {
    const { createMountedFixture } = await import('../humanoid-runtime/mounted-test-fixture');
    const world = await createMountedFixture();
    try {
        const config = { ...document(), binding: { targetEntityId: 'person' } };
        world.setCameraFollow({ configuration: config });
        world.step({}, 0);
        const initial = world.getEntityState('person'), edit = world.beginCameraEdit();
        expect(world.humanoid!.enter('horse-1')).toBe(true);
        edit.applyDraft({ ...config, transition: { durationSeconds: .45 }, binding: { ...config.binding, subjectOverrides: { 'horse-1': { views: { third: { overrides: { position: { distanceMeters: 7 } } } } } } } }, world.inspectCamera().configurationRevision);
        const before = world.inspectCamera();
        expect(() => edit.createOpeningDraft({ ...config, views: { ...config.views, third: { kind: 'third-person', overrides: { framing: { kind: 'preserve-opening' } } } } }, { viewId: 'third' })).toThrow();
        edit.commitBaseline(before.configurationRevision);
        await world.reset();
        expect(world.inspectCamera().current?.resolvedSubjectId).toBe('person');
        expect(world.inspectCamera().document?.transition?.durationSeconds).toBe(.45);
        expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(initial.positionWorldMetersXYZ);
        expect(world.humanoid!.enter('horse-1')).toBe(true);
        expect(world.inspectCamera().resolved?.values.position).toMatchObject({ distanceMeters: 7 });
    }
    finally {
        world.dispose();
    }
});
it('rejects a baseline default view requiring a seat absent from the saved initial person', async () => {
    const { createMountedFixture } = await import('../humanoid-runtime/mounted-test-fixture');
    const world = await createMountedFixture();
    try {
        const config = { ...document(), binding: { targetEntityId: 'person' } };
        world.setCameraFollow({ configuration: config });
        world.step({}, 0);
        const edit = world.beginCameraEdit();
        world.humanoid!.enter('horse-1');
        const draft: CameraDocument = { ...config, defaultViewId: 'seat', views: { ...config.views, seat: { kind: 'third-person', overrides: { position: { anchor: { kind: 'seat' } } } } } };
        edit.applyDraft(draft, world.inspectCamera().configurationRevision);
        const before = world.inspectCamera();
        expect(() => edit.commitBaseline(before.configurationRevision)).toThrow();
        expect(world.inspectCamera()).toEqual(before);
        await world.reset();
        expect(world.inspectCamera().document?.defaultViewId).toBe('third');
    }
    finally {
        world.dispose();
    }
});
it.each(['world-up', 'subject-up'] as const)('adopts %s opening rotation into initial coordinates and reset framing', async (referenceFrame) => {
    const world = await createWorld({ navigation: false }), object = new THREE.Group();
    try {
        world.addEntity({ id: 'actor', object, role: 'decoration' });
        const config: CameraDocument = { ...document(), views: { third: { kind: 'third-person', overrides: { orientation: { referenceFrame, recenter: { enabled: false } }, framing: { kind: 'preserve-opening' } }, opening: { positionWorldMetersXYZ: [2, 3, 8], lookAtWorldMetersXYZ: [0, 1, 0], fovDegrees: 49 } }, shoulder: { kind: 'shoulder' } } };
        world.setCameraFollow({ configuration: config });
        world.step({}, 0);
        const edit = world.beginCameraEdit();
        object.position.set(5, 2, -3);
        object.rotation.set(referenceFrame === 'subject-up' ? .4 : 0, .7, referenceFrame === 'subject-up' ? .2 : 0);
        world.step({});
        const rotation = object.quaternion, transform = (point: readonly [
            number,
            number,
            number
        ]) => new THREE.Vector3(...point).applyQuaternion(rotation).add(object.position).toArray();
        const draft = edit.createOpeningDraft(config, { viewId: 'third', opening: { positionWorldMetersXYZ: transform([4, 5, 7]), lookAtWorldMetersXYZ: transform([0, 2, 0]), upWorldXYZ: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).toArray(), fovDegrees: 53 } });
        const view = draft.views.third;
        if (view?.kind !== 'third-person')
            throw new Error('Expected opening view');
        expect(new THREE.Vector3(...view.opening!.positionWorldMetersXYZ).distanceTo(new THREE.Vector3(4, 5, 7))).toBeLessThan(1e-6);
        expect(new THREE.Vector3(...view.opening!.lookAtWorldMetersXYZ).distanceTo(new THREE.Vector3(0, 2, 0))).toBeLessThan(1e-6);
        edit.applyDraft(draft, world.inspectCamera().configurationRevision);
        edit.commitBaseline(world.inspectCamera().configurationRevision);
        await world.reset();
        expect(world.camera.position.distanceTo(new THREE.Vector3(4, 5, 7))).toBeLessThan(1e-6);
        expect((world.camera as THREE.PerspectiveCamera).fov).toBe(53);
        expect(object.position.toArray()).toEqual([0, 0, 0]);
    }
    finally {
        world.dispose();
    }
});
it('captures and resets a rotated opening around its declared world-offset anchor', async () => {
    const world = await createWorld({ navigation: false }), object = new THREE.Group();
    try {
        world.addEntity({ id: 'actor', object, role: 'decoration' });
        const config: CameraDocument = { ...document(), input: {cycleViewIds:['third']}, views: { third: { kind: 'third-person', overrides: {
            position: { anchor: { kind: 'origin' }, anchorOffset: { space: 'world', offsetMetersXYZ: [2,1,0] } },
            orientation: { referenceFrame: 'world-up', recenter: { enabled: false } }, framing: { kind: 'preserve-opening' },
            constraints: { collision: { enabled: false } },
        }, opening: { positionWorldMetersXYZ: [4,3,8], lookAtWorldMetersXYZ: [2,1,0], fovDegrees: 49 } } } };
        world.setCameraFollow({ configuration: config });world.step({},0);
        const edit=world.beginCameraEdit();
        object.position.set(5,0,0);object.rotation.y=Math.PI/2;world.step({});
        const transform=(value:number[])=>new THREE.Vector3(...value).sub(new THREE.Vector3(2,1,0)).applyQuaternion(object.quaternion).add(new THREE.Vector3(7,1,0)).toArray();
        const draft=edit.createOpeningDraft(config,{viewId:'third',opening:{positionWorldMetersXYZ:transform([4,5,7]),lookAtWorldMetersXYZ:transform([2,2,0]),fovDegrees:53}});
        const view=draft.views.third;if(view?.kind!=='third-person')throw new Error('Expected opening');
        expect(new THREE.Vector3(...view.opening!.positionWorldMetersXYZ).distanceTo(new THREE.Vector3(4,5,7))).toBeLessThan(1e-9);
        expect(new THREE.Vector3(...view.opening!.lookAtWorldMetersXYZ).distanceTo(new THREE.Vector3(2,2,0))).toBeLessThan(1e-9);
        edit.applyDraft(draft,world.inspectCamera().configurationRevision);edit.commitBaseline(world.inspectCamera().configurationRevision);await world.reset();
        expect(world.camera.position.distanceTo(new THREE.Vector3(4,5,7))).toBeLessThan(1e-9);
        expect((world.camera as THREE.PerspectiveCamera).fov).toBe(53);
    } finally {world.dispose();}
});
it('invalidates the session when its applied target is deleted after a session retarget', async () => { const world = await fixture(); try {
    world.addCharacter({ id: 'other', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    const edit = world.beginCameraEdit();
    edit.applyDraft({ ...document(), binding: { targetEntityId: 'other' } }, world.inspectCamera().configurationRevision);
    await world.execute({ type: 'entity.despawn', entityId: 'other' });
    const before = world.inspectCamera();
    expect(() => edit.applyDraft(document(), before.configurationRevision)).toThrow();
    expect(world.inspectCamera()).toEqual(before);
}
finally {
    world.dispose();
} });
it('retains a valid initial follow reference across an authored baseline reset', async () => { const world = await fixture(); try {
    world.useAuthoredCamera();
    const authored = world.beginCameraEdit();
    authored.commitBaseline(world.inspectCamera().configurationRevision);
    await world.reset();
    const edit = world.beginCameraEdit();
    edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
    expect(() => edit.commitBaseline(world.inspectCamera().configurationRevision)).not.toThrow();
}
finally {
    world.dispose();
} });
it('undoes its own target edit by sampling A now and rejects A replacement instead of replaying old physical state', async () => { const world = await fixture(); try {
    world.addCharacter({ id: 'other', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    const edit = world.beginCameraEdit();
    edit.applyDraft({ ...document(), binding: { targetEntityId: 'other' } }, world.inspectCamera().configurationRevision);
    edit.cancel();
    expect(world.inspectCamera().document?.binding.targetEntityId).toBe('actor');
    const stale = world.beginCameraEdit();
    stale.applyDraft({ ...document(), binding: { targetEntityId: 'other' } }, world.inspectCamera().configurationRevision);
    world.setControlledEntity('other');
    await world.execute({ type: 'entity.despawn', entityId: 'actor' });
    world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    const before = world.inspectCamera();
    expect(() => stale.cancel()).toThrow();
    expect(world.inspectCamera()).toEqual(before);
}
finally {
    world.dispose();
} });
it('rejects config-only target undo instead of clamping later intent to the old target range', async () => { const world = await fixture(); try {
    world.addCharacter({ id: 'other', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    const edit = world.beginCameraEdit();
    edit.applyDraft({ ...document(), binding: { targetEntityId: 'other' } }, world.inspectCamera().configurationRevision);
    const draft: CameraDocument = { ...document(16), binding: { targetEntityId: 'other' }, views: { ...document().views, third: { kind: 'third-person', overrides: { position: { distanceMeters: 16 }, zoom: { range: { kind: 'unbounded' } } } } } };
    edit.applyDraft(draft, world.inspectCamera().configurationRevision);
    world.step({ cameraYawRatio: .2 });
    const before = world.inspectCamera();
    expect(() => edit.cancel()).toThrow();
    expect(world.inspectCamera()).toEqual(before);
}
finally {
    world.dispose();
} });
it('rejects cancel atomically when the presentation camera parent became nonrigid', async () => { const world = await fixture(); try {
    const edit = world.beginCameraEdit();
    edit.applyDraft(document(6), world.inspectCamera().configurationRevision);
    const parent = new THREE.Group();
    world.scene.add(parent);
    parent.add(world.camera);
    parent.scale.set(2, 1, 1);
    const before = world.inspectCamera();
    expect(() => edit.cancel()).toThrow();
    expect(world.inspectCamera()).toEqual(before);
}
finally {
    world.dispose();
} });
it('does not recreate lost initial reference authority when authored reset removed its later-added target', async () => { const world = await createWorld({ navigation: false }); try {
    world.step({}, 0);
    world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    world.setCameraFollow({ configuration: document() });
    world.useAuthoredCamera();
    world.beginCameraEdit().commitBaseline(world.inspectCamera().configurationRevision);
    await world.reset();
    world.addCharacter({ id: 'actor', object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
    world.setCameraFollow({ configuration: document() });
    const edit = world.beginCameraEdit(), before = world.inspectCamera();
    expect(() => edit.commitBaseline(before.configurationRevision)).toThrow();
    expect(world.inspectCamera()).toEqual(before);
}
finally {
    world.dispose();
} });
it('does not grant a retargeted document authority over the old initial subject through authored reset', async () => {
    const world = await createWorld({ navigation: false });
    try {
        for (const id of ['actor', 'other']) world.addCharacter({ id, object: new THREE.Group(), body: { heightMeters: 1.8, radiusMeters: .3 } });
        world.setControlledEntity('actor');
        world.setCameraFollow({ configuration: document() });
        world.step({}, 0);
        const targetB: CameraDocument = { ...document(), binding: { targetEntityId: 'other' } };
        const edit = world.beginCameraEdit();
        edit.applyDraft(targetB, world.inspectCamera().configurationRevision);
        expect(() => edit.commitBaseline(world.inspectCamera().configurationRevision)).toThrow('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
        world.useAuthoredCamera();
        edit.commitBaseline(world.inspectCamera().configurationRevision);
        await world.reset();
        const next = world.beginCameraEdit();
        next.applyDraft(targetB, world.inspectCamera().configurationRevision);
        const before = world.inspectCamera();
        expect(() => next.commitBaseline(before.configurationRevision)).toThrow('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
        expect(world.inspectCamera()).toEqual(before);
    } finally { world.dispose(); }
});
