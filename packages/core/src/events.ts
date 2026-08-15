export type EventMap = Record<string, unknown>;

export type EventListener<T> = (event: T) => void;

/** Minimal typed synchronous event bus used by runtime-facing packages. */
export class EventBus<TEvents extends EventMap> {
  #listeners = new Map<keyof TEvents, Set<EventListener<unknown>>>();

  public on<TKey extends keyof TEvents>(
    type: TKey,
    listener: EventListener<TEvents[TKey]>,
  ): () => void {
    let listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(type, listeners);
    }
    listeners.add(listener as EventListener<unknown>);
    return () => this.off(type, listener);
  }

  public off<TKey extends keyof TEvents>(
    type: TKey,
    listener: EventListener<TEvents[TKey]>,
  ): void {
    const listeners = this.#listeners.get(type);
    listeners?.delete(listener as EventListener<unknown>);
    if (listeners?.size === 0) this.#listeners.delete(type);
  }

  public emit<TKey extends keyof TEvents>(type: TKey, event: TEvents[TKey]): void {
    const listeners = this.#listeners.get(type);
    if (listeners === undefined) return;
    for (const listener of [...listeners]) listener(event);
  }

  public clear(): void {
    this.#listeners.clear();
  }
}
