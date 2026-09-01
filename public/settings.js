'use strict';
const uiTextSources=new WeakMap();
const uiAttributeSources=new WeakMap();
const contentSelectors='script,style,code,textarea,input,[data-no-translate],#queryTable td:first-child,.cluster-tag,.change-proposed,.page-url,.page-card h3,.workflow-copy h3,#workflowDetailTitle,#focusTitle,#focusReason,#currentProjectName,#breadcrumbProject,#profileProjectLabel,#connectionManagementProject,.project-list strong,.query-pill,.timeline-item,#inspectionSummary a';
function uiTranslation(source){
  const translated=AppI18n.t(source);if(translated!==source)return translated;
  const lang=AppI18n.settings.language;if(lang==='tr')return source;
  const patterns=[[/^(\d+) aktif gün$/,['$1 active days','$1 aktive Tage']],[/^(\d+) SEO sinyali$/,['$1 SEO signals','$1 SEO-Signale']],[/^(\d+) yeni karar$/,['$1 new decisions','$1 neue Entscheidungen']],[/^(\d+) sorgu gösteriliyor$/,['$1 queries shown','$1 Suchanfragen angezeigt']],[/^(\d+) \/ (\d+) sayfa yayınlandı\.$/,['$1 / $2 pages published.','$1 / $2 Seiten veröffentlicht.']],[/^API senkronize(.*)$/,['API synchronized$1','API synchronisiert$1']],[/^Son güncelleme: (.*)$/,['Last update: $1','Letzte Aktualisierung: $1']],[/^Search Console güncellendi: (.*)$/,['Search Console updated: $1','Search Console aktualisiert: $1']],[/^İnceleme tamamlandı · (.*)$/,['Inspection complete · $1','Prüfung abgeschlossen · $1']],[/^(\d+) sayfa incelendi\.$/,['$1 pages inspected.','$1 Seiten geprüft.']],[/^Kullanıcı tarafından doğrulandı · (.*) · Sürüm (\d+)$/,['Confirmed by user · $1 · Revision $2','Vom Nutzer bestätigt · $1 · Revision $2']]];
  for(const [pattern,values]of patterns)if(pattern.test(source))return source.replace(pattern,values[lang==='en'?0:1]);
  return source;
}
function translateInterface(){
  observer.disconnect();
  document.documentElement.lang=AppI18n.settings.language;
  document.title={tr:'SEOAutoPilot — SEO Komuta Merkezi',en:'SEOAutoPilot — SEO Command Center',de:'SEOAutoPilot — SEO-Kontrollzentrum'}[AppI18n.settings.language];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!node.parentElement||node.parentElement.closest(contentSelectors))continue;
    const previous=uiTextSources.get(node);
    const source=previous&&node.nodeValue===previous.rendered?previous.source:node.nodeValue;
    const trimmed=source.trim();if(!trimmed)continue;
    const rendered=source.replace(trimmed,uiTranslation(trimmed));
    uiTextSources.set(node,{source,rendered});if(node.nodeValue!==rendered)node.nodeValue=rendered;
  }
  for(const element of document.querySelectorAll('[aria-label],[placeholder],[title]')){
    const cache=uiAttributeSources.get(element)||{};
    for(const attr of ['aria-label','placeholder','title']){
      const value=element.getAttribute(attr);if(value===null)continue;
      const source=cache[attr]?.rendered===value?cache[attr].source:value;
      const rendered=uiTranslation(source);cache[attr]={source,rendered};if(rendered!==value)element.setAttribute(attr,rendered);
    }uiAttributeSources.set(element,cache);
  }
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
}
let translationQueued=false;
const observer=new MutationObserver(()=>{if(!translationQueued){translationQueued=true;queueMicrotask(()=>{translationQueued=false;translateInterface();});}});
function applyUiSettings(){
  const p=AppI18n.settings;
  $('#quickLanguage').value=p.language;$('#settingLanguage').value=p.language;
  $('#settingLargeText').checked=p.largeText;$('#settingReducedMotion').checked=p.reducedMotion;$('#settingAutoSync').checked=p.autoSync;
  document.body.classList.toggle('large-ui-text',p.largeText);document.body.classList.toggle('reduce-motion',p.reducedMotion);
  if(state.report)renderAll();
  translateInterface();
}
function saveUiSettings(changes){
  try{AppI18n.save(changes);applyUiSettings();$('#settingsFeedback').textContent=AppI18n.t('Kaydedildi');}
  catch{ $('#settingsFeedback').textContent=AppI18n.t('Tercihler kaydedilemedi. Tarayıcı depolamasını kontrol et.'); }
}
$('#quickLanguage').addEventListener('change',event=>saveUiSettings({language:event.target.value}));
$('#settingLanguage').addEventListener('change',event=>saveUiSettings({language:event.target.value}));
for(const [id,key]of [['settingLargeText','largeText'],['settingReducedMotion','reducedMotion'],['settingAutoSync','autoSync']])$('#'+id).addEventListener('change',event=>saveUiSettings({[key]:event.target.checked}));
$('#resetUiSettings').addEventListener('click',()=>saveUiSettings(AppI18n.defaults));
applyUiSettings();
fetch('/api/health').then(r=>r.json()).then(data=>{$('#settingsVersion').textContent=data.version||'—';}).catch(()=>{$('#settingsVersion').textContent='—';});
