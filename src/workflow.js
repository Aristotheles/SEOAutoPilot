'use strict';

const crypto = require('node:crypto');
const {normalizeOpportunity} = require('./page-label');

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

function languageFor(opportunity) {
  if (opportunity.locale && opportunity.locale !== 'und') return opportunity.locale;
  if (/^\/tr(?:\/|$)/u.test(opportunity.targetPath || '')) return 'tr';
  if (/^\/en(?:\/|$)/u.test(opportunity.targetPath || '')) return 'en';
  return /[çğıöşü]/iu.test(opportunity.label || '') ? 'tr' : 'en';
}

function changesFor(opportunity) {
  if (opportunity.action === 'HOLD') return [];
  const label = String(opportunity.label || 'Hedef konu');
  const language = languageFor(opportunity);
  const isTurkish = language === 'tr';
  const title = isTurkish ? `${label}: Kurallar, Mantık ve Örnekler` :
    `${label}: Rules, Patterns and Clear Examples`;
  const description = isTurkish ?
    `${label} konusunu açık kurallar, gerçek cümleler ve adım adım çözümlemelerle öğrenin.` :
    `Understand ${label.toLowerCase()} with clear rules, real examples and step-by-step breakdowns.`;
  if (opportunity.action === 'CTR_TEST') return [
    {id: 'title-a', area: 'SEO başlığı · Varyant A', proposed: title,
      rationale: 'Ana arama niyetini başlığın başında görünür kılar.'},
    {id: 'title-b', area: 'SEO başlığı · Varyant B',
      proposed: isTurkish ? `${label} Nasıl Öğrenilir? Pratik Rehber` :
        `How to Master ${label}: A Practical Guide`,
      rationale: 'Soru ve fayda odaklı alternatif CTR testi sağlar.'},
    {id: 'meta', area: 'Meta açıklaması', proposed: description,
      rationale: 'Sonuç sayfasında içeriğin değerini netleştirir.'},
  ];
  const queryFocus = (opportunity.matchedQueries || []).slice(0, 5);
  return [
    {id: 'title', area: 'SEO başlığı', proposed: title,
      rationale: 'Birincil konuyu ve öğrenme vaadini birlikte anlatır.'},
    {id: 'meta', area: 'Meta açıklaması', proposed: description,
      rationale: 'Tıklama öncesinde sayfanın kapsamını açıklar.'},
    {id: 'h1', area: 'H1 ve giriş', proposed: label,
      rationale: 'Arama niyetiyle sayfanın ana konusunu aynı hizaya getirir.'},
    {id: 'sections', area: 'İçerik bölümleri',
      proposed: queryFocus.length ? queryFocus.join(' · ') :
        (isTurkish ? 'Temel mantık · Sık hatalar · Açıklamalı örnekler' :
          'Core pattern · Common mistakes · Explained examples'),
      rationale: 'Gösterim alan alt sorguların sayfada açıkça cevaplanmasını sağlar.'},
    {id: 'links', area: 'İç bağlantılar',
      proposed: isTurkish ? 'İlgili ders ve ürün akışına 2–3 bağlamsal bağlantı ekle.' :
        'Add 2–3 contextual links to the relevant lesson and product flow.',
      rationale: 'Konu otoritesini ve ürün keşfini güçlendirir.'},
  ];
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

function briefFor(opportunity) {
  const queries = opportunity.matchedQueries || [];
  const actionText = opportunity.action === 'NEW_PAGE' ? 'Yeni ve ayrı bir hedef sayfa oluştur.' :
    opportunity.action === 'CTR_TEST' ? 'Başlık ve meta açıklaması için kontrollü varyant üret.' :
      opportunity.action === 'HOLD' ? 'Değişiklik yapma; veri eşiğini bekle.' :
        'Yeni sayfa açmadan mevcut hedef sayfayı güçlendir.';
  return {objective: opportunity.reason, action: actionText,
    targetPath: opportunity.targetPath, changes: changesFor(opportunity),
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

function createWorkflow(projectId, opportunity, previousValue) {
  opportunity = normalizeOpportunity(opportunity);
  const priority = priorityFor(opportunity);
  const requiresApproval = opportunity.action !== 'HOLD';
  const now = new Date().toISOString();
  let previous = migratePrevious(previousValue, requiresApproval, now);
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
    brief: briefFor(opportunity), steps: stepsFor(opportunity),
    events: previous?.events || initialEvents(now), execution: previous?.execution || null,
    result: previous?.result || null, createdAt: previous?.createdAt || now, updatedAt: now,
    approvedAt: previous?.approvedAt || null,
    monitoringStartedAt: previous?.monitoringStartedAt || null,
    completedAt: previous?.completedAt || null};
}

function syncWorkflows(projectId, report, existing = []) {
  const byId = new Map(existing.map((workflow) => [workflow.id, workflow]));
  return (report?.opportunities || []).map((opportunity) => {
    const id = workflowId(projectId, opportunity);
    return createWorkflow(projectId, opportunity, byId.get(id));
  }).sort((left, right) => right.priority.score - left.priority.score);
}

function addEvent(workflow, type, label, now, actor = 'user') {
  return [...(workflow.events || []), {type, label, at: now, actor}];
}

function transition(workflow, action, options = {}) {
  const now = options.now || new Date().toISOString();
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
      workflow.execution?.previewUrl;
    return {...workflow, status: publishRetry ? STATUS.previewReady : STATUS.approved,
      updatedAt: now, execution: publishRetry ? {...workflow.execution, state: 'preview_ready',
        error: null} : null,
      events: addEvent(workflow, 'RETRY_READY', publishRetry ?
        'Canlı yayın yeniden denenmeye hazır' : 'Önizleme yeniden hazırlanmaya hazır', now)};
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
    events: addEvent(workflow, 'PREVIEW_READY', 'Firebase önizlemesi hazırlandı', now,
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
  if (workflow.status !== STATUS.previewReady || !workflow.execution?.previewUrl) {
    throw new Error('Canlı yayın öncesinde doğrulanmış bir önizleme gerekli.');
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

module.exports = {STATUS, beginExecution, beginPublish, briefFor, changesFor, failExecution,
  finishExecution, finishPublish, priorityFor, recoverPreview, stepsFor, syncWorkflows,
  transition};
