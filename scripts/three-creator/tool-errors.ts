import type { ErrorObject } from 'ajv';
import { HostDiagnosticError, serializeDiagnostic, type SerializedDiagnostic, type HostDiagnosticContext } from './diagnostic-serialization.js';

export interface RecoveryStep {
  instruction: string;
  tool?: string;
  arguments?: Record<string, unknown>;
}
export interface CreatorToolDiagnostic extends SerializedDiagnostic {
  host?: HostDiagnosticContext;
  browserErrors?: SerializedDiagnostic[];
  collectionError?: SerializedDiagnostic;
  code: string;
  message: string;
  details?: unknown;
  nextSteps: RecoveryStep[];
}
export class CreatorToolInputError extends Error {
  readonly code = 'THREE_TOOL_INPUT_INVALID';
  readonly details: { tool: string; validationErrors: ErrorObject[] };
  constructor(tool: string, validationErrors: ErrorObject[] = []) {
    super(`THREE_TOOL_INPUT_INVALID: ${tool} ${JSON.stringify(validationErrors)}`);
    this.name = 'CreatorToolInputError';
    this.details = { tool, validationErrors: structuredClone(validationErrors) };
  }
}

function isErrorInstance<T extends Error>(value: unknown, constructor: new (...args: any[]) => T): value is T {
  try { return value instanceof constructor; } catch { return false; }
}

/** Add recovery guidance without changing validation, scheduling or retry authority. */
export function creatorToolDiagnostic(error: unknown): CreatorToolDiagnostic {
  const original = isErrorInstance(error, HostDiagnosticError) ? error.diagnostic : serializeDiagnostic(error);
  const message = original.message;
  const code = isErrorInstance(error, CreatorToolInputError) ? error.code : original.code ??
    /^(THREE_[A-Z0-9_]+|WORLD_[A-Z0-9_]+|EPISODE_[A-Z0-9_]+|PHYSICS_[A-Z0-9_]+)(?=:|\s|$)/.exec(message)?.[1] ??
    (isErrorInstance(error, SyntaxError) ? 'THREE_JSON_INVALID' : 'THREE_TOOL_FAILED');
  let nextSteps: RecoveryStep[];
  switch (code) {
    case 'ENVIRONMENT_INVALID':
    case 'HUMANOID_CONTENT_REGISTER_IN_OPTIONS':
    case 'DECORATION_CANNOT_HAVE_PHYSICS':
      nextSteps = [{ instruction: original.suggestedAction ?? 'Check the reported environment field or entity registration against the current Humanoid contract. Preserve required collision geometry.', tool: 'creator_get_authoring_schema', arguments: { topic: 'humanoid', sections: ['guide','humanoid'] } }];
      break;
    case 'PHYSICS_TRIANGLE_BUDGET_EXCEEDED':
    case 'PHYSICS_COLLIDER_BUDGET_EXCEEDED':
      nextSteps = [{ instruction: original.suggestedAction ?? 'Inspect collision geometry and the reported budget. Both mesh and static box may subdivide; use convex-hull only when a closed convex volume matches the intended collision. Source and world budgets still apply.', tool: 'creator_get_authoring_schema', arguments: { topic: 'getting-started', sections: ['guide','contracts'] } }];
      break;
    case 'ENTITY_ROLE_REQUIRED':
      nextSteps = [{ instruction: original.suggestedAction ?? 'Set an explicit entity role using the public addEntity contract.', tool: 'creator_get_authoring_schema', arguments: { topic: 'getting-started', sections: ['contracts'] } }];
      break;
    case 'THREE_TOOL_INPUT_INVALID':
      nextSteps = [{ instruction: 'Correct the tool name or arguments using its input schema and details.validationErrors; then call the corrected tool.' }];
      break;
    case 'THREE_JSON_INVALID':
      nextSteps = [{ instruction: 'Provide valid JSON. In --session mode, send one complete JSON object per line.' }];
      break;
    case 'THREE_ASSET_UNAVAILABLE':
    case 'THREE_EXAMPLE_ASSETS_UNAVAILABLE':
      nextSteps = [{ instruction: 'Choose an asset or example whose dependencies are in the frozen allowed catalog. Do not edit or widen the Host policy.', tool: 'assets_search', arguments: { query: '' } }];
      break;
    case 'THREE_RUNTIME_GUIDANCE_SOURCE_MISSING':
      nextSteps = [{ instruction: 'Read the named workspace SDK source file and restore or update the requested interface there. Host baseline contracts cannot substitute for a missing workspace definition.' }];
      break;
    case 'THREE_SCHEMA_TOPIC_UNKNOWN':
    case 'THREE_SDK_EXAMPLE_UNSUPPORTED':
    case 'THREE_WORLD_COMMANDS_UNSUPPORTED':
    case 'THREE_WORLD_OPERATIONS_UNSUPPORTED':
      nextSteps = [{ instruction: 'Read the active profile and supported topics; use the corresponding authoring route.', tool: 'creator_describe_environment', arguments: {} }];
      break;
    case 'THREE_OPERATION_UNKNOWN':
      nextSteps = [{ instruction: 'Use the original Creator operationId in the same service session; a World operationId belongs to world_get_operation. If the outcome is unknown, inspect the original journal. Do not resubmit the job to replace an unknown operation.' }];
      break;
    case 'THREE_SUBMIT_PLAYTEST_REQUIRED':
      nextSteps = [
        { instruction: 'Read the rejection details and resolve source/episode changes or recorded-duration issues. Keep this service session.', tool: 'world_validate', arguments: {} },
        { instruction: 'After fixing those issues, run the complete current episode (omit durationSeconds); it must complete every step with real active input and valid video, covering the requested core functions before submission.', tool: 'world_playtest', arguments: {} },
      ];
      break;
    case 'THREE_EPISODE_INVALID':
    case 'THREE_EPISODE_DURATION_INVALID':
    case 'THREE_PLAYTEST_DURATION_INVALID':
      nextSteps = [{ instruction: 'Correct episode.json or the requested duration against the episode contract; a truncated debug run cannot satisfy full submission.', tool: 'creator_get_authoring_schema', arguments: { sections: ['episode'] } }];
      break;
    case 'THREE_WORLD_COMMAND_INVALID':
      nextSteps = [{ instruction: 'Correct the command using the actual supported command schema.', tool: 'creator_get_authoring_schema', arguments: { topic: 'control', sections: ['commands'] } }];
      break;
    case 'THREE_PLAYTEST_RUNTIME_STOPPED':
    case 'THREE_PLAYTEST_RUNTIME_ERRORS':
    case 'THREE_PLAYTEST_PAGE_ERROR':
    case 'THREE_SUBMIT_CAPTURE_ERRORS':
      nextSteps = [{ instruction: 'Inspect the recorded browser/SDK errors and current world before editing or rerunning acceptance.', tool: 'world_inspect', arguments: {} }];
      break;
    default:
      nextSteps = [{ instruction: 'Inspect the original diagnostic and any operation journal first. Preserve existing evidence and request identity; do not bypass validation or automatically resubmit an unknown operation.' }];
  }
  return { ...original, code, message, ...(isErrorInstance(error, HostDiagnosticError) ? { host: error.host, ...(error.browserErrors ? {browserErrors:error.browserErrors} : {}), ...(error.collectionError ? {collectionError:error.collectionError} : {}) } : {}), ...(isErrorInstance(error, CreatorToolInputError) ? { details: error.details } : {}), nextSteps };
}

export function creatorToolErrorResponse(error: unknown) {
  const errorDetails = creatorToolDiagnostic(error);
  return { error: errorDetails.message, errorDetails };
}
