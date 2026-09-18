import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {AssetLibrary} from '../client/asset-library.mjs';

const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const baseUrl=new URL('../',import.meta.url).href,library=new AssetLibrary(baseUrl);
const groups={all:['全部资产','◈'],characters:['人物','♙'],animals:['动物','♧'],vehicles:['载具','▱'],robots:['机器人','⌘'],fantastical:['幻想生物','✧'],objects:['物件','◇']};
let catalog={subjects:[]},activeGroup='all',current=null,currentTab='overview',request=0,clipRequest=0;
let renderer,scene,camera,controls,model,skeleton,mixer,action,selectedBone,grid,playing=true,animationFrames=0,loadedClips=[],modelStats={},lastFrame=0;
const originalMaterials=new Map();
const sizeLabel=bytes=>bytes>1048576?(bytes/1048576).toFixed(1)+' MB':Math.round(bytes/1024)+' KB';
function toast(text){$('toast').textContent=text;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',1800);}
const thumbnails=new Map();let nextCursor=null,searchRequest=0,totalMatches=0;
const rowView=s=>({...s,asset_version:s.version,browse_group:s.group});
const groupInfo=id=>groups[id]||['其他','◇'];
function renderCatalog(){
  const rows=catalog.subjects;
  $('collectionTitle').textContent=groupInfo(activeGroup)[0];$('resultCount').textContent=rows.length+' / '+totalMatches+' 项';$('empty').hidden=!!rows.length;
  $('cards').innerHTML=rows.map(s=>{const name=s.display_name.split(' / ')[0],kind=s.preview?.format?.toUpperCase()||'REFERENCE';return '<button class="card" data-id="'+escape(s.asset_id)+'" aria-label="预览 '+escape(name)+'"><div class="card-image"><div class="asset-shape">'+groupInfo(s.group)[1]+'</div><span class="card-corner">'+escape(groupInfo(s.group)[0])+'</span><span class="card-type">'+escape(kind)+'</span></div><div class="card-meta"><h3>'+escape(name)+'</h3><span class="card-id">'+escape(s.asset_id)+'</span><div class="card-bottom"><span class="card-status '+(s.placeholder?'pending':'')+'">● '+(s.placeholder?'待入库占位':'内容已登记')+'</span><span class="metrics">v'+escape(s.version)+'</span></div></div></button>';}).join('');
  document.querySelectorAll('.card').forEach(b=>b.addEventListener('click',()=>openAsset(b.dataset.id)));
  document.querySelectorAll('#groups button').forEach(b=>b.classList.toggle('active',b.dataset.group===activeGroup));
  $('loadMore').hidden=!nextCursor;$('loadMore').disabled=false;
  $('stats').innerHTML=[[totalMatches,'当前匹配主体','项'],[rows.length,'已加载元数据','项'],[rows.filter(s=>s.readiness.previewable).length,'已加载可预览条目','项'],[rows.filter(s=>s.readiness.runtime==='verified').length,'已验证运行条目','项']].map(([n,label,unit])=>'<div class="stat"><div class="stat-label"><i></i>'+label+'</div><div class="stat-number">'+n+'<small>'+unit+'</small></div></div>').join('');
  // Only image previews are requested for visible cards; models wait for selection.
  let next=0;void Promise.all(Array.from({length:4},async()=>{while(next<rows.length){const s=rows[next++];if(!s.preview?.mime_type.startsWith('image/'))continue;try{let promise=thumbnails.get(s.preview.artifact_id);if(!promise){promise=library.blobUrl(s.preview);thumbnails.set(s.preview.artifact_id,promise);}const url=await promise;const card=[...document.querySelectorAll('.card')].find(b=>b.dataset.id===s.asset_id);if(card&&!card.querySelector('img')){const image=document.createElement('img');image.alt=s.display_name;image.src=url;card.querySelector('.asset-shape')?.replaceWith(image);}}catch(error){console.warn('Preview image unavailable',s.asset_id,error.message);}}}));
}
async function refreshCatalog(append=false){
  const token=++searchRequest;const filters={limit:20,...(activeGroup==='all'?{}:{group:activeGroup}),...($('stage').value?{stage:$('stage').value}:{}),...($('onlyPreview').checked?{previewable:true}:{}),...(append&&nextCursor?{cursor:nextCursor}:{})};
  $('loadMore').disabled=true;$('catalogStatus').textContent='正在读取 Registry 元数据…';
  try{const page=await library.search($('search').value.trim(),filters);if(token!==searchRequest)return;catalog.subjects=append?[...catalog.subjects,...page.items.map(rowView)]:page.items.map(rowView);nextCursor=page.next_cursor;totalMatches=page.total??catalog.subjects.length;$('catalogStatus').textContent='';renderCatalog();}catch(error){if(token!==searchRequest)return;$('catalogStatus').textContent='Registry 不可用：'+error.message;$('loadMore').disabled=false;}
}
function viewData(manifest){
  const docs=manifest.sections,asset={...docs.asset,morphology:docs.asset.morphology||{},scale:docs.asset.scale||{}};
  return {manifest,asset,capabilities:{movement_modes:[],control:{},...docs.capabilities},provenance:{license:{},...docs.provenance},validation:docs.validation,rig:docs.bindings.rig||{},animation_map:docs.bindings.animations||{},sockets:docs.bindings.sockets||{},assembly:docs.assembly,resources:{model:manifest.model_resource_id,preview:manifest.preview_resource_id,inspection:docs.facts.inspection||{},files:manifest.resources,animations:docs.animations.map(a=>({...a,resource:a.resource_id,duration_seconds:a.duration_seconds||0}))}};
}
function resource(data,id){const result=data.resources.files.find(r=>r.resource_id===id);if(!result)throw Error('ASSET_RESOURCE_MISSING: '+id);return result;}
async function parseResource(artifact){
  const bytes=await library.bytes(artifact),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{if(url.startsWith('data:')||url.startsWith('blob:'))return url;if(artifact.format==='fbx')return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=';throw Error('ASSET_EXTERNAL_RESOURCE_NOT_DECLARED');});
  if(artifact.format==='fbx')return new FBXLoader(manager).parse(buffer,'');
  if(!['glb','gltf'].includes(artifact.format))throw Error('ASSET_MODEL_FORMAT_UNSUPPORTED: '+artifact.format);
  const gltf=await new GLTFLoader(manager).parseAsync(buffer,'');gltf.scene.animations=gltf.animations;return gltf.scene;
}

function initRenderer(){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e9efdf');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  $('viewport').prepend(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.01,10000);camera.position.set(5,3,6);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;
  scene.add(new THREE.HemisphereLight(0xfaffeb,0x66725a,2.5));const key=new THREE.DirectionalLight(0xfff7e2,3.3);key.position.set(5,10,7);scene.add(key);const fill=new THREE.DirectionalLight(0xdce7fd,1.6);fill.position.set(-6,4,-4);scene.add(fill);
  grid=new THREE.GridHelper(20,20,0xbbc9a8,0xd4dec5);grid.material.transparent=true;grid.material.opacity=.5;scene.add(grid);
  selectedBone=new THREE.Mesh(new THREE.SphereGeometry(.018,12,8),new THREE.MeshBasicMaterial({color:0xd58438,depthTest:false}));selectedBone.renderOrder=1000;selectedBone.visible=false;scene.add(selectedBone);
  new ResizeObserver(resize).observe($('viewport'));
  requestAnimationFrame(tick);
}
function resize(){if(!renderer)return;const {clientWidth:w,clientHeight:h}=$('viewport');if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function tick(time){requestAnimationFrame(tick);const delta=Math.min((time-lastFrame)/1000,.05);lastFrame=time;if(!$('detail').open||!renderer)return;if(mixer&&playing)mixer.update(delta*Number($('speed').value));controls.autoRotate=$('rotate').checked;controls.update();renderer.render(scene,camera);animationFrames++;if(action){const duration=action.getClip().duration;$('timeline').max=duration||1;$('timeline').value=action.time;$('timeLabel').textContent=`${action.time.toFixed(2)} / ${duration.toFixed(2)}s`;}}
function dispose(){clipRequest++;if(mixer&&model){mixer.stopAllAction();mixer.uncacheRoot(model);}mixer=null;action=null;if(skeleton){scene.remove(skeleton);skeleton.geometry.dispose();skeleton.material.dispose();skeleton=null;}if(model){scene.remove(model);const materials=new Set(),textures=new Set();model.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);Object.values(m).filter(v=>v?.isTexture).forEach(v=>textures.add(v));}for(const m of originalMaterials.get(o)||[])materials.add(m);});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());model=null;}originalMaterials.clear();if(selectedBone)selectedBone.visible=false;loadedClips=[];modelStats={};}
function frameModel(sampledBounds){if(!model)return;model.updateMatrixWorld(true);const bounds=sampledBounds instanceof THREE.Box3?sampledBounds:new THREE.Box3().setFromObject(model,true),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const radius=Math.max(size.x,size.y,size.z,.1);const aspect=Math.max(.3,camera.aspect);const distance=radius/Math.min(aspect,1)*1.5;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.85,.44,1.18).normalize().multiplyScalar(distance));camera.near=Math.max(.001,radius/1000);camera.far=Math.max(1000,radius*100);camera.updateProjectionMatrix();controls.minDistance=radius*.05;controls.maxDistance=radius*25;controls.update();grid.position.y=bounds.min.y-.005*radius;grid.scale.setScalar(radius*.22);selectedBone.scale.setScalar(radius*1.2);}
function neutralize(){if(!model)return;model.traverse(o=>{if(!o.isMesh)return;let originals=originalMaterials.get(o);if(!originals){originals=Array.isArray(o.material)?o.material:[o.material];originalMaterials.set(o,originals);}if($('neutral').checked){const materials=originals.map(m=>new THREE.MeshStandardMaterial({color:0xe9eadc,roughness:.84,metalness:0,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest}));for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!originals.includes(m))m.dispose();o.material=Array.isArray(o.material)?materials:materials[0];}else{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!originals.includes(m))m.dispose();o.material=originals.length===1?originals[0]:originals;}for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.wireframe=$('wireframe').checked;});}
async function loadModel(data,token){
  initRenderer();dispose();$('placeholderImage').innerHTML='';$('placeholderImage').style.display='none';renderer.domElement.style.opacity='1';
  if(!data.resources.model){renderer.domElement.style.opacity='0';$('viewerState').textContent='';$('placeholderImage').style.display='flex';$('placeholderImage').innerHTML='<div class="asset-shape">◇</div>';if(data.resources.preview){const preview=resource(data,data.resources.preview);if(preview.mime_type.startsWith('image/')){const url=await library.blobUrl(preview);if(token!==request){URL.revokeObjectURL(url);return;}const image=document.createElement('img');image.src=url;image.alt='来源参考图';image.onload=()=>URL.revokeObjectURL(url);$('placeholderImage').replaceChildren(image);}}$('fileType').textContent='REFERENCE / 待入库';$('playbackNote').textContent='尚未提供可播放的模型、骨架与动作。';setClipOptions([]);renderInspector();return;}
  $('viewerState').textContent='正在验证并读取模型、骨架与动作…';const artifact=resource(data,data.resources.model),isFbx=artifact.format==='fbx',loaded=await parseResource(artifact);
  if(token!==request){loaded.traverse(o=>{o.geometry?.dispose();for(const material of(Array.isArray(o.material)?o.material:o.material?[o.material]:[]))material.dispose();});return;}
  model=loaded;if(isFbx){model.scale.multiplyScalar(.01);$('neutral').checked=true;}
  const transform=data.rig.source_transform;if(transform&&!isFbx){if(transform.scaleXYZ)model.scale.multiply(new THREE.Vector3(...transform.scaleXYZ));if(transform.rotationEulerRadiansXYZ)model.rotation.set(...transform.rotationEulerRadiansXYZ);if(transform.positionMetersXYZ)model.position.set(...transform.positionMetersXYZ);}
  scene.add(model);neutralize();model.updateMatrixWorld(true);const bones=[];let meshes=0,triangles=0;model.traverse(o=>{if(o.isBone)bones.push({name:o.name,parent:o.parent?.isBone?o.parent.name:null,object:o});if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;}});modelStats={bones:bones.length,meshes,triangles:Math.round(triangles),boneObjects:bones};
  skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.85;skeleton.renderOrder=100;skeleton.visible=$('skeleton').checked;scene.add(skeleton);
  mixer=new THREE.AnimationMixer(model);loadedClips=model.animations||[];const options=loadedClips.map((c,i)=>({name:c.name||'animation_'+i,duration_seconds:c.duration,embedded:i,resource:data.resources.model,format:artifact.format}));
  for(const a of data.resources.animations)if(a.resource!==data.resources.model)options.push(a);
  setClipOptions(options);frameModel();resize();$('viewerState').textContent='';$('fileType').textContent=isFbx?'FBX / SHA-256 VERIFIED':'GLB / SHA-256 VERIFIED';$('playbackNote').textContent=isFbx?'FBX 内容以白模检查；单位、语义和运行绑定仍待验证。':'字节完整性已验证；运行质量需要独立的引擎验证。';
  if(options.length){const idle=options.findIndex(c=>/^idle$|^idle[_ -]|ground[_ -]idle/i.test(c.name)),index=idle<0?0:idle;$('clipSelect').value=String(index);await selectClip(index);}renderInspector();
}

