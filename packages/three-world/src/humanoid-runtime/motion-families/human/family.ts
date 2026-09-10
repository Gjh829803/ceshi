import {subtype,type MotionFamilyModule} from '../types';
export const humanFamily:MotionFamilyModule={id:'human',name:'人',description:'由现有 HumanoidController 执行步行、跳跃、游泳和情境动作。',modes:['character'],subtypes:[subtype('human','character','人物','地面与水中动作共享同一人物状态和输入。')],step:null};
