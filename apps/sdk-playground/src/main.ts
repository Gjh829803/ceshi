import {CameraEditorState} from "./camera/editor-state";
import {createCameraFileClient} from "./camera/file-client";
import {createCameraPreview} from "./camera/preview";
import {selectDragonCameraVariant} from "./camera/project-state";
import type {CameraEditorBinding} from "./camera/binding";
/// <reference types="vite/client" />
import type {AircraftActionRequest} from '@worldkit/three';
import {loadCameraProject} from './camera-project';
import { toast as notify } from "sonner";
import * as T from "three";
import {updateSpaceExhaust} from '@worldkit/preset-content/space-model';
import {mountSpacePanel} from './space-panel';
import { createNpcPlayground } from "./npc-playground";
import { mountShell } from "./shell";
import { DRAGON_TRAINING } from "./training-destinations";
import { DRAGON_VARIANTS, readDragonVariant } from '@worldkit/preset-content/dragon-variants';
import { readMapHash, writeMapHash } from "./map-route";
import { preparePlaygroundRendering } from "./render-warmup";
import "./styles.css";

import { controlsFor } from "@worldkit/preset-content/ui/shortcuts";
import { renderAssetThumbnails } from "@worldkit/preset-content/ui/thumbnails";
import { mountInspector } from "./inspector";
import { SPECS as PRESET_SPECS, vehicleControlFamily } from "@worldkit/preset-content/config";
import presentationConfig from "@worldkit/preset-content/presentation.json";
import {
  getMap,
  MAPS,
} from "@worldkit/preset-content/environment/maps";
import { GRAND_PRIX } from "@worldkit/preset-content/environment/grand-prix";
import {
  applyControlProfile,
  readEditableProfile,
} from "@worldkit/preset-content/platform/profile-runtime";
import {
  getDefaultProfile as getPresetDefaultProfile,
  loadAssetProfile,
  saveAssetProfile,
  clearAssetProfile,
  parseAssetProfile,
  type AssetProfile,
} from "@worldkit/preset-content/platform/profiles";
import { buildVehicle, labelSprite, type VehicleVisual } from "@worldkit/preset-content/models";
import { FrameRateMeter } from "@worldkit/preset-content/fps";
import {
  updateVehicleWheels,
  resetVehicleWheels,
} from "@worldkit/preset-content/vehicle-animation";
import {
  assetIdForPreset,
  buildWorkspaceCatalog,
  type AssetEntry,
} from "@worldkit/preset-content/platform/catalog";
import { mountAssetLibrary } from "./library";
import { mountWorkbench } from "./workbench";
import {
  defaultRegion,
  prepareCourse,
} from "@worldkit/preset-content/platform/scenarios";
import { createAccessoryPreview } from "@worldkit/preset-content/humanoid/accessories";
import { mountEquipmentPanel } from "./equipment-panel";
import { mountHumanoidLab } from "./humanoid-panel";
import {
  type CollisionDebugMode,
} from "@worldkit/preset-content/humanoid/capsule-debug";
import { createDisplayPreview } from './display-preview';
import {selectDisplayCameraProbeSample} from './display-camera-probes';
import { createDisplayOverlays, type DisplayInteractionTarget } from './display-overlays';
import { defaultDisplaySettings, isDisplayPreviewActive, type DisplaySettings, type DisplayType } from './display-settings';
import {buildDisplayCatalog} from './display-catalog';
import {resolveDisplayScope} from './display-context';
import {
  HumanoidDemo,
  humanoidTraversalReady,
} from "@worldkit/preset-content/humanoid/demo";
import type { CharacterTrial } from "@worldkit/preset-content/environment/types";
import "./styles/workspace.css";

import { createWorld, resolveShadowSettings, humanoid } from "@worldkit/three";
import { buildWorld } from "@worldkit/preset-content/world";
import {
  resolvePresetResource,
  definitions,
} from "@worldkit/preset-content/assets/resources";
import effectiveProfiles from "@worldkit/preset-content/profiles.json";
const { emptyInput, actionForKey, readControls } = humanoid;
type HumanoidActionInput = humanoid.HumanoidActionInput;
type SkillRequest = humanoid.SkillRequest;
const FIXED_STEP = 1 / 60;
const shell = mountShell(document.querySelector<HTMLDivElement>("#app")!);
const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!,
  scene = new T.Scene();
const renderer = new T.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
const camera = new T.PerspectiveCamera(
  55,
  canvas.clientWidth / canvas.clientHeight,
  0.12,
  2100,
);
const dragonVariant=readDragonVariant(location.search);
shell.update({dragonId:dragonVariant.id});
const SPECS=PRESET_SPECS.map(spec=>spec.id==='dragon'?{...humanoid.createFlyingCreatureSpec('dragon'),name:dragonVariant.name,...(dragonVariant.ground?{flyingCreatureGround:dragonVariant.ground}:{}),
  ...(dragonVariant.seat?{seat:dragonVariant.seat}:{}),...(dragonVariant.envelope?{envelope:dragonVariant.envelope}:{}),
  ...(dragonVariant.collisionProbes?{flyingCreatureCollision:dragonVariant.collisionProbes}:{}),spawn:[80,40,35] as [number,number,number]}:spec);
function getDefaultProfile(id:string):AssetProfile|undefined{
  const profile=getPresetDefaultProfile(id);if(!profile||id!=='dragon')return profile;
  const spec=SPECS.find(value=>value.id===id)!;
  return {...profile,control:humanoid.readMovementSettings(humanoid.createVehicle(spec).spec),envelope:structuredClone(spec.envelope)};
}
const nativeDragon=new humanoid.FlyingCreatureVisual();
const visuals:VehicleVisual[] = SPECS.map(spec=>{
  if(!spec.flyingCreature)return buildVehicle(spec);
  const seat=new T.Group(),label=labelSprite(spec.name);label.position.y=15;nativeDragon.root.add(label);
  return {root:nativeDragon.root,seat,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};
}),
  character = new humanoid.HumanoidCharacter();
try {
  await Promise.all([
    character.load(resolvePresetResource),
    nativeDragon.load({dragonUrl:'./flying-creature/__creature-assets/'+dragonVariant.file,loadTextures:true,animationPrefix:dragonVariant.id,flameTextureUrl:'./flying-creature/__creature-assets/FireGenLoop01_8x8.png'}),
    ...visuals.map((v) => v.creature?.load()),
  ]);
} catch (error) {
  shell.text("loadText", "资源加载失败：" + String(error));
  shell.flush();
  throw error;
}
const mapIds = MAPS.map(map => map.id);
const initialMap = getMap(readMapHash(location.hash, mapIds));
writeMapHash(window, initialMap.id, true);
const sdk = await createWorld({
  scene,
  camera,
  renderer,
  canvas,
  assetDefinitions: definitions,
  shadows: resolveShadowSettings(presentationConfig.shadows),
  humanoid: {
    map: initialMap,
    vehicles: SPECS.map((spec, n) => ({
      instanceId: spec.id,
      assetId: assetIdForPreset(spec, spec.flyingCreature ? dragonVariant.id : undefined),
      spec,
      object: visuals[n]!.root,
      ...(spec.flyingCreature?{flyingVisual:nativeDragon}:{}),
    })),
    character: {
      instanceId: "person",
      object: character.root,
      animation: character,
    },
  },
});
let cameraProject = loadCameraProject(initialMap.id, dragonVariant.id);
sdk.setCameraFollow({configuration:cameraProject.document});
const cameraEditors=new Map<string,CameraEditorBinding>();
let cameraFileClient:Awaited<ReturnType<typeof createCameraFileClient>>=null;
function getCameraEditor():CameraEditorBinding {
 let binding=cameraEditors.get(cameraProject.configurationId);
 if(!binding){
  const state=new CameraEditorState(cameraProject),key=`worldkit.camera-draft.v1.${cameraProject.configurationId}`;
  try{const recovery=localStorage.getItem(key);if(recovery)state.recover(recovery);}catch{/* Recovery is optional. */}
  binding={state,client:cameraFileClient,inspect:()=>sdk.inspectCamera(),subscribeInspection:listener=>{
    let last=0;
    return sdk.onRender(()=>{const now=performance.now();if(now-last<250)return;last=now;listener(sdk.inspectCamera());});
  },setPerformanceEnabled:enabled=>sdk.setCameraPerformanceDiagnosticsEnabled(enabled),rebind:()=>state.bind(sdk),preview:host=>createCameraPreview(host,scene,camera)};
  cameraEditors.set(cameraProject.configurationId,binding);
  state.subscribe(()=>{try{localStorage.setItem(key,state.recovery());}catch{/* A full browser store cannot block editing. */}});
 }
 return binding;
}
void createCameraFileClient().then(client=>{cameraFileClient=client;for(const binding of cameraEditors.values())binding.client=client;}).catch(error=>toast(String(error)));
// Imported bytes may change independently of a live SDK draft or baseline.
if(import.meta.hot)import.meta.hot.accept('./camera-project',module=>{
 if(!module)return;
 const imported=module.loadCameraProject(session.map.id,dragonVariant.id);
 const binding=getCameraEditor();binding.state.imported(imported.savedDocument,imported.importedFileSha256);
 cameraProject={...cameraProject,savedDocument:imported.savedDocument,importedFileSha256:imported.importedFileSha256};
});
const runtime = sdk.humanoid!;
const cameraCollisionLimited=()=>{const diagnostics=sdk.inspectCamera().diagnostics;return diagnostics?.status==='measured'&&diagnostics.limited;};
const cameraViews=()=>Object.entries(sdk.inspectCamera().document?.views??{}).map(([id,view])=>({id,kind:view.kind,label:`${({'third-person':'第三人称','first-person':'第一人称',shoulder:'沉浸越肩'})[view.kind]}${id===view.kind?'':` · ${id}`}`}));
const cameraViewLabel=()=>cameraViews().find(view=>view.id===sdk.inspectCamera().current?.viewId)?.label??'作者机位';
const cameraTargetPosition=()=>new T.Vector3(...(sdk.inspectCamera().current?.pivotWorldMetersXYZ??[0,0,0]));
let sim = runtime.simulation;
runtime.onSimulationReplaced(()=>{sim=runtime.simulation;});

