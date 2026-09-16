import { randomUUID } from 'node:crypto';
import { creatorToolDiagnostic, type CreatorToolDiagnostic } from './tool-errors.js';

export type Operation = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  result?: any;
  error?: string;
  errorDetails?: CreatorToolDiagnostic;
  progress?: unknown;
};

/** Session-local authority for serialized Host work; journals are output only. */
export class CreatorOperationQueue {
  private readonly operations = new Map<string, Operation>();
  private readonly cancelled = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private activeOperationId?: string;

  constructor(private readonly effects: {
    persist: (operation: Operation) => Promise<void>;
    cancelActive: () => Promise<void>;
  }) {}

  start(type: string, run: (id: string) => Promise<unknown>) {
    const now = new Date().toISOString(), id = randomUUID();
    const operation: Operation = {id, type, status: 'queued', createdAt: now, updatedAt: now};
    this.operations.set(id, operation);
    this.queue = this.queue.then(async () => {
      try {
        if (this.cancelled.has(id)) {
          operation.status = 'cancelled';
          return;
        }
        this.activeOperationId = id;
        operation.status = 'running';
        operation.updatedAt = new Date().toISOString();
        operation.result = await run(id);
        operation.status = this.cancelled.has(id) ? 'cancelled' : 'succeeded';
      } catch (error) {
        operation.status = this.cancelled.has(id) ? 'cancelled' : 'failed';
        operation.errorDetails = creatorToolDiagnostic(error);
        operation.error = operation.errorDetails.message;
      } finally {
        operation.updatedAt = new Date().toISOString();
        delete this.activeOperationId;
        // Queued cancellations have the same terminal journal as executed work.
        await this.effects.persist(operation);
      }
    }).catch(() => {
      // A failed journal write must not poison subsequent operations.
    });
    return {operationId: id, status: operation.status};
  }

  async get(id: string, waitSeconds = 0): Promise<Operation> {
    if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 25) throw new Error('THREE_WAIT_INVALID');
    const operation = this.operations.get(id);
    if (!operation) throw new Error('THREE_OPERATION_UNKNOWN: only operations created in this service session are trusted');
    const until = Date.now() + waitSeconds * 1000;
    while ((operation.status === 'queued' || operation.status === 'running') && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, Math.min(100, until - Date.now())));
    }
    return structuredClone(operation);
  }

  async cancel(id: string) {
    const operation = this.operations.get(id);
    if (!operation) throw new Error('THREE_OPERATION_UNKNOWN');
    if (operation.status === 'queued' || operation.status === 'running') {
      this.cancelled.add(id);
      if (id === this.activeOperationId) await this.effects.cancelActive();
    }
    return this.get(id);
  }

  cancelAll(): void {
    for (const operation of this.operations.values()) {
      if (operation.status === 'queued' || operation.status === 'running') this.cancelled.add(operation.id);
    }
  }

  assertActive(id: string): void {
    if (this.cancelled.has(id)) throw new Error('THREE_OPERATION_CANCELLED');
  }

  updateProgress(id: string, progress: unknown): void {
    const operation = this.operations.get(id);
    if (operation) operation.progress = progress;
  }
}
