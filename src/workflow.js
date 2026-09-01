'use strict';

const crypto = require('node:crypto');
const {normalizeOpportunity} = require('./page-label');
const {draftBlocker, resolveLanguage} = require('./site-profile');

const STATUS = Object.freeze({
  discovered: 'DISCOVERED', awaitingApproval: 'AWAITING_APPROVAL',
  approved: 'APPROVED', applying: 'APPLYING', previewReady: 'PREVIEW_READY',
  publishing: 'PUBLISHING', published: 'PUBLISHED', applied: 'APPLIED',
  monitoring: 'MONITORING', completed: 'COMPLETED', rejected: 'REJECTED',
  failed: 'FAILED',
});
const CONFIDENCE_SCORE = {very_low: 0, low: 4, medium: 8, high: 12, very_high: 16};
const ACTION_SCORE = {UPDATE_EXISTING: 18, NEW_PAGE: 16, CTR_TEST: 14, HOLD: 0};

function priorityFor(opportunity) {
  const impressions = Number(opportunity.queryMetrics?.impressions ||
    opportunity.pageMetrics?.impressions || 0);
  const position = Number(opportunity.pageMetrics?.position ||
    opportunity.queryMetrics?.position || 0);
  const score = Math.max(0, Math.min(100, Math.round(
      Number(opportunity.productFit || 3) * 9 + Math.log10(impressions + 1) * 11 +
      (CONFIDENCE_SCORE[opportunity.confidence] || 0) +
      (ACTION_SCORE[opportunity.action] || 0) +
      (position > 10 && position <= 30 ? 8 : 0) -
      (opportunity.action === 'HOLD' ? 22 : 0))));
  const level = score >= 75 ? 'critical' : score >= 58 ? 'high' :
    score >= 38 ? 'medium' : 'low';
  return {score, level};
}

function changesFor(opportunity, profile) {
  if (opportunity.action === 'HOLD' || draftBlocker(opportunity, profile)) return [];
  const label = String(opportunity.label || '');
  const language = resolveLanguage(opportunity, profile).language.split('-')[0];
  const copy = {
    tr: {title:label, variant:`${label}: Ayrıntılar ve Yanıtlar`, description:`${label} hakkında bilgiler, önemli ayrıntılar ve sık sorulan sorular.`, sections:'Konunun kapsamı · Kullanıcının soruları · Açıklayıcı ayrıntılar', links:'İlgili içerik ve ürün sayfalarına bağlamsal bağlantıları değerlendir.'},
    en: {title:label, variant:`${label}: Details and Answers`, description:`Information about ${label}, key details and frequently asked questions.`, sections:'Topic overview · User questions · Supporting details', links:'Review contextual links to relevant content and product pages.'},
    de: {title:label, variant:`${label}: Details und Antworten`, description:`Informationen zu ${label}, wichtige Details und häufig gestellte Fragen.`, sections:'Überblick · Fragen der Nutzer · Weiterführende Informationen', links:'Passende interne Links zu verwandten Inhalten und Produktseiten prüfen.'}
  }[language];
  // These are rule-based starting suggestions, not claimed AI-written or source-verified copy.
  const title = {id:'title', area:'SEO başlığı', proposed:copy.title, rationale:'Başlangıç önerisi; mevcut başlık ve sayfa içeriğiyle karşılaştırılmalı.'};
  const meta = {id:'meta', area:'Meta açıklaması', proposed:copy.description, rationale:'Kural tabanlı taslak; sayfanın gerçekten sunduğu içerikle doğrulanmalı.'};
  if (opportunity.action === 'CTR_TEST') return [
    {...title,id:'title-a',area:'SEO başlığı · Varyant A'},
    {...title,id:'title-b',area:'SEO başlığı · Varyant B',proposed:copy.variant}, meta];
  return [title, meta,
    {id:'h1',area:'H1',proposed:label,rationale:'Hedef konu; içerik dili ve mevcut başlık incelenmeli.'},
    {id:'sections',area:'İçerik bölümleri',proposed:copy.sections,rationale:'Editoryal öneri; henüz yazılmış veya uygulanmış içerik değildir.'},
    {id:'links',area:'İç bağlantılar',proposed:copy.links,rationale:'Gerçek hedef sayfalar doğrulanmadan bağlantı eklenmez.'}];
}

