import type {WorldUiComponentContext} from '@worldkit/world-ui/react';
import './styles.css';
function PlaceCard({props}:WorldUiComponentContext<{name:string;district:string}>){return <section className="place"><div className="eyebrow">SEASIDE / FREE EXPLORE</div><h1>{props.name}</h1><p><i/>{props.district}<span>白模世界</span></p></section>;}
function TravelStatus({props}:WorldUiComponentContext<{mode:string;speed:number}>){return <section className="travel"><small>{props.mode==='骑行'?'MOTORCYCLE':'ON FOOT'}</small><div><b>{props.speed.toFixed(1)}</b><span>m/s</span></div><p>{props.mode}</p></section>;}
function HelpCard(){return <section className="help" data-world-help=""><strong>慢下来，逛一逛海边</strong><p>沿海滨步道散步，或骑车前往山坡旧街。</p><dl><div><dt>移动 / 驾驶</dt><dd>W A S D</dd></div><div><dt>上下摩托</dt><dd>F</dd></div><div><dt>跳跃 / 制动</dt><dd>Space</dd></div><div><dt>视角 / 环视</dt><dd>T / 拖拽</dd></div></dl></section>;}
function Toolbar({emit}:WorldUiComponentContext<Record<string,never>,'toggleHelp'|'recover'>){return <nav><button onClick={()=>emit('toggleHelp')}>操作指南</button><div><span>自由探索 · 无任务限制</span><button onClick={()=>emit('recover')}>扶正摩托</button></div></nav>;}
export const components={PlaceCard,TravelStatus,HelpCard,Toolbar};