const accessories = createAccessoryPreview(character);
let currentMap = initialMap,
  world = buildWorld(scene, currentMap);
sdk.configureShadowLight(world.sun);
let npcLab: ReturnType<typeof createNpcPlayground> | undefined;
function controlledCharacter() {
  return npcLab?.character(sim.controlledActor.id) ?? character;
}
const session = {
  get map() {
    return currentMap;
  },
  get world() {
    return world;
  },
  get queries() {
    return runtime.environment;
  },
  switchMap(id: string) {
    if (id === currentMap.id) return;
    const next = getMap(id),
      visual = buildWorld(scene, next);
    try {
      sdk.configureShadowLight(visual.sun);
      npcLab?.beforeMapChange();
      runtime.switchMap(next);
    } catch (error) {
      visual.dispose();
      throw error;
    }
    world.dispose();
    displayPreview.clearMaterials();
    displayPreview.setSettings({...displaySettings,cameras:false});
    world = visual;
    currentMap = next;
    getCameraEditor().state.invalidate();
    cameraProject = loadCameraProject(next.id, dragonVariant.id);
    sdk.setCameraFollow({configuration:cameraProject.document});
    getCameraEditor().state.invalidate();
    // Scene-local selections retire with the map; keep stable actors and picture settings.
    const stableIds=new Set(['person',...SPECS.map(spec=>spec.id)]);
    const selectedIds=displaySettings.selectedIds.filter(id=>stableIds.has(id));
    displaySettings={...displaySettings,selectedIds,hiddenIds:displaySettings.hiddenIds.filter(id=>stableIds.has(id)),isolation:null,
      scope:displaySettings.scope==='selected'&&!selectedIds.length?'all':displaySettings.scope};
    displayPreview.setSettings(displaySettings);shell.update({display:displaySettings});refreshDisplayMetadata(true);
    writeMapHash(window, next.id);
    void npcLab?.setMap(next.id);
  },
  dispose() {
    world.dispose();
    sdk.dispose();
  },
};
const sdkPresentation = sdk.createPresentation({
  container: canvas.parentElement!,
});
shell.attachViewport(sdkPresentation);
const profiles = new Map<string, AssetProfile>();
const exportedProfiles = new Map<string, string>();
for (const id of ["person", ...SPECS.map((s) => s.id)]) {
  const project = (
    effectiveProfiles as { profiles: AssetProfile[] }
  ).profiles.find((p) => p.assetId === id);
  let profile = project ?? getDefaultProfile(id)!;
  exportedProfiles.set(id, JSON.stringify(profile));
  // Local overrides are visibly marked and never silently included in a delivery.
  if (
    new URLSearchParams(location.search).get("debugProfiles") === "1" &&
    (location.hostname === "127.0.0.1" || location.hostname === "localhost")
  ) {
    try {
      profile = loadAssetProfile(localStorage, id) ?? profile;
    } catch {}
  }
  profiles.set(id, profile);
  applyControlProfile(runtime, profile);
}
const pageLifetime = new AbortController();
const pageEventOptions = {signal: pageLifetime.signal};
const pressed = new Set<string>();
let jumpPressed = false,
  paused = false,
  ready = false,
  preparingRender = true,
  lastMessage = "",
  lastActive = -99;
let humanCommands: HumanoidActionInput = {},
  humanDemo: HumanoidDemo | null = null;
let collisionMode: CollisionDebugMode = "off";
let disposeThumbnails: (() => void) | undefined;
let displaySettings = defaultDisplaySettings();
function displayColliderId(handle:number) {
  return runtime.environment.colliderId(handle);
}
function readDisplayTargets():DisplayInteractionTarget[] {
  const targets:DisplayInteractionTarget[]=[...humanoid.readInteractionTargets(sim.environment)];
  sim.vehicles.forEach((vehicle,n)=>{
    if(!sim.available(vehicle))return;
    const root=visuals[n]!.root,rotation=root.getWorldQuaternion(new T.Quaternion());
    targets.push({id:'vehicle-seat:'+vehicle.spec.id,ownerIds:[vehicle.spec.id],kind:'seat',slotId:'seat',state:'available',
      position:new T.Vector3(...vehicle.spec.seat).applyQuaternion(rotation).add(root.getWorldPosition(new T.Vector3()))});
  });
  return targets;
}
function readDisplayCatalog() {
  const colliderIds=new Set<string>();sim.controlledActor.controller?.world.forEachCollider(c=>{if(c.isEnabled())colliderIds.add(displayColliderId(c.handle));});
  return buildDisplayCatalog({scene,map:session.map,environment:world.root,person:character.root,
    actors: npcLab?.displayActors() ?? [],
    vehicles:visuals.map((visual,n)=>({id:SPECS[n]!.id,name:SPECS[n]!.name,object:visual.root,available:sim.available(sim.vehicles[n]!),type:(SPECS[n]!.mode==='mount'||SPECS[n]!.mode==='dragon'?'creature':'vehicle') as DisplayType})),
    ...(sim.controlledActor.vehicle?{currentVehicleId:sim.controlledActor.vehicle.spec.id}:{}),colliderIds});
}
let displayCatalog=readDisplayCatalog();
function refreshDisplayMetadata(force=false) {
  // Ordinary gameplay must not pay for an unopened diagnostic inspector.
  if(!force&&!shell.get().flags.displayOpen&&!isDisplayPreviewActive(displaySettings))return;
  displayCatalog=readDisplayCatalog();
  if(JSON.stringify(displayCatalog.rows)!==JSON.stringify(shell.get().displayRows))shell.update({displayRows:displayCatalog.rows});
  const scope=resolveDisplayScope(displaySettings,displayCatalog.context),matches=(id:string)=>scope.ids===null||scope.ids.has(id);
  let unmappedColliders=0,scopedColliders=0;const knownIds=new Set(displayCatalog.rows.map(r=>r.id));
  sim.controlledActor.controller?.world.forEachCollider(c=>{if(!c.isEnabled())return;const id=displayColliderId(c.handle);if(!knownIds.has(id))unmappedColliders++;if(matches(id))scopedColliders++;});
  const map=session.map;
  const targets=readDisplayTargets();
  const available={physics:!!sim.controlledActor.controller,unmappedColliders,scopedColliders,
    scene:{anchors:targets.some(t=>t.state!=='removed'),water:map.water.length>0,
      climbSurfaces:!!map.climbSurfaces?.some(s=>map.boxes.some(b=>b.id===s.colliderId&&b.collision!==false))},
    anchors:targets.some(t=>t.state!=='removed'&&(matches(t.id)||t.ownerIds?.some(matches)||map.interactions?.find(a=>a.id===t.id)?.colliderIds?.some(matches))),
    climbSurfaces:!!map.climbSurfaces?.some(s=>matches(s.colliderId)&&map.boxes.some(b=>b.id===s.colliderId&&b.collision!==false)),
    water:map.water.some(w=>matches('water:'+w.id))};
  if(JSON.stringify(available)!==JSON.stringify(shell.get().displayAvailable))shell.update({displayAvailable:available});
}
const displayPreview = createDisplayPreview({
  collisionDiagnostics:()=>selectDisplayCameraProbeSample(sdk.inspectCamera().collisionQueries,'presentation'),
  onRender:callback=>sdk.onRender(callback),
  inputSurface:sdkPresentation.inputSurface,
  focusGameplay:()=>{if(ready&&!paused&&!panelOpen)sdkPresentation.focus();},
  scene, camera, source: renderer, mount: canvas.parentElement!,
  context: () => ({...displayCatalog.context,subjects:sim.controlledActor.vehicleIndex>=0?[controlledCharacter().root,visuals[sim.controlledActor.vehicleIndex]!.root]:[controlledCharacter().root]}),
  overlay: createDisplayOverlays(scene, () => ({physics: sim.controlledActor.controller, map: session.map,
    targets:displaySettings.anchors&&displaySettings.helperOnly==='none'?readDisplayTargets():[],colliderId:displayColliderId,
    colliderDistance:(handle,centers)=>{const c=sim.controlledActor.controller?.world.getCollider(handle);if(!c)return Infinity;
      return centers.reduce((distance,center)=>{const projected=c.projectPoint(center,true);return projected?Math.min(distance,center.distanceTo(new T.Vector3().copy(projected.point))):distance;},Infinity);}
  })),
  onError: error => { shell.update({displayError: `预览暂不可用，已显示原始画面：${error instanceof Error ? error.message : String(error)}`}); },
});
let panelOpen = false,
  quickSlots: AssetEntry[] = [];
const elementCache = new Map<string, HTMLElement>();
const el = (id: string) => {
  let element = elementCache.get(id);
  if (!element) {
    element = document.getElementById(id)!;
    elementCache.set(id, element);
  }
  return element;
};
const setText = shell.text;
const setHTML = (_id: string, value: string) =>
  shell.update({ interaction: value });
function setCollisionMode(value: CollisionDebugMode) {
  setDisplaySettings({...displaySettings, colliders: value, helperOnly:'none'});
}
function setDisplaySettings(value: DisplaySettings) {
  sdk.setCameraCollisionDiagnosticsEnabled(value.cameras&&value.helperOnly==='none'&&value.colliders==='all');
  displaySettings = value; collisionMode = value.helperOnly === 'collision' ? 'all' : value.colliders;
  refreshDisplayMetadata(true);
  displayPreview.setSettings(value); shell.update({display: value, collider: collisionMode, displayError: ''});
  clearInput(); sdk.render();
}
shell.on('displayChange', value => setDisplaySettings(JSON.parse(value!) as DisplaySettings));
shell.on('displayOpen', value => {clearInput();if(value==='true')refreshDisplayMetadata(true);});
shell.on('displayPin', value => {shell.update({displayPinned:value==='true'});clearInput();});
const fpsMeter = new FrameRateMeter();
let pacingFrame = 0;
function resetFPS(state: string) {
  fpsMeter.reset();
  shell.update({ pacing: null });
  setText("fpsReadout", `渲染回调 —/s · ${state}`);
  shell.flag("fpsSlow", false);
}
function input() {
  return panelOpen
    ? emptyInput()
    : readControls(
        pressed,
        !!sim.controlledActor.vehicle,
        jumpPressed,
        humanCommands,
        sdk.getKeyBindings(),
        sim.controlledActor.vehicle?.spec.mode,
      );
}
function toast(text: string) {
  if(!text.trim())return;
  notify(text, { id: "world-feedback", duration: 3300 });
}

