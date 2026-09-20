'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RegistryClient } from '@worldkit/asset-client';
import type { AssetManifest, AssetSummary, RegistryDescriptor, SearchRequest, SearchResponse } from '@worldkit/asset-contracts';
import { ArrowDownToLine, ArrowUpRight, Box, Boxes, Check, ChevronRight, CircleHelp, Copy, Database, FileJson, Layers3, LoaderCircle, PawPrint, Search, ShieldCheck, Sparkles, Truck, UserRound, Bot } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { ModelInspector } from './model-inspector';
import { artifactBlob } from '../lib/preview';

const groups = [{id:'all',name:'全部资产',icon:Boxes},{id:'characters',name:'人物',icon:UserRound},{id:'animals',name:'动物',icon:PawPrint},{id:'vehicles',name:'载具',icon:Truck},{id:'robots',name:'机器人',icon:Bot},{id:'fantastical',name:'幻想生物',icon:Sparkles},{id:'objects',name:'物件',icon:Box}];
export const groupName = (id:string) => groups.find(g=>g.id===id)?.name || id;

function AssetImage({asset,client}:{asset:AssetSummary;client:RegistryClient}) {
  const [url,setUrl]=useState<string>();
  useEffect(()=>{
    let closed=false, blob:string|undefined;
    if(asset.preview?.mime_type.startsWith('image/'))void artifactBlob(client,asset.preview).then(value=>{ if(closed)URL.revokeObjectURL(value);else {blob=value;setUrl(value);} }).catch(()=>{});
    return ()=>{closed=true;if(blob)URL.revokeObjectURL(blob);};
  },[asset.preview,client]);
  const Icon=groups.find(g=>g.id===asset.group)?.icon||Box;
  return url?<img src={url} alt={asset.display_name} loading="lazy"/>:<Icon className="asset-glyph" strokeWidth={1}/>;
}

