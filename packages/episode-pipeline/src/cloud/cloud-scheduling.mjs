import isEqual from 'lodash-es/isEqual.js';
export const EPISODE_SCHEDULING_VERSION = 'episode-single-l4-v1';
/** Positive allowlists are mandatory even when an unrelated GPU pool lacks taints. */
export function episodeScheduling({gpuCount=0,nodeSelector={},tolerations=[]}={}) {
  if (![0,1].includes(gpuCount)) throw Error('EPISODE_SCHEDULING_GPU_INVALID');
  const gpu=gpuCount===1;
  const selector={'karpenter.sh/nodepool':gpu?'worldkit-episode-graphics':'platform',...(gpu?{'node.kubernetes.io/instance-type':'g6.2xlarge'}:{})};
  const allowed=[{key:'workload-type',operator:'Equal',value:gpu?'worldkit-episode-graphics':'platform',effect:'NoSchedule'}];
  if ((Object.keys(nodeSelector).length && !isEqual(nodeSelector,selector)) || (tolerations.length && !isEqual(tolerations,allowed))) throw Error('EPISODE_SCHEDULING_OVERRIDE_FORBIDDEN');
  return {nodeSelector:selector,tolerations:allowed,affinity:{nodeAffinity:{requiredDuringSchedulingIgnoredDuringExecution:{nodeSelectorTerms:[{matchExpressions:[{key:'node.kubernetes.io/instance-type',operator:'In',values:gpu?['g6.2xlarge']:['m6a.xlarge','m6i.xlarge','m6a.2xlarge','m6i.2xlarge']}]}]}}}};
}
