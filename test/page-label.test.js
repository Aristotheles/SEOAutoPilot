'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {pageLabel, normalizeReport} = require('../src/page-label');
const {analyzeExport} = require('../src/engine');
const {syncWorkflows, transition} = require('../src/workflow');

test('URL display labels omit HTML extensions without corrupting Unicode or internal dots', () => {
  assert.equal(pageLabel('/blog/german-b1-vs-b2.html'), 'German B1 Vs B2');
  assert.equal(pageLabel('/blog/version-1.2.HTML?x=1#intro'), 'Version 1.2');
  assert.equal(pageLabel('/blog/aral%C4%B1kl%C4%B1-tekrar.htm'), 'Aralıklı Tekrar');
  assert.equal(pageLabel('/'), 'Ana Sayfa');
  assert.doesNotThrow(() => pageLabel('/bad%ZZ.html'));
});

test('fresh analysis and cached reports produce clean labels while preserving exact URLs', () => {
  const url = 'https://example.com/blog/german-b1-vs-b2.html';
  const report = analyzeExport({chart: [], queries: [], pages: [
    ['Sayfa', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], [url, '0', '50', '0%', '34']],
  devices: [], countries: []}, {clusters: []});
  const item = report.opportunities[0];
  assert.equal(item.label, 'German B1 Vs B2');
  assert.equal(item.targetPath, '/blog/german-b1-vs-b2.html');
  assert.equal(item.pageMetrics.url, url);
  const cached = {...report, opportunities: [{...item, label: 'German B1 Vs B2.Html'}]};
  assert.equal(normalizeReport(cached).opportunities[0].label, item.label);
  assert.equal(cached.opportunities[0].label, 'German B1 Vs B2.Html');
  for (const action of ['UPDATE_EXISTING', 'CTR_TEST']) {
    const data = {opportunities: [{...cached.opportunities[0], action, locale:'en'}]};
    const current = syncWorkflows('example', data)[0];
    assert.ok(current.brief.changes.every(c => !/\.html/i.test(c.proposed)));
    assert.equal(current.targetPath, item.targetPath);
    const old = {...transition(current, 'approve'), title: 'German B1 Vs B2.Html'};
    const repaired = syncWorkflows('example', data, [old])[0];
    assert.equal(repaired.id, old.id);
    assert.equal(repaired.status, 'AWAITING_APPROVAL');
    assert.equal(repaired.approvedAt, null);
    assert.equal(repaired.events.at(-1).type, 'LABEL_REPAIRED');
    assert.equal(syncWorkflows('example', data, [repaired])[0].events.length, repaired.events.length);
    const published = {...old, execution: {appliedAt: '2026-08-30'}, status: 'PUBLISHED'};
    assert.deepEqual(syncWorkflows('example', data, [published])[0], published);
  }
});
