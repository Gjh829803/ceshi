import './phosphor/style.css';

// Official Phosphor glyphs, bundled locally; callers use stable semantic names.
const aliases:Record<string,string>={search:'magnifying-glass',x:'x',star:'star','arrow-up-right':'arrow-up-right',
  'chevrons-up-down':'caret-up-down',box:'cube','person-standing':'person-simple',car:'car-profile',bike:'motorcycle',
  sailboat:'sailboat',ship:'boat',plane:'airplane',rocket:'rocket',bird:'bird',rabbit:'horse',skateboard:'person-simple-ski',
  explore:'compass',assets:'cube',character:'person-simple-run',scenes:'flag',camera:'sliders-horizontal',
  expand:'arrows-out',collapse:'caret-right',close:'x',team:'users-three',book:'book-open',map:'map-trifold',
  pause:'pause',play:'play',reset:'arrow-counter-clockwise',keyboard:'keyboard',chart:'chart-line',chevron:'caret-down'};
export function icon(name:string,size=20):HTMLElement{
  const i=document.createElement('i');i.className=`ph ph-${aliases[name]??name}`;
  i.style.fontSize=`${size}px`;i.setAttribute('aria-hidden','true');return i;
}
export function decorateIcons(root:ParentNode=document){root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el=>el.replaceChildren(icon(el.dataset.icon!,Number(el.dataset.size??20))));}
