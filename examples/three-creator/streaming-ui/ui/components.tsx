import {motion,useTransform} from 'motion/react';
import {usePresentedMotionValue,type WorldUiComponentContext} from '@worldkit/world-ui/react';
import './styles.css';
import type {CatalogComponents} from './catalog.generated.js';

function HealthBar({props,nodeInstanceId}:WorldUiComponentContext<{value:number;max:number}>){
  const value=usePresentedMotionValue({nodeInstanceId,property:'displayValue',fallback:props.value});
  const scaleX=useTransform(()=>Math.max(0,Math.min(1,value.get()/props.max)));
  return <section className="health" data-hud="health"><div className="health-title"><span>EXPLORER / 01</span><b data-health-value="">{props.value} <small>/ {props.max}</small></b></div><div className="health-track"><motion.div data-health-fill="" style={{scaleX,transformOrigin:'left'}}/></div><p>源状态与视频同步 · 自定义世界组件</p></section>;
}
function Controls({emit}:WorldUiComponentContext<Record<string,never>,'damage'|'heal'>){
  return <section className="controls"><span>WASD 移动 · Space 跳跃 · 拖动转向</span><div><button onClick={()=>emit('damage')}>受到伤害 −20</button><button onClick={()=>emit('heal')}>恢复生命</button></div></section>;
}
export const components={HealthBar,Controls} satisfies CatalogComponents;
