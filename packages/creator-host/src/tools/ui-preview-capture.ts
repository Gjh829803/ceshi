import type {Page,JSHandle,ConsoleMessage} from 'playwright';
import type {prepareUiPreviewCapture} from '../browser/world-ui-preview.js';

/** Browser composition is temporary and never replaces the recording canvas. */
export async function captureUiPreview(page:Page,view:'opening'|'current'){
  const errors:string[]=[];
  // json-render catches component errors and logs them instead of throwing.
  const onConsole=(message:ConsoleMessage)=>{if(message.type()==='error')errors.push(message.text());};
  page.on('console',onConsole);
  let handle:JSHandle<Awaited<ReturnType<typeof prepareUiPreviewCapture>>>|undefined;
  try{
    handle=await page.evaluateHandle(async view=>{
      const base=new URL('./world-ui/',document.baseURI);
      // Keep this browser import out of the Host/test bundler's module transform.
      const module=await new Function('url','return import(url)')(new URL('local-preview.js',base).href) as {prepareUiPreviewCapture:typeof prepareUiPreviewCapture};
      return module.prepareUiPreviewCapture(base,view);
    },view);
    const result=await handle.evaluate(capture=>capture.result);
    const bytes=await page.locator('[data-world-ui-capture]').screenshot({type:'png',timeout:15000});
    if(errors.length)throw new Error(`UI_PREVIEW_RENDER_FAILED: ${errors.join('\n')}`);
    return {result,bytes};
  }finally{
    page.off('console',onConsole);
    if(handle)try{await handle.evaluate(capture=>capture.dispose());}finally{await handle.dispose();}
  }
}
