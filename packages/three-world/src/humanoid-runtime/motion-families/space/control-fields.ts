import type {ControlField} from '../../../config/control-fields';
export function spaceControlFields():ControlField[]{return [
 {key:'speed',label:'辅助驾驶目标速度',unit:'m/s',step:.5,note:'辅助模式每轴的满输入目标；惯性模式不设硬限速。',section:'速度范围'},
 {key:'grip',label:'辅助平移响应',unit:'/s',step:.1,note:'速度误差乘总质量得到所需推力，仍受喷口推力限制；0 不作平移辅助。',section:'加速与减速'},
 {key:'brakeDamping',label:'制动响应',unit:'/s',step:.1,note:'Ctrl 的反向推力响应；不是无阻力空间中的自然阻尼。',section:'加速与减速'},
 {key:'steer',label:'辅助姿态目标角速度',unit:'rad/s',step:.05,note:'辅助模式的偏航、俯仰和横滚目标，受力矩上限限制。',section:'转向与稳定'},
];}
