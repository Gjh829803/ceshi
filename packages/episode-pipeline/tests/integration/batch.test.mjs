import test from 'node:test';
import assert from 'node:assert/strict';
import {newCohort, enqueueCapture, closeProducer, selectBatch, completeCapture} from '../../src/batch/batch-state.mjs';
const image=`registry/worker@sha256:${'a'.repeat(64)}`;
const task = n => ({id:`task-${n}`,caseId:`case-${n}`,recipeHash:String(n).padStart(64,'0'),workerImage:image,sourceArchiveS3Uri:'s3://bucket/source.tar.gz',planS3Uri:'s3://bucket/plan.json',inputS3Uri:'s3://bucket/input.json',inputHash:'b'.repeat(64),outputS3Prefix:`s3://bucket/out/${n}`,worldBuildHash:'c'.repeat(64),sourceManifestRelativePath:'inputs/source/source.json',createdAt:'2026-09-06T00:00:00Z'});
function ready(n,total=n){const c=newCohort('cohort-one',Array.from({length:total},(_,i)=>`case-${i}`));for(let i=0;i<n;i++)enqueueCapture(c,task(i));return c;}
test('99 tasks cannot run while one registered producer is pending',()=>assert.equal(selectBatch(ready(99,100)),null));
test('100 tasks admit one batch while producer is still open',()=>assert.equal(selectBatch(ready(100,101)).tasks.length,100));
test('sealed complete producer immediately flushes 80, counting 20 final failures',()=>{const c=ready(80,100);for(let i=80;i<100;i++)closeProducer(c,`case-${i}`,'failed-final');assert.equal(selectBatch(c).tasks.length,80);});
test('unknown producer and duplicate ready do not manufacture a tail or inflate count',()=>{const c=ready(99,100);enqueueCapture(c,task(0));assert.equal(Object.keys(c.tasks).length,99);assert.equal(selectBatch(c),null);assert.throws(()=>enqueueCapture(c,{...task(0),inputHash:'d'.repeat(64)}),/CONFLICT/);});
test('250 tasks form 100+100+50 without counting consumed items as pending upstream',()=>{const c=ready(250);const sizes=[];for(;;){const b=selectBatch(c);if(!b)break;sizes.push(b.tasks.length);for(const t of b.tasks)completeCapture(c,t.executionId,{status:'capture-succeeded'});}assert.deepEqual(sizes,[100,100,50]);});
test('cancelled cohort does not produce tail',()=>{const c=ready(3);c.cancelled=true;assert.equal(selectBatch(c),null);});
