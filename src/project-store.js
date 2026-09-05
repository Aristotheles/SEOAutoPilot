'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {publicConnection} = require('./deployment');
const {defaultProfile, normalizeProfile} = require('./site-profile');
const {LINGO_BACKLOG} = require('./seo-backlog');
const {decrypt, encrypt, secureWriteFile} = require('./security');

const DATA_DIR = process.env.SEO_AUTOPILOT_DATA_DIR ?
  path.resolve(process.env.SEO_AUTOPILOT_DATA_DIR) : path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'projects.json');
const LOCK_FILE = path.join(DATA_DIR, 'projects.lock');
const LOCK_TIMEOUT_MS = 30000;
function migrateProject(project) {
  if (project.profile) return project;
  const profile = defaultProfile(project);
  // A migration of an existing known project, not a rule for newly connected sites.
  if (project.id === 'lingodecoder' && project.siteUrl === 'https://lingodecoder.de') {
    profile.analysisPreset = 'legacy_lingodecoder';
    profile.editorialBacklog = LINGO_BACKLOG;
    profile.languageRoutes = [{prefix:'/tr/', language:'tr'}, {prefix:'/en/', language:'en'}];
  }
  return {...project, profile};
}
function initialState() { return {schemaVersion: 2, projects: []}; }
function protectProject(project) {
  if (!project.oauth) return project;
  const oauth = {...project.oauth};
  if (Object.hasOwn(oauth, 'accessToken')) oauth.accessToken = encrypt(oauth.accessToken, DATA_DIR);
  if (Object.hasOwn(oauth, 'refreshToken')) oauth.refreshToken = encrypt(oauth.refreshToken, DATA_DIR);
  return {...project, oauth};
}
function revealProject(project) {
  if (!project.oauth) return project;
  const oauth = {...project.oauth};
  if (Object.hasOwn(oauth, 'accessToken')) oauth.accessToken = decrypt(oauth.accessToken, DATA_DIR);
  if (Object.hasOwn(oauth, 'refreshToken')) oauth.refreshToken = decrypt(oauth.refreshToken, DATA_DIR);
  return {...project, oauth};
}
function readState() {
  if (!fs.existsSync(STATE_FILE)) return initialState();
  let value;
  try {
    value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) { throw new Error('Proje veri dosyası okunamıyor. Dosya korunuyor; otomatik sıfırlama yapılmadı.'); }
  if (!Array.isArray(value.projects) || value.projects.some(p => !p || typeof p.id !== 'string') ||
      new Set(value.projects.map(p=>p.id)).size !== value.projects.length ||
      ![1,2].includes(value.schemaVersion)) throw new Error('Proje veri şeması geçersiz veya desteklenmiyor; dosya korunuyor.');
  if (value.schemaVersion === 1) {
    const migrated = {...value, schemaVersion:2, projects:value.projects.map(migrateProject)};
    const backup = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(backup, {recursive:true});
    fs.writeFileSync(path.join(backup, `projects-v1-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`),
      fs.readFileSync(STATE_FILE), {mode:0o600, flag:'wx'});
    writeState(migrated);
    return migrated;
  }
  if (value.projects.some(p=>!p.profile || p.profile.version !== 1 || !Array.isArray(p.profile.languages))) throw new Error('Site profili veri şeması geçersiz; dosya korunuyor.');
  return {...value, projects: value.projects.map(revealProject)};
}
function writeState(state) {
  const protectedState = {...state, projects: state.projects.map(protectProject)};
  secureWriteFile(STATE_FILE, `${JSON.stringify(protectedState, null, 2)}\n`);
}
function withStateLock(operation) {
  fs.mkdirSync(DATA_DIR, {recursive:true});
  const started=Date.now();let handle;
  while(!handle){
    try{handle=fs.openSync(LOCK_FILE,'wx',0o600);fs.writeFileSync(handle,`${process.pid}\n${Date.now()}\n`);}
    catch(error){
      const transient=error.code==='EEXIST' ||
        (process.platform==='win32' && (error.code==='EPERM' || error.code==='EACCES'));
      if(!transient)throw error;
      try{if(Date.now()-fs.statSync(LOCK_FILE).mtimeMs>30000)fs.unlinkSync(LOCK_FILE);}catch{ /* another process released it */ }
      if(Date.now()-started>=LOCK_TIMEOUT_MS)throw new Error('Proje verisi başka bir işlem tarafından kullanılıyor. Birkaç saniye sonra yeniden dene.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,12);
    }
  }
  try{return operation();}
  finally{try{fs.closeSync(handle);}finally{try{fs.unlinkSync(LOCK_FILE);}catch(error){if(error.code!=='ENOENT')throw error;}}}
}
function mutateState(mutator) {
  return withStateLock(()=>{const state=readState();const result=mutator(state);writeState(state);return result;});
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
  try { const parsed = new URL(siteUrl); if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw new Error(); hostname = parsed.hostname; } catch (_) {
    throw new Error('Geçerli bir site adresi gir. Örnek: https://example.com');
  }
  const baseId = name.toLocaleLowerCase('tr').normalize('NFKD')
      .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'project';
  const id = `${baseId}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const project = {id, name, siteUrl,
    searchConsoleProperty: `sc-domain:${hostname.replace(/^www\./u, '')}`,
    locales: [],
    status: 'active', createdAt: now, updatedAt: now, csvDirectory: '', oauth: null,
    lastSyncAt: null, lastSyncReport: null, workflows: [], deployment: null};
  project.profile = defaultProfile(project);
  return mutateState((state)=>{
    if(state.projects.some((item)=>item.siteUrl===siteUrl))throw new Error('Bu site için zaten bir proje bulunuyor.');
    state.projects.push(project);return publicProject(project);
  });
}
function updateProject(id, updates) {
  const allowed = ['name', 'siteUrl', 'searchConsoleProperty',
    'csvDirectory', 'oauth', 'lastSyncAt', 'lastSyncReport', 'workflows', 'deployment', 'bulkPublish'];
  const clean = Object.fromEntries(Object.entries(updates)
      .filter(([key]) => allowed.includes(key)));
  return mutateState((state)=>{
    const index=state.projects.findIndex((item)=>item.id===id);
    if(index<0)throw new Error('Proje bulunamadı.');
    state.projects[index]={...state.projects[index],...clean,updatedAt:new Date().toISOString()};
    return publicProject(state.projects[index]);
  });
}
function saveProfile(id, input, expectedRevision) {
  return mutateState((state)=>{
    const index=state.projects.findIndex(p=>p.id===id);const project=state.projects[index];
    assertProjectIdle(project);
    if(expectedRevision!==project.profile.revision)throw new Error('Profil başka bir işlemde değişti. Sayfayı yenileyip tekrar dene.');
    const profile=normalizeProfile(input,project);const now=new Date().toISOString();
    const workflows=(project.workflows||[]).map(workflow=>{
      if(workflow.execution?.appliedAt||['PUBLISHED','MONITORING','COMPLETED','APPLIED'].includes(workflow.status))return workflow;
      return {...workflow,status:workflow.status==='PLANNED'?'PLANNED':'AWAITING_APPROVAL',approvedAt:null,execution:null,profileRevision:null,updatedAt:now,
        events:[...(workflow.events||[]),{type:'PROFILE_CHANGED',actor:'system',at:now,label:'Site profili değişti; eski taslak ve önizleme onayı geçersizleşti.'}]};
    });
    state.projects[index]={...project,profile,locales:profile.languages,workflows,updatedAt:now};
    return publicProject(state.projects[index]);
  });
}
function getPrivateProject(id) { return getProject(id, {includeSecrets: true}); }
function protectStoredSecrets() {
  if (!fs.existsSync(STATE_FILE)) return;
  withStateLock(() => writeState(readState()));
}

function assertProjectIdle(project) {
  if (!project) throw new Error('Proje bulunamadı.');
  if(project.bulkPublish?.status==='running')throw new Error('Toplu yayın sürüyor. Tamamlanmasını bekle.');
  if ((project.workflows || []).some((item) => ['APPLYING', 'PUBLISHING'].includes(item.status))) {
    throw new Error('Bu projede önizleme veya yayın işlemi sürüyor. Tamamlanmadan bağlantı/proje kaldırılamaz.');
  }
}
function removeProject(id) {
  mutateState((state)=>{const project=state.projects.find((item)=>item.id===id);assertProjectIdle(project);state.projects=state.projects.filter((item)=>item.id!==id);});
}
function clearAllOAuth() {
  mutateState((state)=>{for(const project of state.projects)project.oauth=null;});
}

module.exports = {assertProjectIdle, clearAllOAuth, createProject, getPrivateProject,
  getProject, listProjects, protectStoredSecrets, publicProject, removeProject, updateProject,
  saveProfile};
