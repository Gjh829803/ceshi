import type {humanoid} from '@worldkit/three';
import {ROAD_CUSHIONS,KART_CUSHION_SUPPORT_RISE} from './seating';
type Part=NonNullable<humanoid.VehicleSpec['wheelPhysics']>['chassis'];
/** 卡丁车低底板和保险杠不能复用离地 0.32 米的通用汽车底盘。轮胎仍由轮组扫掠处理。 */
export function kartBodyParts():NonNullable<Part>[] {
 const {center,size}=ROAD_CUSHIONS.kart;
 const box=(halfExtents:[number,number,number],offset:[number,number,number]):NonNullable<Part>=>({kind:'box',halfExtents,offset});
 return [
  box([.70,.05,1.25],[0,.16,0]), // 底板下表面为 0.11 米。
  ...[-.63,.63].flatMap(x=>[
   box([.045,.045,1.13],[x,.22,-.01]), // 纵向车架管。
   box([.16,.11,.515],[x,.32,-.02]), // 侧箱。
  ]),
  box([.78,.035,.035],[0,.24,-.89]), // 后轴。
  box([.93,.09,.13],[0,.28,1.23]), // 前保险杠。
  box([.82,.06,.08],[0,.25,-1.25]), // 后保险杠。
  box([.33,.124,.357],[0,.30,.75]), // 倾斜脚踏板的包围范围。
  box([size[0]/2,(size[1]+KART_CUSHION_SUPPORT_RISE)/2,size[2]/2],[center[0],center[1]+KART_CUSHION_SUPPORT_RISE/2,center[2]]),
  box([.37,.36,.065],[center[0],center[1]+.35,center[2]-size[2]/2-.065]),
  box([.215,.1925,.215],[.46,.4725,-.83]), // 发动机及顶盖。
  box([.035,.355,.28],[0,.56,.545]), // 转向柱。
  box([.245,.17,.21],[0,.88,.30]), // 方向盘。
 ];
}
/** 越野车的实体车身；保障车型额外包含货箱。轮胎由轮组扫掠处理。单位：米。 */
export function roverBodyParts(utility=false):NonNullable<Part>[] {
 const box=(halfExtents:[number,number,number],offset:[number,number,number]):NonNullable<Part>=>({kind:'box',halfExtents,offset});
 return [
  box([1,.125,1.9],[0,.605,0]), // 底板，保留底部离地空间。
  box([1,.20,.90],[0,.88,0]), // 两侧车身。
  box([1.1,.10,.09],[0,.50,2]),
  box([1.1,.10,.09],[0,.50,-2]),
  box([.90,.125,.65],[0,1.22,1.10]), // 引擎盖。
  box([.95,.09,.40],[0,1.27,-1.25]), // 后平台。
  box([.99,.605,.96],[0,1.625,.10]), // 驾驶舱和防滚架。
  ...(utility?[box([.95,.39,.65],[0,1.39,-.75])]:[]), // 保障车型货箱及顶部外沿。
  box([.88,.09,.035],[0,.85,1.94]), // 前灯。
  box([.81,.07,.03],[0,.80,-1.94]), // 尾灯。
 ];
}
