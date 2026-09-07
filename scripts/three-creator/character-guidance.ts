import {training} from '@worldkit/three';
import type {AssetCatalogEntry} from './compiler';
import type {CreatorProfile} from './contracts';
const {SKILL_DEFINITIONS,HUMANOID_BINDINGS,HUMANOID_CONTROL_HINTS}=training;

/** Discovery guidance only; asset identity and runtime eligibility stay unchanged. */
export function characterUsage(asset:AssetCatalogEntry,profile:CreatorProfile,allowedIds:readonly string[]){
 const training=asset.id==='humanoid.source-101';
 if(!training&&!asset.locomotionBindingIds?.includes('ground.standard'))return undefined;
 const sdk=profile==='three-sdk';
 return {
  assetId:asset.id,
  integration:training?'training-character':sdk?'ordinary-sdk-character':'three-model-and-clips',
  clipCount:training?asset.runtimeActions.length:Object.keys(asset.actions).length,
  useWhen:training?'攀爬、翻越、游泳、翻滚、滑铲、匍匐、拾取搬运与坐姿；需要 Training 控制器和相应场景条件。':'普通地面探索：站立、走路、跑步、跳跃和下落。',
  ...(sdk?{schemaTopic:'character-actions',exampleTopic:training?'character-actions':'getting-started'}:{}),
  ...(sdk&&!training&&allowedIds.includes('humanoid.source-101')?{contextualAssetId:'humanoid.source-101'}:{}),
  ...(sdk&&training?{skillRequests:SKILL_DEFINITIONS,controlBindings:HUMANOID_BINDINGS,controlHints:HUMANOID_CONTROL_HINTS}:{}),
  limitations:training
   ?['48 animation clips are not 48 independently callable skills. Only the six declared skill requests use training.action; other motions follow input and controller state.',
     'Listed conditions summarize eligibility. The actual controller also checks stance, cooldown, occupancy, collision, reach and headroom; inspect the receipt/operation for rejection or completion.',
     sdk?'Select createWorld({training:...}) during initialization; do not attach a second physics loop or mixer to an ordinary world.':'This raw profile has no Training SDK controller. Loading the files alone does not provide these gameplay abilities.']
   :['The ordinary preset does not automatically gain swimming, climbing or interactions by loading additional clips.'],
 };
}