function stepsFor(opportunity) {
  const common = [
    {id: 'evidence', label: 'Arama verisini ve niyeti doğrula', mode: 'automatic'},
    {id: 'brief', label: 'Değişiklik ayrıntılarını ve taslağı hazırla', mode: 'automatic'},
  ];
  if (opportunity.action === 'HOLD') return [...common,
    {id: 'wait', label: 'Yeni veri eşiğini bekle', mode: 'automatic'},
    {id: 'review', label: 'Sinyali yeniden değerlendir', mode: 'automatic'}];
  return [...common,
    {id: 'approval', label: 'Bütün değişiklikleri kullanıcıya onaylat', mode: 'approval'},
    {id: 'apply', label: 'Onaylanan değişiklikleri bağlı siteye uygula', mode: 'controlled'},
    {id: 'verify', label: 'Yayınlanan sayfayı ve değişiklikleri doğrula', mode: 'automatic'},
    {id: 'monitor14', label: '14 günlük etki kontrolü', mode: 'automatic'},
    {id: 'monitor28', label: '28 günlük sonuç değerlendirmesi', mode: 'automatic'}];
}

function briefFor(opportunity, profile) {
  const queries = opportunity.matchedQueries || [];
  const actionText = opportunity.action === 'NEW_PAGE' ? 'Yeni ve ayrı bir hedef sayfa oluştur.' :
    opportunity.action === 'CTR_TEST' ? 'Başlık ve meta açıklaması için kontrollü varyant üret.' :
      opportunity.action === 'HOLD' ? 'Değişiklik yapma; veri eşiğini bekle.' :
        'Yeni sayfa açmadan mevcut hedef sayfayı güçlendir.';
  return {objective: opportunity.reason, action: actionText,
    targetPath: opportunity.targetPath, changes: changesFor(opportunity, profile),
    evidence: {impressions: opportunity.queryMetrics?.impressions || 0,
      position: opportunity.pageMetrics?.position || opportunity.queryMetrics?.position || 0,
      confidence: opportunity.confidence, productFit: opportunity.productFit},
    queryFocus: queries.slice(0, 12)};
}

function workflowId(projectId, opportunity) {
  return crypto.createHash('sha256')
      .update(`${projectId}:${opportunity.clusterId}:${opportunity.targetPath}`)
      .digest('hex').slice(0, 14);
}

function initialEvents(now) {
  return [
    {type: 'DISCOVERED', label: 'SEO fırsatı tespit edildi', at: now, actor: 'system'},
    {type: 'BRIEF_READY', label: 'Kanıtlar ve değişiklik taslağı hazırlandı', at: now,
      actor: 'system'},
  ];
}

function migratePrevious(previous, requiresApproval, now) {
  if (!previous) return null;
  const invalidCompletion = [STATUS.monitoring, STATUS.completed].includes(previous.status) &&
    !previous.execution?.appliedAt;
  if (!invalidCompletion) return previous;
  return {...previous, status: requiresApproval ? STATUS.awaitingApproval : STATUS.discovered,
    approvedAt: null, monitoringStartedAt: null, completedAt: null,
    events: [...(previous.events || initialEvents(previous.createdAt || now)), {
      type: 'REPAIRED', label: 'Gerçek uygulama kaydı olmadığı için görev onay aşamasına alındı',
      at: now, actor: 'system'}]};
}

function createWorkflow(projectId, opportunity, previousValue, profile) {
  opportunity = normalizeOpportunity(opportunity);
  const priority = priorityFor(opportunity);
  const requiresApproval = opportunity.action !== 'HOLD';
  const now = new Date().toISOString();
  let previous = migratePrevious(previousValue, requiresApproval, now);
  if (previous && (previous.execution?.appliedAt || ['APPLYING','PUBLISHING','PUBLISHED','MONITORING','COMPLETED'].includes(previous.status))) return previous;
  const blockedReason = opportunity.action === 'HOLD' ? null : draftBlocker(opportunity, profile);
  const brief = briefFor(opportunity, profile);
  const briefHash = crypto.createHash('sha256').update(JSON.stringify({brief, profileRevision:profile?.revision || 0})).digest('hex');
  if (previous && previous.briefHash !== briefHash) previous = {...previous,
    status:requiresApproval ? STATUS.awaitingApproval : STATUS.discovered, approvedAt:null, execution:null,
    events:[...(previous.events || []), {type:'BRIEF_CHANGED', actor:'system',at:now,
      label:'Profil veya taslak değişti; onay yeniden gerekli.'}]};
  if (previous && /\.html?$/iu.test(previous.title) && previous.title !== opportunity.label) {
    // Never rewrite in-flight or published execution history behind the user's back.
    if ([STATUS.applying, STATUS.publishing].includes(previous.status) || previous.execution?.appliedAt) return previous;
    previous = {...previous, status: requiresApproval ? STATUS.awaitingApproval : STATUS.discovered,
      approvedAt: null, execution: null,
      events: [...(previous.events || []), {type: 'LABEL_REPAIRED', actor: 'system', at: now,
        label: 'Dosya uzantısı başlık ve taslaklardan kaldırıldı; hedef URL korundu.'}]};
  }
  return {id: workflowId(projectId, opportunity), projectId,
    opportunityId: opportunity.clusterId, title: opportunity.label,
    action: opportunity.action, priority, requiresApproval,
    status: previous?.status || (requiresApproval ? STATUS.awaitingApproval : STATUS.discovered),
    targetPath: opportunity.targetPath, reason: opportunity.reason,
    brief, briefHash, blockedReason, contentLanguage:resolveLanguage(opportunity, profile).language,
    profileRevision:profile?.revision || 0, brandName:profile?.business?.brand || '', steps:stepsFor(opportunity),
    events: previous?.events || initialEvents(now), execution: previous?.execution || null,
    result: previous?.result || null, createdAt: previous?.createdAt || now, updatedAt: now,
    approvedAt: previous?.approvedAt || null,
    monitoringStartedAt: previous?.monitoringStartedAt || null,
    completedAt: previous?.completedAt || null};
}

