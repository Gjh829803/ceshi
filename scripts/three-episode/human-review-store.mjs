import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
const imageHash=url=>{try{return /^([a-f0-9]{64})\.(png|jpg|jpeg|webp)$/i.exec(new URL(url,'http://localhost').pathname.split('/').pop())?.[1]?.toLowerCase();}catch{return null;}};
export function createHumanReviewHandler(directory,{onSaved=()=>{}}={}){
 const root=path.join(directory,'human-ten'),file=path.join(root,'human-reviews.json');let writes=Promise.resolve();
 const load=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return{schemaVersion:1,kind:'three-episode-human-feedback',reviews:{},history:[]};throw e;}};
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 return async(req,res)=>{
  if(req.method==='GET'){await writes;send(res,200,await load());return;}
  if(req.method!=='POST'){send(res,405,{error:'不支持此操作'});return;}
  if(req.headers.origin!==`http://${req.headers.host}`){send(res,403,{error:'请在本地结果页提交审核'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'需要 JSON 数据'});return;}
  let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){send(res,413,{error:'备注过长'});return;}raw+=chunk;}
  let value;try{value=JSON.parse(raw);}catch{send(res,400,{error:'无效数据'});return;}
  const {caseId,styleId,imageSha256,verdict,note=''}=value;
  if(!/^human-ten-0[1-9]$/.test(caseId??'')||!/^style-0[0-9]$/.test(styleId??'')||!(/^[a-f0-9]{64}$/).test(imageSha256??'')||!['passed','needs-work','unreviewed'].includes(verdict)||typeof note!=='string'||note.length>2000){send(res,400,{error:'审核数据无效或备注超过 2000 字'});return;}
  const operation=writes.then(async()=>{
   const status=JSON.parse(await readFile(path.join(root,'status.json'),'utf8'));
   const candidate=status.cases?.find(c=>c.id===caseId)?.styles?.find(v=>v.id===styleId);
   if(imageHash(candidate?.anchor)!==imageSha256){send(res,409,{error:'候选图已更新，请刷新后审核新图片；原有标记仍保留。'});return;}
   const state=await load(),key=`${caseId}/${styleId}/${imageSha256}`;
   const review={caseId,styleId,imageSha256,verdict,note:note.trim(),updatedAt:new Date().toISOString(),scope:'candidate-feedback-only'};
   state.reviews[key]=review;state.history.push(review);await mkdir(root,{recursive:true});
   await writeFile(file+'.part',JSON.stringify(state,null,2));await rename(file+'.part',file);onSaved(state);send(res,200,{key,review});
  });writes=operation.catch(()=>{});await operation;
 };
}
