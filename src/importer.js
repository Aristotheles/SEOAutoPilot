'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {parseCsv} = require('./csv');
const {analyzeExport} = require('./engine');

const FILES = Object.freeze({
  chart: ['Grafik.csv','Chart.csv','Diagramm.csv'],
  queries: ['Sorgular.csv','Queries.csv','Suchanfragen.csv'],
  pages: ['Sayfa sayısı.csv','Pages.csv','Seiten.csv'],
  devices: ['Cihazlar.csv','Devices.csv','Geräte.csv'],
  countries: ['Ülkeler.csv','Countries.csv','Länder.csv'],
  filters: ['Filtreler.csv','Filters.csv','Filter.csv'],
  searchAppearance: ['Arama görünümü.csv','Search appearance.csv','Darstellung in der Suche.csv'],
});

function readTable(directory, fileNames) {
  const names=Array.isArray(fileNames)?fileNames:[fileNames];
  const selected=names.find(fileName=>fs.existsSync(path.join(directory,fileName)));
  return selected ? parseCsv(fs.readFileSync(path.join(directory,selected), 'utf8')) : [];
}

function loadExport(directory, options = {}) {
  const resolved = path.resolve(directory);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    const error = new Error('Search Console klasörü bulunamadı.');
    error.code = 'EXPORT_NOT_FOUND';
    throw error;
  }
  const tables = Object.fromEntries(Object.entries(FILES).map(
      ([key, fileName]) => [key, readTable(resolved, fileName)]));
  if (!tables.chart.length && !tables.queries.length && !tables.pages.length) {
    const error = new Error('Klasörde tanınan Search Console CSV dosyası yok.');
    error.code = 'INVALID_EXPORT';
    throw error;
  }
  return {report: analyzeExport(tables, options), tables, directory: resolved};
}

module.exports = {FILES, loadExport, readTable};
