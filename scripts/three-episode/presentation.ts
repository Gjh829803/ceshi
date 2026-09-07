import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';

/** Apply only to the derived production page; leave author callbacks and source intact. */
export async function installEpisodePresentation(playableRoot:string):Promise<void>{
 const entry=path.join(playableRoot,'index.html');
 const html=await readFile(entry,'utf8');
 if(!/<head(?:\s[^>]*)?>/i.test(html))throw new Error('EPISODE_PRESENTATION_HEAD_REQUIRED');
 if(html.includes('data-worldkit-episode-presentation'))throw new Error('EPISODE_PRESENTATION_ALREADY_INSTALLED');
 try{await lstat(path.join(playableRoot,'episode-presentation.js'));throw new Error('EPISODE_PRESENTATION_NAME_COLLISION');}catch(error:any){if(error.code!=='ENOENT')throw error;}
 const css='<style data-worldkit-episode-presentation>html,body{margin:0!important;overflow:hidden!important}body,body *{visibility:hidden!important}canvas[data-worldkit-episode-surface]{visibility:visible!important}body::before,body::after{visibility:hidden!important}</style>';
 await writeFile(path.join(playableRoot,'episode-presentation.js'),await readFile(new URL('./presentation-runtime.js',import.meta.url)));
 await writeFile(entry,html.replace(/<head(?:\s[^>]*)?>/i,match=>`${match}${css}<script type="module" src="./episode-presentation.js"></script>`));
}