function clearInput() {
  runtime.clearInput();
  pressed.clear();
  jumpPressed = false;
  humanCommands = {};
}
function syncTeleport() {
  humanDemo = null;
  clearInput();
  runtime.clearInput();
  lastActive = -99;
  toast(sim.controlledActor.message);
  if (paused) renderPausedState();
  if (!panelOpen) sdkPresentation.focus();
}
function selectAsset(id: string) {
  if (!ready) return;
  const variantId=catalog.find(asset=>asset.id===id)?.dragonVariantId;
  if(variantId){selectDragonVariant(variantId,true);return;}
  if (id === "person") {
    if (sim.controlledActor.id !== "person") npcLab?.control("person");
    if(sim.controlledActor.vehicle?.motion.flyingCreature){prepareSelection(session.map.id,defaultRegion(session.map,'person').id,'person');return;}
    if (sim.controlledActor.vehicle) {
      runtime.interact();
      syncTeleport();
    } else {
      sim.controlledActor.message = "当前已是人物 · 可前往人物动作测试点";
      toast(sim.controlledActor.message);
    }
    library.setActive(libraryAssetId(sim.controlledActor.vehicle?.spec.id ?? "person"));
    return;
  }
  const v = sim.vehicles.find((v) => v.spec.id === id);
  if (v && !sim.available(v)) {
    toast("这个载具不适配当前地图，请在测试场景中切换到综合园区。");
    return;
  }
  const selected = runtime.approach(id);
  if (selected) syncTeleport();
  else toast(sim.controlledActor.message);
}
function visit(n: number) {
  const spec = SPECS[n]!;
  if(spec.flyingCreature){prepareSelection(DRAGON_TRAINING.id,'dragon-air',spec.id);shell.update({mapId:session.map.id});return;}
  const spawn = session.map.spawns.find((s) => s.vehicleId === spec.id) ?? {
    id: spec.id,
    vehicleId: spec.id,
    name: spec.name,
    position: spec.spawn,
    yaw: spec.yaw,
    regionId: "staging",
  };
  runtime.prepare(spec.id, spawn);
  syncTeleport();
}
function pause(value = !paused, showOverlay = true) {
  paused = value;
  if (value) sdk.stop();
  else if (ready && !preparingRender && !panelOpen) void sdk.start();
  visuals.forEach(resetVehicleWheels);
  resetFPS(value ? "已暂停" : ready ? "采样中" : "加载中");
  clearInput();
  shell.flag("paused", value && showOverlay);
  shell.text("pauseButton", value ? "继续" : "暂停");
  if (!value && !panelOpen) sdkPresentation.focus();
}
function setCameraView(viewId: string) {
  clearInput();
  if (document.pointerLockElement) document.exitPointerLock();
  sdk.setCameraView(viewId);
  if (paused) renderPausedState();
  shell.update({
    configurationDirty: [...profiles].some(
      ([id, p]) => JSON.stringify(p) !== exportedProfiles.get(id),
    ),
  });
  setText(
    "cameraButton",
    `相机 · ${cameraViewLabel()}`,
  );
  toast(`相机：${cameraViewLabel()}`);
  sdkPresentation.focus();
}
function cycleCamera() {
  const views=cameraViews();if(!views.length)return;const index=views.findIndex(view=>view.id===sdk.inspectCamera().current?.viewId);setCameraView(views[(index+1)%views.length]!.id);
}
function recoverVehicle(){if(!ready)return;if(runtime.recoverVehicle())syncTeleport();toast(sim.controlledActor.message);}
function interact() {
  if (!ready || paused || panelOpen) return;
  humanDemo = null;
  clearInput();
  runtime.interact();
  toast(sim.controlledActor.message);
}
window.addEventListener("keydown", (e) => {
  if (
    !ready ||
    e.defaultPrevented ||
    e.altKey ||
    e.metaKey ||
    panelOpen ||
    (e.target instanceof HTMLElement &&
      e.target.closest(
        "input,textarea,select,[contenteditable=true],[role=dialog],[role=listbox],[data-slot=popover-content],.asset-library,.camera-inspector",
      ))
  )
    return;
  if (e.repeat) return;
  if(sim.controlledActor.vehicle?.motion.aircraft&&Object.values(sdk.getKeyBindings()).some(codes=>codes.includes(e.code))){cancelAircraftAction?.();cancelAircraftAction=undefined;}
  if (
    ["forward", "backward", "left", "right", "jump"].some((action) =>
      sdk.getKeyBindings()[action as humanoid.ControlAction].includes(e.code),
    )
  )
    humanDemo = null;
  if (!e.repeat) {
    if (e.code === "Escape") {
      pause();
      return;
    }
    if (paused || !ready) return;
    if(e.code==='KeyR'&&!e.ctrlKey&&sim.controlledActor.vehicle&&!Object.values(sdk.getKeyBindings()).some(codes=>codes.includes('KeyR'))){e.preventDefault();recoverVehicle();return;}
    if (
      /^Digit[1-6]$/.test(e.code) &&
      !Object.values(sdk.getKeyBindings()).some((codes) =>
        codes.includes(e.code),
      )
    ) {
      const entry = quickSlots[Number(e.code.slice(-1)) - 1];
      if (entry) selectAsset(entry.id);
    }
  }
}, pageEventOptions);
window.addEventListener("blur", clearInput, pageEventOptions);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && ready) pause(true);
}, pageEventOptions);
canvas.addEventListener("contextmenu", (e) => e.preventDefault(), pageEventOptions);
shell.on("recoverButton", recoverVehicle);
shell.on("cameraButton", cycleCamera);
function selectDragonVariant(id:string,enterTraining=false){
  if(!DRAGON_VARIANTS.some(variant=>variant.id===id))return;
  if(id===dragonVariant.id){
    if(enterTraining){prepareSelection(DRAGON_TRAINING.id,'dragon-air','dragon');shell.update({mapId:session.map.id});}
    return;
  }
  if(!sim.controlledActor.vehicle&&session.map.id===DRAGON_TRAINING.id){
    sessionStorage.setItem('dragon-training-person',JSON.stringify({position:sim.controlledActor.player.position.toArray(),yaw:sim.controlledActor.player.yaw}));
  }
  getCameraEditor().state.replace(selectDragonCameraVariant(getCameraEditor().state.snapshot.validDraft,id),true);
  const url=new URL(location.href);url.searchParams.set('dragon',id);
  if(enterTraining)url.hash=`/scenes/${DRAGON_TRAINING.id}`;
  // 保持地图路由，由启动流程重新创建唯一受控实例与动画拥有者。
  location.assign(url.href);
}
shell.on('dragonSelect',id=>{if(id)selectDragonVariant(id);});
shell.on("resetButton", async () => {
  await sdk.reset();
  getCameraEditor().state.invalidate();
  await npcLab?.whenReady();
  if(session.map.id===DRAGON_TRAINING.id)prepareSelection(session.map.id,'dragon-air','dragon');
  else syncTeleport();
  toast("已返回场景起点");
});
shell.on("pauseButton", () => pause());
shell.on("resumeButton", () => pause(false));
// 等弹窗释放焦点后再交还驾驶输入，避免关闭动画将焦点拉回“暂停”按钮。
shell.on("viewportFocus", () => { if (ready && !paused && !panelOpen) sdkPresentation.focus(); });
shell.on("touchInteract", interact);
function renderQuickSlots(assets: AssetEntry[]) {
  quickSlots = assets;
  shell.update({ quick: assets });
}
shell.on("quickSelect", (id) => {
  shell.flag("quickOpen", false);
  selectAsset(id!);
});
const onPanelChange = (open: boolean) => {
  panelOpen = open;
  if (open) sdk.stop();
  else if (ready && !preparingRender && !paused) void sdk.start();
  clearInput();
  resetFPS(open ? "面板暂停" : paused ? "已暂停" : "采样中");
};
const catalog = buildWorkspaceCatalog(SPECS).map(asset=>asset.dragonVariantId
  ? {...asset,thumbnail:`./dragon-thumbnails/${asset.dragonVariantId}.png`} : asset);
