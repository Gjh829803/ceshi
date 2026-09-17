import {it,expect} from 'vitest';
import {resolveUiLayout,validateUiLayout,validateDocument,type UiCatalog,type UiDocument} from '../src/schema.js';

it('preserves familiar CSS positions and resolves a separate safe-area containing block',()=>{
  const style={right:28,bottom:28,width:300};
  expect(resolveUiLayout(style,{width:1280,height:720},{right:40,bottom:20})).toEqual({referenceBox:{left:0,top:0,width:1240,height:700},style:{...style,position:'absolute'}});
  expect(resolveUiLayout({left:'50%',top:'50%',width:'40%',transform:'translate(-50%, -50%)'},{width:1000,height:500}).style).toMatchObject({left:'50%',width:'40%'});
  expect(resolveUiLayout({left:0,right:0},{width:1000,height:500},{left:50},'viewport').referenceBox).toEqual({left:0,top:0,width:1000,height:500});
});
it('clips an exhausted safe rectangle and accepts standard CSS sizing/translation syntax',()=>{
  expect(resolveUiLayout({left:28,right:28,bottom:28},{width:100,height:100},{left:200,bottom:200}).referenceBox).toMatchObject({width:0,height:0});
  for(const style of [{top:'28px',left:-2,width:'auto',maxWidth:'100%'},{left:'50%',transform:'translateX(-50%)'},{top:'50%',transform:'translateY(-50%)'},{transform:'translate(0, -20px)'}])expect(()=>validateUiLayout(style)).not.toThrow();
});
it('rejects unsafe/unimplemented CSS and ambiguous nested viewport layout',()=>{
  for(const value of [{anchor:'top-left'},{width:'fill'},{width:'101%'},{width:-1},{position:'fixed'},{zIndex:1001},{transform:'rotate(90deg)'},{transform:'url(javascript:x)'},{width:'calc(100% - 20px)'}])expect(()=>validateUiLayout(value)).toThrow();
  const catalog:UiCatalog={schemaVersion:1,catalogId:'test',components:{},actions:{}};
  const document:UiDocument={schemaVersion:1,catalogId:'test',designViewport:{width:1280,height:720},transitions:{},spec:{root:'hud',elements:{hud:{type:'HudLayer',props:{},children:['label']},label:{type:'Text',props:{text:'HUD'},children:[],layout:{top:20,right:20,width:100}}}}};
  expect(()=>validateDocument(document,catalog)).not.toThrow();
  document.spec.elements.hud!.layout={left:0,top:0};
  expect(()=>validateDocument(document,catalog)).toThrow('UI_LAYOUT_REQUIRES_HUD_ROOT');
});
