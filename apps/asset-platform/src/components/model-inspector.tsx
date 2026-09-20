'use client';
import { useEffect, useRef, useState } from 'react';
import type { RegistryClient } from '@worldkit/asset-client';
import type { AssetManifest, Resource } from '@worldkit/asset-contracts';
import { Box, Download, Focus, LoaderCircle, Pause, Play } from 'lucide-react';
import { AssetPreview, artifactBlob, emptyPreview, type PreviewState } from '../lib/preview';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const record=(value:unknown):Record<string,unknown> => value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const display=(value:unknown) => value===undefined||value===null?'未记录':typeof value==='object'?JSON.stringify(value):String(value);
const kv=(label:string,value:unknown)=><div className="kv" key={label}><span>{label}</span><span>{display(value)}</span></div>;
const bytesLabel=(bytes:number)=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
export function ModelInspector({manifest,client,readiness}:{manifest:AssetManifest;client:RegistryClient;readiness:string}) {
  const host=useRef<HTMLDivElement>(null), preview=useRef<AssetPreview | undefined>(undefined);
  const [state,setState]=useState<PreviewState>({...emptyPreview}),[skeleton,setSkeleton]=useState(false),[wireframe,setWireframe]=useState(false),[rotate,setRotate]=useState(false),[speed,setSpeed]=useState('1');
  const [boneFilter,setBoneFilter]=useState(''),[selectedBone,setSelectedBone]=useState(''),[image,setImage]=useState<string>(),[download,setDownload]=useState(''),[downloadError,setDownloadError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(!host.current||!manifest.model_resource_id)return;
    try { const instance=new AssetPreview(host.current,client,manifest,setState);preview.current=instance;return()=>{preview.current=undefined;instance.dispose();}; }
    catch(error){setState(s=>({...s,loading:false,error:String(error)}));}
  },[client,manifest]);
  useEffect(()=>{
    let closed=false,url:string|undefined;
    if(!manifest.model_resource_id){setState({...emptyPreview,loading:false,note:'尚未提供可播放的模型、骨架与动作。'});const resource=manifest.resources.find(r=>r.resource_id===manifest.preview_resource_id);if(resource?.mime_type.startsWith('image/'))void artifactBlob(client,resource).then(value=>{if(closed)URL.revokeObjectURL(value);else{url=value;setImage(value);}}).catch(error=>{if(!closed)setState(s=>({...s,error:String(error)}));});}
    return()=>{closed=true;if(url)URL.revokeObjectURL(url);};
  },[manifest,client]);
  const downloadResource=async(resource:Resource)=>{
    setDownload(resource.resource_id);setDownloadError('');
    try {const url=await artifactBlob(client,resource);if(!alive.current){URL.revokeObjectURL(url);return;}const a=document.createElement('a');a.href=url;a.download=resource.sha256+'.'+resource.format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){if(alive.current)setDownloadError(String(error));}finally{if(alive.current)setDownload('');}
  };
  const asset=manifest.sections.asset,scale=record(asset.scale),rig=record(manifest.sections.bindings.rig),provenance=manifest.sections.provenance;
  const model=manifest.resources.find(r=>r.resource_id===manifest.model_resource_id);
  return <div className="inspector-body"><section className="preview-panel">
    <div className="viewport" ref={host} data-testid="viewport" data-loading={state.loading} data-meshes={state.meshes} data-bones={state.bones.length} data-time={state.time.toFixed(3)} data-playing={state.playing}>
      {!manifest.model_resource_id&&<div className="reference-image">{image?<img src={image} alt="来源参考图"/>:<Box size={64} strokeWidth={1}/>}</div>}
      {state.loading&&<div className="viewport-message" role="status"><LoaderCircle className="animate-spin"/>读取并校验模型…</div>}{state.error&&<div className="viewport-message error-state" role="alert">{state.error}</div>}
      <span className="viewport-label">{model?model.format.toUpperCase()+' / '+(state.loading?'LOADING':'CONTENT PREVIEW'):'REFERENCE / 待入库'}</span>
      <Button className="frame-button" variant="outline" size="icon-sm" aria-label="重置视角" disabled={!state.meshes} onClick={()=>preview.current?.frame()}><Focus/></Button>
      <div className="viewport-hint">拖动旋转 · 滚轮缩放 · 右键平移</div>
    </div>
    <div className="view-controls">{([{label:'骨骼',value:skeleton,set:(v:boolean)=>{setSkeleton(v);preview.current?.setSkeleton(v);}},{label:'线框',value:wireframe,set:(v:boolean)=>{setWireframe(v);preview.current?.setWireframe(v);}},{label:'白模',value:state.neutral,set:(v:boolean)=>preview.current?.setNeutral(v)},{label:'自动旋转',value:rotate,set:(v:boolean)=>{setRotate(v);preview.current?.setRotate(v);}}]).map(c=><label className="check-label" key={c.label}><Checkbox checked={c.value} disabled={state.loading||!model} onCheckedChange={v=>c.set(v===true)}/>{c.label}</label>)}</div>
    <div className="playback"><div className="playback-row"><Button size="icon" variant="outline" disabled={!state.duration} aria-label={state.playing?'暂停动画':'播放动画'} onClick={()=>preview.current?.setPlaying(!state.playing)}>{state.playing?<Pause/>:<Play/>}</Button><Select value={String(state.clip)} disabled={!state.clips.length} onValueChange={v=>void preview.current?.selectClip(Number(v))}><SelectTrigger className="clip-select" aria-label="动画片段"><SelectValue placeholder="暂无动画"/></SelectTrigger><SelectContent>{state.clips.map((c,i)=><SelectItem value={String(i)} key={i}>{c.name} · {c.duration.toFixed(2)}s{c.embedded===undefined?' / 独立资源':''}</SelectItem>)}</SelectContent></Select><Select value={speed} onValueChange={v=>{setSpeed(v);preview.current?.setSpeed(Number(v));}}><SelectTrigger aria-label="播放速度"><SelectValue/></SelectTrigger><SelectContent>{['0.25','0.5','1','1.5','2'].map(v=><SelectItem value={v} key={v}>{v}×</SelectItem>)}</SelectContent></Select></div><div className="timeline-row"><Slider aria-label="动画时间" value={[state.time]} min={0} max={state.duration||1} step={0.01} disabled={!state.duration} onValueChange={v=>preview.current?.seek(v[0]||0)}/><span>{state.time.toFixed(2)} / {state.duration.toFixed(2)}s</span></div><p role="status">{state.note}</p></div>
  </section><section className="metadata-panel"><Tabs defaultValue="overview"><TabsList className="metadata-tabs">{[['overview','概况'],['rig','骨骼'],['files','资源'],['engine','引擎'],['source','来源']].map(([key,label])=><TabsTrigger key={key} value={key!}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value="overview"><h3>主体概况</h3>{kv('身份分类',asset.semantic_type||manifest.group)}{kv('身体结构',record(asset.morphology).architecture)}{kv('模型 / 骨骼',state.meshes+' / '+state.bones.length)}{kv('三角面',state.triangles.toLocaleString())}{kv('动作资源',state.clips.length)}{kv('单位 / 上轴',display(scale.units)+' / '+display(scale.up_axis))}<h3>内容能力</h3>{Array.isArray(manifest.sections.capabilities.movement_modes)&&manifest.sections.capabilities.movement_modes.map((value,i)=>{const m=record(value);return <div key={i}>{kv(display(m.environment),display(m.propulsion)+' · '+display(m.stage))}</div>;})}<p className="notice">{manifest.description}</p><h3>验证记录</h3>{kv('传输完整性','SHA-256 + 字节长度')}{kv('格式',manifest.sections.validation.format)}{kv('运行验证',readiness)}<p className="notice">内容预览不会将未知运行状态升级为已兼容。</p></TabsContent>
    <TabsContent value="rig"><h3>真实骨骼 · {state.bones.length}</h3><p className="notice">显示模型中的真实节点。语义映射：{display(rig.mapping_status)}。</p><Input aria-label="筛选骨骼" placeholder="筛选骨骼名称" value={boneFilter} onChange={e=>setBoneFilter(e.target.value)}/><div className="bone-list">{state.bones.filter(b=>b.toLowerCase().includes(boneFilter.toLowerCase())).map((name,i)=><Button key={name+i} variant={selectedBone===name?'secondary':'ghost'} className="bone-row" onClick={()=>{setSelectedBone(name);setSkeleton(true);preview.current?.selectBone(name);}}>{name}</Button>)}{!state.bones.length&&<p className="notice">该资源没有可显示的骨骼。</p>}</div></TabsContent>
    <TabsContent value="files"><h3>交付资源 · {manifest.resources.length}</h3><p className="notice">按逻辑 ID 引用；下载前校验 SHA-256 和字节长度。</p>{downloadError&&<p role="alert" className="error-state">{downloadError}</p>}{manifest.resources.map(resource=><div className="file-row" key={resource.resource_id}><Button variant="link" className="resource-button" disabled={!!download} onClick={()=>void downloadResource(resource)}>{download===resource.resource_id?<LoaderCircle className="animate-spin"/>:<Download size={14}/>}<span>{resource.resource_id}</span></Button><small>{resource.role} · {resource.format} · {bytesLabel(resource.byte_length)}<br/>SHA {resource.sha256.slice(0,20)}…</small></div>)}</TabsContent>
    <TabsContent value="engine"><h3>相机与控制</h3>{kv('配置归属','引擎 / Host adapter')}{kv('Preset provider','未连接')}{kv('运行兼容性',readiness)}<p className="notice">轨道相机仅用于查看模型。引擎相机预设、控制器与物理调参在对应 Playground 中检查。</p></TabsContent>
    <TabsContent value="source"><h3>来源与版本</h3>{kv('来源类型',provenance.source_type)}{kv('内容版本',manifest.version)}{kv('源版本',typeof provenance.source_commit==='string'?provenance.source_commit.slice(0,12):undefined)}<h3>授权记录</h3>{Object.entries(record(provenance.license)).map(([key,value])=>kv(key,value))}<p className="notice">未知表示尚未核对。预览不会自动授予独立分发权限。</p></TabsContent>
  </Tabs></section></div>;
}
