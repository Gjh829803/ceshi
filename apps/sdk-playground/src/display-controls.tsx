import React, {useId, useState} from 'react';
import {Button} from './components/ui/button';
import {Checkbox} from './components/ui/checkbox';
import {ChoiceSelect, ChoiceOption} from './components/choice-select';
import {Icon} from './components/icon';
import {DISPLAY_MODES, DISPLAY_TYPES, DISPLAY_PRESETS, applyDisplayPreset, resetDisplaySection, isolateDisplaySelection, exitDisplayIsolation, type DisplaySettings, type DisplayObjectRow, type DisplayAvailability} from './display-settings';

type ControlsProps = {settings:DisplaySettings;change(next:DisplaySettings):void};
export function DisplayPictureControls({settings:s,change}:ControlsProps) {
  const name=useId(),mode=DISPLAY_MODES.find(m=>m.id===s.mode)!;
  return <>
    <fieldset><legend>画面模式</legend><div className="display-mode-list" role="radiogroup" aria-label="画面模式">
      {DISPLAY_MODES.map(m=><label key={m.id} className={`display-mode-option ${s.mode===m.id?'selected':''}`}>
        <input type="radio" name={name} aria-label={m.label} value={m.id} checked={s.mode===m.id} onChange={()=>change({...s,mode:m.id})}/>
        <span><strong>{m.label}</strong><small>{m.hint}</small></span>
      </label>)}
    </div></fieldset>
    <p className="display-guide">{mode.guide}</p>
    {s.mode==='depth'&&<div className="display-depth"><div className="display-depth-scale"/><div className="display-depth-inputs">
      <label>近端 / 米<input aria-label="深度近端 / 米" type="number" min={0} max={s.depthFar-.1} step={1} value={s.depthNear} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n)&&n>=0&&n<s.depthFar)change({...s,depthNear:n});}}/></label>
      <label>远端 / 米<input aria-label="深度远端 / 米" type="number" min={s.depthNear+.1} max={10000} step={5} value={s.depthFar} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n)&&n>s.depthNear&&n<=10000)change({...s,depthFar:n});}}/></label>
    </div></div>}
    {s.mode==='semantic'&&<div className="display-type-legend">{DISPLAY_TYPES.map(t=><span key={t.id}><i style={{background:t.color}}/>{t.label}</span>)}</div>}
    <Button variant="ghost" size="sm" onClick={()=>change(resetDisplaySection(s,'picture'))}><Icon name="reset" size={14}/>重置画面</Button>
  </>;
}
export function DisplayScope({settings:s,change}:ControlsProps) {
  const name=useId();
  return <fieldset className="display-scope"><legend>检查范围 <span>对象与辅助共用</span></legend><div role="radiogroup" aria-label="检查范围" className="display-scope-options">
    {([{id:'all',label:'全场景'},{id:'subject',label:'当前主体'},{id:'selected',label:'选中对象'}] as const).map(option=><label key={option.id} className={s.scope===option.id?'selected':''}>
      <input type="radio" name={name} aria-label={option.label} checked={s.scope===option.id} disabled={option.id==='selected'&&!s.selectedIds.length} onChange={()=>change({...s,scope:option.id})}/><span>{option.label}</span>
    </label>)}
  </div><p className="display-hint">{!s.selectedIds.length?'先在对象列表勾选对象，即可使用选中对象范围。':`已选择 ${s.selectedIds.length} 个对象；选择不会切换控制主体或镜头。`}</p></fieldset>;
}
export function DisplayObjects({settings:s,change,rows}:ControlsProps&{rows:readonly DisplayObjectRow[]}) {
  const [search,setSearch]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const [expandedTypes,setExpandedTypes]=useState<Record<string,boolean>>({});
  const query=search.trim().toLocaleLowerCase();
  const matched=rows.filter(row=>!query||[row.name,row.id,...row.tags??[]].join(' ').toLocaleLowerCase().includes(query));
  const selected=new Set(s.selectedIds),hidden=new Set(s.hiddenIds),byId=new Map(rows.map(row=>[row.id,row]));
  function visible(row:DisplayObjectRow) {return lineage(row).every(id=>!hidden.has(id)&&s.types.includes(byId.get(id)!.type));}
  function show(ids:string[],value:boolean) {
    const affected=value?[...new Set(ids.flatMap(id=>byId.has(id)?lineage(byId.get(id)!):[id]))]:ids;
    const next=new Set(s.hiddenIds);for(const id of affected){if(value)next.delete(id);else next.add(id);}
    change({...s,hiddenIds:[...next],types:value?[...new Set([...s.types,...affected.flatMap(id=>byId.get(id)?.type??[])])]:s.types});
  }
  // Parent chains order logical children next to their parent without assuming a mesh tree.
  function lineage(row:DisplayObjectRow) {const chain=[row.id],seen=new Set(chain);let parent=row.parentId;while(parent&&byId.has(parent)&&!seen.has(parent)){chain.unshift(parent);seen.add(parent);parent=byId.get(parent)!.parentId;}return chain;}
  return <>
    <label className="display-search"><Icon name="search" size={16}/><input type="search" aria-label="搜索对象" placeholder="搜索名称、标识或标签" value={search} onChange={e=>setSearch(e.currentTarget.value)}/></label>
    <p className="display-hint">勾选用于检查选择；右侧显示 / 隐藏按钮控制可见性。实际画面同时受上方检查范围约束。</p>
    <div className="display-batch"><span>已选 {s.selectedIds.length}</span><Button size="sm" variant="ghost" disabled={!selected.size} onClick={()=>show(s.selectedIds,true)}>显示选中</Button><Button size="sm" variant="ghost" disabled={!selected.size} onClick={()=>show(s.selectedIds,false)}>隐藏选中</Button></div>
    <div className="display-batch"><Button size="sm" variant="outline" disabled={!selected.size} onClick={()=>change(isolateDisplaySelection(s))}>隔离选中对象</Button>{s.isolation&&<Button size="sm" variant="outline" onClick={()=>change(exitDisplayIsolation(s))}>退出隔离</Button>}<Button size="sm" variant="ghost" disabled={!selected.size} onClick={()=>change({...s,selectedIds:[],...(s.scope==='selected'?{scope:'all' as const}:{})})}>清空选择</Button></div>
    <div className="display-object-list">{DISPLAY_TYPES.map(type=>{
      const group=matched.filter(row=>row.type===type.id).sort((a,b)=>lineage(a).join('/').localeCompare(lineage(b).join('/')));
      if(!group.length)return null;
      const expanded=!!query||(expandedTypes[type.id]??(type.id!=='environment'&&group.length<=8));
      return <section className="display-object-group" aria-label={`${type.label}对象`} key={type.id}><div className="display-object-group-heading"><Button variant="ghost" size="sm" aria-label={`${expanded?'收起':'展开'}${type.label}对象`} aria-expanded={expanded} disabled={!!query} onClick={()=>setExpandedTypes(previous=>({...previous,[type.id]:!expanded}))}><Icon name={expanded?'chevron':'collapse'} size={13}/><strong><i style={{background:type.color}}/>{type.label} <small>{group.length}</small></strong></Button><Button variant="ghost" size="sm" aria-label={`${s.types.includes(type.id)?'隐藏':'显示'}${type.label}类型`} onClick={()=>change({...s,types:s.types.includes(type.id)?s.types.filter(id=>id!==type.id):[...s.types,type.id]})}>{s.types.includes(type.id)?'隐藏此类':'显示此类'}</Button></div>
        {expanded&&group.filter(row=>query||!lineage(row).slice(0,-1).some(id=>collapsed.has(id))).map(row=><div key={row.id} className={`display-object-row ${visible(row)?'':'is-hidden'}`} data-object-id={row.id} data-parent-id={row.parentId} style={{paddingLeft:Math.min(lineage(row).length-1,4)*12+6}}>
          {rows.some(child=>child.parentId===row.id)&&<Button className="display-object-expand" variant="ghost" size="icon-sm" aria-label={`${collapsed.has(row.id)?'展开':'收起'} ${row.name}子对象`} aria-expanded={!collapsed.has(row.id)} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;})}><Icon name={collapsed.has(row.id)?'collapse':'chevron'} size={13}/></Button>}
          <label><Checkbox aria-label={`选择 ${row.name}`} disabled={!row.available} checked={selected.has(row.id)} onCheckedChange={value=>{const selectedIds=value===true?[...new Set([...s.selectedIds,row.id])]:s.selectedIds.filter(id=>id!==row.id);change({...s,selectedIds,...(!selectedIds.length&&s.scope==='selected'?{scope:'all' as const}:{})});}}/><span><strong>{row.name}</strong><small>{!row.available?'对象当前不可用':row.hasCollider?'已绑定碰撞体':'无绑定碰撞体'}{row.parentId&&byId.has(row.parentId)?` · 属于 ${byId.get(row.parentId)!.name}`:''}</small></span></label>
          <Button size="sm" variant="ghost" disabled={!row.available} aria-label={`${visible(row)?'隐藏':'显示'} ${row.name}`} onClick={()=>show([row.id],!visible(row))}>{visible(row)?'隐藏':'显示'}</Button>
        </div>)}
      </section>;
    })}{!matched.length&&<p className="display-empty">{rows.length?'没有匹配的对象。':'当前场景没有可检查的逻辑对象。'}</p>}</div>
    <Button size="sm" variant="ghost" onClick={()=>change(resetDisplaySection(s,'objects'))}><Icon name="reset" size={14}/>重置对象</Button>
  </>;
}
function HelperToggle({label,hint,checked,change,reason,children}:{label:string;hint:string;checked:boolean;change(value:boolean):void;reason?:string|undefined;children?:React.ReactNode}) {
  return <div className="display-helper"><label className="display-check"><Checkbox aria-label={label} disabled={!!reason&&!checked} checked={checked} onCheckedChange={v=>{if(v!==true||!reason)change(v===true);}}/><span><strong>{label}</strong><small>{hint}</small></span></label>{reason&&<p className="display-unavailable">{reason}{checked?' 已保存的选项可以取消勾选。':''}</p>}{checked&&!reason&&children&&<div className="display-helper-parameters">{children}</div>}</div>;
}
export function DisplayHelpers({settings:s,change,available:a}:ControlsProps&{available:DisplayAvailability}) {
  const update=(patch:Partial<DisplaySettings>)=>change({...s,...patch});
  const any=s.colliders!=='off'||s.wireframe||s.anchors||s.climbSurfaces||s.water||s.helperOnly!=='none';
  return <>
    <div className="display-helper-only"><strong>临时只看辅助</strong><p className="display-hint">暂时隐藏视觉表面，退出后恢复原有画面与辅助组合。</p>{s.helperOnly!=='none'?<div><p>正在仅看{s.helperOnly==='collision'?'碰撞体':'网格线框'}</p><Button variant="outline" size="sm" onClick={()=>update({helperOnly:'none'})}>退出仅看辅助</Button></div>:<div className="display-batch"><Button variant="outline" size="sm" disabled={!a.physics} onClick={()=>update({helperOnly:'collision'})}>仅看碰撞体</Button><Button variant="outline" size="sm" onClick={()=>update({helperOnly:'wireframe'})}>仅看线框</Button></div>}</div>
    {s.helperOnly!=='none'&&<p className="display-hint">以下是退出后恢复的叠加设置。</p>}
    <fieldset disabled={s.helperOnly!=='none'} className="display-helper-list">
      <HelperToggle label="碰撞体" hint="对照物理边界与可见模型，检查阻挡和接触。" checked={s.colliders!=='off'} change={v=>update({colliders:v?'all':'off'})} reason={!a.physics?'当前场景未提供物理世界，无法读取碰撞体。':undefined}>
        <label className="display-select">对象类型<ChoiceSelect aria-label="碰撞体类型" value={s.colliders==='off'?'all':s.colliders} onValueChange={v=>update({colliders:v as DisplaySettings['colliders']})}><ChoiceOption value="all">全部类型</ChoiceOption><ChoiceOption value="person">仅人物</ChoiceOption></ChoiceSelect></label>
        <label className="display-select">范围<ChoiceSelect aria-label="碰撞体范围" value={s.colliderScope} onValueChange={v=>update({colliderScope:v as DisplaySettings['colliderScope']})}><ChoiceOption value="follow">跟随检查范围</ChoiceOption><ChoiceOption value="nearby">主体 / 选中附近</ChoiceOption><ChoiceOption value="all">全场景碰撞体</ChoiceOption></ChoiceSelect></label>
        {s.colliderScope==='nearby'&&<label className="display-number">附近距离 / 米<input aria-label="碰撞体附近距离 / 米" type="number" min={.1} max={1000} step={1} value={s.nearbyMeters} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n)&&n>=.1&&n<=1000)update({nearbyMeters:n});}}/></label>}
        <label className="display-check"><Checkbox aria-label="包含地面碰撞体" checked={s.ground} onCheckedChange={v=>update({ground:v===true})}/><span>包含地面碰撞体</span></label>
        {a.unmappedColliders>0&&<p className="display-hint">{a.unmappedColliders} 个碰撞体没有对象归属；仅在附近或全场景碰撞范围显示。</p>}
        {s.colliderScope==='follow'&&a.scopedColliders===0&&<p className="display-unavailable">当前检查范围没有关联碰撞体；可切换到附近或全场景碰撞体。</p>}
      </HelperToggle>
      <HelperToggle label="网格线框" hint="叠加三角网格，检查几何密度和拓扑。" checked={s.wireframe} change={v=>update({wireframe:v})} reason={['depth','normal','semantic'].includes(s.mode)?'当前画面模式不支持叠加网格线框；可使用上方“仅看线框”。':undefined}/>
      <HelperToggle label="交互锚点" hint="金色标记交互位置，检查入口与站位。" checked={s.anchors} change={v=>update({anchors:v})} reason={!a.anchors?'当前检查范围未绑定交互锚点。':undefined}/>
      <HelperToggle label="攀爬面" hint="绿色区域标记声明的攀爬表面。" checked={s.climbSurfaces} change={v=>update({climbSurfaces:v})} reason={!a.climbSurfaces?'当前检查范围未绑定攀爬面。':undefined}/>
      <HelperToggle label="水体" hint="蓝色区域标记水体边界和水面高度。" checked={s.water} change={v=>update({water:v})} reason={!a.water?'当前检查范围未绑定水体。':undefined}/>
    </fieldset>
    {any&&<div className="display-overlay-parameters"><label className="display-check"><Checkbox aria-label="穿透遮挡显示辅助" checked={s.xray} onCheckedChange={v=>update({xray:v===true})}/><span>穿透遮挡显示辅助</span></label><p className="display-hint">开启后可看见被物体遮挡的辅助线，不能据此判断真实可见性。</p><label className="display-opacity">辅助不透明度<input aria-label="辅助不透明度" type="range" min={.1} max={1} step={.05} value={s.opacity} onChange={e=>update({opacity:e.currentTarget.valueAsNumber})}/><output>{Math.round(s.opacity*100)}%</output></label></div>}
    <p className="display-hint">区域声明不代表动作当前可执行。</p><Button size="sm" variant="ghost" onClick={()=>change(resetDisplaySection(s,'helpers'))}><Icon name="reset" size={14}/>重置辅助</Button>
  </>;
}
export function DisplayPresets({settings:s,change,available:a}:ControlsProps&{available:DisplayAvailability}) {
  const scene=a.scene??a;
  return <details className="display-presets"><summary>快捷检查 <span>应用常用参数组合</span></summary><div>{DISPLAY_PRESETS.map(p=>{const disabled=(p.id==='collision'&&!a.physics)||(p.id==='interaction'&&!scene.anchors&&!scene.climbSurfaces&&!scene.water);return <Button key={p.id} variant="ghost" aria-label={p.label} disabled={disabled} onClick={()=>{const next=applyDisplayPreset(s,p.id);change(p.id==='interaction'?{...next,anchors:scene.anchors,climbSurfaces:scene.climbSurfaces,water:scene.water}:next);}}><strong>{p.label}</strong><small>{p.hint}{disabled?' · 当前场景无可用数据':''}</small></Button>;})}</div></details>;
}
export function displaySummary(s:DisplaySettings):string {
  const mode=DISPLAY_MODES.find(m=>m.id===s.mode)!.label;
  const bits=[mode,s.scope==='all'?'全场景':s.scope==='subject'?'当前主体':`选中 ${s.selectedIds.length} 个对象`];
  if(s.hiddenIds.length)bits.push(`隐藏 ${s.hiddenIds.length} 个对象`);
  if(s.types.length!==DISPLAY_TYPES.length)bits.push(`显示 ${s.types.length} 类`);
  if(s.helperOnly!=='none')bits.push(s.helperOnly==='collision'?'仅看碰撞体':'仅看线框');
  else {if(s.colliders!=='off')bits.push('碰撞体');if(s.wireframe)bits.push('线框');if(s.anchors)bits.push('交互锚点');if(s.climbSurfaces)bits.push('攀爬面');if(s.water)bits.push('水体');}
  return bits.join(' · ');
}
