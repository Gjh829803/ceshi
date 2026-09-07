import type {BatchStore} from './batch-store.mjs';
export interface CaptureContinuation {stopBeforeSeedance:true;outputRoot:string;checkpointS3Uri:string;publishS3Uri:string;producerJobName?:string;until?:'capture'|'pre-seedance'}
export function createBatchQueue(options?:{store?:BatchStore}):{
 store:BatchStore;
 register:(cohortId:string,caseIds:string[])=>Promise<unknown>;
 enqueue:(cohortId:string,task:any,continuation?:CaptureContinuation)=>Promise<unknown>;
 task:(cohortId:string,taskId:string)=>Promise<any>;
 checkpointReady:(cohortId:string,taskId:string,continuation:CaptureContinuation)=>Promise<unknown>;
 terminal:(cohortId:string,caseId:string,status:string)=>Promise<unknown>;
 failPendingProducer:(cohortId:string,caseId:string)=>Promise<unknown>;
 assertActive:(cohortId:string)=>Promise<void>;
 trackRemote:(cohortId:string,caseId:string,remote:any)=>Promise<unknown>;
 cancel:(cohortId:string)=>Promise<unknown>;
};

export function recordCpuReceipt(store:BatchStore,cohortId:string,taskId:string,receipt:any):Promise<void>;
