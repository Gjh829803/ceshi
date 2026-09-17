import * as React from 'react';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,Box,Layers,Monitor,MousePointer2,RadioTower,Video} from 'lucide-react';
import type {PlayerConnections,PlayerDiagnostics,PlayerViewMode} from '@worldkit/stream-player/react';
import {Card} from './components/ui/card';
import {Badge} from './components/ui/badge';
import {Tooltip,TooltipContent,TooltipTrigger} from './components/ui/tooltip';

type FlowProps={interactive:boolean;connections:PlayerConnections;diagnostics:PlayerDiagnostics|null;runtime:string;status:string;mode:PlayerViewMode;session:boolean};
const labels:Record<string,string>={open:'已连接',closed:'未连接',disabled:'未订阅',connecting:'连接中',error:'异常',running:'运行中',starting:'启动中',idle:'未启动',failed:'失败',stopped:'已停止',subscribed:'已订阅',subscribing:'订阅中',paused:'已暂停',playing:'呈现中',buffering:'缓冲中',unmapped:'等待映射',disconnected:'已断开',ended:'已结束'};
const healthy=(state:string)=>['open','running','subscribed','playing'].includes(state);
function Node({id,title,subtitle,state,icon:Icon,children}:{id:string;title:string;subtitle:string;state:string;icon:typeof Box;children:React.ReactNode}){
  return <div data-flow-node={id} data-state={state} className={`flow-node flow-node-${id} ${healthy(state)?'node-online':''}`}>
    <div className="flow-node-head"><span className="flow-node-icon"><Icon size={14}/></span><strong>{title}</strong><Badge variant="outline" className={`flow-state state-${state}`}><i/>{labels[state]??state}</Badge></div>
    <div className="flow-subtitle">{subtitle}</div><div className="flow-node-data">{children}</div>
  </div>;
}
function Edge({d,color,connected,active,id}:{d:string;color:'video'|'ui'|'input';connected:boolean;active:boolean;id:string}){
  return <g className={`flow-edge edge-${color} ${connected?'edge-connected':''} ${active?'edge-active':''}`} data-flow-edge={id} data-active={active}>
    <path className="edge-base" d={d} markerEnd={`url(#flow-arrow-${connected?color:'idle'})`}/>
    {active&&<path className="edge-packets" d={d}/>}
  </g>;
}
export function ConnectionFlow({connections:c,diagnostics:d,runtime,status,mode,session,interactive}:FlowProps){
  const mediaConnected=session&&c.media==='open',uiConnected=session&&c.control==='open'&&c.ui==='subscribed';
  const inputConnected=interactive&&session&&c.control==='open'&&c.role==='controller';
  const videoFlow=mediaConnected&&(d?.mediaKbps??0)>0,uiFlow=uiConnected&&(d?.uiMessagesPerSecond??0)>0;
  // Empty input heartbeats keep the channel alive but are not user activity.
  const inputFlow=inputConnected&&(d?.inputEventsPerSecond??0)>0;
  const playerState=!session?'idle':c.control!=='open'?'disconnected':status;
  return <Card className="panel flow-panel"><div className="panel-heading"><h2><RadioTower/>实时连接拓扑</h2><div className="flow-legend"><span><i className="legend-video"/>视频</span><span><i className="legend-ui"/>UI 数据</span><span><i className="legend-input"/>操作回传</span><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="metrics-help">动线随实际流量更新</span></TooltipTrigger><TooltipContent className="max-w-80 leading-relaxed">实线表示通道已连接，飞线表示最近一秒有实际数据。操作回传仅在键鼠或 UI 动作发生时流动，空闲心跳不触发动效。视频节点表示此播放器的订阅状态；未订阅不代表世界源端停止编码。UI 与操作共用控制 WebSocket，订阅状态独立。</TooltipContent></Tooltip></div></div>
    <div className="flow-scroll"><div className="flow-canvas">
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true" className="flow-lines"><defs>{[['video','#6eaee9'],['ui','#64c7a6'],['input','#b79bea'],['idle','#354555']].map(([name,color])=><marker id={`flow-arrow-${name}`} key={name} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke={color} strokeWidth="1.4"/></marker>)}</defs>
        <Edge id="world-video" d="M240 60 C310 60 310 49 386 49" color="video" connected={mediaConnected} active={videoFlow}/>
        <Edge id="video-player" d="M610 49 C690 49 690 60 756 60" color="video" connected={mediaConnected} active={videoFlow}/>
        <Edge id="world-ui" d="M240 92 C305 92 310 133 386 133" color="ui" connected={uiConnected} active={uiFlow}/>
        <Edge id="ui-player" d="M610 133 C690 133 690 92 756 92" color="ui" connected={uiConnected} active={uiFlow}/>
        <Edge id="player-input" d="M870 110 V160 Q870 174 855 174 H614" color="input" connected={inputConnected} active={inputFlow}/>
        <Edge id="input-world" d="M390 174 H145 Q130 174 130 160 V110" color="input" connected={inputConnected} active={inputFlow}/>
      </svg>
      <Node id="world" title="世界运行端" subtitle="Chromium · World SDK" state={session?runtime:'idle'} icon={Box}>
        <span><ArrowUpRight/>输出：视频 / UI</span><span><ArrowDownLeft/>输入：键鼠 / 动作</span>
      </Node>
      <section className="flow-connection-group flow-media-group" data-flow-group="media" data-state={session?c.media:'closed'} aria-label="Media WebSocket 视频下行">
        <div className="flow-connection-label"><Video size={10}/><span>Media WebSocket · 视频下行</span></div>
      <Node id="media" title="视频流" subtitle={mode==='ui'?'客户端视频通道已停用':'VP8 · 编码视频'} state={session?c.media:'closed'} icon={Video}>
        <b>{mediaConnected?(d?.mediaKbps??0).toFixed(0):'0'}<small>kbps</small></b><span>{mediaConnected?(d?.framesPerSecond??0).toFixed(1):'0.0'} fps</span>
      </Node>
      </section>
      <section className="flow-connection-group flow-control-group" data-flow-group="control" data-state={session?c.control:'closed'} aria-label="Control WebSocket 双向通信">
        <div className="flow-connection-label"><ArrowLeftRight size={10}/><span>Control WebSocket · 双向通信</span></div>
      <Node id="ui" title="UI 数据流" subtitle={mode==='ui'?'状态 + 动画 + 独立源时钟':mode==='video'?'仅视频模式 · UI 取消订阅':'状态 + 动画 · 按视频源帧对齐'} state={!session?'closed':c.control!=='open'?'closed':c.ui} icon={Layers}>
        <b>{uiConnected?(d?.uiMessagesPerSecond??0).toFixed(0):'0'}<small>消息 / s</small></b><span>{uiConnected?(d?.uiKbps??0).toFixed(1):'0.0'} kbps</span>
      </Node>
      <div className={`flow-input ${inputConnected?'input-connected':''}`} data-flow-node="input" data-state={!interactive?'disabled':inputConnected?'open':'closed'}><MousePointer2 size={13}/><strong>{interactive?'操作回传':'操作已关闭'}</strong><span>{inputConnected?(d?.inputMessagesPerSecond??0).toFixed(0):'0'} 包/s</span><span className={inputFlow?'has-input':''}>操作 {inputConnected?(d?.inputEventsPerSecond??0).toFixed(0):'0'}/s</span></div>
      </section>
      <Node id="player" title="调试播放器" subtitle={mode==='ui'?'仅 UI · 源时钟驱动':mode==='video'?'仅视频 · 无 UI 数据订阅':'视频 + DOM UI · 同步呈现'} state={playerState} icon={Monitor}>
        <span><Activity/>{!interactive?'操作已关闭':c.role==='controller'?'可操作':c.role==='spectator'?'只读观众':'等待控制权'}</span><span>{mode==='ui'?(d?.uiFramesPerSecond??0).toFixed(1)+' UI fps':(d?.framesPerSecond??0).toFixed(1)+' fps'}</span>
      </Node>

      <div className="flow-return-label">{interactive?'心跳保活 · 实际操作触发飞线':'停止操作与输入心跳'}</div><div className="flow-ack-label">执行回执 tick {d?.lastInputTick??'—'}</div>
    </div></div>
  </Card>;
}
