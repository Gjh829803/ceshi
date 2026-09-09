import catalog from './lucide/icons.json';

/** Local official Lucide nodes keep the Creator example dependency-free. */
export function icon(name:string,size=20):SVGSVGElement{
  const aliases=catalog.aliases as Record<string,string>;
  const nodes=catalog.nodes as Record<string,[string,Record<string,string>][] >;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({width:String(size),height:String(size),viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'lucide'}))svg.setAttribute(key,value);
  for(const [tag,attributes] of nodes[aliases[name]??'circle-question-mark']!){
    const node=document.createElementNS(svg.namespaceURI,tag);
    for(const [key,value] of Object.entries(attributes))if(key!=='key')node.setAttribute(key,value);
    svg.append(node);
  }
  return svg;
}
export function decorateIcons(root:ParentNode=document){root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el=>el.replaceChildren(icon(el.dataset.icon!,Number(el.dataset.size??20))));}
