'use strict';
let renderedProfileKey = '';
function renderSiteProfile() {
  const project = state.project;
  if (!project?.profile) return;
  const p = project.profile;
  const key = `${project.id}:${p.revision}`;
  if (key === renderedProfileKey) return;
  renderedProfileKey = key;
  $('#siteProfileForm').dataset.projectId = project.id;
  $('#siteProfileForm').dataset.revision = p.revision;
  $('#profileProjectLabel').textContent = `${project.name} · ${project.siteUrl}`;
  $('#profileStatus').textContent = p.status === 'confirmed' ? `Kullanıcı tarafından doğrulandı · ${formatDateTime(p.confirmedAt)} · Sürüm ${p.revision}` : 'Kontrol bekliyor — mevcut site davranışı değiştirilmedi';
  const values = {Brand:p.business.brand, Description:p.business.description, Objective:p.business.objective,
    Audience:p.business.audience, Tone:p.business.tone, Languages:p.languages.join(', '),
    Primary:p.primaryLanguage, Fallback:p.fallbackLanguage, Opening:p.openingPolicy, Coverage:p.coverage,
    Countries:p.countryRules.map(x=>`${x.country} = ${x.language}`).join('\n'),
    Markets:p.targetMarkets.map(x=>`${x.country} = ${x.language}`).join('\n'),
    Routes:p.languageRoutes.map(x=>`${x.prefix} = ${x.language}`).join('\n'),
    Pages:p.pageLanguages.map(x=>`${x.path} = ${x.language}`).join('\n'), Design:p.design.notes};
  for (const [field,value] of Object.entries(values)) $(`#profile${field}`).value = value;
  $('#profileRemember').checked = p.rememberChoice;
  $('#profileConfirm').checked = false;
  $('#profileLegacyRow').hidden = p.analysisPreset !== 'legacy_lingodecoder';
  $('#profileLegacy').checked = p.analysisPreset === 'legacy_lingodecoder';
  $('#profileBacklog').textContent = `${p.editorialBacklog.length} kayıtlı içerik planı korunuyor. Tasarım ve ülke kuralları bu aşamada yalnız profil kaydıdır.`;
  $('#profileError').textContent = '';
  $('#advancedProfile').open=false;
  $('#inspectionSummary').innerHTML='';
  $('#inspectionProgress').textContent='';
  $('#inspectSite').disabled=false;
  loadInspection(project.id);
}
function profilePairs(selector, key) {
  return $(selector).value.split('\n').filter(line=>line.trim()).map(line=>{
    const index = line.lastIndexOf('=');
    if(index < 1) throw new Error('Kuralları her satırda adres/ülke = dil biçiminde gir.');
    return {[key]:line.slice(0,index).trim(), language:line.slice(index+1).trim()};
  });
}
$('#siteProfileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const projectId = form.dataset.projectId;
  const button = $('#saveSiteProfile');
  button.disabled = true; $('#profileError').textContent = '';
  try {
    if (state.project?.id !== projectId) throw new Error('Seçili proje değişti. Profili yeniden aç.');
    const business = Object.fromEntries(['Brand','Description','Objective','Audience','Tone'].map(k=>[k.toLowerCase(),$(`#profile${k}`).value]));
    const profile = {business, languages:$('#profileLanguages').value.split(',').map(x=>x.trim()).filter(Boolean),
      primaryLanguage:$('#profilePrimary').value, fallbackLanguage:$('#profileFallback').value,
      openingPolicy:$('#profileOpening').value, coverage:$('#profileCoverage').value,
      rememberChoice:$('#profileRemember').checked, preserveExplicitUrl:true,
      countryRules:profilePairs('#profileCountries','country'), targetMarkets:profilePairs('#profileMarkets','country'),
      languageRoutes:profilePairs('#profileRoutes','prefix'), pageLanguages:profilePairs('#profilePages','path'),
      design:{notes:$('#profileDesign').value}, requirePageEvidence:state.project.profile.requirePageEvidence, keepLegacyAnalysis:$('#profileLegacy').checked};
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/profile`, {method:'PUT',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({profile,expectedRevision:Number(form.dataset.revision)})});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    const index = state.projects.findIndex(p=>p.id === projectId);
    if(index>=0) state.projects[index] = payload.project;
    if (state.project?.id !== projectId) return;
    updateCurrentProject(payload.project); renderSiteProfile();
    await loadReport();
    showToast('Site profili kaydedildi. Bağlı site ve canlı yayın değiştirilmedi.');
  } catch(error) { if(state.project?.id === projectId) $('#profileError').textContent = error.message; }
  finally { button.disabled = false; }
});

let inspectionTimer;
const languageName=code=>{try{return new Intl.DisplayNames([AppI18n.settings.language],{type:'language'}).of(code);}catch{return code;}};
async function loadInspection(id) {
  clearTimeout(inspectionTimer);
  try{
    const response=await fetch(`/api/projects/${encodeURIComponent(id)}/inspection`);
    const job=await response.json();if(state.project?.id!==id)return;
    if(!response.ok)throw Error(job.error);
    $('#inspectSite').disabled=job.status==='running';
    if(job.status==='running'){
      $('#inspectionProgress').textContent=`Site inceleniyor… ${job.pages} sayfa okundu. Bu sırada site değiştirilmez.`;
      inspectionTimer=setTimeout(()=>loadInspection(id),1200);return;
    }
    if(job.status==='failed')throw Error(job.error);
    if(job.status!=='complete')return;
    const r=job.result;const unknown=r.pages.filter(p=>!p.language).length;
    const stale=r.profileRevision!==state.project.profile.revision;
    $('#inspectionProgress').textContent=`İnceleme tamamlandı · ${formatDateTime(r.scannedAt)}`;
    $('#inspectionSummary').innerHTML=`<h2>Bulduklarımız</h2><p><strong>${r.pages.length} sayfa incelendi.</strong> ${r.limited?'Bu, sınırlı bir ilk taramadır; sitenin tamamı değildir.':''}</p><p>Dil bildirimi bulunan içerikler: <strong>${escapeHtml(r.languages.map(languageName).join(', ')||'Henüz doğrulanamadı')}</strong></p><p>${unknown} sayfanın dili belirsiz; ${r.errors.length} adres okunamadı. Bunlar için otomatik değişiklik önerilmeyecek.</p><p>Mevcut tasarım ve ziyaretçinin dil seçimi korunur. ${r.styles.length} stil dosyası bağlantısı bulundu; görsel uyum henüz doğrulanmadı.</p><p>${escapeHtml(r.note)}</p>${!r.homeLanguage&&!state.project.profile.primaryLanguage&&r.languages.length>1?`<label>Ana içerik dili hangisi?<select id="inspectionPrimary"><option value="">Seç</option>${r.languages.map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(languageName(l))}</option>`).join('')}</select></label>`:''}<details><summary>İncelenen sayfalar ve kanıtlar</summary>${r.pages.map(p=>`<p><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title||p.url)}</a> — ${escapeHtml(p.language?languageName(p.language):p.warning||'Belirsiz')}</p>`).join('')}</details><p>Onay yalnız SEOAutoPilot ayarlarını kaydeder; siteyi yayınlamaz. Bekleyen eski değişiklik onayları yenilenir.</p>${stale?'<p>Profil bu incelemeden sonra kaydedildi/değişti. Yeni kontrol için tekrar inceleyebilirsin.</p>':r.languages.length?'<button type="button" class="primary-button" id="acceptInspection">Bu bilgilerle devam et</button>':'<p>Otomatik onay kapalı: yeterli dil kanıtı bulunamadı. Gelişmiş ayarlardan kontrol edebilirsin.</p>'}`;
    $('#acceptInspection')?.addEventListener('click',async()=>{
      const button=$('#acceptInspection');button.disabled=true;
      try{
        const response=await fetch(`/api/projects/${encodeURIComponent(id)}/inspection/accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scannedAt:r.scannedAt,primaryLanguage:$('#inspectionPrimary')?.value})});
        const payload=await response.json();if(!response.ok)throw Error(payload.error);
        if(state.project?.id!==id)return;
        updateCurrentProject(payload.project);renderSiteProfile();await loadReport();showToast('Hazır. Site değiştirilmedi; doğrulanan sayfalarla analiz yapılabilir.');
      }catch(error){if(state.project?.id===id)$('#inspectionProgress').textContent=error.message;button.disabled=false;}
    });
  }catch(error){if(state.project?.id===id){$('#inspectionProgress').textContent=error.message;$('#inspectSite').disabled=false;}}
}
$('#inspectSite').addEventListener('click',async()=>{
  const id=state.project.id;$('#inspectSite').disabled=true;$('#inspectionSummary').innerHTML='';$('#inspectionProgress').textContent='İnceleme başlatılıyor…';
  try{
    const response=await fetch(`/api/projects/${encodeURIComponent(id)}/inspection`,{method:'POST'});
    const payload=await response.json();if(!response.ok)throw Error(payload.error);
    if(state.project?.id===id)await loadInspection(id);
  }catch(error){if(state.project?.id===id){$('#inspectionProgress').textContent=error.message;$('#inspectSite').disabled=false;}}
});
document.addEventListener('click', event=>{
  if(event.target.closest('[data-open-profile]')) { closeWorkflowDetail(); renderSiteProfile(); setView('profile'); }
});