function libraryAssetId(instanceId:string):string {
  return instanceId==='dragon' ? catalog.find(asset=>asset.dragonVariantId===dragonVariant.id)?.id??instanceId : instanceId;
}
const library = mountAssetLibrary(el("libraryHost"), {
  assets: catalog,
  onSelect: selectAsset,
  onOpenChange: (open) => {
    clearInput();
    shell.flag("libraryOpen", open);
    if (open) ensureThumbnails();
  },
  onQuickSlotsChange: renderQuickSlots,
});
renderQuickSlots(library.getQuickSlots());
function renderPausedState(_dt = 0) {
  updateVisuals(0);
  updateUI(true);
  shell.flush();
  sdk.render();
}
function prepareSelection(mapId: string, regionId: string, assetId: string) {
  humanDemo = null;
  if (!ready) throw new Error("场地仍在加载");
  const map = getMap(mapId),
    mode =
      assetId === "person"
        ? "character"
        : SPECS.find((s) => s.id === assetId)?.mode;
  if (
    !mode ||
    !map.regions.find((r) => r.id === regionId)?.modes.includes(mode)
  )
    throw new Error("所选主体不适配这个训练区域");

  if (sim.controlledActor.id !== "person") npcLab?.control("person");
  session.switchMap(mapId);
  world = session.world;
  if(assetId==='dragon'){
    const saved=sessionStorage.getItem('dragon-training-person');sessionStorage.removeItem('dragon-training-person');
    let position=map.playerSpawn,yaw=0;
    if(saved){try{const p=JSON.parse(saved);if(Array.isArray(p.position)&&p.position.length===3&&p.position.every(Number.isFinite)&&Number.isFinite(p.yaw)){position=p.position;yaw=p.yaw;}}catch{/* 无效的旧临时状态回到地图准备区。 */}}
    const start={positionWorldMetersXYZ:position,facingYawRadians:yaw-Math.PI};
    runtime.prepareEpisodeStart(runtime.probeEpisodeStart(start).isValid?start:{...start,positionWorldMetersXYZ:map.playerSpawn});
    sdk.setCameraView(sdk.inspectCamera().document!.defaultViewId);
    sim.controlledActor.message='按 H 召唤飞龙 · 等待落稳后到鞍侧按 F 上龙';
  }else prepareCourse(sim, map, regionId, assetId);
  pause(false, false);
  syncTeleport();
  resetFPS("采样中");
}
function humanoidState() {
  const h = sim.controlledActor.controller;
  return {
    佩戴: accessories.snapshot(),
    地图: session.map.name,
    操控权: sim.controlledActor.vehicle ? sim.controlledActor.vehicle.spec.name : "人物",
    状态: h?.state,
    动画: controlledCharacter().clipLabel,
    骨骼: controlledCharacter().sourceCharacter?.rigTargets,
    已载入动作: controlledCharacter().availableHumanoidClips.size,
    速度: h?.speed,
    着地: h?.grounded,
    姿态: h?.stance,
    胶囊高度: h?.capsuleHeight,
    水中: h?.swimming,
    泳姿: h?.swimStyle,
    动作: h?.skills.pose ?? h?.surface.pose,
    探测: h?.probe
      ? {
          类型: h.probe.kind,
          高度: h.probe.height,
          厚度: h.probe.depth,
          原因: h.probe.reason,
        }
      : null,
    提示: h?.lastResult,
    携带: h?.skills.carrying,
    座椅: h?.skills.seated,
    自动演示: humanDemo?.trial.name ?? null,
  };
}
function prepareHumanTrial(mapId: string, trial: CharacterTrial, demo = false) {
  if (!ready) throw new Error("人物动作仍在加载");
  if (sim.controlledActor.id !== "person") npcLab?.control("person");
  session.switchMap(mapId);
  world = session.world;
  if (!runtime.prepareCharacter(trial.position, trial.yaw))
    throw new Error(sim.controlledActor.message);
  sim.controlledActor.message = `${trial.name} · ${trial.description}`;
  humanDemo = null;
  pause(false, false);
  syncTeleport();
  if (demo) {
    humanDemo = new HumanoidDemo(trial, sim.controlledActor.controller?.events.length ?? 0);
    toast(`正在演示：${trial.name} · WASD 可随时接管`);
  }
}
const humanPanel = mountHumanoidLab(document.body, {
  onOpenChange: onPanelChange,
  onPrepare: prepareHumanTrial,
  getState: humanoidState,
  onAction: (command) => {
    if (sim.controlledActor.vehicle) {
      toast("请先离开载具，再执行人物动作");
      return;
    }
    humanDemo = null;
    if (paused) pause(false);
    if (command === "jump") jumpPressed = true;
    else humanCommands = { ...humanCommands, ...command };
    sdkPresentation.focus();
  },
  getKeyBindings: () => sdk.getKeyBindings(),
  getAutoTraverse: () => sim.controlledActor.controller?.autoTraverse ?? false,
  setAutoTraverse: (value) => {
    if (sim.controlledActor.controller) sim.controlledActor.controller.autoTraverse = value;
  },
  getSmoothing: () => controlledCharacter().sourceCharacter?.smoothing ?? true,
  setSmoothing: (value) => {
    const source = controlledCharacter().sourceCharacter; if (source) source.smoothing = value;
  },
  getDebug: () => collisionMode,
  setDebug: setCollisionMode,
});
const equipmentPanel = mountEquipmentPanel(
  document.body,
  character,
  accessories,
  onPanelChange,
);
const workbench = mountWorkbench(document.body, {
  cameraEditor:getCameraEditor,
  specs: SPECS,
  onOpenChange: onPanelChange,
  onPrepare: prepareSelection,
  getMapId: () => session.map.id,
  getAssetId: () => sim.controlledActor.vehicle?.spec.id ?? "person",
  getProfile: (id) => readEditableProfile(runtime, profiles.get(id)!),
  applyProfile: (value) => {
    const profile = parseAssetProfile(value);
    applyControlProfile(runtime, profile);
    profiles.set(profile.assetId, profile);

    if (paused) renderPausedState();
  },
  saveProfile: (profile) => {
    saveAssetProfile(localStorage, profile);
  },
  resetProfile: (id) => {
    clearAssetProfile(localStorage, id);
    const profile = getDefaultProfile(id)!;
    profiles.set(id, profile);
    applyControlProfile(runtime, profile);

    if (paused) renderPausedState();
  },
  getState: () => ({
    地图: session.map.name,
    主体: sim.controlledActor.vehicle?.spec.name ?? "人物",
    资产ID: sim.controlledActor.vehicle?.spec.id ?? "person",
    操控权: sim.controlledActor.vehicle ? "驾驶位" : "步行",
    位置: (sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position)
      .toArray()
      .map((n) => +n.toFixed(2)),
    速度米每秒: +(
      sim.controlledActor.vehicle?.velocity.length() ?? sim.controlledActor.player.velocity.length()
    ).toFixed(2),
    模拟秒: +sim.time.toFixed(3),
    已暂停: paused,
    相机臂长: +(sdk.inspectCamera().current?.nominalDistanceMeters??0).toFixed(2),
    相机避障: cameraCollisionLimited(),
    视野度: +camera.fov.toFixed(1),
    动画: sim.controlledActor.player.animation,
    生物模型: visuals[sim.controlledActor.vehicleIndex]?.creature?.sourceStatus,
    步态: sim.controlledActor.vehicle?.motion.creature?.gait,
    骑乘姿势:
      sim.controlledActor.vehicle?.spec.characterPose === "ride"
        ? "程序姿势占位 · 待替换专用骑乘动作"
        : undefined,
  }),
  togglePause: () => pause(!paused, false),
  step: () => {
    if (!ready) return;
    pause(true, false);
    clearInput();
    sdk.step({humanoid:emptyInput()}, 1);
    renderPausedState(FIXED_STEP);
  },
});
const cameraDirection = new T.Vector3();
function movementState() {
  const v = sim.controlledActor.vehicle,
    c = v?.spec ?? sim.characterControl;
  return {
    powertrain:!!(v?.motion.wheelPhysics||v?.motion.body?.powertrain),
    family: vehicleControlFamily(v?.spec),
    control: humanoid.readMovementSettings(c),
    velocity: (v?.velocity ?? sim.controlledActor.player.velocity).toArray(),
    grounded: v?.grounded ?? sim.controlledActor.player.grounded,
  };
}
const inspector = mountInspector(el("inspectorHost"), {
  cameraEditor:getCameraEditor,
  getAssetId: () => sim.controlledActor.vehicle?.spec.id ?? "person",
  getSubject: () => ({
    name: sim.controlledActor.vehicle?.spec.name ?? "主体人物",
    subtitle: sim.controlledActor.vehicle
      ? `${sim.controlledActor.vehicle.spec.en} / ${sim.controlledActor.vehicle.spec.kernel}`
      : "TRAVERSAL / 101 BONES · 48 CLIPS",
    state: paused ? "已暂停" : sim.controlledActor.vehicle ? "驾驶中" : controlledCharacter().clipLabel,
    color: sim.controlledActor.vehicle?.spec.color ?? "#b4d7c2",
  }),
  getProfile: (id) => readEditableProfile(runtime, profiles.get(id)!),
  applyProfile: (value, tab) => {
    const profile = parseAssetProfile(value);
    if (tab === "movement") applyControlProfile(runtime, profile);

    profiles.set(profile.assetId, profile);
    if (paused) renderPausedState();
  },
  saveProfile: (profile) => {
    saveAssetProfile(localStorage, profile);
  },
  resetProfile: (id, tab) => {
    const profile = structuredClone(profiles.get(id)!),
      defaults = getDefaultProfile(id)!;
    if (tab === "movement") {
      profile.control = defaults.control;
      applyControlProfile(runtime, profile);
    }
    profiles.set(id, profile);
    if (paused) renderPausedState();
  },
  getMovement: movementState,
  getCamera: () => {
    camera.getWorldDirection(cameraDirection);
    return {
      viewId: sdk.inspectCamera().current?.viewId??null,
      kind: sdk.inspectCamera().resolved?.kind??null,
      views: cameraViews(),
      distance: camera.position.distanceTo(cameraTargetPosition()),
      fovDegrees: camera.fov,
      yawRadians: Math.atan2(cameraDirection.x, cameraDirection.z),
      pitchRadians: Math.asin(cameraDirection.y),
      collisionLimited: cameraCollisionLimited(),
    };
  },
  setCameraView,
  getTelemetry: () => ({
    speedKmh:
      (sim.controlledActor.vehicle?.velocity.length() ?? sim.controlledActor.player.velocity.length()) * 3.6,
    altitudeMeters: (sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position).y,
    paused,
    position: (sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position).toArray(),
    headingDegrees:
      (((((sim.controlledActor.vehicle?.yaw ?? sim.controlledActor.player.yaw) * 180) / Math.PI) % 360) + 360) %
      360,
  }),
  onInteract: clearInput,
});
function toggleInspector(show: boolean) {
  if (show && innerWidth <= 1000) library.close();
  shell.flag("inspectorClosed", !show);
  shell.flag("inspectorMobileOpen", show);
  shell.flag("debugActive", show);
  if (show) inspector.sync();
}
shell.on("libraryButton", () =>
  library.isOpen() ? library.close() : library.open(),
);
shell.on("exploreButton", () => {
  library.close();
  shell.flag("quickOpen", false);
  sdkPresentation.focus();
});
const openScenes = () => {
  library.close();
  workbench.open("scenes");
};
shell.on("scenesButton", openScenes);
shell.on("sceneTopButton", openScenes);
shell.on("debugButton", () =>
  toggleInspector(
    library.isOpen() ||
      shell.get().flags.inspectorClosed ||
      (innerWidth <= 720 && !shell.get().flags.inspectorMobileOpen),
  ),
);
shell.on("inspectorClose", () => toggleInspector(false));
shell.on("equipmentButton", () => {
  if (sim.controlledActor.id !== "person") npcLab?.control("person");
  library.close();
  equipmentPanel.open();
});
shell.on("advancedButton", () => workbench.open("camera"));
shell.on("humanButton", () => {
  library.close();
  humanPanel.open();
});
shell.on("quickButton", () => {
  clearInput();
});
shell.on("mapExpandButton", () =>
  shell.flag("mapExpanded", !shell.get().flags.mapExpanded),
);
shell.on("performanceButton", clearInput);

