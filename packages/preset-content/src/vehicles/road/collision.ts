import type {humanoid} from '@worldkit/three';
type Part=NonNullable<humanoid.VehicleSpec['wheelPhysics']>['chassis'];
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
