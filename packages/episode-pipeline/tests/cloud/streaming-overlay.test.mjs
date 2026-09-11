import{test}from'node:test';import assert from'node:assert/strict';import{applyStreamingOverlay}from'../../src/cloud/streaming-overlay.mjs';
test('CPU streaming overlay is hash-pinned, follows hydration, and cannot modify GPU or arbitrary files',()=>{
 const base=()=>({metadata:{annotations:{}},spec:{template:{spec:{initContainers:[{name:'hydrate-source'}],containers:[{resources:{requests:{cpu:'500m'}}}]}}}});
 const overlay={image:'registry/worker@sha256:'+'a'.repeat(64),hashes:{'report.ts':'b'.repeat(64),'visuals.mjs':'c'.repeat(64),'workflow.ts':'d'.repeat(64)}};
 const j=applyStreamingOverlay(base(),overlay);assert.equal(j.spec.template.spec.initContainers[1].name,'install-streaming-overlay');assert.deepEqual(j.spec.template.spec.initContainers[1].volumeMounts,[{name:'workspace',mountPath:'/episode'}]);
 assert.throws(()=>applyStreamingOverlay(base(),{...overlay,hashes:{...overlay.hashes,'../../secret':'e'.repeat(64)}}),/INVALID/);
 const gpu=base();gpu.spec.template.spec.containers[0].resources.requests['nvidia.com/gpu']='1';assert.throws(()=>applyStreamingOverlay(gpu,overlay),/CPU_ONLY/);
});
