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
      design:{notes:$('#profileDesign').value}, keepLegacyAnalysis:$('#profileLegacy').checked};
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
document.addEventListener('click', event=>{
  if(event.target.closest('[data-open-profile]')) { closeWorkflowDetail(); renderSiteProfile(); setView('profile'); }
});
