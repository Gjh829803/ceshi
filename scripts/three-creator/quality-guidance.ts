import {agentDocument} from './agent-docs.js';

export const CREATOR_QUALITY_SUMMARY = 'Read quality for task/completion requirements, programming before authoring or checking, getting-started for SDK capabilities, and assets when selecting resources. Expand only the relevant topic.';
export function qualityAuthoringGuidance(expanded = false) {
  return {
    authority:'creator-host',source:'scripts/three-creator/agent/README.md',
    summary:CREATOR_QUALITY_SUMMARY,
    ...(expanded?{guide:agentDocument('quality')}:{}),
    details:{tool:'creator_get_authoring_schema',arguments:{topic:'quality'}},
  };
}
