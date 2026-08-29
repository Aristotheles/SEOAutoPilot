'use strict';

const crypto = require('node:crypto');

const STATUS = Object.freeze({
  discovered: 'DISCOVERED', awaitingApproval: 'AWAITING_APPROVAL',
  approved: 'APPROVED', monitoring: 'MONITORING', completed: 'COMPLETED',
  rejected: 'REJECTED',
});
const CONFIDENCE_SCORE = {very_low: 0, low: 4, medium: 8, high: 12, very_high: 16};
const ACTION_SCORE = {UPDATE_EXISTING: 18, NEW_PAGE: 16, CTR_TEST: 14, HOLD: 0};

function priorityFor(opportunity) {
  const impressions = Number(opportunity.queryMetrics?.impressions ||
    opportunity.pageMetrics?.impressions || 0);
  const position = Number(opportunity.pageMetrics?.position ||
    opportunity.queryMetrics?.position || 0);
  const score = Math.max(0, Math.min(100, Math.round(
      Number(opportunity.productFit || 3) * 9 +
      Math.log10(impressions + 1) * 11 +
      (CONFIDENCE_SCORE[opportunity.confidence] || 0) +
      (ACTION_SCORE[opportunity.action] || 0) +
      (position > 10 && position <= 30 ? 8 : 0) -
      (opportunity.action === 'HOLD' ? 22 : 0))));
  const level = score >= 75 ? 'critical' : score >= 58 ? 'high' :
    score >= 38 ? 'medium' : 'low';
  return {score, level};
}

function stepsFor(opportunity) {
  const common = [
    {id: 'evidence', label: 'Arama verisini ve niyeti doğrula', mode: 'automatic'},
    {id: 'brief', label: 'Uygulanabilir değişiklik brifi hazırla', mode: 'automatic'},
  ];
  if (opportunity.action === 'HOLD') return [
    ...common, {id: 'wait', label: 'Yeni veri eşiğini bekle', mode: 'automatic'},
    {id: 'review', label: 'Sinyali yeniden değerlendir', mode: 'automatic'},
  ];
  const actionStep = opportunity.action === 'NEW_PAGE' ? 'Yeni sayfa taslağını hazırla' :
    opportunity.action === 'CTR_TEST' ? 'Başlık ve açıklama varyantlarını hazırla' :
      'Mevcut sayfa için revizyon taslağı hazırla';
  return [...common, {id: 'draft', label: actionStep, mode: 'automatic'},
    {id: 'approval', label: 'Değişikliği kullanıcıya onaylat', mode: 'approval'},
    {id: 'apply', label: 'Onaylanan değişikliği uygula', mode: 'controlled'},
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
    targetPath: opportunity.targetPath,
    evidence: {impressions: opportunity.queryMetrics?.impressions || 0,
      position: opportunity.pageMetrics?.position || opportunity.queryMetrics?.position || 0,
      confidence: opportunity.confidence, productFit: opportunity.productFit},
    queryFocus: queries.slice(0, 12)};
}

function workflowId(projectId, opportunity) {
  return crypto.createHash('sha256').update(`${projectId}:${opportunity.clusterId}:${opportunity.targetPath}`)
      .digest('hex').slice(0, 14);
}

function createWorkflow(projectId, opportunity, previous) {
  const priority = priorityFor(opportunity);
  const requiresApproval = opportunity.action !== 'HOLD';
  const now = new Date().toISOString();
  return {id: workflowId(projectId, opportunity), projectId,
    opportunityId: opportunity.clusterId, title: opportunity.label,
    action: opportunity.action, priority, requiresApproval,
    status: previous?.status || (requiresApproval ? STATUS.awaitingApproval : STATUS.discovered),
    targetPath: opportunity.targetPath, reason: opportunity.reason,
    brief: briefFor(opportunity), steps: stepsFor(opportunity),
    createdAt: previous?.createdAt || now, updatedAt: now,
    approvedAt: previous?.approvedAt || null,
    monitoringStartedAt: previous?.monitoringStartedAt || null,
    completedAt: previous?.completedAt || null,
  };
}

function syncWorkflows(projectId, report, existing = []) {
  const byId = new Map(existing.map((workflow) => [workflow.id, workflow]));
  return (report?.opportunities || []).map((opportunity) => {
    const id = workflowId(projectId, opportunity);
    return createWorkflow(projectId, opportunity, byId.get(id));
  }).sort((left, right) => right.priority.score - left.priority.score);
}

function transition(workflow, action) {
  const now = new Date().toISOString();
  if (action === 'approve' && workflow.status === STATUS.awaitingApproval) {
    return {...workflow, status: STATUS.approved, approvedAt: now, updatedAt: now};
  }
  if (action === 'reject' && workflow.status === STATUS.awaitingApproval) {
    return {...workflow, status: STATUS.rejected, updatedAt: now};
  }
  if (action === 'start_monitoring' && workflow.status === STATUS.approved) {
    return {...workflow, status: STATUS.monitoring, monitoringStartedAt: now, updatedAt: now};
  }
  if (action === 'complete' && workflow.status === STATUS.monitoring) {
    return {...workflow, status: STATUS.completed, completedAt: now, updatedAt: now};
  }
  throw new Error('Bu görev mevcut durumunda bu işleme izin vermiyor.');
}

module.exports = {STATUS, briefFor, priorityFor, stepsFor, syncWorkflows, transition};
