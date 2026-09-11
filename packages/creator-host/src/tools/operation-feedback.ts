import type {CommandReceipt, OperationStatus} from '@worldkit/three';
import type {Operation, ThreeCreatorTools} from './tools.js';

type OperationReply = Pick<Operation, 'id' | 'status'> & Partial<Operation>;
type NextQuery = {tool: 'operations_get' | 'world_get_operation'; arguments: Record<string, string | number>};
type WorldExecution = {
  status: CommandReceipt['status'] | OperationStatus['status'];
  operationId?: string;
  phase?: string;
  error?: OperationStatus['error'];
};

/** Wire guidance only. Host completion and World action completion stay separate. */
export function operationFeedback(operation: OperationReply) {
  let next: NextQuery | null = null;
  let worldExecution: WorldExecution | undefined;
  if (operation.status === 'queued' || operation.status === 'running') {
    next = {tool: 'operations_get', arguments: {operationId: operation.id, waitSeconds: 1}};
  } else if (operation.status === 'succeeded') {
    const world: OperationStatus | undefined = operation.result?.worldOperation;
    const receipt: CommandReceipt | undefined = operation.result?.worldCommandReceipt;
    if (world) {
      worldExecution = {status: world.status, operationId: world.id, phase: world.phase, ...(world.error ? {error: world.error} : {})};
      if (world.status === 'queued' || world.status === 'running') {
        next = {tool: 'world_get_operation', arguments: {worldOperationId: world.id, waitSeconds: 1}};
      }
    } else if (receipt) {
      worldExecution = {status: receipt.status};
      if (receipt.status === 'accepted') {
        worldExecution.operationId = receipt.operationId;
        next = {tool: 'world_get_operation', arguments: {worldOperationId: receipt.operationId, waitSeconds: 1}};
      } else if (receipt.status === 'rejected') worldExecution.error = receipt.error;
    }
  }
  return {...operation, operationId: operation.id, ...(worldExecution ? {worldExecution} : {}), next};
}

/** A reply deadline never cancels, starts simulation, or submits the command again. */
export async function startWithReply(service: ThreeCreatorTools, type: string, run: (id: string) => Promise<unknown>, waitSeconds = 0) {
  const started = service.start(type, run);
  return operationFeedback(waitSeconds > 0
    ? await service.getOperation(started.operationId, waitSeconds)
    : {id: started.operationId, type, status: started.status});
}