let clipOptions=[];
function setClipOptions(options){clipOptions=options;$('clipSelect').innerHTML=options.length?options.map((a,i)=>`<option value="${i}">${escape(a.name)} · ${a.duration_seconds.toFixed(2)}s${a.embedded===undefined?' / 独立资源':''}</option>`).join(''):'<option value="">暂无动画片段</option>';$('clipSelect').disabled=!options.length;$('playPause').disabled=!options.length;$('timeline').disabled=!options.length;$('timeLabel').textContent='0.00 / 0.00s';}
async function selectClip(index){
  const option=clipOptions[index];if(!option||!mixer)return;const token=++clipRequest;let clip;
  $('playbackNote').textContent='正在读取动作…';
  try{if(option.embedded!==undefined)clip=loadedClips[option.embedded];else if(option.format==='three-clip-json')clip=THREE.AnimationClip.parse(JSON.parse(new TextDecoder().decode(await library.bytes(resource(current.data,option.resource)))));else{const loaded=await parseResource(resource(current.data,option.resource));clip=loaded.animations[option.index];loaded.traverse(o=>o.geometry?.dispose());}
    if(token!==clipRequest)return;if(!clip)throw Error('动画片段不存在');
    const missing=clip.tracks.filter(track=>!THREE.PropertyBinding.findNode(model,THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    mixer.stopAllAction();action=null;
    if(missing.length){playing=false;$('playPause').textContent='播放';$('playbackNote').textContent=`该片段有 ${missing.length} 条轨道未匹配当前模型节点，需要补齐绑定。资源保留供检查。`;return;}
    action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopRepeat,Infinity).play();mixer.update(0);
    const bounds=new THREE.Box3();for(const fraction of [0,.25,.5,.75,.99]){action.time=clip.duration*fraction;mixer.update(0);model.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(model,true));}action.time=0;mixer.update(0);frameModel(bounds);
    playing=true;$('playPause').textContent='暂停';$('playbackNote').textContent=option.embedded!==undefined?'原始内嵌片段 · 循环仅用于预览，不声明游戏中的循环或根运动策略。':'独立动画资源 · 按原骨骼名称绑定；预览不代表重定向已经验证。';
  }catch(e){$('playbackNote').textContent='动作加载失败：'+e.message;}
}
async function openAsset(id){
  const token=++request;window.assetPreview.ready=false;window.assetPreview.error=null;
  try{
    current=catalog.subjects.find(s=>s.asset_id===id);
    if(!current){const result=await library.search('',{asset_ids:[id],limit:1});if(token!==request)return;current=result.items[0]?rowView(result.items[0]):null;}
    if(!current)throw Error('ASSET_NOT_FOUND: '+id);
    $('detailTitle').textContent=current.display_name.split(' / ')[0];$('detailId').textContent=id+' @ '+current.version;$('detailGroup').textContent=groupInfo(current.group)[0]+' / ASSET INSPECTOR';$('jsonLink').href=library.url('v1/assets/'+id+'/versions/'+current.version)+'?snapshot_id='+(await library.client.descriptor()).snapshot_id;$('detailBadges').innerHTML='<span class="badge '+(current.placeholder?'pending':'')+'">'+(current.placeholder?'待入库占位':'内容已登记')+'</span><span class="badge">Runtime '+escape(current.readiness.runtime)+'</span>';$('inspectorContent').textContent='读取已锁定版本的元数据…';
    if(!$('detail').open)$('detail').showModal();$('skeleton').checked=false;$('wireframe').checked=false;$('neutral').checked=false;$('rotate').checked=false;currentTab='overview';document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
    const data=viewData(await library.describe(id,{version:current.version}));if(token!==request)return;current={...current,data};renderInspector();await loadModel(data,token);if(token===request)window.assetPreview.ready=true;
  }catch(error){if(token===request){$('viewerState').textContent='资源预览失败：'+error.message;window.assetPreview.error=error.message;}}
}

