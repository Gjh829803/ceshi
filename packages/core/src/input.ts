import type { Disposable } from "@whitebox-world/contracts";

export interface InputTarget extends EventTarget {}

export interface KeyboardInputOptions {
  preventDefault?: readonly string[];
}

export interface InputSnapshot {
  readonly keys: ReadonlySet<string>;
  readonly axes: ReadonlyMap<string, number>;
}

interface KeyboardLikeEvent extends Event {
  readonly code?: string;
  readonly repeat?: boolean;
  preventDefault(): void;
}

/** Frame-aware input state. Browser listeners are optional and detachable. */
export class InputState implements Disposable {
  #keys = new Set<string>();
  #pressed = new Set<string>();
  #released = new Set<string>();
  #axes = new Map<string, number>();
  #connections = new Set<Disposable>();
  #disposed = false;

  public setKey(code: string, down: boolean): void {
    this.#assertUsable();
    const wasDown = this.#keys.has(code);
    if (down === wasDown) return;

    if (down) {
      this.#keys.add(code);
      this.#pressed.add(code);
      this.#released.delete(code);
    } else {
      this.#keys.delete(code);
      this.#released.add(code);
      this.#pressed.delete(code);
    }
  }

  public isKeyDown(code: string): boolean {
    return this.#keys.has(code);
  }

  public wasKeyPressed(code: string): boolean {
    return this.#pressed.has(code);
  }

  public wasKeyReleased(code: string): boolean {
    return this.#released.has(code);
  }

  public setAxis(name: string, value: number): void {
    this.#assertUsable();
    if (!Number.isFinite(value)) throw new Error(`Axis "${name}" must be finite.`);
    this.#axes.set(name, Math.max(-1, Math.min(1, value)));
  }

  public getAxis(name: string): number {
    return this.#axes.get(name) ?? 0;
  }

  public snapshot(): InputSnapshot {
    return {
      keys: new Set(this.#keys),
      axes: new Map(this.#axes),
    };
  }

  /** Clear one-frame transitions after all systems have observed the frame. */
  public endFrame(): void {
    this.#pressed.clear();
    this.#released.clear();
  }

  public reset(): void {
    this.#keys.clear();
    this.#pressed.clear();
    this.#released.clear();
    this.#axes.clear();
  }

  public connectKeyboard(
    target: InputTarget,
    options: KeyboardInputOptions = {},
  ): Disposable {
    this.#assertUsable();
    const preventDefault = new Set(options.preventDefault ?? []);

    const onKeyDown = (rawEvent: Event): void => {
      const event = rawEvent as KeyboardLikeEvent;
      if (event.code === undefined) return;
      if (preventDefault.has(event.code)) event.preventDefault();
      this.setKey(event.code, true);
    };
    const onKeyUp = (rawEvent: Event): void => {
      const event = rawEvent as KeyboardLikeEvent;
      if (event.code === undefined) return;
      if (preventDefault.has(event.code)) event.preventDefault();
      this.setKey(event.code, false);
    };
    const onBlur = (): void => this.reset();

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    target.addEventListener("blur", onBlur);

    let connected = true;
    const connection: Disposable = {
      dispose: () => {
        if (!connected) return;
        connected = false;
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
        target.removeEventListener("blur", onBlur);
        this.#connections.delete(connection);
      },
    };
    this.#connections.add(connection);
    return connection;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const connection of [...this.#connections]) connection.dispose();
    this.reset();
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("InputState has been disposed.");
  }
}
