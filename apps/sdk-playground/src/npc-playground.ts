import type {ThreeWorld, WorldCommand, Vec3, humanoid} from '@worldkit/three';
import {NPC_WORKSHOP_ID} from '@worldkit/preset-content/environment/npc-workshop';

const NPCS = [{id: 'npc-left', label: 'NPC A', x: -5}, {id: 'npc-right', label: 'NPC B', x: 5}] as const;
type Character = humanoid.HumanoidCharacter;
type Demo = 'patrol' | 'pickup' | 'place' | 'sit' | 'stand';

/** Playground content lifetime and UI only. All movement, actions and camera writes belong to SDK owners. */
export function createNpcPlayground(world: ThreeWorld, options: {focus(): void; beforeControl(): void; changed(): void}) {
  const runtime = world.humanoid!;
  const characters = new Map<string, Character>();
  const panel = document.createElement('section');
  panel.className = 'npc-playground'; panel.hidden = true; panel.setAttribute('aria-label', 'NPC 交互试验场');
  const title = document.createElement('h2'); title.textContent = 'NPC 交互试验场';
  const hint = document.createElement('p'); hint.textContent = 'WASD 操控所选角色 · 两个 NPC 共用物品和座位';
  const roles = document.createElement('div'); roles.className = 'npc-playground-buttons';
  const actions = document.createElement('div'); actions.className = 'npc-playground-buttons';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const actors = document.createElement('p'); actors.className = 'npc-playground-actors';
  panel.append(title, hint, roles, actions, status, actors);
  let generation = 0, request = 0, mapId = '', ready = false, disposed = false;
  let pending = Promise.resolve();
  let task: AbortController | undefined;
  const operationIds = new Set<string>();
  const roleButtons = new Map<string, HTMLButtonElement>();
  const actionButtons: HTMLButtonElement[] = [];

  function cancel() {
    task?.abort(); task = undefined;
    for (const id of operationIds) world.operations.cancel(id);
    operationIds.clear();
  }
  function control(id: string) {
    options.beforeControl();
    world.setControlledEntity(id);
    const document=world.inspectCamera().document;
    if(document)world.setCameraFollow({configuration:{...document,binding:{...document.binding,targetEntityId:id}}});
    options.changed(); update(); options.focus();
  }
  function beforeMapChange() {
    ++generation; ready = false; cancel();
    if (characters.has(world.snapshot().controlledEntityId ?? '')) control('person');
  }
  async function removeActors() {
    for (const id of characters.keys()) {
      const receipt = await world.execute({type: 'entity.despawn', entityId: id});
      if (receipt.status === 'rejected') throw new Error(receipt.error.message);
      characters.delete(id);
    }
  }
  function setMap(id: string): Promise<void> {
    beforeMapChange(); mapId = id; panel.hidden = id !== NPC_WORKSHOP_ID;
    const revision = generation;
    status.textContent = '正在准备 NPC…'; update();
    pending = pending.then(async () => {
      if (disposed || revision !== generation) return;
      await removeActors();
      if (id !== NPC_WORKSHOP_ID || revision !== generation) return;
      await world.runTask(async scope => {
        for (const npc of NPCS) {
          const character = await runtime.createCharacter();
          if (disposed || revision !== generation || scope.signal.aborted) { character.dispose(); return; }
          character.root.name = npc.label;
          character.root.position.set(npc.x, .04, 0);
          try { scope.addCharacter({id: npc.id, humanoid: character}); }
          catch (error) { character.dispose(); throw error; }
          characters.set(npc.id, character);
          world.setAutonomy(npc.id, {kind: 'patrol', waypointPositionsWorldMetersXYZ: [[npc.x, 0, 7], [npc.x, 0, -3]], pauseSeconds: .5});
        }
      });
      if (revision !== generation) return;
      ready = true; status.textContent = '两个 NPC 正在自动巡逻'; options.changed(); update();
    }).catch(error => {
      if (!disposed && revision === generation) { status.textContent = `NPC 准备失败：${String(error)}`; update(); }
    });
    return pending;
  }
  async function demo(kind: Demo) {
    if (!ready || task) return;
    const abort = new AbortController(); task = abort;
    control('person');
    const revision = generation;
    status.textContent = '正在执行…'; update();
    try {
      await world.runTask(async scope => {
        const signal = AbortSignal.any([abort.signal, scope.signal]);
        async function dispatch(command: WorldCommand) {
          signal.throwIfAborted();
          const receipt = await scope.execute(command);
          if (signal.aborted) {
            if (receipt.status === 'accepted') world.operations.cancel(receipt.operationId);
            signal.throwIfAborted();
          }
          return receipt;
        }
        async function execute(command: WorldCommand) {
          const receipt = await dispatch(command);
          if (receipt.status === 'rejected') throw new Error(`${receipt.error.code}: ${receipt.error.message}`);
          if (receipt.status === 'accepted') {
            operationIds.add(receipt.operationId);
            try {
              const result = await world.operations.wait(receipt.operationId, {signal});
              if (result.status !== 'succeeded') throw new Error(`${result.error?.code ?? result.status}: ${result.error?.message ?? result.phase}`);
            } finally { operationIds.delete(receipt.operationId); }
          }
          return receipt;
        }
        const move = (id: string, position: Vec3) => execute({type: 'actor.move-to', entityId: id, targetPositionWorldMetersXYZ: position});
        const skill = (id: string, action: 'pickup' | 'putDown' | 'sit' | 'standUp', targetId?: string, slotId?: string) => execute({
          type: 'humanoid.perform-action', actorId: id,
          request: {requestId: `playground-npc-${++request}`, action, ...(targetId ? {targetId} : {}), ...(slotId ? {slotId} : {})},
        });
        for (const npc of NPCS) await execute({type: 'actor.stop', entityId: npc.id});
        if (kind === 'patrol') {
          for (const npc of NPCS) await execute({type: 'actor.resume-autonomy', entityId: npc.id});
          status.textContent = '两个 NPC 已恢复巡逻';
        } else if (kind === 'pickup') {
          // Approach through the clear front aisle; movable furniture is a real obstacle.
          await Promise.all(NPCS.map(async (npc, i) => {
            await move(npc.id, [npc.x, 0, 3]);
            await move(npc.id, [i ? .8 : -.8, 0, 6]);
          }));
          signal.throwIfAborted();
          const receipts = [];
          for (const npc of NPCS) receipts.push(await dispatch({type: 'humanoid.perform-action', actorId: npc.id,
            request: {requestId: `playground-contest-${++request}`, action: 'pickup', targetId: 'parcel', slotId: 'grip'}}));
          const accepted = receipts.filter(receipt => receipt.status === 'accepted');
          for (const receipt of accepted) operationIds.add(receipt.operationId);
          const results = await Promise.all(accepted.map(receipt => world.operations.wait(receipt.operationId, {signal})));
          for (const receipt of accepted) operationIds.delete(receipt.operationId);
          if (accepted.length !== 1 || results.some(result => result.status !== 'succeeded')) throw new Error([...receipts.filter(receipt => receipt.status === 'rejected').map(receipt => `${receipt.error.code}: ${receipt.error.message}`), ...results.filter(result => result.status !== 'succeeded').map(result => `${result.error?.code ?? result.status}: ${result.error?.message ?? result.phase}`)].join('；') || '拾取未完成');
          const holder = NPCS.find(npc => runtime.snapshot(npc.id).character.carrying === 'parcel');
          const rejected = receipts.find(receipt => receipt.status === 'rejected');
          status.textContent = `${holder?.label ?? 'NPC'} 拾取成功；另一位收到：${rejected?.error.message ?? '物品已被占用'}`;
        } else if (kind === 'place') {
          const holder = NPCS.find(npc => runtime.snapshot(npc.id).character.carrying === 'parcel');
          if (!holder) throw new Error('请先点击“接近并争用物品”');
          await move(holder.id, [-3, 0, 6]); await skill(holder.id, 'putDown'); status.textContent = '搬运并放下完成';
        } else if (kind === 'sit') {
          await Promise.all(NPCS.map(async (npc, i) => {
            if (i) { await move(npc.id, [2, 0, 6]); await move(npc.id, [2, 0, 12.35]); }
            await move(npc.id, [i ? .6 : -.6, 0, 12.35]); await skill(npc.id, 'sit', i ? 'bench-right' : 'bench-left', i ? 'right' : 'left');
          }));
          status.textContent = '两个 NPC 已分别就座';
        } else {
          await Promise.all(NPCS.map(npc => skill(npc.id, 'standUp'))); status.textContent = '两个 NPC 已起身';
        }
      });
    } catch (error) {
      if (revision === generation && task === abort) status.textContent = abort.signal.aborted ? '已取消操作' : String(error);
      // A rejected parallel action must also retire its still-running siblings.
      if (task === abort) {
        for (const id of operationIds) world.operations.cancel(id);
        operationIds.clear();
      }
      abort.abort();
    } finally {
      if (task === abort) task = undefined;
      update();
    }
  }
  for (const actor of [{id: 'person', label: '玩家'}, ...NPCS]) {
    const button = document.createElement('button'); button.textContent = `操控${actor.label}`;
    button.onclick = () => { cancel(); control(actor.id); status.textContent = `正在操控${actor.label}`; };
    roles.append(button); roleButtons.set(actor.id, button);
  }
  for (const [kind, label] of [['patrol', '恢复巡逻'], ['pickup', '接近并争用物品'], ['place', '搬运并放下'], ['sit', '分别就座'], ['stand', '起身']] as const) {
    const button = document.createElement('button'); button.textContent = label; button.onclick = () => { void demo(kind); };
    actions.append(button); actionButtons.push(button);
  }
  const stop = document.createElement('button'); stop.textContent = '取消操作';
  stop.onclick = () => { cancel(); status.textContent = '已取消操作'; update(); }; actions.append(stop);
  function update() {
    if (disposed) return;
    const controlled = world.snapshot().controlledEntityId;
    for (const [id, button] of roleButtons) { button.disabled = !ready; button.setAttribute('aria-pressed', String(controlled === id)); }
    for (const button of actionButtons) button.disabled = !ready || !!task;
    stop.disabled = !task;
    actors.textContent = [...characters].map(([id, character]) => `${NPCS.find(npc => npc.id === id)!.label} · ${character.clipLabel}`).join('　');
  }
  world.onReset(() => { characters.clear(); void setMap(mapId); });
  world.onDispose(() => { disposed = true; ++generation; cancel(); characters.clear(); panel.remove(); });
  return {panel, setMap, beforeMapChange, control, update, character: (id: string) => characters.get(id),
    displayActors: () => [...characters].map(([id, character]) => ({id, name: character.root.name, object: character.root})),
    characters: () => [...characters.values()], whenReady: () => pending,
    state: () => ({ready, busy: !!task, status: status.textContent, actors: [...characters.keys()].map(id => ({...world.getEntityState(id), character: runtime.snapshot(id).character}))})};
}
