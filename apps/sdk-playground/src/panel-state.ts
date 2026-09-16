export const PANEL_STORAGE_KEY='worldkit.playground.panels';
type Field<T>={initial:T;read(value:unknown):T};
const bool=(initial=false):Field<boolean>=>({initial,read:value=>typeof value==='boolean'?value:initial});
const text=(initial='',maximum=200):Field<string>=>({initial,read:value=>typeof value==='string'&&value.length<=maximum?value:initial});
const choice=<T extends string>(initial:T,values:readonly T[]):Field<T>=>({initial,read:value=>typeof value==='string'&&values.includes(value as T)?value as T:initial});

/** Add a panel here with its own field validators; storage and consumers remain independent. */
export const PANEL_DEFINITIONS={
 assetLibrary:{open:bool(),pinned:bool(),query:text(),category:choice('all',['all','character','ground','water','air','creatures']),order:choice('catalog',['catalog','name','recent']),favoritesOnly:bool(),selectedId:text()},
 inspector:{open:bool(true),pinned:bool(),tab:choice('movement',['movement','camera'])},
 shortcuts:{layout:choice('floating',['collapsed','floating','pinned'])},
 performance:{open:bool(),detailsOpen:bool()},
 display:{open:bool(),pinned:bool(),tab:choice('objects',['objects','helpers'])},
 picture:{open:bool()},
 quickAccess:{open:bool()},
 minimap:{expanded:bool()},
 humanActions:{open:bool()},
 equipment:{open:bool()},
 workbench:{open:bool(),tab:choice('scenes',['scenes','camera'])},
 contribution:{open:bool()},
} as const;
export type PanelId=keyof typeof PANEL_DEFINITIONS;
export type PanelState<K extends PanelId>={[F in keyof typeof PANEL_DEFINITIONS[K]]:typeof PANEL_DEFINITIONS[K][F] extends Field<infer T>?T:never};
type PanelValues={[K in PanelId]:PanelState<K>};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
type StoragePort=Pick<Storage,'getItem'|'setItem'>;

export function createPanelStateStore(storage?:StoragePort){
 let available=true,suspended=false,lastError:string|null=null,unknownPanels:Record<string,unknown>={};
 let port=storage;
 let stored:Record<string,unknown>={};
 try{
  port??=globalThis.localStorage;
  const raw=port?.getItem(PANEL_STORAGE_KEY);
  if(raw){
   if(raw.length>65536)throw Error('PANEL_STATE_TOO_LARGE');
   const value:unknown=JSON.parse(raw);
   if(!object(value)||value.version!==1||!object(value.panels)){available=false;lastError='PANEL_STATE_VERSION_UNSUPPORTED';}
   else{stored=value.panels;unknownPanels=Object.fromEntries(Object.entries(stored).filter(([id])=>!Object.hasOwn(PANEL_DEFINITIONS,id)));}
  }
 }catch(error){available=false;lastError=String(error);}
 const panels=Object.fromEntries(Object.entries(PANEL_DEFINITIONS).map(([id,fields])=>{
  const input=object(stored[id])?stored[id]:{};
  return [id,Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.read(input[key])]))];
 })) as PanelValues;
 const persist=()=>{
  if(!available||suspended)return;
  try{if(!port)throw Error('PANEL_STORAGE_UNAVAILABLE');const merged=Object.fromEntries(Object.entries(panels).map(([id,value])=>[id,{...(object(stored[id])?stored[id]:{}),...value}]));const json=JSON.stringify({version:1,panels:{...unknownPanels,...merged}});if(json.length>65536)throw Error('PANEL_STATE_TOO_LARGE');port.setItem(PANEL_STORAGE_KEY,json);}
  catch(error){available=false;lastError=String(error);}
 };
 return {
  read<K extends PanelId>(id:K):PanelState<K>{return structuredClone(panels[id]);},
  update<K extends PanelId>(id:K,patch:Partial<PanelState<K>>){
   const next={...panels[id]} as Record<string,unknown>;let changed=false;
   for(const [key,field]of Object.entries(PANEL_DEFINITIONS[id]))if(Object.hasOwn(patch,key)){
    const value=field.read((patch as Record<string,unknown>)[key]);if(next[key]!==value){next[key]=value;changed=true;}
   }
   if(changed){panels[id]=next as PanelValues[K];persist();}
  },
  status:()=>({available:available&&!!port,suspended,lastError}),
  /** Disposal closes mounted components; those callbacks must not erase the user's saved layout. */
  suspendPersistence(){suspended=true;},
 };
}
export type PanelStateStore=ReturnType<typeof createPanelStateStore>;