function syncWorkflows(projectId, report, existing = [], profile) {
  const byId = new Map(existing.map((workflow) => [workflow.id, workflow]));
  const current = (report?.opportunities || []).map((opportunity) => {
    const id = workflowId(projectId, opportunity);
    return createWorkflow(projectId, opportunity, byId.get(id), profile);
  });
  const seen = new Set(current.map(w=>w.id));
  const history = existing.filter(w=>!seen.has(w.id) && w.source !== 'editorial_backlog').map(w=>
    w.execution?.appliedAt || ['APPLYING','PUBLISHING','PUBLISHED','MONITORING','COMPLETED'].includes(w.status) ? w :
      {...w, blockedReason:'Bu görev güncel analizde yer almıyor; eski öneriyle işlem yapılmaz.', approvedAt:null, execution:null});
  return [...current,...history].sort((left, right) => right.priority.score - left.priority.score);
}

function addEvent(workflow, type, label, now, actor = 'user') {
  return [...(workflow.events || []), {type, label, at: now, actor}];
}

function transition(workflow, action, options = {}) {
  if (workflow.blockedReason && ['approve','retry'].includes(action)) throw new Error(workflow.blockedReason);
  const now = options.now || new Date().toISOString();
  if (action === 'keep_existing' && workflow.action === 'CTR_TEST' &&
      [STATUS.awaitingApproval, STATUS.approved].includes(workflow.status)) {
    return {...workflow,status:STATUS.rejected,approvedAt:null,updatedAt:now,
      events:addEvent(workflow,'KEPT_EXISTING','Mevcut sayfa başlığı ve meta açıklaması korundu',now)};
  }
  if (action === 'select_variant' && workflow.status === STATUS.awaitingApproval && workflow.action === 'CTR_TEST') {
    if (!['a', 'b'].includes(options.variant)) throw new Error('Başlık varyantı A veya B olmalı.');
    const selected = workflow.brief?.changes?.find((change) => change.id === `title-${options.variant}`);
    const meta = workflow.brief?.changes?.find((change) => change.id === 'meta');
    if (!selected?.proposed || !meta?.proposed) throw new Error('Seçilen başlık taslağı eksik.');
    const brief = {...workflow.brief,
      action:`Seçilen ${options.variant.toUpperCase()} başlığını ve meta açıklamasını mevcut sayfaya uygula.`,
      changes:[{...selected,id:'title',area:'SEO başlığı'},meta]};
    const briefHash=crypto.createHash('sha256').update(JSON.stringify({brief,
      profileRevision:workflow.profileRevision||0})).digest('hex');
    return {...workflow,action:'UPDATE_EXISTING',brief,briefHash,status:STATUS.approved,
      approvedAt:now,updatedAt:now,events:addEvent(workflow,'VARIANT_SELECTED',
        `Başlık varyantı ${options.variant.toUpperCase()} seçildi ve toplu yayın için onaylandı`,now)};
  }
  if (action === 'approve' && workflow.status === STATUS.awaitingApproval) {
    return {...workflow, status: STATUS.approved, approvedAt: now, updatedAt: now,
      events: addEvent(workflow, 'APPROVED', 'Önerilen değişiklikler kullanıcı tarafından onaylandı', now)};
  }
  if (action === 'reject' && workflow.status === STATUS.awaitingApproval) {
    return {...workflow, status: STATUS.rejected, updatedAt: now,
      events: addEvent(workflow, 'REJECTED', 'Öneri kullanıcı tarafından reddedildi', now)};
  }
  if (action === 'retry' && workflow.status === STATUS.failed) {
    const publishRetry = workflow.execution?.failedPhase === STATUS.publishing &&
      (workflow.execution?.previewUrl || workflow.execution?.prepared);
    return {...workflow, status: publishRetry ? STATUS.previewReady : STATUS.approved,
      updatedAt: now, execution: publishRetry ? {...workflow.execution, state: 'preview_ready',
        error: null} : null,
      events: addEvent(workflow, 'RETRY_READY', publishRetry ?
        'Canlı yayın yeniden denenmeye hazır' : 'Değişiklikler yeniden hazırlanmaya hazır', now)};
  }
  if (action === 'start_monitoring' && workflow.status === STATUS.published &&
      workflow.execution?.appliedAt) {
    return {...workflow, status: STATUS.monitoring, monitoringStartedAt: now, updatedAt: now,
      events: addEvent(workflow, 'MONITORING', '14/28 günlük sonuç izleme başladı', now, 'system')};
  }
  if (action === 'complete' && workflow.status === STATUS.monitoring) {
    const elapsed = new Date(now).getTime() - new Date(workflow.monitoringStartedAt).getTime();
    if (elapsed < 14 * 24 * 60 * 60 * 1000) {
      throw new Error('Sonuç değerlendirmesi için 14 günlük izleme süresi henüz dolmadı.');
    }
    return {...workflow, status: STATUS.completed, completedAt: now, updatedAt: now,
      result: options.result || workflow.result || null,
      events: addEvent(workflow, 'COMPLETED', 'İzleme sonucu değerlendirildi', now)};
  }
  throw new Error('Bu görev mevcut durumunda bu işleme izin vermiyor.');
}

