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
  clearTimeout(bulkTimer);$('#reviewBulkPublish').disabled=true;
  try{
    const response=await fetch(bulkUrl(id));const payload=await response.json();if(state.project?.id!==id)return;
    if(!response.ok)throw Error(payload.error);
    if(payload.job?.status==='running'){await renderBulkStatus(id);return;}
    const r=payload.review;
    $('#bulkPublishContent').innerHTML=`<h3>Canlıya yayınlanacak değişiklikler</h3><p><strong>${r.items.length} sayfa</strong> · ${r.skipped.length} öneri kapsam dışında.</p><p>Yalnız aşağıdaki SEO başlığı, meta açıklaması ve H1 değişiklikleri yayınlanır. İçerik bölümleri ve bağlantı önerileri otomatik yazılmaz. Ayrı Firebase önizlemesi yoktur. Hata olursa kalan işlem durur; yayınlanan sayfalar otomatik geri alınmaz.</p>${r.items.map(i=>`<details class="bulk-review" open><summary data-no-translate>${escapeHtml(i.title)} — ${escapeHtml(i.targetPath)}</summary>${i.changes.map(c=>`<p><strong data-no-translate>${escapeHtml(c.area)}</strong><br><span data-no-translate>${escapeHtml(c.proposed)}</span></p>`).join('')}${i.pending.length?`<p>${i.pending.length} editoryal madde uygulanmayacak.</p>`:''}</details>`).join('')}${r.skipped.length?`<details><summary>Kapsam dışındaki öneriler</summary>${r.skipped.map(i=>`<p data-no-translate>${escapeHtml(i.title)}: ${escapeHtml(i.reason)}</p>`).join('')}</details>`:''}${r.items.length?'<label class="setting-row"><span>Yukarıdaki değişikliklerin canlı siteye toplu yayınlanmasını onaylıyorum.</span><input type="checkbox" id="bulkApproval"></label><button type="button" class="primary-button" id="startBulkPublish" disabled>Onaylananları topluca canlıya yayınla</button>':''}`;
    $('#bulkApproval')?.addEventListener('change',e=>{$('#startBulkPublish').disabled=!e.target.checked;});
    $('#startBulkPublish')?.addEventListener('click',async()=>{
      if(state.project?.id!==id||!$('#bulkApproval').checked)return;
      $('#startBulkPublish').disabled=true;
      try{
        const response=await fetch(bulkUrl(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:r.token,confirmation:'PUBLISH_REVIEWED_CHANGES'})});
        const result=await response.json();if(!response.ok)throw Error(result.error);
        if(state.project?.id===id)await renderBulkStatus(id);
      }catch(error){if(state.project?.id===id){$('#bulkPublishContent').textContent=error.message;$('#reviewBulkPublish').disabled=false;}}
    });
  }catch(error){if(state.project?.id===id)$('#bulkPublishContent').textContent=error.message;}
  finally{if(state.project?.id===id)$('#reviewBulkPublish').disabled=false;}
});
document.addEventListener('click',event=>{if(event.target.closest('[data-view="workflows"]')&&state.project)renderBulkStatus(state.project.id);});
