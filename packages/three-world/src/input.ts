import type { WorldInput } from './engine-contracts.js';
export type CameraPointerInput = Readonly<{
  cameraYawRatio?: number; cameraPitchRatio?: number; yawDeltaRadians?: number;
  pitchDeltaRadians?: number; distanceDeltaMeters?: number; activate?: boolean;
}>;

import type { Mode } from './humanoid-runtime/config.js';
import { vehicleKeyboardAxes } from './humanoid-runtime/input.js';
import { actionForKey, readControls, DEFAULT_KEY_BINDINGS, createKeyBindings, type KeyBindings, type KeyAction, type ControlAction } from './humanoid-runtime/input.js';

const UI_CONTROL_SELECTOR = 'input,textarea,select,button,a[href],[role="textbox"],[role="button"]';
function isElement(value: EventTarget): value is Element {
  return (value as Node).nodeType === 1 && typeof (value as Element).matches === 'function';
}
function isUIControl(value: Element): boolean {
  return (value as HTMLElement).isContentEditable || value.matches(UI_CONTROL_SELECTOR);
}
function hasUIControl(event: Event): boolean {
  return event.composedPath().some(value => isElement(value) && isUIControl(value));
}
function includesRoot(event: Event, root: HTMLElement | undefined): boolean {
  return !!root && event.composedPath().some(value => value === root || (isElement(value) && root.contains(value)));
}

export const MOVEMENT_KEYS = new Set(Object.values(DEFAULT_KEY_BINDINGS).flat());
export class WorldKeyboard {
  private humanoidMounted:(()=>Mode|undefined)|undefined;
  private readonly humanoidPressed:KeyAction[]=[];
  private bindings:KeyBindings=DEFAULT_KEY_BINDINGS;
  getKeyBindings():KeyBindings{return createKeyBindings({},this.bindings);}
  setKeyBindings(overrides:Partial<KeyBindings>):void{const next=createKeyBindings(overrides,this.bindings);this.clear();this.bindings=next;}
  private bound(action:ControlAction,code:string):boolean{return this.bindings[action].includes(code);}
  setHumanoidMode(mounted:(()=>Mode|undefined)|undefined):void{this.humanoidMounted=mounted;}
  private admittedKey(code:string):boolean{return Object.values(this.bindings).some(codes=>codes.includes(code));}
  readonly held = new Set<string>();
  private jumpQueued = false;
  private interactQueued = false;
  private cameraToggleQueued=false;
  private abort: AbortController | undefined;
  private admitEvent: ((event: KeyboardEvent) => boolean) | undefined;
  enabled = false;
  readonly transcript: { type: 'keydown' | 'keyup' | 'blur'; code: string; repeat: boolean; simulationTick: number }[] = [];
  constructor(private readonly getTick: () => number, _reset: () => void) {}
  attach(target: Window): void {
    this.detach(); this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    target.addEventListener('keydown', event => {
      if (!this.enabled || hasUIControl(event) || (this.admitEvent && !this.admitEvent(event))) return;
      if (this.admittedKey(event.code)) event.preventDefault();
      this.keyDown(event.code, event.repeat);
    }, options);
    target.addEventListener('keyup', event => this.keyUp(event.code), options);
    target.addEventListener('blur', () => { this.record('blur', '', false); this.clear(); }, options);
    target.document.addEventListener('focusin', event => { if (hasUIControl(event)) this.clear(); }, options);
    target.document.addEventListener('visibilitychange', () => { if (target.document.hidden) this.clear(); }, options);
  }
  /** Internal admission policy; direct fixed-input keyDown/keyUp stay deterministic. */
  setEventAdmission(admit: ((event: KeyboardEvent) => boolean) | undefined): void { this.admitEvent = admit; }
  keyDown(code: string, repeat = false): void {
    if (!this.enabled || !this.admittedKey(code)) return;
    this.record('keydown', code, repeat);
    if (repeat && !this.held.has(code)) return;
    if (!this.held.has(code)) {
      if(this.humanoidMounted){const action=actionForKey(code,!!this.humanoidMounted(),this.held,this.bindings);if(action)this.humanoidPressed.push(action);}
      if(!this.humanoidMounted&&this.bound('cameraToggle',code))this.cameraToggleQueued=true;
      if (this.bound('jump',code)) this.jumpQueued = true;
      if (this.bound('interact',code)) this.interactQueued = true;
    }
    this.held.add(code);
  }
  keyUp(code: string): void { if (this.admittedKey(code)) this.record('keyup', code, false); this.held.delete(code); }
  private record(type: 'keydown' | 'keyup' | 'blur', code: string, repeat: boolean): void {
    if (this.transcript.length < 100_000) this.transcript.push({ type, code, repeat, simulationTick: this.getTick() });
  }
  sample(): WorldInput {
    if(this.humanoidMounted){
      const mode=this.humanoidMounted(),mounted=!!mode,axes=vehicleKeyboardAxes(mode),humanoid:import('./humanoid-runtime/simulation').HumanoidActionInput={};let interact=false,cameraTogglePressed=false;
      for(const action of this.humanoidPressed){if(action.kind==='vehicle')interact=true;else if(action.kind==='camera-toggle')cameraTogglePressed=true;else if(!mounted)Object.assign(humanoid,action.input);}
      const player=readControls(this.held,mounted,this.jumpQueued,humanoid,this.bindings,mode);
      const result:WorldInput={humanoid:player,interactPressed:interact,cameraTogglePressed,cameraYawRatio:axes.strafe?0:Number(this.bindings.cameraLeft.some(code=>this.held.has(code)))-Number(this.bindings.cameraRight.some(code=>this.held.has(code))),cameraPitchRatio:axes.pitch?0:Number(this.bindings.cameraDown.some(code=>this.held.has(code)))-Number(this.bindings.cameraUp.some(code=>this.held.has(code)))};
      this.humanoidPressed.length=0;this.jumpQueued=false;this.interactQueued=false;return result;
    }
    const has = (action:ControlAction) => this.bindings[action].some(code => this.held.has(code));
    const result: WorldInput = {
      moveXRatio: Number(has('right')) - Number(has('left')),
      moveZRatio: Number(has('backward')) - Number(has('forward')),
      cameraYawRatio:Number(has('cameraLeft'))-Number(has('cameraRight')),
      cameraPitchRatio:Number(has('cameraDown'))-Number(has('cameraUp')),
      run: has('sprint'),
      jump: this.jumpQueued || has('jump'),
      jumpPressed: this.jumpQueued,
      interact: this.interactQueued || has('interact'),
      interactPressed: this.interactQueued,
      cameraTogglePressed:this.cameraToggleQueued,
    };
    this.jumpQueued = false; this.interactQueued = false;this.cameraToggleQueued=false; return result;
  }
  clear(): void { this.held.clear(); this.humanoidPressed.length=0;this.jumpQueued = false; this.interactQueued = false;this.cameraToggleQueued=false; }
  detach(): void { this.abort?.abort(); this.abort = undefined; this.clear(); }
}

