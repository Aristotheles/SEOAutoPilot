'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {STATUS, beginExecution, finishExecution, priorityFor, syncWorkflows,
  transition} = require('../src/workflow');

const opportunity = {clusterId: 'growth', label: 'Growth guide',
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

test('does not allow skipping required workflow stages', () => {
  const workflow = syncWorkflows('project-1', {opportunities: [opportunity]})[0];
  assert.throws(() => transition(workflow, 'complete'));
  const approved = transition(workflow, 'approve');
  assert.throws(() => transition(approved, 'start_monitoring'));
  const applying = beginExecution(approved, 'test-adapter', '2026-08-01T09:00:00.000Z');
  assert.equal(applying.status, STATUS.applying);
  assert.throws(() => beginExecution(applying, 'test-adapter'), /devam ediyor/u);
  const applied = finishExecution(applying, {url: 'https://example.com/growth-guide',
    revision: 'abc123'}, '2026-08-01T09:01:00.000Z');
  const monitoring = transition(applied, 'start_monitoring',
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
  const turkish = {...opportunity, clusterId: 'articles', label: 'Almanca artikeller',
    targetPath: '/tr/blog/almanca-artikeller'};
  const workflow = syncWorkflows('project-1', {opportunities: [turkish]})[0];
  assert.match(workflow.brief.changes[0].proposed, /Kurallar, Mantık ve Örnekler/u);
});
