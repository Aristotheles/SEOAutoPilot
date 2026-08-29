'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const {loadExport} = require('./src/importer');
const {demoReport} = require('./src/demo-report');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
let selectedDirectory = process.env.SEO_DATA_DIR || '';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
});

function json(response, status, body) {
  response.writeHead(status, {'Content-Type': MIME['.json'], 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(body));
}

function currentReport(directory = selectedDirectory) {
  if (!directory) return {report: demoReport, directory: '', mode: 'demo'};
  const loaded = loadExport(directory);
  selectedDirectory = loaded.directory;
  return {...loaded, mode: 'live'};
}

function serveStatic(requestUrl, response) {
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()) {
    json(response, 404, {error: 'Dosya bulunamadı.'});
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    json(response, 200, {ok: true, app: 'SEOAutoPilot', version: '0.2.0'});
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/report') {
    try {
      const directory = requestUrl.searchParams.get('directory') || selectedDirectory;
      const result = currentReport(directory);
      json(response, 200, {report: result.report, mode: result.mode,
        directory: result.directory || ''});
    } catch (error) {
      json(response, 400, {error: error.message, code: error.code || 'IMPORT_FAILED'});
    }
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/import') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) request.destroy();
    });
    request.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (typeof payload.directory !== 'string' || !payload.directory.trim()) {
          throw new Error('Klasör yolu gerekli.');
        }
        const result = currentReport(payload.directory.trim());
        json(response, 200, {report: result.report, mode: result.mode,
          directory: result.directory});
      } catch (error) {
        json(response, 400, {error: error.message, code: error.code || 'IMPORT_FAILED'});
      }
    });
    return;
  }
  if (request.method === 'GET') serveStatic(requestUrl, response);
  else json(response, 405, {error: 'Bu yöntem desteklenmiyor.'});
});

server.listen(PORT, HOST, () => {
  console.log(`SEOAutoPilot hazır: http://${HOST}:${PORT}`);
  if (selectedDirectory) console.log(`Veri klasörü: ${selectedDirectory}`);
});
