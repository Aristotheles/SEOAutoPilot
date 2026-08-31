'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const {loadExport} = require('./src/importer');
const {analyzeExport} = require('./src/engine');
const {normalizeReport} = require('./src/page-label');
const {createProject, getPrivateProject, listProjects, updateProject, saveProfile} =
  require('./src/project-store');
const google = require('./src/google-search-console');
const {analysisOptions, reanalyzeReport, assertProfileWorkflow} = require('./src/profile-analysis');
const connections = require('./src/connection-management');
const {inspectSite,profileFromInspection} = require('./src/site-inspection');
const inspections = new Map();
const deployment = require('./src/deployment');
const {mergeEditorialBacklog} = require('./src/seo-backlog');
const {beginExecution, beginPublish, failExecution, finishExecution, finishPublish,
  syncWorkflows, transition} = require('./src/workflow');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = Object.freeze({'.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8'});

function json(response, status, body) {
  response.writeHead(status, {'Content-Type': MIME['.json'], 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 64_000) reject(new Error('İstek çok büyük.')); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (_) { reject(new Error('Geçersiz JSON.')); } });
    request.on('error', reject);
  });
}
function trustedLocalOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}`;
}
function dateValue(date) { return date.toISOString().slice(0, 10); }
function emptyReport(project) {
  return {schemaVersion: 1, generatedAt: new Date().toISOString(), source: 'empty',
    project: {name: project.name, siteUrl: project.siteUrl},
    summary: {clicks: 0, impressions: 0, ctr: 0, position: 0, activeDays: 0,
      displayedQueryImpressions: 0, pageImpressions: 0},
    details: {series: [], queries: [], pages: [], devices: [], countries: []},
    opportunities: [], unclusteredQueries: []};
}
function projectReport(project) {
  if (project.lastSyncReport) return {report: normalizeReport(reanalyzeReport(project.lastSyncReport, project)), directory: '', mode: 'api'};
  if (project.csvDirectory) {
    const loaded = loadExport(project.csvDirectory,
        analysisOptions(project));
    return {report: loaded.report, directory: loaded.directory, mode: 'live'};
  }
  return {report: emptyReport(project), directory:'', mode:'empty'};
}
function projectWorkflows(projectId, report, existing = []) {
  const profile = getPrivateProject(projectId)?.profile;
  return mergeEditorialBacklog(projectId, syncWorkflows(projectId, report, existing, profile), existing, profile);
}
function serveStatic(requestUrl, response) {
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return json(response, 404, {error: 'Dosya bulunamadı.'});
  }
  response.writeHead(200, {'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache'});
  fs.createReadStream(filePath).pipe(response);
}
function projectIdFrom(pathname, suffix) {
  const match = pathname.match(new RegExp(`^/api/projects/([^/]+)/${suffix}$`, 'u'));
  return match ? decodeURIComponent(match[1]) : null;
}
function updateWorkflow(projectId, workflowId, transform) {
  const project = getPrivateProject(projectId);
  if (!project) throw new Error('Proje bulunamadı.');
  const workflows = [...(project.workflows || [])];
  const index = workflows.findIndex((item) => item.id === workflowId);
  if (index < 0) throw new Error('Görev bulunamadı.');
  workflows[index] = transform(workflows[index], project);
  updateProject(project.id, {workflows});
  return workflows[index];
}
function runPreviewJob(projectId, workflowId) {
  setImmediate(async () => {
    try {
      const project = getPrivateProject(projectId);
      const workflow = project.workflows.find((item) => item.id === workflowId);
      const output = await deployment.preparePreview(workflow, project.deployment);
      updateWorkflow(projectId, workflowId, (current) => finishExecution(current, output));
    } catch (error) {
      try { updateWorkflow(projectId, workflowId, (current) => failExecution(current, error.message)); }
      catch (_) { /* project may have been removed while the job ran */ }
    }
  });
}
function runPublishJob(projectId, workflowId) {
  setImmediate(async () => {
    try {
      const project = getPrivateProject(projectId);
      const workflow = project.workflows.find((item) => item.id === workflowId);
      const output = await deployment.publishPreview(workflow, project.deployment,
          project.siteUrl);
      updateWorkflow(projectId, workflowId, (current) => finishPublish(current, output));
    } catch (error) {
      try { updateWorkflow(projectId, workflowId, (current) => failExecution(current, error.message)); }
      catch (_) { /* project may have been removed while the job ran */ }
    }
  });
}
async function routeApi(request, response, requestUrl) {
  const inspectionRoute=requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/inspection(?:\/(accept))?$/);
  if(inspectionRoute){
    const id=decodeURIComponent(inspectionRoute[1]);
    try {
      const project=getPrivateProject(id);if(!project)throw Error('Proje bulunamadı.');
      if(request.method==='POST'&&inspectionRoute[2]==='accept'){
        const input=await readBody(request);const job=inspections.get(id);
        if(job?.status!=='complete'||input.scannedAt!==job.result.scannedAt)throw Error('Önce site incelemesini tamamla.');
        const profile=profileFromInspection(project,job.result,input.primaryLanguage);
        json(response,200,{project:saveProfile(id,profile,job.result.profileRevision)});return true;
      }
      if(request.method==='POST'&&!inspectionRoute[2]){
        if(inspections.get(id)?.status==='running'){json(response,202,inspections.get(id));return true;}
        if([...inspections.values()].filter(j=>j.status==='running').length>=2)throw Error('Başka incelemeler sürüyor; kısa süre sonra tekrar dene.');
        if(inspections.size>100)for(const [key,value] of inspections)if(value.status!=='running')inspections.delete(key);
        const job={status:'running',visited:0,pages:0};inspections.set(id,job);
        inspectSite(project,{onProgress:progress=>Object.assign(job,progress)}).then(result=>Object.assign(job,{status:'complete',result})).catch(error=>Object.assign(job,{status:'failed',error:error.message}));
        json(response,202,job);return true;
      }
      if(request.method==='GET'&&!inspectionRoute[2]){json(response,200,inspections.get(id)||{status:'idle'});return true;}
      json(response,405,{error:'Yöntem desteklenmiyor.'});return true;
    }catch(error){json(response,400,{error:error.message});return true;}
  }
  if (request.method === 'DELETE') {
    const removal = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(google|deployment))?$/u);
    if (removal || requestUrl.pathname === '/api/google/config') {
      try {
        const {confirmation} = await readBody(request);
        if (!removal) {
          json(response, 200, connections.removeGoogleConfig(confirmation));
        } else {
          const id = decodeURIComponent(removal[1]);
          if (removal[2] === 'google') json(response, 200, {project: connections.disconnectGoogle(id, confirmation)});
          else if (removal[2] === 'deployment') json(response, 200, {project: connections.disconnectDeployment(id, confirmation)});
          else { connections.removeProject(id, confirmation); json(response, 200, {removed: id}); }
        }
      } catch (error) { json(response, 400, {error: error.message}); }
      return true;
    }
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    json(response, 200, {ok: true, app: 'SEOAutoPilot', version: '0.8.1'}); return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/projects') {
    json(response, 200, {projects: listProjects()}); return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/projects') {
    try { json(response, 201, {project: createProject(await readBody(request))}); }
    catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const deploymentId = projectIdFrom(requestUrl.pathname, 'deployment');
  const profileId = projectIdFrom(requestUrl.pathname, 'profile');
  if (profileId && request.method === 'PUT') {
    try {
      const payload = await readBody(request);
      const project = saveProfile(profileId, payload.profile, payload.expectedRevision);
      json(response, 200, {project});
    } catch (error) { json(response, 400, {error:error.message}); }
    return true;
  }
  if (deploymentId && request.method === 'GET') {
    const project = getPrivateProject(deploymentId);
    if (!project) json(response, 404, {error: 'Proje bulunamadı.'});
    else {
      const checked = await deployment.inspectFirebaseConnection(project.deployment);
      const current = getPrivateProject(deploymentId);
      // An in-flight check must never restore a connection the user removed/replaced.
      if (checked.firebaseAccess?.verified && current?.deployment &&
          current.deployment.connectedAt === project.deployment.connectedAt &&
          current.deployment.repositoryPath === project.deployment.repositoryPath &&
          current.deployment.firebaseAccount !== checked.firebaseAccess.account) {
        updateProject(deploymentId, {deployment: {...current.deployment,
          firebaseAccount: checked.firebaseAccess.account}});
      }
      json(response, 200, checked);
    }
    return true;
  }
  if (deploymentId && request.method === 'POST') {
    try {
      const project = getPrivateProject(deploymentId);
      if (!project) throw new Error('Proje bulunamadı.');
      const connection = deployment.detectConnection((await readBody(request)).repositoryPath);
      if (connection.provider !== 'firebase_hosting') {
        throw new Error('Bu MVP şu anda yalnızca Firebase Hosting projelerini yayınlayabilir.');
      }
      const checked = await deployment.inspectFirebaseConnection(connection);
      if (!checked.firebaseAccess?.verified) throw new Error(checked.publicationWarning || 'Firebase erişimi doğrulanamadı.');
      const current = getPrivateProject(project.id);
      if (!current || JSON.stringify(current.deployment) !== JSON.stringify(project.deployment)) {
        throw new Error('Bağlantı kontrol sırasında değiştirildi; yeniden dene.');
      }
      const updated = updateProject(project.id, {deployment: {...connection,
        firebaseAccount: checked.firebaseAccess.account}});
      json(response, 200, {project: updated,
        deployment: checked});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const reportId = projectIdFrom(requestUrl.pathname, 'report');
  if (request.method === 'GET' && reportId) {
    try {
      const project = getPrivateProject(reportId);
      if (!project) json(response, 404, {error: 'Proje bulunamadı.'});
      else json(response, 200, {...projectReport(project), projectId: project.id});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const workflowProjectId = projectIdFrom(requestUrl.pathname, 'workflows');
  if (request.method === 'GET' && workflowProjectId) {
    try {
      const project = getPrivateProject(workflowProjectId);
      if (!project) json(response, 404, {error: 'Proje bulunamadı.'});
      else {
        const result = projectReport(project);
        const workflows = projectWorkflows(project.id, result.report, project.workflows || []);
        updateProject(project.id, {workflows});
        json(response, 200, {workflows});
      }
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const workflowAction = requestUrl.pathname.match(
      /^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/action$/u);
  if (request.method === 'POST' && workflowAction) {
    try {
      const projectId = decodeURIComponent(workflowAction[1]);
      const workflowId = decodeURIComponent(workflowAction[2]);
      const payload = await readBody(request);
      const project = getPrivateProject(projectId);
      if (!project) throw new Error('Proje bulunamadı.');
      const workflows = [...(project.workflows || [])];
      const index = workflows.findIndex((item) => item.id === workflowId);
      if (index < 0) throw new Error('Görev bulunamadı.');
      if (['approve','retry'].includes(payload.action)) assertProfileWorkflow(project, workflows[index]);
      workflows[index] = transition(workflows[index], payload.action);
      updateProject(project.id, {workflows});
      json(response, 200, {workflow: workflows[index]});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const workflowPreview = requestUrl.pathname.match(
      /^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/preview$/u);
  if (request.method === 'POST' && workflowPreview) {
    try {
      const projectId = decodeURIComponent(workflowPreview[1]);
      const workflowId = decodeURIComponent(workflowPreview[2]);
      const project = getPrivateProject(projectId);
      if (!project?.deployment) throw new Error('Site güncelleme bağlantısı kurulmamış.');
      const workflow = updateWorkflow(projectId, workflowId, (current) => {
        assertProfileWorkflow(project, current);
        const ready = current.status === 'FAILED' ? transition(current, 'retry') : current;
        return beginExecution(ready, 'local_git_build');
      });
      runPreviewJob(projectId, workflowId);
      json(response, 202, {workflow});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const workflowPublish = requestUrl.pathname.match(
      /^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/publish$/u);
  if (request.method === 'POST' && workflowPublish) {
    try {
      const projectId = decodeURIComponent(workflowPublish[1]);
      const workflowId = decodeURIComponent(workflowPublish[2]);
      const project = getPrivateProject(projectId);
      if (!project?.deployment) throw new Error('Site güncelleme bağlantısı kurulmamış.');
      const workflow = updateWorkflow(projectId, workflowId, (current) => {
        assertProfileWorkflow(project, current);
        const ready = current.status === 'FAILED' ? transition(current, 'retry') : current;
        return beginPublish(ready);
      });
      runPublishJob(projectId, workflowId);
      json(response, 202, {workflow});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const importId = projectIdFrom(requestUrl.pathname, 'import');
  if (request.method === 'POST' && importId) {
    try {
      const payload = await readBody(request);
      if (typeof payload.directory !== 'string' || !payload.directory.trim()) throw new Error('Klasör yolu gerekli.');
      const project = getPrivateProject(importId);
      if (!project) throw new Error('Proje bulunamadı.');
      const loaded = loadExport(payload.directory.trim(),
          analysisOptions(project));
      const workflows = projectWorkflows(project.id, loaded.report, project.workflows || []);
      const importedProject = updateProject(importId, {csvDirectory: loaded.directory,
        lastSyncReport: null, lastSyncAt: new Date().toISOString(), workflows});
      json(response, 200, {report: loaded.report, mode: 'live', directory: loaded.directory,
        projectId: importId, project: importedProject});
    } catch (error) { json(response, 400, {error: error.message, code: error.code || 'IMPORT_FAILED'}); }
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/google/status') {
    json(response, 200, google.configStatus()); return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/google/config') {
    try { google.saveConfig(await readBody(request)); json(response, 200, google.configStatus()); }
    catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const connectId = projectIdFrom(requestUrl.pathname, 'google/connect');
  if (request.method === 'GET' && connectId) {
    try {
      if (!getPrivateProject(connectId)) json(response, 404, {error: 'Proje bulunamadı.'});
      else json(response, 200, {url: google.createAuthorizationUrl(connectId,
        `http://${HOST}:${PORT}/oauth/google/callback`)});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  const syncId = projectIdFrom(requestUrl.pathname, 'google/sync');
  if (request.method === 'POST' && syncId) {
    try {
      let project = getPrivateProject(syncId);
      if (!project) { json(response, 404, {error: 'Proje bulunamadı.'}); return true; }
      const generation = google.generationFor(syncId);
      const token = await google.accessTokenFor(project);
      google.assertGeneration(syncId, generation);
      if (token.updatedOauth) {
        updateProject(project.id, {oauth: token.updatedOauth});
        project = getPrivateProject(project.id);
      }
      const sites = await google.listSites(token.accessToken);
      google.assertGeneration(syncId, generation);
      const selectedProperty = google.chooseProperty(project.siteUrl, sites,
          project.searchConsoleProperty);
      if (selectedProperty !== project.searchConsoleProperty) {
        updateProject(project.id, {searchConsoleProperty: selectedProperty});
        project = getPrivateProject(project.id);
      }
      const end = new Date(); end.setUTCDate(end.getUTCDate() - 2);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
      const tables = await google.fetchPerformance(token.accessToken,
          project.searchConsoleProperty, dateValue(start), dateValue(end));
      google.assertGeneration(syncId, generation);
      project = getPrivateProject(syncId);
      const report = analyzeExport(tables,
          analysisOptions(project));
      report.source = 'search_console_api';
      const workflows = projectWorkflows(project.id, report, project.workflows || []);
      const syncedProject = updateProject(project.id, {lastSyncReport: report,
        lastSyncAt: new Date().toISOString(), workflows});
      json(response, 200, {report, mode: 'api', directory: '', projectId: project.id,
        project: syncedProject});
    } catch (error) { json(response, 400, {error: error.message}); }
    return true;
  }
  return false;
}
async function oauthCallback(response, requestUrl) {
  try {
    if (requestUrl.searchParams.get('error')) throw new Error('Google erişim izni verilmedi.');
    const pending = google.consumeState(requestUrl.searchParams.get('state'));
    const token = await google.exchangeCode(requestUrl.searchParams.get('code'), pending.redirectUri);
    google.assertGeneration(pending.projectId, pending.generation);
    const project = getPrivateProject(pending.projectId);
    if (!project) throw new Error('Proje kaldırılmış.');
    const sites = await google.listSites(token.access_token);
    google.assertGeneration(pending.projectId, pending.generation);
    const selectedProperty = google.chooseProperty(project.siteUrl, sites,
        project.searchConsoleProperty);
    updateProject(project.id, {oauth: {accessToken: token.access_token,
      refreshToken: token.refresh_token || project.oauth?.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope},
    searchConsoleProperty: selectedProperty});
    response.writeHead(302, {Location: `/?oauth=success&project=${encodeURIComponent(project.id)}`});
  } catch (error) {
    response.writeHead(302, {Location: `/?oauth=error&message=${encodeURIComponent(error.message)}`});
  }
  response.end();
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    if (request.method === 'GET' && requestUrl.pathname === '/oauth/google/callback') {
      return oauthCallback(response, requestUrl);
    }
    if (requestUrl.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && !trustedLocalOrigin(request)) {
        json(response, 403, {error: 'Yerel uygulama dışından gelen değişiklik isteği engellendi.'});
        return;
      }
      if (!await routeApi(request, response, requestUrl)) json(response, 404, {error: 'API adresi bulunamadı.'});
      return;
    }
    if (request.method === 'GET') return serveStatic(requestUrl, response);
    json(response, 405, {error: 'Bu yöntem desteklenmiyor.'});
  } catch (error) { json(response, 500, {error: error.message}); }
});

server.listen(PORT, HOST, () => console.log(`SEOAutoPilot hazır: http://${HOST}:${server.address().port}`));
