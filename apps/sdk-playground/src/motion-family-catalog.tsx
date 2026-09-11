import {useState} from 'react';
import {humanoid} from '@worldkit/three';
import {ChoiceSelect,ChoiceOption} from './components/choice-select';
const families=humanoid.listMotionFamilies();
export function MotionFamilyCatalog({onInteract}:{onInteract?:()=>void}){
  const [familyId,setFamilyId]=useState<humanoid.MotionFamilyId>('human');
  const [subtypeId,setSubtypeId]=useState(families[0]!.subtypes[0]!.id);
  const family=families.find(f=>f.id===familyId)!,subtype=family.subtypes.find(s=>s.id===subtypeId)!;
  const fields=humanoid.motionSubtypeControlFields(familyId,subtypeId);
  return <details className="inspector-group motion-family-catalog" onToggle={()=>onInteract?.()}>
    <summary style={{cursor:'pointer',fontWeight:600}}>七大类能力目录</summary>
    <p className="inspector-group-note">按运动方式浏览实现与小类参数；当前资产的调参仍在下方。</p>
    <label style={{display:'grid',gridTemplateColumns:'72px minmax(0,1fr)',alignItems:'center',gap:8,marginTop:8}}>运动大类<ChoiceSelect aria-label="运动大类" value={familyId} onValueChange={id=>{onInteract?.();const next=families.find(f=>f.id===id)!;setFamilyId(next.id);setSubtypeId(next.subtypes[0]!.id);}}>
      {families.map(f=><ChoiceOption key={f.id} value={f.id}>{f.name}</ChoiceOption>)}
    </ChoiceSelect></label>
    <label style={{display:'grid',gridTemplateColumns:'72px minmax(0,1fr)',alignItems:'center',gap:8,marginTop:8}}>运动小类<ChoiceSelect aria-label="运动小类" value={subtypeId} onValueChange={id=>{onInteract?.();setSubtypeId(id);}}>
      {family.subtypes.map(s=><ChoiceOption key={s.id} value={s.id}>{s.name}</ChoiceOption>)}
    </ChoiceSelect></label>
    <p className="inspector-group-note">{family.description}</p>
    <p data-motion-subtype-status={subtype.status}>{subtype.status==='implemented'?'已有运行实现':'预留，未实现'} · {subtype.description}</p>
    <ul aria-label="小类参数范围" style={{paddingLeft:18,fontSize:12}}>{fields.map(f=><li key={f.key}>{f.label}：{humanoid.CONTROL_RANGES[f.key].join('–')} {f.unit}</li>)}</ul>
  </details>;
}
