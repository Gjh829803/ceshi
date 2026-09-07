export interface BatchStore {
 namespace:string;
 request:(args:string[],input?:unknown)=>Promise<any>;
 read:(name:string)=>Promise<any>;
 state:(name:string)=>Promise<any>;
 change:(name:string,transform:(state:any)=>unknown,initial?:unknown)=>Promise<{state:any;result:any}>;
 list:()=>Promise<Array<{name:string;state:any}>>;
}
export function createBatchStore(options?:{namespace?:string;request?:(args:string[],input?:unknown)=>Promise<any>}):BatchStore;
export function cohortName(id:string):string;
export const GLOBAL_QUEUE:string;