const kv=(k,v)=>`<div class="kv"><span>${escape(k)}</span><span>${escape(v)}</span></div>`;
function renderInspector(){
  if(!current?.data)return;const {asset,resources,capabilities,provenance,validation,rig}=current.data;
  if(currentTab==='overview'){
    $('inspectorContent').innerHTML='<h3>主体概况</h3>'+kv('身份分类',asset.semantic_type||current.group)+kv('身体结构',asset.morphology.architecture||'未登记')+kv('模型 / 骨骼',(modelStats.meshes??resources.inspection?.meshes??'—')+' / '+(modelStats.bones??'—'))+kv('动作资源',clipOptions.length||resources.animations.length)+kv('单位 / 上轴',(asset.scale.units||'unknown')+' / '+(asset.scale.up_axis||'unknown'))+'<h3>内容能力</h3>'+capabilities.movement_modes.map(m=>kv(m.environment,m.propulsion+' · '+m.stage)).join('')+'<div class="notice">'+escape(asset.description)+'</div><h3>验证记录</h3>'+kv('传输完整性','SHA-256 + 字节长度')+kv('glTF 格式',validation.format||'unknown')+kv('运行验证',current.readiness.runtime)+'<div class="notice">控制器、相机与调参由引擎提供。内容预览不会把未知运行状态升级为已兼容。</div>';
  }else if(currentTab==='rig'){
    const bones=modelStats.boneObjects||rig.bones||[];$('inspectorContent').innerHTML='<h3>真实骨骼 · '+bones.length+'</h3><div class="notice">显示资源中的真实节点。语义映射状态：'+escape(rig.mapping_status||'unknown')+'。</div><input class="bone-search" id="boneSearch" aria-label="筛选骨骼" placeholder="筛选骨骼名称"><div id="boneList"></div>';
    const render=()=>{$('boneList').innerHTML=bones.filter(b=>b.name.toLowerCase().includes($('boneSearch').value.toLowerCase())).map(b=>'<button class="bone-row" data-bone="'+escape(b.name)+'" style="border:0;background:transparent;text-align:left">'+escape(b.name)+'</button>').join('')||'<p class="muted">该资源没有可显示的骨骼。</p>';document.querySelectorAll('[data-bone]').forEach(b=>b.onclick=()=>{const bone=modelStats.boneObjects?.find(v=>v.name===b.dataset.bone)?.object;if(bone){bone.getWorldPosition(selectedBone.position);selectedBone.visible=true;$('skeleton').checked=true;skeleton.visible=true;}document.querySelectorAll('.bone-row').forEach(v=>v.classList.toggle('selected',v===b));});};$('boneSearch').oninput=render;render();
  }else if(currentTab==='files'){
    $('inspectorContent').innerHTML='<h3>交付资源 · '+resources.files.length+'</h3><div class="notice">按逻辑资源 ID 引用。下载前校验 SHA-256 和字节长度。</div>'+resources.files.map((f,i)=>'<div class="file-row"><button data-resource-index="'+i+'">'+escape(f.resource_id)+' ↗</button><small>'+escape(f.role)+' · '+escape(f.format)+' · '+sizeLabel(f.byte_length)+'<br>SHA '+escape(f.sha256.slice(0,20))+'…</small></div>').join('');
    document.querySelectorAll('[data-resource-index]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const file=resources.files[Number(button.dataset.resourceIndex)],url=await library.blobUrl(file),a=document.createElement('a');a.href=url;a.download=file.sha256+'.'+file.format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}finally{button.disabled=false;}});
  }else if(currentTab==='engine'){
    $('inspectorContent').innerHTML='<h3>相机与控制</h3>'+kv('配置归属','引擎 / Host adapter')+kv('Preset provider','未连接')+kv('运行兼容性',current.readiness.runtime)+'<div class="notice">当前为独立内容预览。轨道相机仅用于查看模型；引擎相机预设、控制器参数与调参配置未加载。请在连接相应引擎的 Playground 中检查。</div>';
  }else{
    $('inspectorContent').innerHTML='<h3>来源与版本</h3>'+kv('来源类型',provenance.source_type||'未记录')+kv('内容版本',current.version)+kv('源版本',provenance.source_commit?.slice(0,12)||'未记录')+'<h3>授权记录</h3>'+Object.entries(provenance.license).map(([k,v])=>kv(k,v)).join('')+'<div class="notice">未知表示尚未核对。预览不会自动授予独立分发权限。</div>';
  }

}
$('closeDetail').onclick=()=>{$('detail').close();request++;dispose();window.assetPreview.ready=false;};$('detail').addEventListener('cancel',()=>{request++;dispose();});$('detail').addEventListener('click',e=>{if(e.target===$('detail'))$('closeDetail').click();});
$('skeleton').onchange=()=>{if(skeleton)skeleton.visible=$('skeleton').checked;};$('wireframe').onchange=neutralize;$('neutral').onchange=neutralize;$('frameButton').onclick=frameModel;
$('clipSelect').onchange=()=>selectClip(Number($('clipSelect').value));$('playPause').onclick=()=>{playing=!playing;$('playPause').textContent=playing?'暂停':'播放';};$('timeline').oninput=()=>{if(action&&mixer){playing=false;$('playPause').textContent='播放';action.time=Number($('timeline').value);mixer.update(0);}};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;document.querySelectorAll('.tabs button').forEach(v=>v.classList.toggle('active',v===b));renderInspector();});
$('copyId').onclick=async()=>{try{await navigator.clipboard.writeText(current.asset_id);toast('已复制 '+current.asset_id);}catch{toast(current.asset_id);}};
let debounce;for(const id of ['search','stage','onlyPreview'])$(id).addEventListener(id==='search'?'input':'change',()=>{clearTimeout(debounce);debounce=setTimeout(()=>refreshCatalog(),id==='search'?150:0);});$('loadMore').onclick=()=>refreshCatalog(true);
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('detail').open){e.preventDefault();$('search').focus();}});
$('structureButton').onclick=()=>{$('structure').showModal();};$('closeStructure').onclick=()=>$('structure').close();
const folders={manifests:'已发布、不可变的内容描述与依赖',artifacts:'以 SHA-256 寻址的模型、动作和预览',releases:'固定 Registry 快照描述',indexes:'由 Registry 服务使用的版本索引',client:'独立 Registry 客户端',viewer:'模型 / 骨骼 / 动作检查器'};
$('folderTree').innerHTML=Object.entries(folders).map(([name,description])=>'<div class="folder">▸ '+name+'/<small>'+description+'</small></div>').join('');