type InputBinding = {
  surface: HTMLElement;
  uiRoot: HTMLElement | undefined;
  releaseListeners?: () => void;
};
type PointerDrag = { pointerId: number; x: number; y: number };
const activeRouterByDocument = new WeakMap<Document, WorldInputRouter>();

/** One pointer/focus owner layered over the world's existing keyboard and clock. */
export class WorldInputRouter {
  private readonly bindings: InputBinding[] = [];
  private pointer: PointerDrag | undefined;
  private blocked = false;
  private disposed = false;
  constructor(private readonly keyboard: WorldKeyboard, private readonly options: {
    isRunning: () => boolean;
    canZoom: () => boolean;
    wantsPointerLock?: () => boolean;
    onPointer: (input: CameraPointerInput) => void;
    onRelease: () => void;
  }) {
    this.keyboard.setEventAdmission(event => {
      const binding = this.current;
      return !!binding && activeRouterByDocument.get(binding.surface.ownerDocument) === this &&
        !this.blocked && this.options.isRunning() && !includesRoot(event, binding.uiRoot);
    });
  }
  private get current(): InputBinding | undefined { return this.bindings[this.bindings.length - 1]; }

  bind(surface: HTMLElement, uiRoot?: HTMLElement): () => void {
    if (this.disposed) throw new Error('WORLD_INPUT_ROUTER_DISPOSED');
    this.suspend();
    const binding: InputBinding = { surface, uiRoot };
    this.bindings.push(binding);
    this.install(binding);
    let released = false;
    return () => {
      if (released || this.disposed) return;
      released = true;
      const isCurrent = this.current === binding;
      if (isCurrent) this.suspend();
      const index = this.bindings.indexOf(binding);
      if (index >= 0) this.bindings.splice(index, 1);
      if (isCurrent && this.current) this.install(this.current);
    };
  }

  focus(): void {
    const binding = this.current;
    if (!binding || this.disposed) return;
    this.activate(false);
    binding.surface.focus({ preventScroll: true });
  }
  releasePointerLock(): void { const surface=this.current?.surface;if(surface&&surface.ownerDocument.pointerLockElement===surface)surface.ownerDocument.exitPointerLock(); }
  clear(): void { this.releasePointerLock();this.releasePointer(); this.keyboard.clear(); this.options.onRelease(); }
  dispose(): void {
    if (this.disposed) return;
    this.suspend(); this.bindings.length = 0; this.disposed = true;
    // A disposed router must not expose a still-attached keyboard to the whole page.
    this.keyboard.setEventAdmission(() => false);
  }

