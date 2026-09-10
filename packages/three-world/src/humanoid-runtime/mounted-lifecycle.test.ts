import { expect, it } from 'vitest';
import { createMountedFixture } from './mounted-test-fixture';
import { emptyInput } from './simulation';
it('rejects direct mutations and callback registration after disposal', async () => {
  const world = await createMountedFixture(), runtime = world.humanoid!;
  world.dispose();
  const mutations = [
    () => runtime.enter('horse-1'), () => runtime.exit(),
    () => runtime.setInput(emptyInput()), () => runtime.clearInput(),
    () => runtime.prepareCharacter([1, .025, 0]),
    () => runtime.prepare('horse-1', runtime.options.map.spawns[0]!),
    () => runtime.approach('horse-1'), () => runtime.switchMap(runtime.options.map),
    () => runtime.applyProfile({}), () => runtime.advance({}, 1 / 60),
    () => runtime.reset(), () => runtime.useAuthoredCamera(),
    () => runtime.setCameraMode(0), () => runtime.onVisualUpdate(() => {}),
  ];
  for (const mutate of mutations) expect(mutate).toThrow('HUMANOID_DISPOSED');
});

it('allows world cleanup after a directly disposed runtime',async()=>{
 const world=await createMountedFixture();
 world.humanoid!.dispose();
 expect(()=>world.dispose()).not.toThrow();
});