window.assetPreview={ready:false,error:null,open:async id=>{window.assetPreview.ready=false;window.assetPreview.error=null;await openAsset(id);},stats:()=>({id:current?.asset_id,bones:modelStats.bones||0,meshes:modelStats.meshes||0,clips:clipOptions.length,frames:animationFrames,time:action?.time||0,skeleton:skeleton?.visible||false,clipNames:clipOptions.map(o=>o.name),error:window.assetPreview.error}),thumbnail:()=>{if(!renderer||!model)return null;const old=grid.visible;grid.visible=false;renderer.render(scene,camera);const data=renderer.domElement.toDataURL('image/webp',.85);grid.visible=old;return data;},clip:selectClip,frame:frameModel};
try{
  const descriptor=await library.client.descriptor();
  $('groups').innerHTML=Object.entries(groups).map(([id,[label,icon]])=>'<button data-group="'+id+'" class="'+(id===activeGroup?'active':'')+'"><span class="nav-icon">'+icon+'</span>'+label+'</button>').join('');
  document.querySelectorAll('#groups button').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.group;void refreshCatalog();});
  $('sourceVersion').textContent='REGISTRY '+descriptor.contract_version+' · '+descriptor.snapshot_id.slice(0,12);
  await refreshCatalog();const selected=new URL(location.href).searchParams.get('asset');if(selected)await openAsset(selected);
}catch(error){$('catalogStatus').textContent='Registry 连接失败：'+error.message;}
