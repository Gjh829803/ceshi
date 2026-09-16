/** Optional browser diagnostics. Import explicitly; the core SDK does not mount or register tools. */
export {inspectDebugCamera} from './camera-inspection.js';
export {createDebugControls,DEBUG_CONTROL_SCHEMAS,type DebugControlsPort,type DebugControlTool,type DebugWorld} from './debug-controls.js';
export {createDebugRecording,type DebugRecording,type DebugRecordingPort} from './recording.js';
export type {DebugSourceIdentity,DebugArtifactStore,DebugBundleFiles} from './storage.js';
export {createCollisionOverlay} from './collision-overlay.js';
export {createBrowserDebugStore} from './browser-storage.js';
export {mountDebugPanel,type DebugPanelOptions} from './panel.js';

export {parseDebugIncident,MAX_DEBUG_INCIDENT_BYTES,type DebugIncidentBundle,type DebugIncidentSummary} from './incident.js';
