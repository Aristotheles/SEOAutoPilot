import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {parseCsv} = require('../src/csv');
const {analyzeExport} = require('../src/engine');

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

const args = process.argv.slice(2);
const directory = args[0] ? path.resolve(args[0]) : null;
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 && args[outputIndex + 1] ?
  path.resolve(args[outputIndex + 1]) : null;

if (!directory || !fs.existsSync(directory) ||
    !fs.statSync(directory).isDirectory()) {
  console.error('Kullanım: npm run analyze -- <Search Console klasörü> ' +
    '[--output reports/report.json]');
  process.exit(1);
}

const tables = Object.fromEntries(Object.entries(FILES).map(
    ([key, fileName]) => [key, readTable(directory, fileName)]));
const report = analyzeExport(tables);
const json = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, json, 'utf8');
  console.log(`SEO MVP raporu yazıldı: ${outputPath}`);
} else {
  process.stdout.write(json);
}
