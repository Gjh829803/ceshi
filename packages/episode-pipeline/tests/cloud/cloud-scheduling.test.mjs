import test from 'node:test';
import assert from 'node:assert/strict';
import { threeEpisodeHostJob, threeEpisodeSourceUploadJob } from '../../src/cloud/cloud-host.mjs';
const base = {jobId:'episode-test', image:`registry/worker@sha256:${'a'.repeat(64)}`, sourceArchiveSha256:'f'.repeat(64), sourceArchiveS3Uri:'s3://bucket/source.tar.gz', runArgs:['packages/episode-pipeline/src/workflow/workflow.ts','--stop-before-seedance']};
test('CPU hosts and source uploads have mandatory CPU placement', () => {
  const host = threeEpisodeHostJob(base);
  const upload = threeEpisodeSourceUploadJob({...base, archivePath:'/fsx/pipeline/worldkit-three-episode-experiments/source.tar.gz', archiveSha256:'b'.repeat(64), outputS3Uri:'s3://bucket/source.tar.gz'});
  for (const j of [host,upload]) {
    assert.equal(j.spec.template.spec.nodeSelector['karpenter.sh/nodepool'], 'platform');
    const types=j.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values;
    assert(types.every(t=>/^m6[ai]\./.test(t)));
  }
});
test('H100 selectors and broad tolerations cannot override placement', () => {
  assert.throws(()=>threeEpisodeHostJob({...base,nodeSelector:{'node.kubernetes.io/instance-type':'p5.48xlarge'}}), /SCHEDULING/);
  assert.throws(()=>threeEpisodeHostJob({...base,tolerations:[{operator:'Exists'}]}), /SCHEDULING/);
});
test('GPU direct-case launch is forbidden without a batch capability', () => {
  assert.throws(()=>threeEpisodeHostJob({...base,gpuCount:1}), /BATCH/);
});
test('only the CPU batch reconciler receives the remote cancellation credential',async()=>{
 const {batchInfrastructure}=await import('../../src/cloud/cloud-batch-infrastructure.mjs');
 const items=batchInfrastructure({image:base.image}).items;
 const devicePlugin=items.find(i=>i.kind==='DaemonSet');
 assert.equal(devicePlugin.metadata.name,'worldkit-three-nvidia-device-plugin');
 assert.equal(devicePlugin.metadata.namespace,'kube-system');
 assert.equal(devicePlugin.spec.template.spec.nodeSelector['karpenter.sh/nodepool'],'worldkit-episode-graphics');
 const batch=items.find(i=>i.metadata.name==='three-episode-batch-reconciler');
 const cleanup=items.find(i=>i.metadata.name==='three-episode-resource-reconciler');
 assert(batch.spec.jobTemplate.spec.template.spec.containers[0].env.some(e=>e.name==='LWDP_GENERATION_API_TOKEN'&&e.valueFrom.secretKeyRef.name==='lwdp-generation-token'));
 assert.equal(cleanup.spec.jobTemplate.spec.template.spec.containers[0].env,undefined);
});