function beginExecution(workflow, provider, now = new Date().toISOString()) {
  if (workflow.blockedReason) throw new Error(workflow.blockedReason);
  if (workflow.status === STATUS.applying) {
    throw new Error('Güncelleme hâlâ devam ediyor. Tamamlanmasını bekle.');
  }
  if (workflow.status !== STATUS.approved) {
    throw new Error('Uygulama başlamadan önce değişiklikler onaylanmalı.');
  }
  return {...workflow, status: STATUS.applying, updatedAt: now,
    execution: {provider, state: 'running', startedAt: now, appliedAt: null,
      url: null, revision: null, error: null},
    events: addEvent(workflow, 'APPLYING', 'Onaylanan değişiklikler uygulanıyor', now, 'system')};
}

function finishExecution(workflow, output, now = new Date().toISOString()) {
  if (workflow.status !== STATUS.applying || workflow.execution?.state !== 'running') {
    throw new Error('Tamamlanmayı bekleyen bir güncelleme bulunmuyor.');
  }
  return {...workflow, status: STATUS.previewReady, updatedAt: now,
    execution: {...workflow.execution, ...output, state: 'preview_ready', previewAt: now,
      previewUrl: output.url, url: null, appliedAt: null, revision: output.revision || null},
    events: addEvent(workflow, 'PREVIEW_READY', output.prepared ? 'Değişiklikler hazırlandı ve derleme kontrolü geçti; canlı site değişmedi' : 'Firebase önizlemesi hazırlandı', now,
        'system')};
}

function recoverPreview(workflow, output, now = new Date().toISOString()) {
  if (workflow.status !== STATUS.failed ||
      workflow.execution?.failedPhase !== STATUS.applying || !output?.url) {
    throw new Error('Kurtarılabilir bir Firebase önizlemesi bulunmuyor.');
  }
  return {...workflow, status: STATUS.previewReady, updatedAt: now,
    execution: {...workflow.execution, ...output, state: 'preview_ready', error: null,
      previewAt: now, previewUrl: output.url, url: null, appliedAt: null},
    events: addEvent(workflow, 'PREVIEW_RECOVERED',
        'Başarılı Firebase önizlemesi doğrulandı ve göreve bağlandı', now, 'system')};
}