  private activate(blocked: boolean): void {
    const binding = this.current;
    if (!binding) return;
    const doc = binding.surface.ownerDocument;
    const previous = activeRouterByDocument.get(doc);
    if (previous !== this) { previous?.clear(); this.clear(); activeRouterByDocument.set(doc, this); }
    if (blocked) this.clear();
    this.blocked = blocked;
  }
  private releasePointer(): void {
    const drag = this.pointer;
    this.pointer = undefined;
    const surface = this.current?.surface;
    if (drag && surface?.hasPointerCapture(drag.pointerId)) surface.releasePointerCapture(drag.pointerId);
  }
  private suspend(): void {
    const binding = this.current;
    if (!binding) return;
    this.clear(); binding.releaseListeners?.(); delete binding.releaseListeners;
    if (activeRouterByDocument.get(binding.surface.ownerDocument) === this) activeRouterByDocument.delete(binding.surface.ownerDocument);
  }
  private install(binding: InputBinding): void {
    const { surface, uiRoot } = binding, doc = surface.ownerDocument, win = doc.defaultView;
    const abort = new AbortController(), options = { signal: abort.signal };
    const tabIndex = surface.getAttribute('tabindex');
    const touchAction = surface.style.getPropertyValue('touch-action');
    const touchPriority = surface.style.getPropertyPriority('touch-action');
    if (tabIndex === null) surface.tabIndex = 0;
    surface.style.setProperty('touch-action', 'none');
    // Binding an overlay does not produce focusin. Preserve an existing UI pause,
    // including when disposal has just removed the focused control from the DOM.
    const focused = doc.activeElement;
    let deepFocused = focused;
    while (deepFocused?.shadowRoot?.activeElement) deepFocused = deepFocused.shadowRoot.activeElement;
    if (focused && focused !== doc.body && focused !== doc.documentElement &&
      (uiRoot?.contains(focused) || !surface.contains(focused) || isUIControl(focused) || (deepFocused && isUIControl(deepFocused)))) this.blocked = true;
    if (!activeRouterByDocument.has(doc)) activeRouterByDocument.set(doc, this);
    const isUI = (event: Event) => includesRoot(event, uiRoot) || hasUIControl(event);
    const isActive = () => activeRouterByDocument.get(doc) === this && !this.blocked;
    const blockUI = (event: Event) => {
      if (includesRoot(event, uiRoot)) this.activate(true);
      else if (hasUIControl(event) && activeRouterByDocument.get(doc) === this) { this.blocked = true; this.clear(); }
    };
    doc.addEventListener('pointerdown', blockUI, { ...options, capture: true });
    doc.addEventListener('focusin', event => {
      if (isUI(event)) blockUI(event);
      else if (includesRoot(event, surface)) this.activate(false);
      else if (activeRouterByDocument.get(doc) === this) { this.blocked = true; this.clear(); }
    }, { ...options, capture: true });
    surface.addEventListener('pointerdown', event => {
      if (isUI(event) || !event.isPrimary || event.button !== 0) return;
      this.focus();
      if (!this.options.isRunning()) return;
      event.preventDefault();
      this.releasePointer();
      if(doc.pointerLockElement===surface)return;
      this.pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      if(this.options.wantsPointerLock?.()&&event.pointerType==='mouse'&&surface.requestPointerLock){
        // 先设置拖动捕获，再申请锁定；锁定后的重复点击不能再次捕获指针。
        void surface.requestPointerLock()?.catch(()=>{});
      }
    }, options);
    surface.addEventListener('pointermove', event => {
      if(doc.pointerLockElement===surface)return;
      const drag = this.pointer;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!isActive() || !this.options.isRunning()) { this.clear(); return; }
      const x = event.clientX, y = event.clientY;
      if (x !== drag.x || y !== drag.y) this.options.onPointer({ yawDeltaRadians: -(x - drag.x) * .004, pitchDeltaRadians: (y - drag.y) * .004, activate: true });
      drag.x = x; drag.y = y;
    }, options);
    doc.addEventListener('mousemove',event=>{
      if(doc.pointerLockElement!==surface)return;
      if(!isActive()||!this.options.isRunning()||!this.options.wantsPointerLock?.()){this.clear();return;}
      this.options.onPointer({yawDeltaRadians:-event.movementX*.004,pitchDeltaRadians:event.movementY*.004,activate:true});
    },options);
    doc.addEventListener('pointerlockchange',()=>{if(doc.pointerLockElement!==surface&&activeRouterByDocument.get(doc)===this){this.releasePointer();this.keyboard.clear();this.options.onRelease();}},options);
    surface.addEventListener('pointerup', event => { if (this.pointer?.pointerId === event.pointerId) this.releasePointer(); }, options);
    surface.addEventListener('pointercancel', event => { if (this.pointer?.pointerId === event.pointerId) this.clear(); }, options);
    surface.addEventListener('lostpointercapture', event => { if (this.pointer?.pointerId === event.pointerId) this.clear(); }, options);
    surface.addEventListener('wheel', event => {
      if (isUI(event) || !isActive() || !this.options.isRunning() || !this.options.canZoom()) return;
      event.preventDefault();
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * surface.clientHeight : event.deltaY;
      this.options.onPointer({ distanceDeltaMeters: pixels * .005, activate: true });
    }, { ...options, passive: false });
    win?.addEventListener('blur', () => this.clear(), options);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) this.clear(); }, options);
    binding.releaseListeners = () => {
      abort.abort();
      if (tabIndex === null) surface.removeAttribute('tabindex'); else surface.setAttribute('tabindex', tabIndex);
      if (touchAction) surface.style.setProperty('touch-action', touchAction, touchPriority); else surface.style.removeProperty('touch-action');
    };
  }
}
