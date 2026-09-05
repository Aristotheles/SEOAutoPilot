'use strict';
const uiTextSources=new WeakMap();
const uiAttributeSources=new WeakMap();
const contentSelectors='script,style,code,textarea,input,[data-no-translate],#queryTable td:first-child,.cluster-tag,.change-proposed,.page-url,.page-card h3,.workflow-copy h3,#workflowDetailTitle,#focusTitle,#focusReason,#currentProjectName,#breadcrumbProject,#profileProjectLabel,#connectionManagementProject,.project-list strong,.query-pill,.timeline-item,#inspectionSummary a';
function uiTranslation(source){
  const translated=AppI18n.t(source);if(translated!==source)return translated;
  const lang=AppI18n.settings.language;if(lang==='tr')return source;
  const patterns=[[/^(\d+) aktif gün$/,['$1 active days','$1 aktive Tage']],[/^(\d+) SEO sinyali$/,['$1 SEO signals','$1 SEO-Signale']],[/^(\d+) yeni karar$/,['$1 new decisions','$1 neue Entscheidungen']],[/^(\d+) sorgu gösteriliyor$/,['$1 queries shown','$1 Suchanfragen angezeigt']],[/^(\d+) \/ (\d+) sayfa yayınlandı\.$/,['$1 / $2 pages published.','$1 / $2 Seiten veröffentlicht.']],[/^API senkronize(.*)$/,['API synchronized$1','API synchronisiert$1']],[/^Son güncelleme: (.*)$/,['Last update: $1','Letzte Aktualisierung: $1']],[/^Search Console güncellendi: (.*)$/,['Search Console updated: $1','Search Console aktualisiert: $1']],[/^İnceleme tamamlandı · (.*)$/,['Inspection complete · $1','Prüfung abgeschlossen · $1']],[/^(\d+) sayfa incelendi\.$/,['$1 pages inspected.','$1 Seiten geprüft.']],[/^Kullanıcı tarafından doğrulandı · (.*) · Sürüm (\d+)$/,['Confirmed by user · $1 · Revision $2','Vom Nutzer bestätigt · $1 · Revision $2']],
    [/^(\d+) sorgu eşleşti$/,['$1 queries matched','$1 Suchanfragen passend']],
    [/^Gerçek veri(.*)$/,['Real data$1','Echte Daten$1']],
    [/^Demo veri(.*)$/,['Demo data$1','Demodaten$1']],
    [/^Veri bekleniyor(.*)$/,['Awaiting data$1','Wartet auf Daten$1']],
    [/^(\d+) sayfanın 28 günlük izlemesi tamamlandı\. İzlenen kutusundan sonuçları açabilirsin\.$/,['$1 pages have completed 28-day monitoring. You can open the results from the Monitored box.','Für $1 Seiten ist die 28-tägige Überwachung abgeschlossen. Du kannst die Ergebnisse im Feld „Überwacht“ öffnen.']],
    [/^Varyant ([A-Z]) seçildi; öneri toplu yayına hazır\.$/,['Variant $1 selected; the recommendation is ready for bulk publishing.','Variante $1 ausgewählt; die Empfehlung ist bereit für die Sammelveröffentlichung.']],
    [/^(.+) projesine geçildi\.$/,['Switched to $1.','Zu $1 gewechselt.']],
    [/^Otomatik senkronizasyon: (.*)$/,['Automatic synchronization: $1','Automatische Synchronisierung: $1']],
    [/^Firebase erişimi doğrulandı: (.*)$/,['Firebase access verified: $1','Firebase-Zugriff bestätigt: $1']],
    [/^(\d+) kayıtlı içerik planı korunuyor\. Tasarım ve ülke kuralları bu aşamada yalnız profil kaydıdır\.$/,['$1 saved content plan(s) preserved. Design and country rules are, at this stage, only part of the profile record.','$1 gespeicherte Inhaltspläne bleiben erhalten. Design- und Länderregeln sind in dieser Phase nur Teil des Profileintrags.']],
    [/^(\d+) sayfanın dili belirsiz; (\d+) adres okunamadı\. Bunlar için otomatik değişiklik önerilmeyecek\.$/,['$1 page(s) have an unclear language; $2 address(es) could not be read. No automatic change will be suggested for these.','Bei $1 Seite(n) ist die Sprache unklar; $2 Adresse(n) konnten nicht gelesen werden. Für diese wird keine automatische Änderung vorgeschlagen.']],
    [/^Mevcut tasarım ve ziyaretçinin dil seçimi korunur\. (\d+) stil dosyası bağlantısı bulundu; görsel uyum henüz doğrulanmadı\.$/,['The current design and the visitor’s language choice are preserved. $1 stylesheet link(s) found; visual consistency has not been verified yet.','Das aktuelle Design und die Sprachwahl des Besuchers bleiben erhalten. $1 Stylesheet-Verknüpfung(en) gefunden; die visuelle Konsistenz wurde noch nicht überprüft.']],
    [/^(\d+) öneri senden karar bekliyor$/,['$1 recommendation(s) awaiting your decision','$1 Empfehlung(en) warten auf deine Entscheidung']],
    [/^(.+) projesini salt okunur Search Console izniyle bağla\.$/,['Connect $1 with read-only Search Console access.','$1 mit lesendem Search-Console-Zugriff verbinden.']],
    [/^(.+) projesini kaldır$/,['Remove $1','$1 entfernen']]];
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
