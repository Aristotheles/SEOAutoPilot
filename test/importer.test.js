'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {loadExport} = require('../src/importer');
const {CLUSTERS} = require('../src/legacy-preset');

test('loads a Search Console directory into the shared report model', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-autopilot-'));
  context.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Grafik.csv'),
      'Tarih,Tıklamalar,Gösterimler,TO,Konum\n2026-08-29,2,20,"10%",12\n');
  fs.writeFileSync(path.join(directory, 'Sorgular.csv'),
      'En çok yapılan sorgular,Tıklamalar,Gösterimler,TO,Konum\nalmanca artikeller,2,20,"10%",12\n');
  fs.writeFileSync(path.join(directory, 'Sayfa sayısı.csv'),
      'En çok görüntülenen sayfalar,Tıklamalar,Gösterimler,TO,Konum\nhttps://lingodecoder.de/tr/blog/almanca-artikeller-der-die-das,2,20,"10%",12\n');

  const result = loadExport(directory, {clusters:CLUSTERS});
  assert.equal(result.report.summary.clicks, 2);
  assert.equal(result.report.summary.impressions, 20);
  assert.equal(result.report.opportunities[0].clusterId, 'artikel_tr');
  assert.equal(result.directory, path.resolve(directory));
});

test('rejects a directory without recognized Search Console files', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-autopilot-empty-'));
  context.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  assert.throws(() => loadExport(directory), {code: 'INVALID_EXPORT'});
});

test('accepts English and German Search Console export filenames', (context) => {
  for(const [chart,pages] of [['Chart.csv','Pages.csv'],['Diagramm.csv','Seiten.csv']]){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'seo-localized-'));
    context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    fs.writeFileSync(path.join(directory,chart),'Date,Clicks,Impressions,CTR,Position\n2026-08-01,1,20,5%,10\n');
    fs.writeFileSync(path.join(directory,pages),'Page,Clicks,Impressions,CTR,Position\nhttps://example.com/guide,1,20,5%,10\n');
    assert.equal(loadExport(directory).report.summary.impressions,20);
  }
});
