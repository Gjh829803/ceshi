(() => {
 const labels={passed:'人工通过','needs-work':'效果不行',unreviewed:'未审核'};let reviews={};
 const modal=document.createElement('dialog');modal.className='human-review-dialog';
 modal.innerHTML='<form><h2 id="human-review-title">人工审核</h2><p class="muted">标记“效果不行”后，将停止该版本样式的后续生成；已有图片保留。</p><fieldset><legend>审核结果</legend><label><input type="radio" name="verdict" value="passed"> 通过</label><label><input type="radio" name="verdict" value="needs-work"> 效果不行</label><label><input type="radio" name="verdict" value="unreviewed"> 未审核 / 清除标记</label></fieldset><label class="review-note-label" for="human-review-note">备注（可选）</label><textarea id="human-review-note" rows="4" maxlength="2000" placeholder="例如：人物比例不对、风格不喜欢、场景细节缺失"></textarea><p class="review-message" aria-live="polite"></p><div class="review-actions"><button type="button" class="review-cancel">取消</button><button type="submit" class="review-save">保存审核</button></div></form>';
 modal.setAttribute('aria-labelledby','human-review-title');document.body.append(modal);let active;
 function render(){
  for(const card of document.querySelectorAll('[data-review-style]')){
   const {reviewCase:caseId,reviewStyle:styleId,imageHash:imageSha256}=card.dataset;
   if(!imageSha256||card.querySelector('.human-review-controls'))continue;
   const key=`${caseId}/${styleId}/${imageSha256}`,review=reviews[key],box=document.createElement('div');box.className='human-review-controls';
   const badge=document.createElement('span');badge.className='human-review-badge '+(review?.verdict??'unreviewed');badge.textContent=labels[review?.verdict??'unreviewed'];
   const button=document.createElement('button');button.type='button';button.textContent='人工审核';button.setAttribute('aria-label',`人工审核 样式 ${styleId.slice(-2)}`);
   button.onclick=()=>{active={caseId,styleId,imageSha256,key};const current=reviews[key];modal.querySelector('h2').textContent=`人工审核 · 案例 ${caseId.slice(-2)} / 样式 ${styleId.slice(-2)}`;modal.querySelector(`input[value="${current?.verdict??'unreviewed'}"]`).checked=true;modal.querySelector('textarea').value=current?.note??'';modal.querySelector('.review-message').textContent='';modal.showModal();};
   box.append(badge,button);if(review?.note){const note=document.createElement('p');note.className='human-review-note';note.textContent=review.note;box.append(note);}card.querySelector('.caption').after(box);
  }
 }
 function refreshControls(){document.querySelectorAll('.human-review-controls').forEach(e=>e.remove());render();}
 modal.querySelector('.review-cancel').onclick=()=>modal.close();
 modal.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const button=modal.querySelector('.review-save');button.disabled=true;
  try{
   const response=await fetch('/human-ten/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,verdict:modal.querySelector('input:checked').value,note:modal.querySelector('textarea').value})});const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败，请重试');
   reviews[result.key]=result.review;modal.close();refreshControls();
  }catch(error){modal.querySelector('.review-message').textContent=error.message;}finally{button.disabled=false;}
 };
 new MutationObserver(render).observe(document.querySelector('#detail'),{childList:true});
 fetch('/human-ten/api/reviews').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{reviews=d.reviews??{};refreshControls();}).catch(()=>{const p=document.createElement('p');p.className='error';p.textContent='审核记录暂未加载，请刷新页面后再标记。';document.querySelector('#detail').before(p);});
 render();
})();
