import type { JsonValue, RuntimeError, Scalar, ScalarSchema, ObjectSchema, OperationStatus, TerminalOperationStatus, Operations, DeepReadonly, StateHandle, StateStore } from './contracts.js';

export function failure(code:string,message=code,category:RuntimeError['category']='invalid-input',entityIds:readonly string[]=[]):RuntimeError {
 return {code,message,category,entityIds,phase:'control'};
}
export function runtimeError(error:unknown,phase='control',entityIds:readonly string[]=[]):RuntimeError {
 if(error&&typeof error==='object'&&'category' in error&&'code' in error)return {...error as RuntimeError,phase};
 const message=error instanceof Error?error.message:String(error);
 const code=/^([A-Z][A-Z0-9_]+)/.exec(message)?.[1]??'WORLD_RUNTIME_FAILED';
 return {code,message:message.slice(0,2000),category:code.includes('UNSUPPORTED')||code.includes('UNAVAILABLE')?'unsupported-capability':code.includes('PATH')||code.includes('GEOMETRY')?'content':'runtime',entityIds,phase};
}
export function requireId(id:string):void {if(typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>256||/[\u0000-\u001f]/.test(id))throw failure('WORLD_ID_INVALID');}
export function scalarSchema(schema:ScalarSchema):void {
 if(!schema||typeof schema!=='object')throw failure('SCHEMA_INVALID');
 if(schema.type==='number'){
  if([schema.minimum,schema.maximum].some(v=>v!==undefined&&!Number.isFinite(v))||(schema.minimum!==undefined&&schema.maximum!==undefined&&schema.minimum>schema.maximum))throw failure('SCHEMA_RANGE_INVALID');
 }else if(schema.type==='string'){
  if(schema.enum&&(!schema.enum.length||schema.enum.some(v=>typeof v!=='string')||new Set(schema.enum).size!==schema.enum.length))throw failure('SCHEMA_ENUM_INVALID');
  if(schema.maxLength!==undefined&&(!Number.isSafeInteger(schema.maxLength)||schema.maxLength<0))throw failure('SCHEMA_RANGE_INVALID');
 }else if(schema.type!=='boolean')throw failure('SCHEMA_UNSUPPORTED','Supported parameter types are boolean, number and string.','unsupported-capability');
}
export function scalarValue(schema:ScalarSchema,value:unknown):asserts value is Scalar {
 scalarSchema(schema);
 if(typeof value!==schema.type||(typeof value==='number'&&!Number.isFinite(value)))throw failure('PARAMETER_TYPE_INVALID');
 if(schema.type==='number'&&typeof value==='number'&&((schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)))throw failure('PARAMETER_RANGE_INVALID');
 if(schema.type==='string'&&typeof value==='string'&&((schema.enum&&!schema.enum.includes(value))||(schema.maxLength!==undefined&&value.length>schema.maxLength)))throw failure('PARAMETER_VALUE_INVALID');
}
export function objectSchema(schema:ObjectSchema):void {
 if(!schema||schema.type!=='object'||schema.additionalProperties!==false||!schema.properties||!Array.isArray(schema.required)||schema.required.some(key=>!Object.hasOwn(schema.properties,key))||new Set(schema.required).size!==schema.required.length)throw failure('SCHEMA_OBJECT_INVALID');
 for(const property of Object.values(schema.properties))scalarSchema(property);
}
export function actionArguments(schema:ObjectSchema,args:Readonly<Record<string,Scalar>>):void {
 if(!args||typeof args!=='object'||Array.isArray(args)||schema.required.some(key=>!Object.hasOwn(args,key))||Object.keys(args).some(key=>!Object.hasOwn(schema.properties,key)))throw failure('ACTION_ARGUMENTS_INVALID');
 for(const [key,value] of Object.entries(args))scalarValue(schema.properties[key]!,value);
}
export function cloneJson<T>(value:T):T {
 const encoded=JSON.stringify(value,(_key,item:unknown)=>{
  if(item!==null&&typeof item==='object'&&!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw failure('STATE_JSON_REQUIRED');
  if(typeof item==='number'&&!Number.isFinite(item)||['undefined','function','symbol','bigint'].includes(typeof item))throw failure('STATE_JSON_REQUIRED');
  return item;
 });
 if(encoded===undefined)throw failure('STATE_JSON_REQUIRED');return JSON.parse(encoded) as T;
}
export function synchronous<T>(callback:()=>T):T {const result=callback();if(result&&typeof (result as {then?:unknown}).then==='function')throw failure('WORLD_ASYNC_CALLBACK_UNSUPPORTED','Use runTask for asynchronous preparation; update/effect/plan must be synchronous.');return result;}

type Waiter={resolve:(value:TerminalOperationStatus)=>void;reject:(error:unknown)=>void;cleanup:()=>void};
export class OperationLedger implements Operations {
 private next=0;
 private readonly records=new Map<string,OperationStatus>();
 private readonly waiters=new Map<string,Set<Waiter>>();
 private readonly cancellations=new Map<string,()=>void|false>();
 create(phase:string,cancel?:()=>void|false):string {const id=`world-operation-${++this.next}`;this.records.set(id,{id,status:'queued',phase});if(cancel)this.cancellations.set(id,cancel);return id;}
 get(id:string):OperationStatus {const value=this.records.get(id);if(!value)throw failure('OPERATION_NOT_FOUND');return cloneJson(value);}
 update(id:string,change:Partial<Omit<OperationStatus,'id'>>):void {
  const previous=this.records.get(id);if(!previous||['succeeded','failed','cancelled'].includes(previous.status))return;
  const result={...previous,...change};this.records.set(id,result);
  if(['succeeded','failed','cancelled'].includes(result.status)){
   this.cancellations.delete(id);
   for(const waiter of this.waiters.get(id)??[]){waiter.cleanup();waiter.resolve(cloneJson(result) as TerminalOperationStatus);}
   this.waiters.delete(id);
  }
 }
 cancel(id:string):void {const status=this.get(id);if(['succeeded','failed','cancelled'].includes(status.status))return;if(this.cancellations.get(id)?.()===false){this.update(id,{status:'running',phase:'cancelling'});return;}this.update(id,{status:'cancelled',phase:'cancelled'});}
 cancelAll():void {for(const [id,status] of this.records)if(status.status==='queued'||status.status==='running')this.cancel(id);}
 wait(id:string,options:{readonly signal?:AbortSignal}={}):Promise<TerminalOperationStatus>{
  if(options.signal?.aborted)return Promise.reject(failure('WAIT_ABORTED'));
  const status=this.get(id);if(['succeeded','failed','cancelled'].includes(status.status))return Promise.resolve(status as TerminalOperationStatus);
  return new Promise((resolve,reject)=>{
   const waiters=this.waiters.get(id)??new Set<Waiter>();this.waiters.set(id,waiters);
   const abort=()=>{waiters.delete(waiter);waiter.cleanup();reject(failure('WAIT_ABORTED'));};
   const waiter:Waiter={resolve,reject,cleanup:()=>options.signal?.removeEventListener('abort',abort)};
   waiters.add(waiter);options.signal?.addEventListener('abort',abort,{once:true});
  });
 }
}

export class StateRegistry implements StateStore {
 private readonly values=new Map<string,JsonValue>();
 private baseline:Map<string,JsonValue>|undefined;
 constructor(private readonly beforeWrite:(id:string)=>void=()=>{}){}
 define(id:string,value:number):StateHandle<number>;
 define(id:string,value:boolean):StateHandle<boolean>;
 define(id:string,value:string):StateHandle<string>;
 define<T extends JsonValue>(id:string,value:T):StateHandle<T>;
 define<T extends JsonValue>(id:string,value:T):StateHandle<T>{
  requireId(id);if(this.values.has(id))throw failure('STATE_DUPLICATE');this.values.set(id,cloneJson(value));const store=this;
  return {id,get value(){if(!store.values.has(id))throw failure('STATE_STALE');return cloneJson(store.values.get(id)) as DeepReadonly<T>;},set(next){store.beforeWrite(id);if(!store.values.has(id))throw failure('STATE_STALE');store.values.set(id,cloneJson(next) as JsonValue);}};
 }
 has(id:string):boolean{return this.values.has(id);}
 seal():void {if(!this.baseline)this.baseline=new Map([...this.values].map(([id,value])=>[id,cloneJson(value)]));}
 reset():void {this.values.clear();for(const [id,value] of this.baseline??[])this.values.set(id,cloneJson(value));}
}
