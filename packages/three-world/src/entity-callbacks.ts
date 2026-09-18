import type {Object3D} from 'three';
import type {EntityLifecycleCallbacks,UpdateContext} from './contracts';
import {failure} from './control-support';

type Hook=keyof EntityLifecycleCallbacks;
type Binding={id:string;object:Object3D;callbacks:EntityLifecycleCallbacks;active:boolean};
interface Host {
 read(id:string,object:Object3D):{active:boolean;retained:boolean};
 invoke(callback:()=>void):void;
 report(error:unknown,id:string,hook:Hook):void;
}
const hooks:readonly Hook[]=['onInit','onEnable','onDisable','onUpdate','onReset','onDispose'];

/** Owns optional subscriptions only. Entity membership and activation remain engine-owned. */
export class EntityCallbackRegistry {
 private readonly bindings=new Set<Binding>();
 constructor(private readonly host:Host){}
 register(id:string,object:Object3D,callbacks:EntityLifecycleCallbacks):()=>void{
  if(!callbacks||typeof callbacks!=='object')throw failure('ENTITY_LIFECYCLE_CALLBACK_INVALID');
  const copy:EntityLifecycleCallbacks={};
  for(const hook of hooks){
   const callback=callbacks[hook];if(callback===undefined)continue;
   if(typeof callback!=='function')throw failure('ENTITY_LIFECYCLE_CALLBACK_INVALID',hook);
   if(['AsyncFunction','AsyncGeneratorFunction','GeneratorFunction'].includes(callback.constructor.name))throw failure('WORLD_ASYNC_CALLBACK_UNSUPPORTED',hook);
   Object.assign(copy,{[hook]:callback});
  }
  const binding:Binding={id,object,callbacks:copy,active:false};this.bindings.add(binding);
  let initializingHook:Hook='onInit';
  try{
   this.call(binding,'onInit');
   if(this.bindings.has(binding)&&this.host.read(id,object).active){binding.active=true;initializingHook='onEnable';this.call(binding,'onEnable');}
  }catch(error){this.host.report(error,id,initializingHook);this.release(binding);throw error;}
  return()=>this.release(binding);
 }
 private call(binding:Binding,hook:Hook,context?:UpdateContext):void{
  const callback=binding.callbacks[hook];if(!callback)return;
  this.host.invoke(()=>{
   const result=(callback as (context?:UpdateContext)=>unknown)(context);
   if(result&&typeof (result as PromiseLike<unknown>).then==='function'){
    // Consume a rejected promise, but never admit asynchronous work to the fixed step.
    void Promise.resolve(result).catch(()=>{});throw failure('WORLD_ASYNC_CALLBACK_UNSUPPORTED',hook);
   }
  });
 }
 private notify(binding:Binding,hook:Hook,context?:UpdateContext):void{
  try{this.call(binding,hook,context);}catch(error){this.host.report(error,binding.id,hook);this.release(binding);}
 }
 private release(binding:Binding):void{
  if(!this.bindings.delete(binding))return;
  // Detach first: callbacks can unsubscribe themselves or another registration.
  if(binding.active){binding.active=false;try{this.call(binding,'onDisable');}catch(error){this.host.report(error,binding.id,'onDisable');}}
  try{this.call(binding,'onDispose');}catch(error){this.host.report(error,binding.id,'onDispose');}
 }
 private reconcile(binding:Binding):void{
  if(!this.bindings.has(binding))return;
  const state=this.host.read(binding.id,binding.object);
  if(!state.retained){this.release(binding);return;}
  if(binding.active!==state.active){binding.active=state.active;this.notify(binding,state.active?'onEnable':'onDisable');}
 }
 removed(object:Object3D,retained:boolean):void{
  for(const binding of [...this.bindings])if(binding.object===object&&this.bindings.has(binding)){
   if(!retained)this.release(binding);
   else if(binding.active){binding.active=false;this.notify(binding,'onDisable');}
  }
 }
 sync():void{for(const binding of [...this.bindings])this.reconcile(binding);}
 update(context:UpdateContext):void{
  for(const binding of [...this.bindings]){
   this.reconcile(binding);
   if(this.bindings.has(binding)&&binding.active)this.notify(binding,'onUpdate',context);
  }
 }
 reset():void{
  for(const binding of [...this.bindings]){
   if(!this.bindings.has(binding))continue;
   const state=this.host.read(binding.id,binding.object);
   if(!state.retained){this.release(binding);continue;}
   if(binding.active&&!state.active){binding.active=false;this.notify(binding,'onDisable');}
   if(this.bindings.has(binding))this.notify(binding,'onReset');
   this.reconcile(binding);
  }
 }
 retainOnly(objects:ReadonlySet<Object3D>):void{for(const binding of [...this.bindings])if(!objects.has(binding.object))this.release(binding);}
 releaseObjects(objects:ReadonlySet<Object3D>):void{for(const binding of [...this.bindings])if(objects.has(binding.object))this.release(binding);}
 dispose():void{for(const binding of [...this.bindings])this.release(binding);}
}
