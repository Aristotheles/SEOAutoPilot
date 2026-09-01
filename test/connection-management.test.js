'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-removal-test-'));
process.env.SEO_AUTOPILOT_DATA_DIR = directory;
const store = require('../src/project-store');
const google = require('../src/google-search-console');
const management = require('../src/connection-management');
test.after(() => fs.rmSync(directory, {recursive: true, force: true}));

test('disconnect invalidates pending callbacks and in-flight requests for only that project', () => {
  google.saveConfig({clientId: 'test-client', clientSecret: 'test-secret'});
  const project = store.createProject({name: 'Disconnect Test', siteUrl: 'https://disconnect.example'});
  store.updateProject(project.id, {oauth: {refreshToken: 'test-token'}, lastSyncReport: {source: 'test'}});
  const old = google.generationFor(project.id);
  const other = google.generationFor('lingodecoder');
  const url = new URL(google.createAuthorizationUrl(project.id, 'http://127.0.0.1/callback'));
  management.disconnectGoogle(project.id, project.id);
  assert.equal(store.getPrivateProject(project.id).oauth, null);
  assert.equal(store.getPrivateProject(project.id).lastSyncReport.source, 'test');
  assert.throws(() => google.assertGeneration(project.id, old), /kaldırıldı/u);
  assert.throws(() => google.consumeState(url.searchParams.get('state')), /geçersiz/u);
  assert.doesNotThrow(() => google.assertGeneration('lingodecoder', other));
});

test('global removal clears tokens and persists disabled state even with environment credentials', () => {
  process.env.GOOGLE_CLIENT_ID = 'env-id'; process.env.GOOGLE_CLIENT_SECRET = 'env-secret';
  const selected=store.listProjects()[0];store.updateProject(selected.id, {oauth: {refreshToken: 'test-token'}});
  const old = google.generationFor(selected.id);
  assert.throws(() => management.removeGoogleConfig('wrong'), /onay/u);
  assert.equal(google.configStatus().configured, true);
  management.removeGoogleConfig('REMOVE_GOOGLE_CONFIG');
  assert.equal(google.configStatus().configured, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'google-oauth.json'), 'utf8')), {disabled: true});
  assert.equal(store.getPrivateProject(selected.id).oauth, null);
  assert.throws(() => google.assertGeneration(selected.id, old), /kaldırıldı/u);
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
  google.saveConfig({clientId: 'new-client', clientSecret: 'new-secret'});
  assert.equal(google.configStatus().configured, true);
});

test('removal endpoints require confirmation, isolate projects, preserve files and handle no projects', async () => {
  const server = spawn(process.execPath, ['server.js'], {cwd: path.join(__dirname, '..'),
    env: {...process.env, PORT: '43179', SEO_AUTOPILOT_DATA_DIR: directory}, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test server timeout')), 10000);
      server.stdout.on('data', chunk => {const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if(match){clearTimeout(timeout);resolve(match[0]);}});
      server.once('error', error => {clearTimeout(timeout);reject(error);});
    });
    async function request(url, method = 'GET', body, origin) {
      const response = await fetch(base + url, {method, headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
      return {status: response.status, body: await response.json()};
    }
    const created = await request('/api/projects', 'POST', {name: 'Wrong Site', siteUrl: 'https://wrong.example'});
    const id = created.body.project.id;
    const marker = path.join(directory, 'user-source.txt'); fs.writeFileSync(marker, 'keep');
    store.updateProject(id, {deployment: {repositoryPath: directory}, oauth: {refreshToken: 'secret-token'}, workflows: [{id: 'task', status: 'PREVIEW_READY', execution: {branch: 'old-site'}, events: []}]});
    const uri = `/api/projects/${id}`;
    assert.equal((await request(uri, 'DELETE', {})).status, 400);
    assert.equal((await request(uri, 'DELETE', {confirmation: id}, 'https://attacker.example')).status, 403);
    assert.equal((await request(uri + '/deployment', 'DELETE', {confirmation: id})).status, 200);
    const disconnected = store.getPrivateProject(id);
    assert.equal(disconnected.deployment, null);
    assert.equal(disconnected.workflows[0].status, 'APPROVED');
    assert.equal(disconnected.workflows[0].execution, null);
    assert.equal((await request(uri + '/workflows/task/publish', 'POST', {})).status, 400);
    assert.equal((await request(uri + '/google', 'DELETE', {confirmation: id})).status, 200);
    assert.equal(store.getPrivateProject(id).oauth, null);
    store.updateProject(id, {workflows: [{id: 'task', status: 'PUBLISHING'}]});
    assert.equal((await request(uri, 'DELETE', {confirmation: id})).status, 400);
    assert.equal((await request(uri + '/deployment', 'DELETE', {confirmation: id})).status, 400);
    store.updateProject(id, {workflows: []});
    assert.equal((await request(uri, 'DELETE', {confirmation: id})).status, 200);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'keep');
    assert.ok(store.listProjects().length>=1);
    assert.equal((await request('/api/google/config', 'DELETE', {confirmation: 'wrong'})).status, 400);
    assert.equal((await request('/api/google/config', 'DELETE', {confirmation: 'REMOVE_GOOGLE_CONFIG'})).body.configured, false);
    for (const p of store.listProjects()) assert.equal((await request(`/api/projects/${p.id}`, 'DELETE', {confirmation: p.id})).status, 200);
    assert.deepEqual((await request('/api/projects')).body.projects, []);
    assert.deepEqual((await request('/api/projects')).body.projects, []);
    assert.equal((await request('/api/projects', 'POST', {name: 'New Start', siteUrl: 'https://new.example'})).status, 201);
  } finally {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await stopped;
  }
});
