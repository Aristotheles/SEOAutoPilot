'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {STATUS, beginExecution, beginPublish, failExecution, finishExecution, finishPublish,
  priorityFor, recoverPreview, syncWorkflows,
  transition} = require('../src/workflow');

const opportunity = {clusterId: 'growth', label: 'Growth guide', locale:'en',
  action: 'UPDATE_EXISTING', productFit: 5, targetPath: '/growth-guide',
  confidence: 'high', reason: 'Sayfa güçlendirilmeli.',
  queryMetrics: {impressions: 180, position: 18},
  pageMetrics: {impressions: 180, position: 18},
  matchedQueries: ['growth guide', 'growth strategy']};

test('prioritizes strong, actionable opportunities', () => {
  const priority = priorityFor(opportunity);
  assert.equal(priority.level, 'critical');
  assert.ok(priority.score >= 75);
});

test('generates approval-gated workflows and preserves their state', () => {
  const report = {opportunities: [opportunity]};
  const first = syncWorkflows('project-1', report);
  assert.equal(first[0].status, STATUS.awaitingApproval);
  assert.equal(first[0].steps.find((step) => step.mode === 'approval').id, 'approval');
  const approved = transition(first[0], 'approve');
  const refreshed = syncWorkflows('project-1', report, [approved]);
  assert.equal(refreshed[0].status, STATUS.approved);
  assert.equal(refreshed[0].id, first[0].id);
});

test('selecting a CTR title variant creates one exact approved title change', () => {
  const workflow = syncWorkflows('project-1', {opportunities:[{...opportunity, action:'CTR_TEST'}]})[0];
  const selected = transition(workflow, 'select_variant', {variant:'b'});
  assert.equal(selected.status, STATUS.approved);
  assert.equal(selected.action, 'UPDATE_EXISTING');
  assert.deepEqual(selected.brief.changes.map((change) => change.id), ['title', 'meta']);
  assert.match(selected.brief.changes[0].proposed, /Details and Answers/);
  assert.throws(() => transition(workflow, 'select_variant', {variant:'c'}), /A veya B/);
});

test('an approved CTR draft can be closed while preserving the existing page', () => {
  const workflow = syncWorkflows('project-1', {opportunities:[{...opportunity, action:'CTR_TEST'}]})[0];
  const approved = transition(workflow, 'approve');
  const kept = transition(approved, 'keep_existing');
  assert.equal(kept.status, STATUS.rejected);
  assert.equal(kept.approvedAt, null);
  assert.match(kept.events.at(-1).label, /korundu/);
});

test('does not allow skipping required workflow stages', () => {
  const workflow = syncWorkflows('project-1', {opportunities: [opportunity]})[0];
  assert.throws(() => transition(workflow, 'complete'));
  const approved = transition(workflow, 'approve');
  assert.throws(() => transition(approved, 'start_monitoring'));
  const applying = beginExecution(approved, 'test-adapter', '2026-08-01T09:00:00.000Z');
  assert.equal(applying.status, STATUS.applying);
  assert.throws(() => beginExecution(applying, 'test-adapter'), /devam ediyor/u);
  const preview = finishExecution(applying, {url: 'https://preview.example.com/growth-guide',
    revision: 'abc123'}, '2026-08-01T09:01:00.000Z');
  assert.equal(preview.status, STATUS.previewReady);
  assert.throws(() => transition(preview, 'start_monitoring'));
  const publishing = beginPublish(preview, '2026-08-01T09:01:30.000Z');
  const published = finishPublish(publishing, {url: 'https://example.com/growth-guide'},
      '2026-08-01T09:02:00.000Z');
  const monitoring = transition(published, 'start_monitoring',
      {now: '2026-08-01T09:02:00.000Z'});
  assert.throws(() => transition(monitoring, 'complete',
      {now: '2026-08-02T09:02:00.000Z'}), /14 günlük/u);
  assert.equal(transition(monitoring, 'complete',
      {now: '2026-08-16T09:02:00.000Z'}).status, STATUS.completed);
});

test('repairs legacy completed workflows that have no real execution record', () => {
  const report = {opportunities: [opportunity]};
  const original = syncWorkflows('project-1', report)[0];
  const legacy = {...original, status: STATUS.completed, completedAt: new Date().toISOString(),
    execution: null};
  const repaired = syncWorkflows('project-1', report, [legacy])[0];
  assert.equal(repaired.status, STATUS.awaitingApproval);
  assert.equal(repaired.completedAt, null);
  assert.equal(repaired.events.at(-1).type, 'REPAIRED');
});

test('includes concrete proposed changes before approval', () => {
  const workflow = syncWorkflows('project-1', {opportunities: [opportunity]})[0];
  assert.ok(workflow.brief.changes.length >= 4);
  assert.ok(workflow.brief.changes.every((change) => change.area && change.proposed &&
    change.rationale));
});

test('uses target locale for proposed copy', () => {
  const turkish = {...opportunity, clusterId: 'articles', label: 'Almanca artikeller', locale:'tr',
    targetPath: '/tr/blog/almanca-artikeller'};
  const workflow = syncWorkflows('project-1', {opportunities: [turkish]})[0];
  assert.match(workflow.brief.changes[1].proposed, /hakkında bilgiler/u);
});

test('keeps failed preview work transparent and retryable', () => {
  const workflow = syncWorkflows('project-1', {opportunities: [opportunity]})[0];
  const applying = beginExecution(transition(workflow, 'approve'), 'test-adapter');
  const failed = failExecution(applying, 'Build failed');
  assert.equal(failed.status, STATUS.failed);
  assert.equal(failed.execution.failedPhase, STATUS.applying);
  assert.equal(transition(failed, 'retry').status, STATUS.approved);
});

test('recovers a successfully deployed preview after URL parsing failed', () => {
  const workflow = syncWorkflows('project-1', {opportunities: [opportunity]})[0];
  const applying = beginExecution(transition(workflow, 'approve'), 'test-adapter');
  const failed = failExecution(applying, 'Preview URL missing');
  const recovered = recoverPreview(failed, {url: 'https://example--preview.web.app',
    previewPageUrl: 'https://example--preview.web.app/growth-guide',
    revision: 'abc123'});
  assert.equal(recovered.status, STATUS.previewReady);
  assert.equal(recovered.execution.previewPageUrl,
      'https://example--preview.web.app/growth-guide');
});

test('prepared local build can publish without Firebase preview and retry without rebuilding',()=>{
  const workflow=syncWorkflows('project-1',{opportunities:[opportunity]})[0];
  const applying=beginExecution(transition(workflow,'approve'),'local_git_build');
  const prepared=finishExecution(applying,{prepared:true,url:null,worktreePath:'test-worktree',revision:'abc',sourceFile:'public/page.html'});
  assert.equal(prepared.execution.previewUrl,null);
  assert.match(prepared.events.at(-1).label,/derleme kontrolü/);
  const publishing=beginPublish(prepared);
  const retry=transition(failExecution(publishing,'Network error'),'retry');
  assert.equal(retry.status,STATUS.previewReady);
  assert.equal(retry.execution.worktreePath,'test-worktree');
  assert.equal(beginPublish(retry).status,STATUS.publishing);
  assert.throws(()=>beginPublish({...prepared,execution:{prepared:true}}));
  assert.throws(()=>beginPublish(transition(workflow,'approve')));
});
