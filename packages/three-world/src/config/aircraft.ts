/** 轻型固定翼标定，米、千克、秒；维护者参数与运行算法分离。 */
export const AIRCRAFT = {
 turnRate:.32, maxBank:1.0, turnResponse:8, verticalResponse:.8,
 mass:850, area:16.2, density:1.225, center:[0,1.1,.35] as const,
 inertia:[1200,2400,1900] as const, spring:36000, damping:3200, travel:.18,
 wheels:[{x:-1.1,y:.32,z:0,radius:.32,share:5/12,steering:false},
 {x:1.1,y:.32,z:0,radius:.32,share:5/12,steering:false},
 {x:0,y:.26,z:2.1,radius:.26,share:1/6,steering:true}],
 boxes:[{halfExtents:[.48,.29,2.80] as const,offset:[0,1.03,0] as const},
 {halfExtents:[4,.06,.675] as const,offset:[0,2.2,.05] as const}],
} as const;

/** 小类共用座舱与起落架；旋翼飞控是便于键盘驾驶的增稳模型。 */
export const AIRCRAFT_SUBTYPES=['fixed-wing','pusher','helicopter','multirotor','tiltrotor','glider','paraglider','wingsuit','balloon'] as const;
export type AircraftSubtype=typeof AIRCRAFT_SUBTYPES[number];
export const ROTOR_FLIGHT={
 governorRate:2.5, rotorSpeed:38, motorRate:10, propellerSpeed:70,
 climbSpeed:8, verticalResponse:1.8, maxLift:2.1, pitchLimit:.32, bankLimit:.38,
 attitudeGain:8, rateDamping:4, yawRate:.65, drag:.12,
 transitionStart:12, transitionEnd:32, tiltRate:.22,
 mainArm:[0,1.52,-.20], tailArm:[.45,.92,-3.05], reactionArm:.08,
 quadArms:[[-2.2,1.52,-1.8],[2.2,1.52,-1.8],[-2.2,1.52,1.8],[2.2,1.52,1.8]],
 quadDirections:[1,-1,-1,1], tiltArms:[[-3.2,1.40,.45],[3.2,1.40,.45]],
} as const;

/** 桨盘使用保守扫掠盒，避免机身通过时旋翼横穿墙壁。 */
export function aircraftCollisionBoxes(subtype:AircraftSubtype){
 const box=(halfExtents:[number,number,number],offset:[number,number,number])=>({halfExtents,offset});
 if(subtype==='helicopter')return [AIRCRAFT.boxes[0]!,box([3.9,.04,3.9],[0,2.62,.15])];
 if(subtype==='multirotor')return [AIRCRAFT.boxes[0]!,...ROTOR_FLIGHT.quadArms.map(p=>box([1.25,.04,1.25],[p[0],2.62,p[2]+AIRCRAFT.center[2]]))];
 if(subtype==='tiltrotor')return [...AIRCRAFT.boxes,...ROTOR_FLIGHT.tiltArms.map(p=>box([1.22,1.33,1.33],[p[0],2.50,.80]))];
 return AIRCRAFT.boxes;
}

export const SOARING={
 glider:{mass:850,area:22,cl0:.25,liftSlope:4.7,drag:.017,induced:.035,trim:.045},
 paraglider:{mass:110,area:25,cl0:.45,liftSlope:2.8,drag:.10,induced:.13,trim:.12},
 // Training preset: effective low-speed lifting area; not a certified wingsuit model.
 wingsuit:{mass:95,area:3.2,cl0:.55,liftSlope:3.0,drag:.09,induced:.09,trim:.15},
 balloon:{mass:300,volume:1200,ambientKelvin:288.15,maxKelvin:410,heating:20,cooling:.025,ventCooling:10,fuelSeconds:180,dragArea:120},
 towSeconds:8,towAcceleration:10,canopySeconds:2,
} as const;

/** 动力飞机训练小类的航迹转向响应；教练机及其他飞机继续使用各自原有配置。 */
export const POWERED_PLANE_TURN={turnRate:.44,maxBank:1.15} as const;
