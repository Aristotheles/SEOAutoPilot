'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-projects-'));
process.env.SEO_AUTOPILOT_DATA_DIR = directory;
const store = require('../src/project-store');

test.after(() => fs.rmSync(directory, {recursive: true, force: true}));

test('creates and isolates multiple SEO projects', () => {
  const created = store.createProject({name: 'Example Commerce', siteUrl: 'https://shop.example.com'});
  const projects = store.listProjects();
  assert.equal(projects.length, 2);
  assert.equal(created.searchConsoleProperty, 'sc-domain:shop.example.com');
  assert.equal(projects[0].id, 'lingodecoder');
  assert.equal(projects[1].id, created.id);
});

test('never exposes OAuth tokens in public project objects', () => {
  const project = store.listProjects()[1];
  store.updateProject(project.id, {oauth: {refreshToken: 'private-token'}});
  const publicValue = store.getProject(project.id);
  const privateValue = store.getPrivateProject(project.id);
  assert.equal(publicValue.oauth, undefined);
  assert.equal(publicValue.connection, 'connected');
  assert.equal(privateValue.oauth.refreshToken, 'private-token');
});

test('stores deployment connections per project without exposing the requested alias', () => {
  const project = store.listProjects()[1];
  store.updateProject(project.id, {deployment: {source: 'local_git',
    requestedPath: 'C:\\Alias', repositoryPath: 'C:\\RealRepo', branch: 'main',
    provider: 'firebase_hosting'}});
  const publicValue = store.getProject(project.id);
  assert.equal(publicValue.deployment.repositoryPath, 'C:\\RealRepo');
  assert.equal(publicValue.deployment.requestedPath, undefined);
  assert.equal(store.getProject('lingodecoder').deployment, null);
});