function beginPublish(workflow, now = new Date().toISOString()) {
  const ready = workflow.execution?.previewUrl || (workflow.execution?.prepared && workflow.execution?.worktreePath && workflow.execution?.revision && workflow.execution?.sourceFile);
  if (workflow.status !== STATUS.previewReady || !ready) {
    throw new Error('Canlı yayın öncesinde değişikliklerin hazırlanması ve kontrol edilmesi gerekli.');
  }
  return {...workflow, status: STATUS.publishing, updatedAt: now,
    execution: {...workflow.execution, state: 'publishing', publishStartedAt: now},
    events: addEvent(workflow, 'PUBLISHING', 'İkinci onay alındı; canlı yayın başladı', now)};
}

function finishPublish(workflow, output, now = new Date().toISOString()) {
  if (workflow.status !== STATUS.publishing) {
    throw new Error('Canlı yayın aşamasında bir görev bulunmuyor.');
  }
  return {...workflow, status: STATUS.published, updatedAt: now,
    execution: {...workflow.execution, ...output, state: 'published', appliedAt: now,
      url: output.url},
    events: addEvent(workflow, 'PUBLISHED', 'Değişiklik canlı siteye yayınlandı', now,
        'system')};
}

function failExecution(workflow, error, now = new Date().toISOString()) {
  if (![STATUS.applying, STATUS.publishing].includes(workflow.status)) return workflow;
  return {...workflow, status: STATUS.failed, updatedAt: now,
    execution: {...workflow.execution, state: 'failed', failedPhase: workflow.status,
      error: String(error)},
    events: addEvent(workflow, 'FAILED', 'Güncelleme tamamlanamadı', now, 'system')};
}

function pageMetricsForWorkflow(report, workflow) {
  const target=String(workflow.targetPath||'').replace(/\/$/u,'')||'/';
  const row=(report?.details?.pages||[]).find((page)=>{try{return (new URL(page.url).pathname.replace(/\/$/u,'')||'/')===target;}catch{return false;}});
  return row?{clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}:null;
}

function monitoringResult(baseline, current) {
  const change=(after,before)=>before?((after-before)/before):after?1:0;
  const changes={clicks:change(current.clicks,baseline.clicks),impressions:change(current.impressions,baseline.impressions),
    ctr:current.ctr-baseline.ctr,position:baseline.position-current.position};
  let verdict='stable',recommendation='Değişikliği koru; yeni bir müdahale için daha fazla arama verisi bekle.';
  if(current.impressions<30){verdict='insufficient_data';recommendation='Karar vermek için veri yetersiz. En az 30 gösterime kadar izlemeyi sürdür.';}
  else if(changes.position>=2||changes.clicks>=.2||changes.ctr>=.01){verdict='improved';recommendation='Değişiklik olumlu. Koru ve ilgili içeriklerden bu sayfaya iç bağlantı eklemeyi değerlendir.';}
  else if(changes.position<=-2||changes.clicks<=-.2||changes.ctr<=-.01){verdict='declined';recommendation='Performans geriledi. Arama niyeti ile başlık/meta uyumunu yeniden incele; önceki metne dönüşü değerlendir.';}
  return {status:'review_ready',verdict,recommendation,baseline,current,changes};
}

function completeMatureMonitoring(workflows, now = new Date().toISOString(), report = null) {
  const nowMs = new Date(now).getTime();
  return (workflows || []).map((workflow) => {
    if (workflow.status !== STATUS.monitoring || !workflow.monitoringStartedAt) return workflow;
    const current=pageMetricsForWorkflow(report,workflow);
    const baseline=workflow.monitoringBaseline||current||{
      clicks:0,impressions:Number(workflow.brief?.evidence?.impressions||0),ctr:0,
      position:Number(workflow.brief?.evidence?.position||0)};
    if(!workflow.monitoringBaseline)return {...workflow,monitoringBaseline:baseline,
      monitoringBaselineAt:report?.generatedAt||now};
    const elapsed = nowMs - new Date(workflow.monitoringStartedAt).getTime();
    if (elapsed < 28 * 24 * 60 * 60 * 1000) return workflow;
    const result=current?monitoringResult(baseline,current):{status:'review_ready',verdict:'no_current_data',
      recommendation:'Güncel Search Console verisi bulunamadı. Veriyi yenileyip sonucu tekrar incele.',baseline,current:null,changes:null};
    return transition(workflow, 'complete', {now,result});
  });
}

module.exports = {STATUS, beginExecution, beginPublish, briefFor, changesFor, completeMatureMonitoring, failExecution, monitoringResult, pageMetricsForWorkflow,
  finishExecution, finishPublish, priorityFor, recoverPreview, stepsFor, syncWorkflows,
  transition};
