'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {parseCsv} = require('./csv');
const {analyzeExport} = require('./engine');

const FILES = Object.freeze({
  chart: 'Grafik.csv',
  queries: 'Sorgular.csv',
  pages: 'Sayfa sayısı.csv',
  devices: 'Cihazlar.csv',
  countries: 'Ülkeler.csv',
  filters: 'Filtreler.csv',
  searchAppearance: 'Arama görünümü.csv',
});

function readTable(directory, fileName) {
  const filePath = path.join(directory, fileName);
  return fs.existsSync(filePath) ? parseCsv(fs.readFileSync(filePath, 'utf8')) : [];
}

function loadExport(directory) {
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
  return {report: analyzeExport(tables), tables, directory: resolved};
}

module.exports = {FILES, loadExport, readTable};
