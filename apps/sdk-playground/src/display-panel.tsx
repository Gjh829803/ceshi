import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Popover, PopoverContent, PopoverTrigger} from './components/ui/popover';
import {Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger} from './components/ui/dialog';
import {Tabs, TabsContent, TabsList, TabsTrigger} from './components/ui/tabs';
import {Button} from './components/ui/button';
import {Icon} from './components/icon';
import {DISPLAY_MODES, DISPLAY_TYPES, isDisplayPreviewActive, type DisplaySettings, type DisplayObjectRow, type DisplayAvailability} from './display-settings';
import {DisplayPictureControls, DisplayScope, DisplayObjects, DisplayHelpers, DisplayPresets, displaySummary} from './display-controls';

import type {PanelStateStore} from './panel-state';

export function DisplayPanel({panels,settings:s,change,open,onOpenChange,rows,available,pinned,onPinnedChange,error}:{
  panels?:PanelStateStore;settings:DisplaySettings;change(next:DisplaySettings):void;open:boolean;onOpenChange(open:boolean):void;
  rows:readonly DisplayObjectRow[];available:DisplayAvailability;pinned:boolean;onPinnedChange(pinned:boolean):void;error?:string;
}) {
  const [pictureOpen,updatePictureOpen]=useState(()=>panels?.read('picture').open??false),[tab,updateTab]=useState(()=>panels?.read('display').tab??'objects');
  const setPictureOpen=(open:boolean)=>{updatePictureOpen(open);panels?.update('picture',{open});};
  const setTab=(value:string)=>{if(value==='objects'||value==='helpers'){updateTab(value);panels?.update('display',{tab:value});}};
  const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 720px)').matches);
  const panelRef=useRef<HTMLElement>(null),triggerRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const media=window.matchMedia('(max-width: 720px)');const listener=()=>setMobile(media.matches);media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);},[]);
  const host=pinned&&!mobile?document.getElementById('displayInspectorHost'):null;
  useEffect(()=>{if(open&&host)panelRef.current?.focus();},[open,host]);
  const active=isDisplayPreviewActive(s),mode=DISPLAY_MODES.find(m=>m.id===s.mode)!;
  const setInspectorOpen=(value:boolean)=>{onOpenChange(value);if(!value&&pinned)onPinnedChange(false);};
  const close=()=>{setInspectorOpen(false);triggerRef.current?.focus();};
  const stop=(e:React.KeyboardEvent)=>e.stopPropagation();
  const content=<>
    <div className="display-inspector-context"><div className="display-heading"><div><strong>显示检查</strong><small>VIEW INSPECTOR</small></div><div className="display-heading-actions">
      {!mobile&&<Button size="sm" variant="ghost" aria-label={pinned?'取消固定':'固定到右侧'} aria-pressed={pinned} onClick={()=>onPinnedChange(!pinned)}>{pinned?'取消固定':'固定'}</Button>}
      <Button variant="ghost" size="icon-sm" aria-label="关闭显示检查" onClick={close}><Icon name="close" size={18}/></Button>
    </div></div>
    <DisplayScope settings={s} change={change}/>
    <p className="display-summary" role="status" aria-label="当前显示摘要">{displaySummary(s)}</p></div>
    {s.helperOnly!=='none'&&tab!=='helpers'&&<Button size="sm" variant="outline" onClick={()=>change({...s,helperOnly:'none'})}>退出仅看辅助</Button>}
    <Tabs value={tab} onValueChange={setTab} className="display-tabs"><TabsList aria-label="显示检查分区"><TabsTrigger value="objects">对象 Objects</TabsTrigger><TabsTrigger value="helpers">辅助 Helpers</TabsTrigger></TabsList>
      <TabsContent value="objects" className="display-objects-content"><DisplayObjects settings={s} change={change} rows={rows}/></TabsContent>
      <TabsContent value="helpers" className="display-helpers-content"><DisplayHelpers settings={s} change={change} available={available}/></TabsContent>
    </Tabs>
    <DisplayPresets settings={s} change={change} available={available}/>
    <p className="display-footnote">仅改变预览。原始截图与模型输入保持干净。</p>
    {error&&<p className="display-error" role="alert">{error}</p>}
  </>;
  const trigger=<Button ref={triggerRef} id="displayButton" className={`subtle-button display-button ${active?'active':''}`} aria-label="显示检查" aria-expanded={open}><Icon name="box" size={15}/><span>显示检查</span><Icon name="chevron" size={13}/></Button>;
  return <>
    <Popover open={pictureOpen} onOpenChange={setPictureOpen}><PopoverTrigger asChild><Button id="pictureButton" className={`subtle-button display-button ${s.mode!=='material'?'active':''}`} aria-label="画面设置" aria-expanded={pictureOpen}><Icon name="camera" size={15}/><span>画面 · {mode.label}</span><Icon name="chevron" size={13}/></Button></PopoverTrigger>
      <PopoverContent className="display-panel display-picture-panel" align="end" sideOffset={8} aria-label="画面设置" onKeyDown={stop} onKeyUp={stop} onEscapeKeyDown={e=>e.stopPropagation()}><div className="display-heading"><div><strong>画面</strong><small>PICTURE</small></div><Button variant="ghost" size="icon-sm" aria-label="关闭画面设置" onClick={()=>setPictureOpen(false)}><Icon name="close" size={18}/></Button></div><DisplayPictureControls settings={s} change={change}/></PopoverContent>
    </Popover>
    {mobile?<Dialog open={open} onOpenChange={setInspectorOpen}><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent className="display-panel display-mobile-drawer" showCloseButton={false} onKeyDown={stop} onKeyUp={stop} onEscapeKeyDown={e=>e.stopPropagation()}><DialogTitle className="sr-only">显示检查</DialogTitle><DialogDescription className="sr-only">选择检查范围、视觉对象与辅助信息。</DialogDescription>{content}</DialogContent></Dialog>
      :host?<><span className="display-pinned-trigger" onClick={()=>setInspectorOpen(!open)}>{trigger}</span>{open&&createPortal(<section ref={panelRef} className="display-panel display-docked-panel" role="region" aria-label="显示检查" tabIndex={-1} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}}} onKeyUp={stop}>{content}</section>,host)}</>
      :<Popover open={open} onOpenChange={setInspectorOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent className="display-panel display-inspector-panel" align="end" sideOffset={8} aria-label="显示检查" onKeyDown={stop} onKeyUp={stop} onEscapeKeyDown={e=>e.stopPropagation()} onCloseAutoFocus={e=>{if(pinned)e.preventDefault();}}>{content}</PopoverContent></Popover>}
    {active&&<div className="display-legend" aria-label="预览图例"><strong>{displaySummary(s)}</strong>{s.mode==='semantic'&&<span>{DISPLAY_TYPES.filter(t=>s.types.includes(t.id)).map(t=><span key={t.id}><i style={{background:t.color}}/>{t.label}</span>)}</span>}{s.mode==='depth'&&<span>{s.depthNear} m <i className="display-depth-mini"/> {s.depthFar} m</span>}</div>}
  </>;
}
