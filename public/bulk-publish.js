'use strict';
let bulkTimer;
function bulkUrl(id){return `/api/projects/${encodeURIComponent(id)}/bulk-publish`;}
async function renderBulkStatus(id){
  clearTimeout(bulkTimer);
  try{
    const response=await fetch(bulkUrl(id));const payload=await response.json();if(state.project?.id!==id)return;
    if(!response.ok)throw Error(payload.error);
    const job=payload.job;if(!job)return;
    const labels={queued:'Sırada',preparing:'Hazırlanıyor',publishing:'Yayınlanıyor',published:'Yayınlandı',failed:'Başarısız',interrupted:'Kesildi; canlı sayfayı kontrol et'};
    $('#reviewBulkPublish').disabled=job.status==='running';
    $('#bulkPublishContent').innerHTML=`<h3>${job.status==='running'?'Toplu yayın sürüyor':job.status==='completed'?'Toplu yayın tamamlandı':'Toplu yayın durdu'}</h3><p>${job.items.filter(i=>i.status==='published').length} / ${job.items.length} sayfa yayınlandı.</p>${job.error?`<p class="form-error">${escapeHtml(job.error)}</p>`:''}<div class="bulk-items">${job.items.map(i=>`<article><strong data-no-translate>${escapeHtml(i.title)}</strong><span>${labels[i.status]||i.status}</span>${i.status==='published'&&i.url?`<a class="outline-button" href="${escapeHtml(i.url)}" target="_blank" rel="noopener">İncele ↗</a>`:''}</article>`).join('')}</div>`;
    if(job.status==='running')bulkTimer=setTimeout(()=>renderBulkStatus(id),1600);
    else{await loadWorkflows();if(state.project?.id===id)renderWorkflows();}
  }catch(error){if(state.project?.id===id)$('#bulkPublishContent').textContent=error.message;}
}
$('#reviewBulkPublish').addEventListener('click',async()=>{
  const id=state.project?.id;if(!id)return;
  let started=false;
  closeWorkflowDetail();setView('workflows');document.querySelector('#bulkPublishPanel')?.scrollIntoView({behavior:'smooth'});
  clearTimeout(bulkTimer);$('#reviewBulkPublish').disabled=true;
  try{
    const response=await fetch(bulkUrl(id));const payload=await response.json();if(state.project?.id!==id)return;
    if(!response.ok)throw Error(payload.error);
    if(payload.job?.status==='running'){await renderBulkStatus(id);return;}
    const r=payload.review;
    const skippedDetails=r.skipped.length?`<details class="bulk-review" open><summary>${r.skipped.length} gerçek öneri neden yayınlanamıyor?</summary><div class="bulk-items">${r.skipped.map(i=>`<article><strong data-no-translate>${escapeHtml(i.title)}</strong><span>${escapeHtml(i.reason)}</span></article>`).join('')}</div></details>`:'';
    const notReadyDetails=r.notReady?.length?`<details class="bulk-review"><summary>${r.notReady.length} kayıt öneri değil — henüz taslak hazırlanmamış</summary><div class="bulk-items">${r.notReady.map(i=>`<article><strong data-no-translate>${escapeHtml(i.title)}</strong><span>${escapeHtml(i.reason)}</span></article>`).join('')}</div></details>`:'';
    if(!r.items.length){$('#bulkPublishContent').innerHTML=`<p><strong>Şu anda yayınlanabilecek hazır değişiklik yok.</strong></p>${skippedDetails}${notReadyDetails}`;return;}
    const lines=r.items.map((i,index)=>`${index+1}. ${i.title}\n   ${i.changes.map(c=>`${c.area}: ${String(c.proposed).slice(0,90)}`).join('\n   ')}`).join('\n\n');
    const accepted=window.confirm(`${r.items.length} sayfa canlıya yayınlanacak:\n\n${lines}\n\n${r.skipped.length} gerçek öneri ayrıca karar veya yenileme bekliyor. ${(r.notReady||[]).length} kayıt henüz öneri/taslak değil. Yalnız listelenen başlık, meta ve H1 değişiklikleri uygulanır. İlk hatada kalan kuyruk durur; yayınlanan sayfalar otomatik geri alınmaz.\n\nHepsini şimdi canlıya yayınla?`);
    if(!accepted){$('#bulkPublishContent').textContent='Toplu yayın başlatılmadı.';return;}
    const start=await fetch(bulkUrl(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:r.token,confirmation:'PUBLISH_REVIEWED_CHANGES'})});
    const result=await start.json();if(!start.ok)throw Error(result.error);
    started=true;
    if(state.project?.id===id)await renderBulkStatus(id);
  }catch(error){if(state.project?.id===id)$('#bulkPublishContent').textContent=error.message;}
  finally{if(state.project?.id===id&&!started)$('#reviewBulkPublish').disabled=false;}
});
document.addEventListener('click',event=>{if(event.target.closest('[data-view="workflows"]')&&state.project)renderBulkStatus(state.project.id);});
