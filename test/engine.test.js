'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {ACTION, analyzeExport:analyzeGeneric, clusterForQuery:findCluster, confidenceFor} =
  require('../src/engine');
const {CLUSTERS} = require('../src/legacy-preset');
const analyzeExport = (tables, options = {clusters:CLUSTERS}) => analyzeGeneric(tables, options);
const clusterForQuery = query => findCluster(query, CLUSTERS);

const headers = ['Anahtar', 'Tıklamalar', 'Gösterimler', 'TO', 'Pozisyon'];

test('matches current LingoDecoder query clusters', () => {
  assert.equal(clusterForQuery('almanca artikel bulucu').id, 'artikel_tr');
  assert.equal(clusterForQuery('almanca cümle kurma sırası').id,
      'sentence_structure_tr');
  assert.equal(clusterForQuery('german grammar sentence structure').id,
      'sentence_structure_en');
  assert.equal(clusterForQuery('how difficult is german').id, 'difficulty_en');
  assert.equal(clusterForQuery('unrelated query'), null);
});

test('downgrades confidence while the active period is shorter than a week', () => {
  assert.equal(confidenceFor(40, 6), 'low');
  assert.equal(confidenceFor(40, 7), 'medium');
});

test('recommends updating an existing low-ranking page instead of a new page', () => {
  const report = analyzeExport({
    chart: [headers, ['2026-08-25', '3', '104', '2.88%', '63.85']],
    queries: [headers, ['almanca artikel bulucu', '0', '40', '0%', '90']],
    pages: [headers, [
      'https://lingodecoder.de/tr/blog/almanca-artikeller-der-die-das',
      '0', '40', '0%', '84.3',
    ]],
  });
  const article = report.opportunities.find((item) =>
    item.clusterId === 'artikel_tr');
  assert.equal(article.action, ACTION.updateExisting);
  assert.equal(article.pageMetrics.impressions, 40);
  assert.equal(report.summary.impressions, 104);
});

test('holds a promising position when the sample is too small', () => {
  const report = analyzeExport({
    chart: [headers, ['2026-08-25', '0', '2', '0%', '7.5']],
    queries: [headers],
    pages: [headers, [
      'https://lingodecoder.de/en/blog/is-german-hard',
      '0', '2', '0%', '7.5',
    ]],
  });
  const difficulty = report.opportunities.find((item) =>
    item.clusterId === 'difficulty_en');
  assert.equal(difficulty.action, ACTION.hold);
  assert.equal(difficulty.confidence, 'very_low');
});

test('preserves exact query and chart rows for the dashboard', () => {
  const report = analyzeExport({
    chart: [['Tarih', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'],
      ['29.08.2026', '2', '20', '10%', '12']],
    queries: [['Sorgu', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'],
      ['almanca artikeller', '2', '20', '10%', '12']],
    pages: [], devices: [], countries: [],
  });
  assert.deepEqual(report.details.series[0], {
    date: '29.08.2026', clicks: 2, impressions: 20, ctr: .1, position: 12,
  });
  assert.equal(report.details.queries[0].query, 'almanca artikeller');
  assert.equal(report.details.queries[0].clusterId, 'artikel_tr');
  assert.equal(report.details.queries[0].impressions, 20);
});

test('creates page-based opportunities for a generic project', () => {
  const report = analyzeExport({chart: [], queries:[['Sorgu','Tıklamalar','Gösterimler','TO','Konum'],['growth guide tactics','1','30','3%','20']],
    pages: [['Sayfa', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'],
      ['https://example.com/growth-guide', '1', '50', '2%', '34']],
    devices: [], countries: []}, {clusters: []});
  assert.equal(report.opportunities.length, 1);
  assert.equal(report.opportunities[0].label, 'Growth Guide');
  assert.equal(report.opportunities[0].action, 'UPDATE_EXISTING');
  assert.equal(report.opportunities[0].targetPath, '/growth-guide');
  assert.deepEqual(report.opportunities[0].matchedQueries,['growth guide tactics']);
  assert.equal(report.opportunities[0].queryEvidence,'url_token_match');
});
