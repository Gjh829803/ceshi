/** Internal ownership of active task cancellation signals.
 * World validity and asset ownership stay with ThreeWorld and WorldAssets. */
export class WorldTaskScopes {
  private readonly active = new Set<AbortController>();

  begin(): AbortController {
    const scope = new AbortController();
    this.active.add(scope);
    return scope;
  }

  end(scope: AbortController): void {
    this.active.delete(scope);
  }

  abortAll(): void {
    // Iterate the live set: synchronous abort listeners retain their existing
    // registration/removal behavior. Do not snapshot or clear before notifying.
    for (const scope of this.active) scope.abort();
  }

  // Reset/map replacement forget cancelled scopes immediately. Disposal leaves
  // them registered until each task's finally calls end, as before extraction.
  clear(): void {
    this.active.clear();
  }
}