shell.update({ mapId: session.map.id });
function selectMap(value: string) {
  clearInput();
  const map = getMap(value);
  let id = value===DRAGON_TRAINING.id?"dragon":sim.controlledActor.vehicle?.spec.id ?? "person";
  if (
    !map.regions.some((r) =>
      r.modes.includes(id==='dragon'?'dragon':sim.controlledActor.vehicle?.spec.mode ?? "character"),
    )
  )
    id = "person";
  try {
    prepareSelection(map.id, defaultRegion(map, id).id, id);
  } catch (error) {
    toast(String(error));
    shell.update({ mapId: session.map.id });
    writeMapHash(window, session.map.id, true);
  }
}
shell.on("mapSelect", (value) => selectMap(value!));
function restoreMapFromHash() {
  const id = readMapHash(location.hash, mapIds);
  // Canonicalize missing/invalid routes without adding a history entry.
  writeMapHash(window, id, true);
  // 初次从飞龙网址打开时，地图已经创建，仍需准备地面人物与召唤流程。
  if (id !== session.map.id || (id === DRAGON_TRAINING.id && !sim.controlledActor.vehicle?.spec.flyingCreature)) selectMap(id);
}
shell.on("contributeButton", () => {
  shell.flag("contributionOpen", true);
  onPanelChange(true);
});
shell.on("contributionClose", () => {
  shell.flag("contributionOpen", false);
  onPanelChange(false);
});
shell.on("downloadManifest", () => {
  const template = {
    schema: "vector.asset-contribution.v1",
    id: "team.asset-name",
    name: "填写资产名称",
    version: "0.1.0",
    contributor: "填写贡献者",
    source: "填写模型 / 动作来源与授权",
    status: "draft",
    kind: "vehicle",
    environment: "ground",
    tags: [],
    model: "assets/team/asset-name/model.glb",
    controlProfile: "profiles/team.asset-name.json",
    testCases: [],
    knownLimitations: [],
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "asset-contribution.template.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// Delegation also covers rows and quick slots rebuilt after search/favorites.
const releaseUIInput = (event: Event) => {
  const target =
    event.target instanceof HTMLElement
      ? event.target.closest("button,input,select,textarea")
      : null;
  if (target && !target.hasAttribute("data-key")) clearInput();
};
document.addEventListener("pointerdown", releaseUIInput, pageEventOptions);
document.addEventListener("focusin", releaseUIInput, pageEventOptions);
window.addEventListener(
  "pagehide",
  () => {
    ready = false;
    pageLifetime.abort();
    disposeThumbnails?.();
    spacePanel.dispose();
    for(const binding of cameraEditors.values())binding.state.invalidate();
    inspector.dispose();
    stageObserver.disconnect();
    footerObserver.disconnect();
    humanPanel.dispose();
    equipmentPanel.dispose();
    accessories.dispose();
    displayPreview.dispose();
    visuals.forEach((v) => v.creature?.dispose());
    library.dispose();
    workbench.dispose();
    cancelAnimationFrame(pacingFrame);
    session.dispose();
    shell.dispose();
  },
  { once: true },
);
shell.on("touchDown", (code) => {
  if (!ready) return;
  const bindings = sdk.getKeyBindings();
  if (!pressed.has(code!)) {
    const action = actionForKey(code!, !!sim.controlledActor.vehicle, pressed, bindings);
    if (action?.kind === "humanoid")
      humanCommands = { ...humanCommands, ...action.input };
    if (bindings.jump.includes(code!)) jumpPressed = true;
  }
  pressed.add(code!);
});
shell.on("touchUp", (code) => {
  pressed.delete(code!);
});
const resizeStage = () => {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (ready && (paused || panelOpen)) renderPausedState();
};
const stageObserver = new ResizeObserver(resizeStage);
stageObserver.observe(el("stage"));
const footerObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--footer",
    `${el("shortcutFooter").offsetHeight}px`,
  );
});
footerObserver.observe(el("shortcutFooter"));
window.addEventListener("resize", resizeStage, pageEventOptions);
const mapCanvas = document.querySelector<HTMLCanvasElement>("#map")!,
  ctx = mapCanvas.getContext("2d")!;
