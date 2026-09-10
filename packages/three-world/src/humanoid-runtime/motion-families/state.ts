import type { AircraftFamilyState } from './aircraft/physics-state';
import type { FlyingCreatureFamilyState } from './flying-creature/physics-state';
import type { GroundVehicleState } from './ground-vehicle/physics-state';
import type { SpaceState } from './space/physics-state';
import type { SurfaceVesselState } from './surface-vessel/physics-state';
import type { UnderwaterState } from './underwater/physics-state';
type Payloads=GroundVehicleState|SurfaceVesselState|AircraftFamilyState|FlyingCreatureFamilyState|UnderwaterState|SpaceState;
type Keys<T>=T extends unknown?keyof T:never;
type Complete<T,All> = T extends unknown ? T & Partial<Record<Exclude<Keys<All>,keyof T>,undefined>> : never;
/** 一个实例只有所属大类的一份状态；不存在并行的通用运动控制器。 */
export type MotionFamilyState=Complete<Payloads,Payloads>;