export function Atlas() {
  const [client,setClient]=useState<RegistryClient>();
  const [descriptor,setDescriptor]=useState<RegistryDescriptor>();
  const [connection,setConnection]=useState('连接中');
  const [group,setGroup]=useState('all'),[query,setQuery]=useState(''),[stage,setStage]=useState('all'),[previewOnly,setPreviewOnly]=useState(false);
  const [page,setPage]=useState<SearchResponse>(),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [selection,setSelection]=useState<AssetSummary>(),[manifest,setManifest]=useState<AssetManifest>(),[detailError,setDetailError]=useState('');
  const [help,setHelp]=useState(false),[copied,setCopied]=useState(false);
  const request=useRef(0), detailRequest=useRef(0), searchInput=useRef<HTMLInputElement>(null);
  const connect=useCallback(()=>{
    const next=new RegistryClient({registryUrl:window.location.origin+'/'});
    setConnection('连接中');setClient(undefined);
    void next.descriptor().then(value=>{setDescriptor(value);setClient(next);setConnection('');}).catch(()=>setConnection('资产发布数据暂时不可用，请检查服务配置后重试。'));
  },[]);
  useEffect(()=>{connect();},[connect]);
  const filters:SearchRequest={query:query.trim(),limit:20,...(group==='all'?{}:{group}),...(stage==='all'?{}:{stage}),...(previewOnly?{previewable:true}:{})};
  const filterKey=JSON.stringify(filters);
  const load=useCallback(async(cursor?:string)=>{
    if(!client)return;
    const token=++request.current;setLoading(true);setError('');
    try {
      const result=await client.searchAssets({...JSON.parse(filterKey),...(cursor?{cursor}:{})});
      if(token!==request.current)return;
      setPage(previous=>cursor&&previous?{...result,items:[...previous.items,...result.items]}:result);
    }catch(e){if(token===request.current)setError(String(e));}
    finally{if(token===request.current)setLoading(false);}
  },[client,filterKey]);
  useEffect(()=>{request.current++;setPage(undefined);setLoading(true);const timer=setTimeout(()=>void load(),150);return()=>{clearTimeout(timer);request.current++;};},[load]);
  const open=useCallback(async(asset:AssetSummary)=>{
    if(!client)return;
    const token=++detailRequest.current;setSelection(asset);setManifest(undefined);setDetailError('');setCopied(false);
    const url=new URL(window.location.href);url.searchParams.set('asset',asset.asset_id);window.history.replaceState(null,'',url);
    try{const result=await client.fetchManifest({asset_id:asset.asset_id,version:asset.version,manifest_path:asset.manifest_path,manifest_digest:asset.manifest_digest});if(token===detailRequest.current)setManifest(result);}catch(e){if(token===detailRequest.current)setDetailError(String(e));}
  },[client]);
  useEffect(()=>{
    if(!client)return;let closed=false;
    const id=new URL(window.location.href).searchParams.get('asset');
    if(id)void client.searchAssets({asset_ids:[id],limit:1}).then(result=>{if(closed)return;const asset=result.items[0];if(asset)void open(asset);else setError('未找到指定资产：'+id);}).catch(e=>{if(!closed)setError(String(e));});
    return()=>{closed=true;};
  },[client,open]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='/'&&!selection&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();searchInput.current?.focus();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[selection]);
  const close=()=>{detailRequest.current++;setSelection(undefined);setManifest(undefined);const url=new URL(location.href);url.searchParams.delete('asset');history.replaceState(null,'',url);};
  const rows=page?.items||[];
  return <div className="atlas-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-symbol"><Layers3 size={24}/></span><span>Worldkit <b>Atlas</b><small>世界资产库</small></span></a>
      <div className="nav-label">工作空间 <span>01</span></div>
      <nav aria-label="资产分类">{groups.map(g=><Button key={g.id} aria-label={g.name} title={g.name} variant="ghost" className={'nav-item '+(g.id===group?'active':'')} onClick={()=>setGroup(g.id)}><g.icon size={17}/><span>{g.name}</span>{g.id===group&&<ChevronRight size={14}/>}</Button>)}</nav>
      <div className="sidebar-bottom"><Button variant="ghost" onClick={()=>setHelp(true)} className="justify-start"><CircleHelp size={16}/>关于资产库</Button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">工作空间 <ChevronRight size={14}/><span>资产管理</span></div></header>
      <section className="collection">
        <div className="stats-grid">{[[page?.total??'—','匹配资产',Boxes],[page?rows.length:'—','已加载条目',Layers3],[page?rows.filter(r=>r.readiness.previewable).length:'—','已加载可预览',Box],[page?rows.filter(r=>r.readiness.runtime==='verified').length:'—','已加载运行验证',ShieldCheck]].map(([n,label,Icon])=>{const I=Icon as typeof Boxes;return <div className="stat" key={String(label)}><div><span>{String(label)}</span><I size={16}/></div><strong>{String(n)}</strong><small>项</small></div>;})}</div>
        <div className="filterbar"><div className="search-field"><Search size={17}/><Input ref={searchInput} aria-label="搜索资产" placeholder="搜索名称、ID 或能力…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>/</kbd></div><Select value={stage} onValueChange={setStage}><SelectTrigger aria-label="资产阶段"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部阶段</SelectItem>{['placeholder','assets_ready','deprecated'].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><label className="check-label"><Checkbox checked={previewOnly} onCheckedChange={v=>setPreviewOnly(v===true)}/>仅可预览</label><span className="result-count">{rows.length} / {page?.total??'—'} 项</span></div>
        {connection&&<div className="empty-state" role="status"><Database/><p>{connection}</p>{connection!=='连接中'&&<Button variant="outline" onClick={connect}>重新连接</Button>}</div>}
        {error&&<div className="error-state" role="alert">{error}<Button variant="outline" onClick={()=>void load()}>重试</Button></div>}
        {!connection&&client&&<div className="asset-grid">{rows.map(asset=><button type="button" className="asset-card" key={asset.asset_id+'@'+asset.version} aria-label={'预览 '+asset.display_name.split(' / ')[0]} onClick={()=>void open(asset)}><div className="card-image"><AssetImage asset={asset} client={client}/><span className="card-group">{groupName(asset.group)}</span><span className="card-format">{asset.preview?.format?.toUpperCase()||'REFERENCE'}</span><span className="card-open"><ArrowUpRight size={16}/></span></div><div className="card-info"><h2>{asset.display_name.split(' / ')[0]}</h2><p>{asset.asset_id}</p><div><span className={asset.placeholder?'status pending':'status'}><i/>{asset.placeholder?'待入库占位':'内容已登记'}</span><span>v{asset.version}</span></div></div></button>)}</div>}
        {loading&&!connection&&<div className="loading-row" role="status"><LoaderCircle className="animate-spin" size={18}/>正在读取资产…</div>}
        {!loading&&!connection&&!error&&!rows.length&&<div className="empty-state"><Search/><p>没有匹配的资产</p><Button variant="outline" onClick={()=>{setQuery('');setGroup('all');setStage('all');setPreviewOnly(false);}}>清除筛选</Button></div>}
        {page?.next_cursor&&<div className="load-more"><Button variant="outline" disabled={loading} onClick={()=>void load(page.next_cursor!)}><ArrowDownToLine size={16}/>加载更多</Button></div>}
      </section>
    </main>
    <Dialog open={!!selection} onOpenChange={value=>{if(!value)close();}}><DialogContent className="inspector-dialog" aria-describedby="asset-description"><DialogHeader className="inspector-heading"><div className="eyebrow">{selection?groupName(selection.group):''} / ASSET INSPECTOR</div><DialogTitle>{selection?.display_name.split(' / ')[0]}</DialogTitle><DialogDescription id="asset-description">{selection?.asset_id} @ {selection?.version}</DialogDescription><div className="detail-actions"><span className="badge">{selection?.placeholder?'待入库占位':'内容已登记'}</span><span className="badge">Runtime {selection?.readiness.runtime}</span><Button variant="ghost" size="icon-sm" aria-label="复制资产 ID" onClick={()=>{if(selection)void navigator.clipboard.writeText(selection.asset_id).then(()=>setCopied(true)).catch(()=>setDetailError('复制失败，请手动复制资产 ID。'));}}>{copied?<Check/>:<Copy/>}</Button>{selection&&descriptor&&<Button variant="ghost" size="sm" asChild><a href={'/v1/assets/'+selection.asset_id+'/versions/'+selection.version+'?snapshot_id='+descriptor.snapshot_id} target="_blank" rel="noreferrer"><FileJson size={14}/>Manifest</a></Button>}</div></DialogHeader>{detailError&&<p className="error-state" role="alert">{detailError}</p>}{manifest&&client&&selection?<ModelInspector key={manifest.asset_id+'@'+manifest.version} manifest={manifest} client={client} readiness={selection.readiness.runtime}/>:!detailError&&<div className="empty-state"><LoaderCircle className="animate-spin"/><p>读取固定版本的资产描述…</p></div>}</DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>Worldkit Atlas · 世界资产库</DialogTitle><DialogDescription>资产选择、版本锁定与运行验证说明。</DialogDescription></DialogHeader><div className="help-content"><p>这里可以搜索资产、查看模型与动画、核对来源和下载资源。内容预览与引擎运行验证分别记录。</p><p>世界通过资产清单选择内容，使用锁定清单固定版本与资源哈希。启动前读取远端资源，按 SHA-256 校验并复用缓存。</p><p>模型事实属于资产；控制器、物理行为和相机调参属于引擎。运行效果请在对应 Playground 中检查。</p></div></DialogContent></Dialog>
  </div>;
}
