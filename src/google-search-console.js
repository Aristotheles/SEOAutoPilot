'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_ROOT = 'https://www.googleapis.com/webmasters/v3';
const CONFIG_FILE = path.join(process.env.SEO_AUTOPILOT_DATA_DIR ?
  path.resolve(process.env.SEO_AUTOPILOT_DATA_DIR) : path.join(__dirname, '..', 'data'),
  'google-oauth.json');
const pendingStates = new Map();
let configGeneration = 0;
const projectGenerations = new Map();
function generationFor(projectId) {
  return `${configGeneration}:${projectGenerations.get(projectId) || 0}`;
}
function invalidateProject(projectId) {
  projectGenerations.set(projectId, (projectGenerations.get(projectId) || 0) + 1);
  for (const [key, value] of pendingStates) {
    if (value.projectId === projectId) pendingStates.delete(key);
  }
}
function assertGeneration(projectId, generation) {
  if (generation !== generationFor(projectId)) {
    throw new Error('Google bağlantısı kaldırıldı veya değişti; eski istek iptal edildi.');
  }
}

function readConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) { fileConfig = {}; }
  }
  if (fileConfig.disabled) return {clientId: '', clientSecret: ''};
  return {clientId: process.env.GOOGLE_CLIENT_ID || fileConfig.clientId || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || fileConfig.clientSecret || ''};
}
function saveConfig({clientId, clientSecret}) {
  if (!String(clientId || '').trim() || !String(clientSecret || '').trim()) {
    throw new Error('Google OAuth istemci kimliği ve gizli anahtarı gerekli.');
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE), {recursive: true});
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify({clientId: clientId.trim(),
    clientSecret: clientSecret.trim()}, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
}
function configStatus() {
  const config = readConfig();
  return {configured: Boolean(config.clientId && config.clientSecret), scope: SCOPE,
    redirectUri: 'http://127.0.0.1:4173/oauth/google/callback'};
}
function removeConfig() {
  // A persistent tombstone also disables environment-provided credentials after restart.
  fs.mkdirSync(path.dirname(CONFIG_FILE), {recursive: true});
  fs.writeFileSync(CONFIG_FILE, '{"disabled":true}\n', {encoding: 'utf8', mode: 0o600});
  configGeneration += 1;
  pendingStates.clear();
}
function createAuthorizationUrl(projectId, redirectUri) {
  const config = readConfig();
  if (!config.clientId || !config.clientSecret) throw new Error('Google OAuth henüz yapılandırılmadı.');
  const state = crypto.randomBytes(24).toString('base64url');
  pendingStates.set(state, {projectId, redirectUri, generation: generationFor(projectId),
    expiresAt: Date.now() + 10 * 60_000});
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({client_id: config.clientId, redirect_uri: redirectUri,
    response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'true', state}).toString();
  return url.toString();
}
function consumeState(state) {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
    throw new Error('OAuth oturumu geçersiz veya süresi dolmuş.');
  }
  return pending;
}
async function tokenRequest(parameters) {
  const response = await fetch(TOKEN_ENDPOINT, {method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(parameters)});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error ||
    'Google yetkilendirme hatası.');
  return payload;
}
async function exchangeCode(code, redirectUri) {
  const config = readConfig();
  return tokenRequest({code, client_id: config.clientId, client_secret: config.clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code'});
}
async function accessTokenFor(project) {
  if (!project.oauth?.refreshToken) throw new Error('Proje Search Console hesabına bağlı değil.');
  if (project.oauth.accessToken && project.oauth.expiresAt > Date.now() + 60_000) {
    return {accessToken: project.oauth.accessToken, updatedOauth: null};
  }
  const config = readConfig();
  const token = await tokenRequest({client_id: config.clientId,
    client_secret: config.clientSecret, refresh_token: project.oauth.refreshToken,
    grant_type: 'refresh_token'});
  return {accessToken: token.access_token, updatedOauth: {...project.oauth,
    accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000}};
}
async function apiRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {...options, headers: {Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json', ...(options.headers || {})}});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Search Console API isteği başarısız.');
  return payload;
}
async function listSites(accessToken) {
  const payload = await apiRequest(`${API_ROOT}/sites`, accessToken);
  return payload.siteEntry || [];
}
function hostnameForProperty(value) {
  const source = String(value || '').trim();
  if (source.startsWith('sc-domain:')) return source.slice('sc-domain:'.length)
      .replace(/^www\./u, '').toLocaleLowerCase('en');
  try { return new URL(source).hostname.replace(/^www\./u, '').toLocaleLowerCase('en'); }
  catch (_) { return ''; }
}
function chooseProperty(projectSiteUrl, sites, currentProperty = '') {
  const projectHostname = hostnameForProperty(projectSiteUrl);
  const permitted = (sites || []).filter((site) => site.siteUrl &&
    site.permissionLevel !== 'siteUnverifiedUser');
  const exact = permitted.find((site) => site.siteUrl === currentProperty &&
    hostnameForProperty(site.siteUrl) === projectHostname);
  if (exact) return exact.siteUrl;
  const matching = permitted.filter((site) =>
    hostnameForProperty(site.siteUrl) === projectHostname);
  const domainProperty = matching.find((site) => site.siteUrl === `sc-domain:${projectHostname}`);
  if (domainProperty) return domainProperty.siteUrl;
  const httpsProperty = matching.find((site) => site.siteUrl === `https://${projectHostname}/`) ||
    matching.find((site) => site.siteUrl === `https://www.${projectHostname}/`);
  if (httpsProperty) return httpsProperty.siteUrl;
  if (matching.length) return matching[0].siteUrl;
  const available = permitted.map((site) => site.siteUrl).slice(0, 5).join(', ');
  throw new Error(`Google hesabında ${projectHostname} için yetkili Search Console mülkü bulunamadı.` +
    (available ? ` Erişilebilir mülkler: ${available}` : ' Search Console erişimini kontrol et.'));
}
async function query(accessToken, siteUrl, startDate, endDate, dimension) {
  return apiRequest(`${API_ROOT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken, {method: 'POST', body: JSON.stringify({startDate, endDate,
        dimensions: [dimension], rowLimit: dimension === 'query' ? 25000 : 5000,
        dataState: 'final', type: 'web'})});
}
function asTable(header, rows = []) {
  return [header, ...rows.map((row) => [row.keys?.[0] || '', row.clicks || 0,
    row.impressions || 0, `${(row.ctr || 0) * 100}%`, row.position || 0])];
}
async function fetchPerformance(accessToken, siteUrl, startDate, endDate) {
  const dimensions = ['date', 'query', 'page', 'device', 'country'];
  const results = await Promise.all(dimensions.map((dimension) =>
    query(accessToken, siteUrl, startDate, endDate, dimension)));
  return {chart: asTable(['Tarih', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], results[0].rows),
    queries: asTable(['Sorgu', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], results[1].rows),
    pages: asTable(['Sayfa', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], results[2].rows),
    devices: asTable(['Cihaz', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], results[3].rows),
    countries: asTable(['Ülke', 'Tıklamalar', 'Gösterimler', 'TO', 'Konum'], results[4].rows)};
}

module.exports = {accessTokenFor, assertGeneration, chooseProperty, configStatus, consumeState,
  createAuthorizationUrl, exchangeCode, fetchPerformance, hostnameForProperty,
  generationFor, invalidateProject, listSites, readConfig, removeConfig, saveConfig, SCOPE};
