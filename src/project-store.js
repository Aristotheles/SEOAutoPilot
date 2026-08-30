'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {publicConnection} = require('./deployment');

const DATA_DIR = process.env.SEO_AUTOPILOT_DATA_DIR ?
  path.resolve(process.env.SEO_AUTOPILOT_DATA_DIR) : path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'projects.json');
const starterProject = Object.freeze({
  id: 'lingodecoder', name: 'LingoDecoder', siteUrl: 'https://lingodecoder.de',
  searchConsoleProperty: 'sc-domain:lingodecoder.de', locales: ['tr', 'en'],
  status: 'active', createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z', csvDirectory: '', oauth: null,
  lastSyncAt: null, lastSyncReport: null, workflows: [], deployment: null,
});

function initialState() { return {schemaVersion: 1, projects: [{...starterProject}]}; }
function readState() {
  if (!fs.existsSync(STATE_FILE)) return initialState();
  try {
    const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return Array.isArray(value.projects) ? value : initialState();
  } catch (_) { return initialState(); }
}
function writeState(state) {
  fs.mkdirSync(DATA_DIR, {recursive: true});
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`,
      {encoding: 'utf8', mode: 0o600});
  fs.renameSync(temporary, STATE_FILE);
}
function publicProject(project) {
  const {oauth, lastSyncReport, workflows, deployment, ...safe} = project;
  return {...safe, connection: oauth?.refreshToken ? 'connected' : 'disconnected',
    hasReport: Boolean(lastSyncReport || project.csvDirectory),
    deployment: publicConnection(deployment)};
}
function listProjects() { return readState().projects.map(publicProject); }
function getProject(id, {includeSecrets = false} = {}) {
  const project = readState().projects.find((item) => item.id === id);
  if (!project) return null;
  return includeSecrets ? project : publicProject(project);
}
function createProject(input) {
  const name = String(input.name || '').trim();
  const siteUrl = String(input.siteUrl || '').trim().replace(/\/$/u, '');
  if (name.length < 2) throw new Error('Proje adı en az 2 karakter olmalı.');
  let hostname;
  try { hostname = new URL(siteUrl).hostname; } catch (_) {
    throw new Error('Geçerli bir site adresi gir. Örnek: https://example.com');
  }
  const state = readState();
  if (state.projects.some((item) => item.siteUrl === siteUrl)) {
    throw new Error('Bu site için zaten bir proje bulunuyor.');
  }
  const baseId = name.toLocaleLowerCase('tr').normalize('NFKD')
      .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'project';
  const id = `${baseId}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const project = {id, name, siteUrl,
    searchConsoleProperty: `sc-domain:${hostname.replace(/^www\./u, '')}`,
    locales: Array.isArray(input.locales) && input.locales.length ? input.locales : ['tr'],
    status: 'active', createdAt: now, updatedAt: now, csvDirectory: '', oauth: null,
    lastSyncAt: null, lastSyncReport: null, workflows: [], deployment: null};
  state.projects.push(project);
  writeState(state);
  return publicProject(project);
}
function updateProject(id, updates) {
  const state = readState();
  const index = state.projects.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Proje bulunamadı.');
  const allowed = ['name', 'siteUrl', 'searchConsoleProperty', 'locales',
    'csvDirectory', 'oauth', 'lastSyncAt', 'lastSyncReport', 'workflows', 'deployment'];
  const clean = Object.fromEntries(Object.entries(updates)
      .filter(([key]) => allowed.includes(key)));
  state.projects[index] = {...state.projects[index], ...clean,
    updatedAt: new Date().toISOString()};
  writeState(state);
  return publicProject(state.projects[index]);
}
function getPrivateProject(id) { return getProject(id, {includeSecrets: true}); }

function assertProjectIdle(project) {
  if (!project) throw new Error('Proje bulunamadı.');
  if ((project.workflows || []).some((item) => ['APPLYING', 'PUBLISHING'].includes(item.status))) {
    throw new Error('Bu projede önizleme veya yayın işlemi sürüyor. Tamamlanmadan bağlantı/proje kaldırılamaz.');
  }
}
function removeProject(id) {
  const state = readState();
  const project = state.projects.find((item) => item.id === id);
  assertProjectIdle(project);
  state.projects = state.projects.filter((item) => item.id !== id);
  writeState(state);
}
function clearAllOAuth() {
  const state = readState();
  for (const project of state.projects) project.oauth = null;
  writeState(state);
}

module.exports = {assertProjectIdle, clearAllOAuth, createProject, getPrivateProject,
  getProject, listProjects, publicProject, removeProject, updateProject};