function drawMap() {
  const w = 376,
    h = 364,
    map = session.map,
    min = map.bounds.min,
    max = map.bounds.max;
  const scale = Math.min(
    (w - 34) / (max[0] - min[0]),
    (h - 34) / (max[2] - min[2]),
  );
  const cx = w / 2 - (min[0] + max[0]) * 0.5 * scale,
    cy = h / 2 + (min[2] + max[2]) * 0.5 * scale;
  const mp = (x: number, z: number) =>
    [cx + x * scale, cy - z * scale] as const;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#294552";
  ctx.fillRect(12, 12, w - 24, h - 24);
  ctx.strokeStyle = "#44616c";
  ctx.lineWidth = 0.7;
  for (let x = 16; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, h - 14);
    ctx.stroke();
  }
  for (let y = 16; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(w - 14, y);
    ctx.stroke();
  }
  for (const water of map.water) {
    const [x, y] = mp(water.min[0], water.max[2]);
    ctx.fillStyle = "#267283";
    ctx.fillRect(
      x,
      y,
      (water.max[0] - water.min[0]) * scale,
      (water.max[2] - water.min[2]) * scale,
    );
  }
  if (map.id === "grand-prix") {
    ctx.beginPath();
    GRAND_PRIX.samples.forEach(({ position }, i) => {
      const [x, y] = mp(position.x, position.z);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "#c7d0c8";
    ctx.lineWidth = Math.max(3, GRAND_PRIX.roadWidthMeters * scale);
    ctx.lineJoin = "round";
    ctx.stroke();
  } else
    for (const box of map.boxes) {
      if (box.collision === false || box.size[0] > 150 || box.size[2] > 150)
        continue;
      const [x, y] = mp(box.position[0], box.position[2]);
      ctx.fillStyle = box.position[1] < -1 ? "#719f9d55" : "#a7bfc288";
      ctx.fillRect(
        x - (box.size[0] * scale) / 2,
        y - (box.size[2] * scale) / 2,
        Math.max(1, box.size[0] * scale),
        Math.max(1, box.size[2] * scale),
      );
    }
  ctx.font = 'bold 15px "Segoe UI"';
  for (const region of map.regions) {
    const [x, y] = mp(region.center[0], region.center[2]);
    ctx.strokeStyle = region.color;
    ctx.fillStyle = region.color;
    ctx.lineWidth = 1;
    if (map.id !== "grand-prix")
      ctx.strokeRect(
        x - (region.size[0] * scale) / 2,
        y - (region.size[1] * scale) / 2,
        region.size[0] * scale,
        region.size[1] * scale,
      );
    ctx.fillText(region.name.split(" / ")[0]!, x + 3, y - 4);
  }
  sim.vehicles.forEach((v, n) => {
    if (!sim.available(v)) return;
    const [x, y] = mp(v.position.x, v.position.z);
    ctx.fillStyle = v.spec.color;
    ctx.beginPath();
    ctx.arc(x, y, sim.controlledActor.vehicleIndex === n ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
  const p = sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position,
    [x, y] = mp(p.x, p.z),
    yaw = sim.controlledActor.vehicle?.yaw ?? sim.controlledActor.player.yaw;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(yaw);
  ctx.fillStyle = "#f7fbd9";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
const spacePanel=mountSpacePanel(sdkPresentation.ui.root,command=>{runtime.command(command);sdkPresentation.focus();});
let lastUIUpdate = -Infinity,
  lastBindings = "";
function updateUI(force = false) {
  // Paused/stepped frames have no later live tick to refresh throttled telemetry.
  if (!force && performance.now() - lastUIUpdate < 100) return;
  lastUIUpdate = performance.now();
  refreshDisplayMetadata();
  const v = sim.controlledActor.vehicle,
    p = sim.controlledActor.player,
    nearest = sim.controlledActor.nearest(),
    speed = v ? v.velocity.length() : Math.hypot(p.velocity.x, p.velocity.z);
  spacePanel.update(v?humanoid.spaceTelemetry(v):null);
  const drive=v&&v.motion.family!=='space'?humanoid.vehicleDriveTelemetry(v):null;
  shell.update({recoverable:!!v&&['wheeled','motorcycle','unicycle','skateboard'].includes(v.spec.mode),drivetrain:drive?{...drive,speed:Math.round(speed*3.6),throttle:Math.round(drive.effort*100)}:null});
  const h = sim.controlledActor.controller,
    traversalPrompt = humanoidTraversalReady(h)
      ? `WASD + Space · 朝向障碍${h!.swimming ? "攀上岸边" : h!.probe!.kind === "vault" ? "翻越" : "攀上"}`
      : null;
  const bindingSignature = JSON.stringify({keys:sdk.getKeyBindings(),cameraCycle:sdk.inspectCamera().document?.input?.cycleViewIds??[]});
  if (lastActive !== sim.controlledActor.vehicleIndex || lastBindings !== bindingSignature) {
    lastBindings = bindingSignature;
    library.setActive(libraryAssetId(v?.spec.id ?? "person"));
    lastActive = sim.controlledActor.vehicleIndex;
    setText(
      "category",
      v
        ? `${["plane", "glider", "spacecraft", "dragon"].includes(v.spec.mode) ? "FLIGHT" : ["submarine", "boat", "paddled_boat"].includes(v.spec.mode) ? "WATER" : "GROUND"} / ${v.spec.kernel}`
        : "ON FOOT / K01",
    );
    setText("activeName", v?.spec.name ?? "人物动作训练");

    shell.update({
      controls: controlsFor(vehicleControlFamily(v?.spec), sdk.getKeyBindings()),
    });
    setText("shortcutSubject", v ? "载具操作" : "人物操作");
    const systemKeys: [string, string][] = [
      ...(sdk.inspectCamera().document?.input?.cycleViewIds?.length ? [["T", "切换视角"] as [string,string]] : []),
      ["点击 / 拖动", "观察"],
      ["滚轮", "镜头距离"],
      ["Esc", "释放 / 暂停"],
      ["1–6", "快速前往"],
    ];
    shell.update({ system: systemKeys, activeId: v?.spec.id ?? "person" });
    setText(
      "cameraNote",
      v
        ? v.spec.mode === "spacecraft"
          ? "相机随飞行器上方向旋转。拖动鼠标自由观察。"
          : "方向键或鼠标环绕；停止环绕后，行驶中按调试设置自动回正。"
        : "方向键或鼠标拖动环绕，滚轮调整距离。WASD 移动方向随镜头变化。",
    );
  }
  setText(
    "stateValue",
    v
      ? sim.controlledActor.transition > 0
        ? (sim.controlledActor.transitionKind==='exit'?'正在下龙 / 离座':'正在登乘')
        : v.motion.submersible
          ? v.motion.submersible.depth > .4 ? "水下航行" : "水面漂浮"
          : v.submerged
          ? "载具涉水，请复位"
          : v.motion.flyingCreature
            ? (v.motion.flyingCreature.groundPhase!=='airborne'?({approach:'减速准备着陆',landing:'正在着陆',grounded:'地面待机',takeoff:'正在起飞'} as const)[v.motion.flyingCreature.groundPhase]:({hover:'悬停',brake:'减速',cruise:'振翅巡航',boost:'加速',glide:'滑翔',dive:'俯冲',evade:'闪避',collision:'碰撞缓冲'}[v.motion.flyingCreature.mode]+(v.motion.flyingCreature.flamePhase!=='off'?' · 喷火':'')))
          : v.motion.creature
            ? {
                graze: "休息",
                walk: "慢走",
                trot: "快步",
                gallop: "疾驰",
                rest: "停驻",
                flap: "振翅",
                glide: "滑翔",
              }[v.motion.creature.gait]
            : v.spec.mode === "glider" && !v.launched
              ? "等待释放"
              : v.spec.mode === "plane"
                ? v.motion.aircraft?.wearable?humanoid.wearableHint(v.motion.aircraft.wearable,v.motion.aircraft.canopy):v.motion.aircraft?.subtype==='balloon'?`热气球 · 热量 ${Math.round(v.motion.aircraft.temperatureKelvin-273.15)}°C`:`${v.motion.aircraft?.hardLanding?"重着陆":v.motion.aircraft?.stalled?"失速":v.grounded?"地面":"飞行"} · 油门 ${Math.round(v.throttle * 100)}%`
                : "驾驶中"
      : p.swimming
        ? "游泳"
        : p.grounded
          ? "地面移动"
          : "空中",
  );
  setText("speed", String(Math.round(speed * 3.6)));
  const altitude = (v?.position ?? p.position).y;
  setText("heightLabel", altitude < -2 ? "深度" : "海拔");
  setText(
    "height",
    `${Math.round(altitude < -2 ? -altitude - 2 : altitude)} m`,
  );
  shell.flag("interactionSmall", !!v || nearest < 0);
  if (v)
    setHTML(
      "interaction",
      v.motion.flyingCreature
        ? `体力 ${Math.round(v.motion.flyingCreature.staminaRatio*100)}% · ${sim.controlledActor.dragonTransition?(sim.controlledActor.dragonTransition.entering?'正在上龙':'正在下龙'):v.motion.flyingCreature.groundPhase==='grounded'?'F 下龙 · Space 起飞':v.motion.flyingCreature.groundPhase==='airborne'?'F 着陆':'起降中 · F 取消着陆'}${v.motion.flyingCreature.groundFailure?' · '+v.motion.flyingCreature.groundFailure:''}`
        : v.motion.submersible && v.motion.submersible.depth > .4
        ? `深度 ${v.motion.submersible.depth.toFixed(1)} m · <kbd>Space</kbd>上浮 · 回到水面后可开舱离艇`
        : v.submerged && v.spec.mode !== "submarine"
        ? "载具涉水 · 使用页面复位按钮继续训练"
        : v.spec.mode === "glider" && !v.launched
          ? "<kbd>Shift</kbd>从高台释放，开始滑翔"
          : v.spec.mode === "plane" && v.spec.aircraftSubtype && v.spec.aircraftSubtype!=="fixed-wing" && v.spec.aircraftSubtype!=="pusher"
            ? v.spec.hint
          : v.spec.mode === "plane" && v.grounded
            ? "<kbd>Shift</kbd>加油门，约 90 km/h 轻按 S 拉起 · Ctrl 收油并刹车 · T 驾驶舱"
            : v.spec.mode === "plane" ? "W / S 俯仰 · A / D 协调转弯 · 松开回平 · Ctrl 收油 · T 切视角" : `<kbd>F</kbd>${speed > 5 ? "减速至 18 km/h 以下可离开" : "离开 " + v.spec.name}`,
    );
  else
    setHTML(
      "interaction",
      (session.map.id===DRAGON_TRAINING.id
        ? `${humanoid.bindingLabel('summonDragon',sdk.getKeyBindings())} 召唤飞龙 · ${sim.vehicles.find(v=>v.motion.flyingCreature)?.motion.flyingCreature?.summon?.message??'飞龙会降落在附近，落稳后到鞍侧按 F 上龙'}`
        : undefined) ?? h?.skills.hint(sdk.getKeyBindings()) ??
        (h?.surface.mode === "climbing"
          ? "Space 尝试翻上 · C 松手"
          : runtime.characterCapabilities().find((c) => c.id === "climb")
                ?.eligible
            ? "E 进入攀爬"
            : null) ??
        (nearest >= 0
          ? `<kbd>F</kbd>进入 ${SPECS[nearest]!.name}`
          : (traversalPrompt ?? "打开资产库选择主体，或自由探索")),
    );
  if (!v) {
    setText("stateValue", controlledCharacter().clipLabel);
    setText(
      "bottomHint",
      humanDemo
        ? `演示：${humanDemo.trial.name} · WASD 接管`
        : (h?.skills.hint(sdk.getKeyBindings()) ??
            traversalPrompt ??
            h?.lastResult ??
            "打开人物动作面板选择测试"),
    );
  } else
    setText(
      "bottomHint",
      sdk.inspectCamera().resolved?.kind === 'first-person'
        ? "点击画面锁定鼠标 · 自由观察不改变车辆方向 · Esc 释放 / 暂停"
        : "点击 / 拖动观察 · 滚轮调距离 · 页面复位按钮返回起点 · Esc 暂停",
    );
  const pos = v?.position ?? p.position;
  let zone = session.map.regions[0]!,
    distance = Infinity;
  for (const region of session.map.regions) {
    const inside =
      Math.abs(pos.x - region.center[0]) <= region.size[0] / 2 &&
      Math.abs(pos.z - region.center[2]) <= region.size[1] / 2;
    const d = inside
      ? region.size[0] * region.size[1] * 0.00001
      : 1000 + Math.hypot(pos.x - region.center[0], pos.z - region.center[2]);
    if (d < distance) {
      distance = d;
      zone = region;
    }
  }
  setText("zone", zone.name);
  setText(
    "mapBadge",
    session.map.id === "campus" ? "综合园区 · 1 km²" : session.map.name,
  );
  shell.update({ mapId: session.map.id });
  shell.update({
    configurationDirty: [...profiles].some(
      ([id, p]) => JSON.stringify(p) !== exportedProfiles.get(id),
    ),
  });
  setText(
    "cameraButton",
    `相机 · ${cameraViewLabel()}`,
  );
  const inspectorVisible =
    !shell.get().displayPinned &&
    !shell.get().flags.inspectorClosed &&
    (innerWidth > 720 || shell.get().flags.inspectorMobileOpen) &&
    !(innerWidth <= 1000 && library.isOpen());
  if (inspectorVisible) inspector.sync();
  shell.flag(
    "debugActive",
    inspectorVisible,
  );
  if (sim.controlledActor.message && sim.controlledActor.message !== lastMessage) {
    lastMessage = sim.controlledActor.message;
    toast(sim.controlledActor.message);
  }
  drawMap();
}

function updateCreatureVisual(n: number, dt: number) {
  const visual = visuals[n]!,
    state = sim.vehicles[n]!,
    c = state.motion.creature;
  if (visual.root.visible && visual.creature)
    visual.creature.update(
      {
        position: state.position,
        rotation: state.rotation,
        speed: state.speed,
        steering: state.steering,
        grounded: state.grounded,
        time: sim.time,
        gait: c?.gait ?? "rest",
        phase: c?.phase ?? 0,
        flying: c?.flying ?? false,
        ...(c ? { leadPosition: c.leadPosition, leadYaw: c.leadYaw } : {}),
      },
      dt,
    );
}
let movingVisualRoot:T.Group|undefined;
let movingVisuals:{id:string;mesh:T.Object3D}[]=[];
function updateVisuals(dt: number,sample?:humanoid.HumanoidDisplaySample) {
  visuals.forEach((vis, n) => {
    const state = sim.vehicles[n]!;
    if(state.motion.family==='space')updateSpaceExhaust(vis.engine,state.motion.appliedForceNewtonsXYZ,state.rotation,state.spec.spaceFlight!.thrustNewtonsXYZ[2]);
    updateCreatureVisual(n, dt);
    updateVehicleWheels(vis, sample?.vehicles[n]??state, {
      grounded: state.grounded && !state.submerged,
      dt,
      revision: sim.controlledActor.teleportRevision,
      active: n === sim.controlledActor.vehicleIndex,
    });
    if (n === sim.controlledActor.vehicleIndex)
      vis.aircraftCockpit?.update({...state,aircraft:state.motion.aircraft},sim.time);
    vis.soaringShell?.update({...state,aircraft:state.motion.aircraft},n===sim.controlledActor.vehicleIndex?character.root:undefined);
    if(state.motion.aircraft)vis.aircraftShell?.update(sample?.vehicles[n]?.aircraft??state.motion.aircraft);
    if(n===sim.controlledActor.vehicleIndex&&!state.motion.aircraft)vis.rotors.forEach((r) => (r.rotation.z += (state.motion.aircraft?state.throttle*70:(state.speed+4)*4)*dt));
    vis.label.visible =
      n !== sim.controlledActor.vehicleIndex &&
      camera.position.distanceToSquared(state.position) < 8100;
  });
  const held = [character, ...(npcLab?.characters() ?? [])].flatMap(actor => actor.carriedAttachment ? [actor.carriedAttachment] : []);
  world.interactionProps.update(humanoid.readInteractionTargets(sim.environment).map(target => {
    const attachment = held.find(item => item.id === target.id);
    return attachment && target.state === 'carried' ? {...target, position: attachment.position} : target;
  }));
  npcLab?.update();
  world.update(
    sim.time,
    sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position,
    (runtime.environment.map.water.some(w=>camera.position.x>=w.min[0]&&camera.position.x<=w.max[0]&&camera.position.z>=w.min[2]&&camera.position.z<=w.max[2]&&camera.position.y>=w.min[1]&&camera.position.y<w.surface-.15)),
  );
  if(movingVisualRoot!==world.root){movingVisualRoot=world.root;const indexed=new Map<string,T.Object3D>();world.root.traverse(mesh=>indexed.set(mesh.name,mesh));movingVisuals=session.map.boxes.filter(b=>b.rigidGroup||b.liftId).flatMap(b=>{const mesh=indexed.get(b.id);return mesh?[{id:b.id,mesh}]:[];});}
  for(const {id,mesh} of movingVisuals){const pose=sim.environment.propBoxPose(id);if(pose){mesh.position.copy(pose.position);mesh.quaternion.copy(pose.rotation);}}
  updateUI();
}
runtime.onVisualUpdate(updateVisuals);
let releaseUIOverride: (() => void) | undefined;
sdk.onUpdate(({ deltaSeconds }) => {
  const demo = humanDemo?.step(
    deltaSeconds,
    humanoidTraversalReady(sim.controlledActor.controller),
  );
  if (humanDemo && !demo) humanDemo = null;
  const override =
    demo ??
    (pressed.size || jumpPressed || Object.keys(humanCommands).length
      ? input()
      : undefined);
  if (override) releaseUIOverride = runtime.setInput(override);
  else if (releaseUIOverride) {
    releaseUIOverride();
    releaseUIOverride = undefined;
  }
  jumpPressed = false;
  humanCommands = {};
});
sdk.onReset(() => {
  // The SDK already reset owned inputs; clear only application intent here.
  pressed.clear();jumpPressed=false;humanCommands={};releaseUIOverride=undefined;
  humanDemo = null;
  lastActive = -99;
});
// Seal only the persistent Playground content. Scene-local NPCs are recreated on reset.
sdk.step({}, 0);
npcLab = createNpcPlayground(sdk, {
  focus: () => { pause(false, false); sdkPresentation.focus(); },
  beforeControl: () => { clearInput(); humanDemo = null; },
  changed: () => { lastActive = -99; refreshDisplayMetadata(); },
});
sdkPresentation.ui.mount(npcLab.panel);
await npcLab.setMap(session.map.id);
// Keep loading visible while first-use shaders and camera geometry are prepared.
// The SDK remains the only clock; render() samples display state without stepping.
try {
  let preparedMap: string;
  do {
    // Apply URL edits made during loading before preparing that map's materials.
    ready = true;
    restoreMapFromHash();
    ready = false;
    preparedMap = session.map.id;
    shell.text("loadText", "正在准备画面与材质…");
    shell.flush();
    await preparePlaygroundRendering({
      prepareVisuals: () => {
        updateVisuals(0);
      },
      compile: () => renderer.compileAsync(scene, camera),
      render: () => sdk.render(),
      signal: pageLifetime.signal,
    });
  } while (readMapHash(location.hash, mapIds) !== preparedMap);
  clearInput();
  preparingRender = false;
  if (!paused && !panelOpen) await sdk.start();
  ready = true;
} catch (error) {
  if (!pageLifetime.signal.aborted) {
    shell.text("loadText", "画面准备失败：" + String(error));
    shell.flush();
  }
  throw error;
}
window.addEventListener("hashchange", restoreMapFromHash, pageEventOptions);
// Read-only browser callback cadence; no simulation, animation or camera writes.
const observePacing = (now: number) => {
  if (!paused && !panelOpen) {
    const reading = fpsMeter.sample(now);
    if (reading) {
      shell.update({ pacing: reading });
      setText("fpsReadout", `渲染回调 ${reading.fps.toFixed(0)}/s`);
      shell.flag("fpsSlow", reading.fps < 45);
    }
  }
  pacingFrame = requestAnimationFrame(observePacing);
};
pacingFrame = requestAnimationFrame(observePacing);
// 太空深链接只选择太空实例；进入仍使用主项目 F 操作。
const requestedSpace=new URLSearchParams(location.search).get('space');
if(requestedSpace&&['spacecraft','survey-spacecraft'].includes(requestedSpace)&&session.map.regions.some(r=>r.modes.includes('spacecraft')))visit(SPECS.findIndex(s=>s.id===requestedSpace));
shell.flag("loading", false);
shell.flush();
sdkPresentation.focus();
toast(
  `Whitebox SDK · 101 骨 / 48 动作 / ${SPECS.length} 载具 / ${MAPS.length} 地图`,
);
// Asset previews are only needed while browsing. Starting their second renderer
// during driving competes with the simulation and compiles extra shader programs.
function ensureThumbnails() {
 if (!ready || disposeThumbnails) return;
 disposeThumbnails = renderAssetThumbnails(
  [
    { id: "person", object: character.root },
    ...visuals.flatMap((v, n) => SPECS[n]!.flyingCreature ? [] : [{ id: SPECS[n]!.id, object: v.root }]),
  ],
  (id, url) => library.setThumbnail(id, url),
  () => library.isOpen(),
 );
}
if (library.isOpen()) ensureThumbnails();
shell.on("exportProfiles", () => {
  const value = { schemaVersion: 2, profiles: [...profiles.values()] };
  const uri = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = uri;
  a.download = "profiles.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(uri), 1000);
  toast("将 profiles.json 放回项目目录后重新编译，交付才会使用这些参数");
});
// Small local command surface for repeatable player selections and state inspection.
let cancelAircraftAction: (() => void) | undefined;
const labAPI = {
  inspectAircraftActions: () => ({
    vehicleId: sim.controlledActor.vehicle?.motion.aircraft ? sim.controlledActor.vehicle.spec.id : null,
    actions: runtime.inspectAircraftActions(),
    execution: runtime.inspectAircraftActionExecution(),
  }),
  setAircraftActions: (requests: readonly AircraftActionRequest[], durationSeconds: number) => {
    if (!ready || paused || panelOpen) throw new Error('Resume the training ground before aircraft actions');
    cancelAircraftAction = runtime.setAircraftActions(requests, durationSeconds);
    return labAPI.inspectAircraftActions();
  },
  cancelAircraftActions: () => {
    cancelAircraftAction?.();
    cancelAircraftAction = undefined;
    return labAPI.inspectAircraftActions();
  },
  getState: () => ({
    spaceFlight:sim.controlledActor.vehicle?humanoid.spaceTelemetry(sim.controlledActor.vehicle):null,
    inputState:runtime.inspectControls(),
    dragon: (()=>{const v=sim.vehicles.find(v=>v.motion.flyingCreature);return v?{position:v.position.toArray(),state:structuredClone(v.motion.flyingCreature),boarding:sim.controlledActor.inspectBoarding(v.spec.id)}:null;})(),
    dragonVariant:dragonVariant.id,
    npc: npcLab?.state(),
    controlledEntityId: sdk.snapshot().controlledEntityId,
    worldErrors: sdk.snapshot().errors,
    cameraOwnership: sdk.snapshot().camera,
    cameraProject:{...cameraProject,document:getCameraEditor().state.snapshot.draft,unsaved:getCameraEditor().state.snapshot.dirty},
    cameraEditor:getCameraEditor().state.snapshot,
    entityIds: sdk.snapshot().entities.map(entity => entity.id),
    display: displaySettings,
    diagnosticVisible: !!displayPreview.canvas && !displayPreview.canvas.hidden,
    flyingCreature:sim.controlledActor.vehicle?.motion.flyingCreature?{...sim.controlledActor.vehicle.motion.flyingCreature}:undefined,
    dragonVisual:nativeDragon.inspect(),
    dragonSeat:nativeDragon.readSeatWorld().elements,
    riderHip:controlledCharacter().hip?.getWorldPosition(new T.Vector3()).toArray(),
    flight:sim.controlledActor.vehicle?.motion.aircraft?{...sim.controlledActor.vehicle.motion.aircraft,throttle:sim.controlledActor.vehicle.throttle,grounded:sim.controlledActor.vehicle.grounded}:undefined,
    vehicleRotation:sim.controlledActor.vehicle?.rotation.toArray(),powertrain:sim.controlledActor.vehicle?(sim.controlledActor.vehicle.motion.wheelPhysics?.powertrain??sim.controlledActor.vehicle.motion.body?.powertrain?{...(sim.controlledActor.vehicle.motion.wheelPhysics?.powertrain??sim.controlledActor.vehicle.motion.body?.powertrain)}:undefined):undefined,wheelTelemetry:sim.controlledActor.vehicle?.motion.wheelPhysics?.wheels.map(w=>({...w})),driveTelemetry:sim.controlledActor.vehicle?humanoid.vehicleDriveTelemetry(sim.controlledActor.vehicle):null,

    mapId: session.map.id,
    activeVehicle: sim.controlledActor.vehicle?.spec.id ?? null,
    transitionSeconds: sim.controlledActor.transition,
    transitionKind: sim.controlledActor.transitionKind,
    mode: sim.controlledActor.vehicle?.spec.mode ?? "character",
    position: (sim.controlledActor.vehicle?.position ?? sim.controlledActor.player.position).toArray(),
    speed: sim.controlledActor.vehicle?.speed ?? sim.controlledActor.player.velocity.length(),
    movement: movementState(),
    animation: sim.controlledActor.player.animation,
    ready,
    paused,
    simulationTime: sim.time,
    camera: {
      viewId: sdk.inspectCamera().current?.viewId??null,
      viewKind: sdk.inspectCamera().resolved?.kind??null,
      yaw: (sdk.inspectCamera().intent?.yawRadians??0),
      pitch: (sdk.inspectCamera().intent?.pitchRadians??0),
      distance: (sdk.inspectCamera().current?.nominalDistanceMeters??0),
      position: camera.position.toArray(),
      target: cameraTargetPosition().toArray(),
    },
    vehicleCount: SPECS.length,
    vehicleIdentities: runtime.snapshot().vehicles.map(({instanceId,assetId})=>({instanceId,assetId})),
    creature: sim.controlledActor.vehicle?.motion.creature,
    creatureSources: visuals
      .filter((v) => v.creature)
      .map((v) => ({ id: v.root.name, ...v.creature!.sourceStatus })),
  }),
  selectVehicle: (id: string) => {
    const n = SPECS.findIndex((s) => s.id === id);
    if (n < 0) throw new Error("Unknown vehicle");
    visit(n);
    return labAPI.getState();
  },
  reset: async () => {
    await sdk.reset();
  getCameraEditor().state.invalidate();
    await npcLab?.whenReady();
    if(session.map.id===DRAGON_TRAINING.id)prepareSelection(session.map.id,'dragon-air','dragon');
    else syncTeleport();
    return labAPI.getState();
  },
  humanoidState: () => ({
    ...humanoidState(),
    events: sim.controlledActor.controller?.events.slice(-6),
    position: sim.controlledActor.controller?.position.toArray(),
    targets: runtime.snapshot().interactionTargets,
    capabilities: runtime.characterCapabilities(),
  }),
};
Object.assign(window, { playground: labAPI });
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
const context = (document as Document & { modelContext?: ModelContext })
  .modelContext;
if (context?.registerTool) {
  const register = (
    name: string,
    description: string,
    inputSchema: object,
    readOnlyHint: boolean,
    execute: (input: unknown) => unknown,
  ) => {
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name,
            description,
            inputSchema,
            annotations: { readOnlyHint },
            execute,
          },
          { signal: pageLifetime.signal },
        ),
      ).catch((error) => console.warn("Playground tool unavailable", error));
    } catch (error) {
      console.warn("Playground tool unavailable", error);
    }
  };
  if(import.meta.env.DEV)register('step_vehicle_controls','Pause and execute up to 600 fixed SDK input steps for a local vehicle regression; leaves the scene paused for inspection.',
    {type:'object',properties:{frames:{type:'integer',minimum:1,maximum:600},input:{type:'object',properties:Object.fromEntries(['forward','steer','boost','slow','brake','primary','secondary'].map(key=>[key,{type:['forward','steer'].includes(key)?'number':'boolean'}])),additionalProperties:false}},required:['frames','input'],additionalProperties:false},false,(value)=>{
      const request=value as {frames:number;input:Partial<humanoid.Input>};
      if(!Number.isInteger(request.frames)||request.frames<1||request.frames>600)throw new Error('Invalid frame count');
      const input={...emptyInput(),...request.input};runtime.setInput(input)();
      clearInput();pause(true,false);sdk.step({humanoid:input},request.frames);renderPausedState();return labAPI.getState();
    });
  register(
    "inspect_playground",
    "Read current vehicle, location, speed and character state.",
    { type: "object", properties: {}, additionalProperties: false },
    true,
    () => labAPI.getState(),
  );
  register('summon_dragon','Ask the existing dragon to fly to a safe landing beside the unmounted character. Does not teleport or mount the character; inspect dragon.state.summon for completion.',
    {type:'object',properties:{},additionalProperties:false},false,()=>{
      if(!ready||paused)throw new Error('请先恢复训练');
      if(!runtime.summonDragon('dragon'))throw new Error(sim.controlledActor.message);
      return labAPI.getState();
    });
  register(
    "inspect_aircraft_actions",
    "Read actions and current eligibility for the mounted aircraft subtype. Query before requesting actions.",
    {type:'object',properties:{},additionalProperties:false}, true,
    () => labAPI.inspectAircraftActions(),
  );
  register(
    "execute_aircraft_actions",
    "Execute the mounted aircraft's semantic actions for simulation seconds. New requests replace old ones; keyboard input takes over. Only actions returned by inspect_aircraft_actions are supported. Axis strength is 0–1; omit strength for hold/trigger actions.",
    {type:'object',properties:{requests:{type:'array',items:{type:'object',properties:{action:{type:'string'},strength:{type:'number',minimum:0,maximum:1}},required:['action'],additionalProperties:false}},durationSeconds:{type:'number',exclusiveMinimum:0,maximum:60}},required:['requests','durationSeconds'],additionalProperties:false}, false,
    (value) => {
      const input=value as {requests:AircraftActionRequest[];durationSeconds:number};
      if(!input || !Array.isArray(input.requests)) throw new Error('Aircraft action requests must be an array');
      return labAPI.setAircraftActions(input.requests,input.durationSeconds);
    },
  );
  register(
    "cancel_aircraft_actions", "Cancel the current aircraft semantic request and return to normal input.",
    {type:'object',properties:{},additionalProperties:false}, false,
    () => labAPI.cancelAircraftActions(),
  );
  register(
    "inspect_character",
    "Read the character action, rig, interaction target eligibility and recent traversal events.",
    { type: "object", properties: {}, additionalProperties: false },
    true,
    () => labAPI.humanoidState(),
  );
  register(
    "prepare_character_trial",
    "Move the character to an authored action workshop trial; optionally play its interruptible demonstration.",
    {
      type: "object",
      properties: {
        mapId: {
          type: "string",
          enum: MAPS.filter((m) => m.characterTrials?.length).map((m) => m.id),
        },
        trialId: { type: "string" },
        demo: { type: "boolean" },
      },
      required: ["mapId", "trialId"],
      additionalProperties: false,
    },
    false,
    (input) => {
      if (
        !input ||
        typeof input !== "object" ||
        !("mapId" in input) ||
        !("trialId" in input) ||
        typeof input.mapId !== "string" ||
        typeof input.trialId !== "string"
      )
        throw new Error("mapId and trialId are required");
      const trial = getMap(input.mapId).characterTrials?.find(
        (t) => t.id === input.trialId,
      );
      if (!trial) throw new Error("Unknown character trial");
      humanPanel.close();
      prepareHumanTrial(
        input.mapId,
        trial,
        "demo" in input && input.demo === true,
      );
      return labAPI.humanoidState();
    },
  );
  register(
    "perform_character_action",
    "Start a character skill with a stable request id and optional target; poll its operation until terminal.",
    {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["roll", "slide", "pickup", "putDown", "sit", "standUp"],
        },
        requestId: { type: "string" },
        targetId: { type: "string" },
        slotId: { type: "string" },
      },
      required: ["action", "requestId"],
      additionalProperties: false,
    },
    false,
    (input) =>
      sdk.execute({ type: "humanoid.perform-action", request: input as SkillRequest }),
  );
  register(
    "get_character_operation",
    "Read the physical action operation without advancing the simulation.",
    {
      type: "object",
      properties: { operationId: { type: "string" } },
      required: ["operationId"],
      additionalProperties: false,
    },
    true,
    (input) => {
      if (
        !input ||
        typeof input !== "object" ||
        !("operationId" in input) ||
        typeof input.operationId !== "string"
      )
        throw new Error("operationId is required");
      return sdk.operations.get(input.operationId);
    },
  );
  register(
    "prepare_vehicle",
    "Restore the selected vehicle at its staging point and move the character next to it. Does not board the vehicle.",
    {
      type: "object",
      properties: {
        vehicleId: { type: "string", enum: SPECS.map((s) => s.id) },
      },
      required: ["vehicleId"],
      additionalProperties: false,
    },
    false,
    (input) => {
      if (!ready) throw new Error("Playground is still loading");
      if (
        !input ||
        typeof input !== "object" ||
        !("vehicleId" in input) ||
        typeof input.vehicleId !== "string"
      )
        throw new Error("vehicleId is required");
      const result = labAPI.selectVehicle(input.vehicleId);
      updateUI();
      return result;
    },
  );
  register(
    "toggle_vehicle",
    "Board or exit a stationary vehicle. For a flying dragon, request/cancel landing first; once grounded, use again to dismount. Completion is reported by activeVehicle and transition state.",
    { type: "object", properties: {}, additionalProperties: false },
    false,
    () => {
      if (!ready || paused)
        throw new Error("Resume the loaded playground first");
      humanDemo = null;
      if (!runtime.interact()) throw new Error(sim.controlledActor.message);
      updateUI();
      return labAPI.getState();
    },
  );
}
