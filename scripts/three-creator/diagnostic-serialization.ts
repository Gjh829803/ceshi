/** Whitelist shared by Host and injected browser code. Never invokes toJSON; native Error.stack access is guarded. */
export interface SerializedDiagnostic {
  message: string;
  code?: string; category?: string; phase?: string; suggestedAction?: string; stack?: string;
  path?: string; expected?: string;
  actual?: string | number | boolean | null | (string | number | boolean | null)[];
  entityIds?: string[];
  cause?: SerializedDiagnostic;
  causes?: SerializedDiagnostic[];
}
// Keep this function self-contained: its source is injected into the browser, including from keepNames builds.
// Nested named functions/arrows can capture compiler helpers that do not exist in that realm.
export function serializeDiagnostic(value: unknown, depth = 0, seen: unknown[] = []): SerializedDiagnostic {
  const result: SerializedDiagnostic = { message: typeof value === 'string' ? value.slice(0,4000) : 'Unknown thrown value' };
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.includes(value)) return result;
  seen = [...seen, value];
  for (const key of ['message','code','category','phase','suggestedAction','stack','path','actual','expected','entityIds','cause','errors','causes']) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!descriptor) continue;
      // Chromium's native stack getter is shared with a fresh Error in this realm.
      // Author-defined accessors (including on Error instances) are never invoked.
      if (!('value' in descriptor) && !(key === 'stack' && value instanceof Error && descriptor.get && descriptor.get === Object.getOwnPropertyDescriptor(new Error(), 'stack')?.get)) continue;
      const field = 'value' in descriptor ? descriptor.value : Reflect.get(value,key);
      if (key === 'actual') {
        if (Array.isArray(field)) {
          const length = Object.getOwnPropertyDescriptor(field,'length')?.value;
          if (typeof length !== 'number') continue;
          const values: (string | number | boolean | null)[] = [];
          for (let i=0;i<Math.min(length,8);i++) {
            let item: PropertyDescriptor | undefined;
            try { item=Object.getOwnPropertyDescriptor(field,String(i)); } catch { /* Keep an unavailable array slot. */ }
            const itemValue=item && 'value' in item ? item.value : undefined;
            const value=typeof itemValue==='string'?itemValue.slice(0,4000):itemValue===null||typeof itemValue==='boolean'||typeof itemValue==='number'&&Number.isFinite(itemValue)?itemValue:undefined;
            values.push(value === undefined ? '<unavailable>' : value);
          }
          if (length > 8) values.push('<truncated>');
          result.actual=values;
        } else {
          const actual=typeof field==='string'?field.slice(0,4000):field===null||typeof field==='boolean'||typeof field==='number'&&Number.isFinite(field)?field:undefined;
          if (actual !== undefined) result.actual=actual;
        }
      } else if (key === 'entityIds' && Array.isArray(field)) {
        result.entityIds = [];
        for (let i=0;i<Math.min(field.length,20);i++) {
          const item=Object.getOwnPropertyDescriptor(field,String(i));
          if (typeof item?.value === 'string') result.entityIds.push(item.value.slice(0,4000));
        }
      } else if (key === 'cause' && depth < 3 && !seen.includes(field)) result.cause = serializeDiagnostic(field,depth+1,seen);
      else if ((key === 'errors' || key === 'causes') && depth < 3 && Array.isArray(field)) {
        result.causes=[];
        for(let i=0;i<Math.min(field.length,5);i++) {
          const item=Object.getOwnPropertyDescriptor(field,String(i));
          if(item && 'value' in item && !seen.includes(item.value)) result.causes.push(serializeDiagnostic(item.value,depth+1,seen));
        }
      } else if (typeof field === 'string' && ['message','code','category','phase','suggestedAction','stack','path','expected'].includes(key)) (result as any)[key]=field.slice(0,4000);
    } catch { /* A hostile proxy or descriptor cannot break diagnostic delivery. */ }
  }
  return result;
}
export interface HostDiagnosticContext {
  phase: string;
  method?: string;
  candidate: { id: string; sourceHash: string; runtimeHash: string; runtimeSourceHash: string | null; worldBuildHash: string };
}
export class HostDiagnosticError extends Error {
  constructor(readonly diagnostic: SerializedDiagnostic, readonly host: HostDiagnosticContext,
    readonly browserErrors?: SerializedDiagnostic[], readonly collectionError?: SerializedDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = serializeDiagnostic(diagnostic);
    if (browserErrors) this.browserErrors = browserErrors.slice(0,20).map(value => serializeDiagnostic(value));
  }
}
export const browserDiagnosticsScript = `(() => {
  const serialize = ${serializeDiagnostic.toString()};
  const records = [];
  Object.defineProperty(window, '__THREE_CREATOR_DIAGNOSTICS__', {value: {serialize, records}});
  window.addEventListener('error', event => { if(records.length < 20) records.push(serialize(event.error ?? event.message)); });
  window.addEventListener('unhandledrejection', event => { if(records.length < 20) records.push(serialize(event.reason)); });
})();`;
