import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const {loadExport} = require('../src/importer');

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

const {report} = loadExport(directory);
const json = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, json, 'utf8');
  console.log(`SEO MVP raporu yazıldı: ${outputPath}`);
} else {
  process.stdout.write(json);
}
