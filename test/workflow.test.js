'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {STATUS, priorityFor, syncWorkflows, transition} = require('../src/workflow');

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
  const monitoring = transition(approved, 'start_monitoring');
  assert.equal(transition(monitoring, 'complete').status, STATUS.completed);
});
