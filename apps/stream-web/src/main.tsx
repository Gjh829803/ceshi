import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {WorldStreamPlayer,type PlayerDiagnostics,type PlayerConnections,type PlayerViewMode,type PlayerEvent} from '@worldkit/stream-player/react';
import type {SessionDescriptor,VideoSettings} from '@worldkit/stream-protocol';
import {Activity,ArrowLeftRight,ArrowUpRight,Box,ChevronDown,History,Layers,MousePointer2,RadioTower,RotateCcw,Server,Settings2,Square,Video,X} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Card} from './components/ui/card';
import {Switch} from './components/ui/switch';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './components/ui/tooltip';
import {readSavedSession,saveSession} from './session-cache';
import {ConnectionFlow} from './connection-flow';
import './style.css';

const emptyConnections:PlayerConnections={control:'closed',media:'closed',ui:'paused',role:'unassigned'};
const statusLabels:Record<string,string>={idle:'未启动',connecting:'连接中',buffering:'缓冲中',playing:'播放中',unmapped:'等待 UI 同步',disconnected:'已断开',error:'异常',ended:'已结束',open:'已连接',closed:'未连接',disabled:'未订阅',paused:'未订阅',subscribing:'订阅中',subscribed:'已订阅',spectator:'只读',unassigned:'等待控制权',online:'在线',offline:'离线',running:'运行中',starting:'启动中',failed:'失败',stopped:'已停止'};
function Status({value,label}:{value:string;label?:string}){return <Badge variant="outline" className={`status status-${value}`}><i/>{label??statusLabels[value]??value}</Badge>;}
function Metric({label,value,unit}:{label:string;value:React.ReactNode;unit?:string}){return <div className="metric"><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>;}
type ConsoleEvent=Omit<PlayerEvent,'type'>&{type:PlayerEvent['type']|'input.enabled';count:number};
const eventLabels:Record<ConsoleEvent['type'],string>={'control.connection':'控制连接','media.connection':'视频连接','ui.subscription':'UI 订阅','ui.resync':'请求 UI 重新同步','view.mode':'显示图层','session.ready':'接入会话','session.reset':'世界重置 · epoch','session.ended':'会话结束','video.settings':'视频参数已更新','error':'异常','input.enabled':'操作响应'};
const eventValues:Record<string,string>={...statusLabels,combined:'视频 + UI',video:'仅视频',ui:'仅 UI',controller:'控制者',spectator:'只读观众',enabled:'开启',disabled:'关闭',requested:'已发送'};
function App(){
  const [events,setEvents]=React.useState<ConsoleEvent[]>([]);
  const onEvent=React.useCallback((event:Omit<ConsoleEvent,'count'>)=>setEvents(previous=>{
    const last=previous[0];
    if(last&&last.type===event.type&&last.value===event.value&&last.level===event.level)return [{...event,count:last.count+1},...previous.slice(1)];
    return [{...event,count:1},...previous].slice(0,50);
  }),[]);
  const [interactive,setInteractive]=React.useState(true);
  const [viewMode,setViewMode]=React.useState<PlayerViewMode>('combined');
  const [videoDraft,setVideoDraft]=React.useState<VideoSettings>({width:1280,height:720,fps:24,bitrate:2000000});
  const [applyingVideo,setApplyingVideo]=React.useState(false);
  const [initialSession]=React.useState(readSavedSession);
  const [recoveryPending,setRecoveryPending]=React.useState(!!initialSession),[notice,setNotice]=React.useState('');
  const [worlds,setWorlds]=React.useState<{id:string;name:string}[]>([]),[session,setSession]=React.useState<SessionDescriptor|null>(null);
  const [diagnostics,setDiagnostics]=React.useState<PlayerDiagnostics|null>(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(!!initialSession);
  const [connections,setConnections]=React.useState(emptyConnections),[status,setStatus]=React.useState('idle');
  const [service,setService]=React.useState({status:'connecting',ping:0,checkedAt:''}),[runtime,setRuntime]=React.useState('idle');
  const current=React.useRef(session);current.current=session;
  const adopt=React.useCallback((value:SessionDescriptor)=>{saveSession({kind:'active',sessionId:value.sessionId,accessToken:value.accessToken});setSession(value);setVideoDraft({width:value.width,height:value.height,fps:value.fps,bitrate:value.bitrate});setRecoveryPending(false);},[]);
  const recover=React.useCallback(async(isDisposed:()=>boolean=()=>false)=>{
    const saved=readSavedSession();if(!saved){setRecoveryPending(false);setBusy(false);return;}
    setBusy(true);setError('');setStatus('connecting');
    try{
      const response=saved.kind==='active'
        ?await fetch(`/v1/sessions/${encodeURIComponent(saved.sessionId)}`,{headers:{authorization:`Bearer ${saved.accessToken}`},signal:AbortSignal.timeout(10000)})
        :await fetch('/v1/sessions',{method:'POST',headers:{'content-type':'application/json','idempotency-key':saved.requestId},body:JSON.stringify({worldId:saved.worldId,...(saved.video?{video:saved.video}:{})}),signal:AbortSignal.timeout(45000)});
      if(isDisposed())return;
      if([403,404,410].includes(response.status)||(saved.kind==='pending'&&response.status===400)){saveSession(null);setRecoveryPending(false);setStatus('idle');setNotice('上次会话已结束或服务已重启，请重新选择世界。');return;}
      const value=await response.json();if(isDisposed())return;if(!response.ok)throw new Error(value.error??'恢复失败');
      adopt(value);setRuntime(value.status??'running');setNotice('已恢复原会话，世界状态保持不变。');
    }catch(e){if(!isDisposed()){setError(`恢复连接失败：${String(e)}`);setStatus('disconnected');}}
    finally{if(!isDisposed())setBusy(false);}
  },[adopt]);
  React.useEffect(()=>{if(!initialSession)return;let disposed=false;void recover(()=>disposed);return()=>{disposed=true;};},[initialSession,recover]);
  React.useEffect(()=>{
    let disposed=false,pending=false;
    const probe=async()=>{if(pending)return;pending=true;const start=performance.now();try{
      const response=await fetch('/v1/worlds',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error('服务不可用');const list=await response.json();
      if(disposed)return;setWorlds(list);setService({status:'online',ping:Math.round(performance.now()-start),checkedAt:new Date().toLocaleTimeString('zh-CN',{hour12:false})});
      const active=current.current;if(active){const r=await fetch(`/v1/sessions/${active.sessionId}`,{headers:{authorization:`Bearer ${active.accessToken}`},signal:AbortSignal.timeout(4000)});const body=await r.json();if(!disposed&&current.current?.sessionId===active.sessionId)setRuntime(r.ok?body.status:'stopped');}
    }catch{if(!disposed){setService(s=>({...s,status:'offline'}));setRuntime('idle');}}finally{pending=false;}};
    void probe();const timer=setInterval(()=>void probe(),5000);return()=>{disposed=true;clearInterval(timer);};
  },[]);
  const clear=()=>{saveSession(null);setRecoveryPending(false);setNotice('');setSession(null);setDiagnostics(null);setConnections(emptyConnections);setStatus('idle');setRuntime('idle');};
  const stop=async()=>{if(!session)return;setBusy(true);setError('');try{
    const r=await fetch(`/v1/sessions/${session.sessionId}`,{method:'DELETE',headers:{authorization:`Bearer ${session.accessToken}`}});if(!r.ok&&r.status!==404)throw new Error('结束会话失败');clear();
  }catch(e){setError(String(e));}finally{setBusy(false);}};
  const select=async(id:string)=>{if(session?.worldId===id)return;setBusy(true);setError('');try{
    if(session){const r=await fetch(`/v1/sessions/${session.sessionId}`,{method:'DELETE',headers:{authorization:`Bearer ${session.accessToken}`}});if(!r.ok&&r.status!==404)throw new Error('结束旧会话失败');}
    clear();setStatus('connecting');setRuntime('starting');
    const requestId=crypto.randomUUID();saveSession({kind:'pending',worldId:id,requestId,video:{...videoDraft}});
    const response=await fetch('/v1/sessions',{method:'POST',headers:{'content-type':'application/json','idempotency-key':requestId},body:JSON.stringify({worldId:id,video:videoDraft})});
    const result=await response.json();if(!response.ok){if(response.status>=400&&response.status<500)saveSession(null);throw new Error(result.error);}adopt(result);setRuntime('running');
  }catch(e){setRecoveryPending(!!readSavedSession());setError(String(e));setStatus('error');setRuntime('failed');}finally{setBusy(false);}};
  const reset=async()=>{if(!session)return;setBusy(true);setError('');setRuntime('starting');try{
    const response=await fetch(`/v1/sessions/${session.sessionId}/reset`,{method:'POST',headers:{authorization:`Bearer ${session.accessToken}`}});const result=await response.json();if(!response.ok)throw new Error(result.error);adopt(result);setRuntime('running');
  }catch(e){setError(String(e));setRuntime('failed');}finally{setBusy(false);}};
  const onVideoSettingsChange=React.useCallback((video:VideoSettings)=>{setSession(s=>s?{...s,...video}:s);setVideoDraft(video);},[]);
  const applyVideo=async()=>{if(!session)return;setApplyingVideo(true);setError('');try{
    const response=await fetch(`/v1/sessions/${session.sessionId}/video`,{method:'POST',headers:{authorization:`Bearer ${session.accessToken}`,'content-type':'application/json'},body:JSON.stringify(videoDraft)});
    const result=await response.json();if(!response.ok)throw new Error(result.error);adopt(result);setNotice('视频参数已应用，世界状态保持不变。');
  }catch(e){setError(String(e));}finally{setApplyingVideo(false);}};
  const onError=React.useCallback((e:Error)=>setError(e.message),[]);
  const source=diagnostics?.sourceDiagnostics;
  const sourceFps=(count:number|undefined)=>source&&count!==undefined?(count*1000/source.sampleDurationMs).toFixed(1):'—';
  const uiChannel=!session?'closed':connections.control!=='open'?connections.control:connections.ui;
  const inputChannel=!interactive?'disabled':!session?'closed':connections.control!=='open'?connections.control:connections.role==='controller'?'open':connections.role;
  const active=(viewMode==='ui'?connections.ui==='subscribed':connections.media==='open')&&status==='playing'&&(diagnostics?.lastFrameAgeMs??0)<2000;
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark"><RadioTower size={17}/></span><h1>World Stream <span>开发控制台</span></h1></div><div className="topbar-meta"><span className="mode">白模直通</span><Status value={service.status} label={service.status==='online'?'本地服务在线':'本地服务'+(statusLabels[service.status]??'未知')}/></div></header>
    <ConnectionFlow interactive={interactive} connections={connections} diagnostics={diagnostics} runtime={runtime} status={status} mode={viewMode} session={!!session}/>
    <div className="workspace"><aside>
      <Card className="panel service-panel"><div className="panel-heading"><h2><Server/>服务连接</h2><span className="counter">1 个实例</span></div>
        <div className="service-item"><div className="row"><strong>Local stream host</strong><Status value={service.status}/></div><code>{session?.baseUrl??location.origin}</code><div className="subline"><span>HTTP 探测 {service.status==='online'?service.ping+' ms':'—'}</span><span>{service.checkedAt||'等待响应'}</span></div></div>
        <div className="service-transports" aria-label="当前服务连接">
          <section className="service-transport" data-service-transport="media" aria-label="视频连接">
            <div className="transport-heading"><Video/><strong>视频连接</strong><Status value={session?connections.media:'closed'}/></div>
            <div className="transport-description">Media WebSocket <span>↓ 视频下行</span></div>
          </section>
          <section className="service-transport" data-service-transport="control" aria-label="控制连接">
            <div className="transport-heading"><ArrowLeftRight/><strong>控制连接</strong><Status value={session?connections.control:'closed'}/></div>
            <div className="transport-description">Control WebSocket <span>↕ 双向通信</span></div>
            <dl className="control-channels">
              <div data-service-channel="ui"><dt><Layers/>↓ UI 数据</dt><dd><Status value={uiChannel}/></dd></div>
              <div data-service-channel="input"><dt><MousePointer2/>↑ 操作回传</dt><dd><Status value={inputChannel} label={!interactive?'已关闭':inputChannel==='open'?'可操作':statusLabels[inputChannel]??inputChannel}/></dd></div>
            </dl>
          </section>
        </div>
      </Card>
      <Card className="panel world-panel"><div className="panel-heading"><h2><Box/>可用世界</h2><span className="counter">{worlds.length}</span></div><div className="world-list">{worlds.map(w=><Button variant="outline" size="sm" data-world-id={w.id} disabled={busy||applyingVideo||recoveryPending||service.status!=='online'} className={'world-option '+(session?.worldId===w.id?'selected':'')} key={w.id} onClick={()=>void select(w.id)}><span className="world-icon"><Box size={15}/></span><span><strong>{w.name}</strong><small>{session?.worldId===w.id?'当前会话':'点击启动'}</small></span><span className="world-arrow">{session?.worldId===w.id?<span className="live-dot is-live"/>:<ArrowUpRight size={12}/>}</span></Button>)}{!worlds.length&&<p className="muted">{service.status==='offline'?'无法获取世界列表':'正在加载世界…'}</p>}</div></Card>
      <Card className="panel"><div className="panel-heading"><h2><Settings2/>视频参数</h2><span className="subtle">VP8</span></div><div className="video-settings">
        <label>分辨率<NativeSelect aria-label="视频分辨率" disabled={busy||applyingVideo} value={`${videoDraft.width}x${videoDraft.height}`} onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);setVideoDraft(v=>({...v,width:width!,height:height!}));}}>
          {!['640x360','854x480','1280x720','1920x1080'].includes(`${videoDraft.width}x${videoDraft.height}`)&&<NativeSelectOption value={`${videoDraft.width}x${videoDraft.height}`}>{videoDraft.width} × {videoDraft.height}</NativeSelectOption>}
          <NativeSelectOption value="640x360">360p · 640 × 360</NativeSelectOption><NativeSelectOption value="854x480">480p · 854 × 480</NativeSelectOption><NativeSelectOption value="1280x720">720p · 1280 × 720</NativeSelectOption><NativeSelectOption value="1920x1080">1080p · 1920 × 1080</NativeSelectOption>
        </NativeSelect></label>
        <div className="settings-pair"><label>目标帧率<NativeSelect aria-label="目标视频帧率" disabled={busy||applyingVideo} value={videoDraft.fps} onChange={e=>setVideoDraft(v=>({...v,fps:Number(e.target.value)}))}>
          {![12,24,30,60].includes(videoDraft.fps)&&<NativeSelectOption value={videoDraft.fps}>{videoDraft.fps} fps</NativeSelectOption>}{[12,24,30,60].map(fps=><NativeSelectOption key={fps} value={fps}>{fps} fps</NativeSelectOption>)}
        </NativeSelect></label><label>目标码率<NativeSelect aria-label="目标视频码率" disabled={busy||applyingVideo} value={videoDraft.bitrate} onChange={e=>setVideoDraft(v=>({...v,bitrate:Number(e.target.value)}))}>
          {![500000,1000000,2000000,4000000,8000000,12000000].includes(videoDraft.bitrate)&&<NativeSelectOption value={videoDraft.bitrate}>{videoDraft.bitrate/1e6} Mbps</NativeSelectOption>}{[.5,1,2,4,8,12].map(mbps=><NativeSelectOption key={mbps} value={mbps*1e6}>{mbps} Mbps</NativeSelectOption>)}
        </NativeSelect></label></div>
        <Button variant="outline" size="sm" disabled={!session||busy||applyingVideo||runtime!=='running'||connections.role!=='controller'} onClick={()=>void applyVideo()}>{applyingVideo?'正在应用…':'应用视频参数'}</Button>
        <p className="panel-note">{session?`当前 ${session.width}×${session.height} · ${session.fps} fps · ${(session.bitrate/1e6).toFixed(1)} Mbps`:'选择参数后启动世界。'}<br/>目标码率不等于实际接收码率。</p>
      </div></Card>
      <Collapsible className="panel"><CollapsibleTrigger asChild><Button variant="ghost" className="details-trigger"><ChevronDown/>操作说明</Button></CollapsibleTrigger><CollapsibleContent><dl className="shortcuts"><div><dt>移动</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd></div><div><dt>跳跃</dt><dd><kbd>Space</kbd></dd></div><div><dt>视角 / 缩放</dt><dd>拖拽 / 滚轮</dd></div></dl><p className="panel-note">点击画面聚焦，操作通过服务回传世界。</p></CollapsibleContent></Collapsible>
    </aside>
    <article className="stage-column"><Card className="panel stage-panel"><div className="stage-toolbar"><div><span className={'live-dot '+(active?'is-live':'')}/><strong>{worlds.find(w=>w.id===session?.worldId)?.name??session?.worldId??'世界预览'}</strong><span className="mode">{session?`${session.width} × ${session.height}`:'等待会话'}</span></div><div><Status value={status}/>{recoveryPending&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void recover()}>重新连接</Button>}<Button variant="outline" size="sm" disabled={!session||busy||applyingVideo} onClick={()=>void reset()}><RotateCcw/>重置世界</Button><Button variant="outline" size="sm" disabled={!session||busy||applyingVideo} onClick={()=>void stop()}><Square/>结束会话</Button></div></div>
      <div className="view-toolbar"><span>显示图层</span><div role="group" aria-label="显示图层">{([['video','仅视频',Video],['ui','仅 UI',Layers],['combined','视频 + UI',Box]] as const).map(([mode,label,Icon])=><Button key={mode} size="sm" variant="ghost" aria-pressed={viewMode===mode} onClick={()=>setViewMode(mode)}><Icon/>{label}</Button>)}</div><label className="interaction-switch"><Switch checked={interactive} onCheckedChange={value=>{setInteractive(value);onEvent({timestampMs:Date.now(),type:'input.enabled',value:value?'enabled':'disabled',level:'info'});}} aria-label="操作响应"/><span>操作响应</span><small>{interactive?'已开启':'已关闭'}</small></label><small>{viewMode==='ui'?'视频通道已停用，UI 按源时钟运行':viewMode==='video'?'UI 数据已取消订阅':'视频与 UI 按源帧时间对齐'}</small></div>
      {session?<WorldStreamPlayer session={session} interactive={interactive} viewMode={viewMode} onVideoSettingsChange={onVideoSettingsChange} onConnectionsChange={setConnections} onStatusChange={setStatus} onDiagnostics={setDiagnostics} onEvent={onEvent} onError={onError}/>:<div className="empty"><span><Video size={30} strokeWidth={1.3}/></span><strong>{busy?(recoveryPending?'正在恢复原会话':'正在启动世界运行端'):recoveryPending?'等待恢复连接':'选择世界以开始预览'}</strong><p>视频、同步 UI 与远程操作会在此接入</p></div>}
      <div className="stage-foot"><span><b>VIDEO</b> {viewMode==='ui'?'未订阅':diagnostics?.codec.toUpperCase()??'—'} <i/> <b>UI</b> {viewMode==='video'?'未订阅':'React / DOM'}</span><span>{session?`SESSION ${session.sessionId.slice(0,8)} · EPOCH ${session.epoch}`:'无活动会话'}</span></div>
    </Card>
    {notice&&<p role="status" className="session-notice">{notice}</p>}
    {error&&<div role="alert" className="error"><span>{error}</span><Button variant="outline" size="sm" aria-label="清除错误" onClick={()=>setError('')}><X/></Button></div>}
    <Card className="panel"><div className="panel-heading"><h2><Activity/>流监测</h2><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="subtle metrics-help">每秒采样 · 指标说明</span></TooltipTrigger><TooltipContent side="top" className="max-w-72 leading-relaxed">源端帧率来自运行端每秒实际完成的采集和编码次数，与客户端使用独立采样窗口；超过 3 秒未更新显示 —。仅 UI 模式下源端可能继续编码，客户端视频播放 FPS 为零。最近呈现距今不是端到端延迟。</TooltipContent></Tooltip></div><div className="metrics stream-metrics">
      <Metric label="播放帧率" value={diagnostics?diagnostics.framesPerSecond.toFixed(1):'—'} unit="fps"/>
      <Metric label="视频接收码率" value={diagnostics?(diagnostics.mediaKbps/1000).toFixed(2):'—'} unit="Mbps"/>
      <Metric label="目标采集帧率" value={session?.fps??'—'} unit="fps"/>
      <Metric label="源端实际采集" value={sourceFps(source?.capturedFrames)} unit="fps"/>
      <Metric label="源端实际编码" value={sourceFps(source?.encodedFrames)} unit="fps"/>
      <Metric label="源端编码队列" value={source?.encodeQueueSize??'—'} unit="帧"/>
      <Metric label="最近呈现距今" value={diagnostics?Math.round(diagnostics.lastFrameAgeMs):'—'} unit="ms"/>
      <Metric label="累计显示帧" value={diagnostics?.frames??'—'}/>
      <Metric label="播放队列丢弃" value={diagnostics?.droppedFrames??'—'}/>
      <Metric label="源帧时间" value={diagnostics?(diagnostics.sourceTimeUs/1e6).toFixed(2):'—'} unit="s"/>
      <Metric label="模拟 tick" value={diagnostics?.simulationTick??'—'}/>
      <Metric label="UI revision" value={diagnostics?.uiRevision??'—'}/>
      <Metric label="UI 未映射帧" value={diagnostics?.unmappedFrames??'—'}/>
      <Metric label="待解码帧" value={diagnostics?.decodeQueueSize??'—'}/>
      <Metric label="输入回执 tick" value={diagnostics?.lastInputTick??'—'}/>
    </div></Card>
    <Card className="panel"><div className="panel-heading"><h2><Layers/>UI 与操作监测</h2><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="subtle metrics-help">增量 / 同步 · 回执耗时说明</span></TooltipTrigger><TooltipContent className="max-w-80 leading-relaxed">UI 分别统计状态增量、全量快照、源时钟消息；无状态变化仍可能收到同步消息。操作耗时使用客户端时钟，从发送真实输入或 UI 动作到收到对应回执，排除空闲心跳；不包含最终画面的传输与呈现。P95 取最近 60 秒内最多 128 个匹配样本，— 表示暂无有效样本。</TooltipContent></Tooltip></div><div className="metrics">
      <Metric label="UI 状态增量" value={diagnostics?.uiCommitsPerSecond.toFixed(1)??'—'} unit="条/s"/>
      <Metric label="UI 完整快照" value={diagnostics?.uiSnapshotsPerSecond.toFixed(1)??'—'} unit="条/s"/>
      <Metric label="UI 时钟同步" value={diagnostics?.uiClocksPerSecond.toFixed(1)??'—'} unit="条/s"/>
      <Metric label="最近操作回执" value={diagnostics?.inputAckMs?.toFixed(0)??'—'} unit="ms"/>
      <Metric label="操作回执 P95" value={diagnostics?.inputAckP95Ms?.toFixed(0)??'—'} unit="ms"/>
      <Metric label="回执有效样本" value={diagnostics?.inputAckSamples??0} unit="个 / 60s"/>
    </div></Card>
    <Collapsible className="panel event-panel"><CollapsibleTrigger asChild><Button variant="ghost" className="details-trigger"><ChevronDown/><History/>近期事件 <span>{events.length} 条 · 本页最近 50 条</span></Button></CollapsibleTrigger><CollapsibleContent><ol className="event-list" aria-label="近期连接事件">{events.map((event,index)=><li key={`${event.timestampMs}-${index}`} data-level={event.level}><time>{new Date(event.timestampMs).toLocaleTimeString('zh-CN',{hour12:false})}</time><span><b>{eventLabels[event.type]}</b> · {eventValues[event.value]??event.value}{event.count>1&&<small> ×{event.count}</small>}</span></li>)}{!events.length&&<li>暂无事件</li>}</ol></CollapsibleContent></Collapsible>
    <Collapsible className="panel details"><CollapsibleTrigger asChild><Button variant="ghost" className="details-trigger"><ChevronDown/>会话与产物身份 <span>{session?'查看完整标识':'未连接'}</span></Button></CollapsibleTrigger><CollapsibleContent><dl><div><dt>Session</dt><dd>{session?.sessionId??'—'}</dd></div><div><dt>World build</dt><dd>{session?.worldBuildHash??'—'}</dd></div><div><dt>UI bundle</dt><dd>{session?.uiBundleHash??'—'}</dd></div><div><dt>传输</dt><dd>VP8 / WebCodecs · 视频与 UI 分离传输 · 源帧时间对齐</dd></div></dl></CollapsibleContent></Collapsible>
    </article></div><footer className="bottom-bar"><span>WORLDKIT <i/> 开发预览</span><span>交互 → 世界运行端 → 编码视频 + UI → 公共播放器</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider delayDuration={250}><App/></TooltipProvider>);
