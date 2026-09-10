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
