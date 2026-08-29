'use strict';

const state = {report: null, mode: 'demo', directory: '', filter: 'all',
  projects: [], project: null, googleStatus: null, workflows: []};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const format = new Intl.NumberFormat('tr-TR');

const actionMeta = {
  UPDATE_EXISTING: {label: 'Sayfayı güncelle', className: 'update', icon: '↗'},
  HOLD: {label: 'Veri bekle', className: 'hold', icon: '◷'},
  NEW_PAGE: {label: 'Yeni sayfa', className: 'new', icon: '+'},
  CTR_TEST: {label: 'CTR testi', className: 'new', icon: 'A/B'},
};
const confidenceLabel = {very_low: 'Çok düşük', low: 'Düşük', medium: 'Orta', high: 'Yüksek', very_high: 'Çok yüksek'};
const viewLabels = {overview: 'Genel bakış', opportunities: 'Fırsatlar',
  workflows: 'Onay kuyruğu', queries: 'Sorgular', pages: 'Sayfalar',
  data: 'Veri kaynakları'};
const workflowMeta = {
  DISCOVERED: {label: 'Otomatik izleniyor', className: 'discovered'},
  AWAITING_APPROVAL: {label: 'Onay bekliyor', className: 'awaiting'},
  APPROVED: {label: 'Uygulamaya hazır', className: 'approved'},
  MONITORING: {label: 'Etki izleniyor', className: 'monitoring'},
  COMPLETED: {label: 'Tamamlandı', className: 'completed'},
  REJECTED: {label: 'Reddedildi', className: 'rejected'},
};

function number(value, digits = 0) { return Number(value || 0).toLocaleString('tr-TR', {maximumFractionDigits: digits}); }
function percent(value) { return `%${number(Number(value || 0) * 100, 1)}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char])); }
function scoreFor(report) {
  const {impressions, clicks, activeDays} = report.summary;
  return Math.min(100, Math.round(Math.log10(impressions + 1) * 10 + clicks * 2 + activeDays));
}

function chartPath(rows, key, width = 720, height = 215) {
  if (!rows.length) return `M0 ${height}`;
  const maximum = Math.max(1, ...rows.map((row) => Number(row[key] || 0)));
  return rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : index * width / (rows.length - 1);
    const y = height - Number(row[key] || 0) / maximum * (height - 15);
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function renderChart() {
  const rows = state.report.details?.series || [];
  if (!rows.length) {
    $('#impressionPath').setAttribute('d', 'M0 215 L720 215');
    $('#clickPath').setAttribute('d', 'M0 215 L720 215');
    $('#areaPath').setAttribute('d', 'M0 215 L720 215 Z');
    $('#chartYAxis').innerHTML = '<span>0</span><span>0</span><span>0</span><span>0</span>';
    $('#chartXAxis').innerHTML = '<span>Veri bekleniyor</span>';
    return;
  }
  const impressionPath = chartPath(rows, 'impressions');
  const clickPath = chartPath(rows, 'clicks');
  $('#impressionPath').setAttribute('d', impressionPath);
  $('#clickPath').setAttribute('d', clickPath);
  $('#areaPath').setAttribute('d', `${impressionPath} L720 215 L0 215 Z`);
  const maximum = Math.max(1, ...rows.map((row) => Number(row.impressions || 0)));
  $('#chartYAxis').innerHTML = [maximum, maximum * .67, maximum * .33, 0]
      .map((value) => `<span>${number(value)}</span>`).join('');
  $('#chartXAxis').innerHTML = rows.map((row) => {
    const parts = String(row.date).split(/[.\-/]/);
    const label = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : row.date;
    return `<span>${escapeHtml(label)}</span>`;
  }).join('');
}

function renderOverview() {
  const report = state.report;
  const score = scoreFor(report);
  $('#visibilityScore').textContent = score;
  $('#scoreRing').style.setProperty('--score', score);
  $('#clicksMetric').textContent = format.format(report.summary.clicks);
  $('#impressionsMetric').textContent = format.format(report.summary.impressions);
  $('#ctrMetric').textContent = percent(report.summary.ctr);
  $('#activeDays').textContent = `${report.summary.activeDays} aktif gün`;
  $('#opportunityCount').textContent = report.opportunities.length;
  $('#headingOpportunityCount').textContent = `${report.opportunities.length} SEO sinyali`;
  $('#lastAnalysis').textContent = new Date(report.generatedAt).toLocaleString('tr-TR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  renderChart();
  const focus = report.opportunities.find((item) => item.action === 'UPDATE_EXISTING') || report.opportunities[0];
  if (focus) {
    $('#focusTitle').textContent = `${focus.label} sayfasını güçlendir`;
    $('#focusReason').textContent = focus.reason;
    $('#focusImpressions').textContent = number(focus.queryMetrics.impressions);
    $('#focusPosition').textContent = number(focus.pageMetrics?.position || focus.queryMetrics.position, 1);
    $('#focusFit').textContent = `${focus.productFit}/5`;
    $('[data-open-focus]').onclick = () => openDrawer(focus);
  } else {
    $('#focusTitle').textContent = 'İlk veriyi bağla';
    $('#focusReason').textContent = 'Search Console API veya CSV bağlandığında en değerli SEO hamlesi burada görünecek.';
    $('#focusImpressions').textContent = '0'; $('#focusPosition').textContent = '—';
    $('#focusFit').textContent = '—'; $('[data-open-focus]').onclick = () => setView('data');
  }
  $('#opportunityPreview').innerHTML = report.opportunities.slice(0, 3).map((item) => {
    const meta = actionMeta[item.action] || actionMeta.HOLD;
    return `<div class="opportunity-row"><span class="opportunity-symbol">${meta.icon}</span><div class="opportunity-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.targetPath)}</small></div><span class="action-chip ${meta.className}">${meta.label}</span><span class="opportunity-metric"><small>Gösterim</small><strong>${number(item.queryMetrics.impressions)}</strong></span><button class="row-arrow" data-detail="${escapeHtml(item.clusterId)}">→</button></div>`;
  }).join('');
  $$('[data-detail]').forEach((button) => button.onclick = () => openDrawer(report.opportunities.find((item) => item.clusterId === button.dataset.detail)));
}

function renderOpportunities() {
  const items = state.filter === 'all' ? state.report.opportunities : state.report.opportunities.filter((item) => item.action === state.filter);
  $('#opportunityBoard').innerHTML = items.length ? items.map((item) => {
    const meta = actionMeta[item.action] || actionMeta.HOLD;
    const dots = Array.from({length: 5}, (_, index) => `<i class="${index < item.productFit ? 'on' : ''}"></i>`).join('');
    return `<article class="opportunity-card"><div class="opportunity-card-top"><span class="action-chip ${meta.className}">${meta.label}</span><span class="fit-dots" title="Ürün uyumu ${item.productFit}/5">${dots}</span></div><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.reason)}</p><div class="card-metrics"><span><small>Gösterim</small><strong>${number(item.queryMetrics.impressions)}</strong></span><span><small>Ort. konum</small><strong>${number(item.pageMetrics?.position || item.queryMetrics.position, 1)}</strong></span><span><small>Eşleşen sorgu</small><strong>${item.matchedQueries.length}</strong></span></div><div class="card-footer"><span class="confidence">Güven: <strong>${confidenceLabel[item.confidence] || item.confidence}</strong></span><button class="outline-button" data-card-detail="${escapeHtml(item.clusterId)}">Detayı aç →</button></div></article>`;
  }).join('') : '<article class="panel"><p>Bu filtrede fırsat bulunmuyor.</p></article>';
  $$('[data-card-detail]').forEach((button) => button.onclick = () => openDrawer(state.report.opportunities.find((item) => item.clusterId === button.dataset.cardDetail)));
}

function queryRows() {
  const rows = state.report.details?.queries;
  if (rows?.length) return rows.map((row) => {
    const opportunity = state.report.opportunities.find((item) => item.clusterId === row.clusterId);
    return {...row, cluster: row.clusterLabel,
      action: opportunity?.action || 'HOLD'};
  });
  return state.report.opportunities.flatMap((item) => item.matchedQueries.map((query) => ({query, cluster: item.label, impressions: 0, position: item.queryMetrics.position, action: item.action})));
}
function renderQueries() {
  const search = ($('#querySearch').value || '').toLocaleLowerCase('tr');
  const rows = queryRows().filter((row) => row.query.toLocaleLowerCase('tr').includes(search));
  $('#queryResultCount').textContent = `${rows.length} sorgu gösteriliyor`;
  $('#queryTable').innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.query)}</td><td><span class="cluster-tag">${escapeHtml(row.cluster)}</span></td><td>${number(row.impressions)}</td><td>${number(row.position, 1)}</td><td><span class="action-chip ${(actionMeta[row.action] || actionMeta.HOLD).className}">${(actionMeta[row.action] || actionMeta.HOLD).label}</span></td></tr>`).join('');
}

function renderPages() {
  const pages = state.report.opportunities.filter((item) => item.pageMetrics);
  $('#pageCards').innerHTML = pages.map((item) => { const page = item.pageMetrics; const meta = actionMeta[item.action] || actionMeta.HOLD; const strength = Math.max(5, Math.min(100, 100 - page.position)); return `<article class="page-card"><span class="page-url">${escapeHtml(page.url)}</span><h3>${escapeHtml(item.label)}</h3><div class="page-bar"><i style="width:${strength}%"></i></div><div class="card-metrics"><span><small>Gösterim</small><strong>${number(page.impressions)}</strong></span><span><small>Konum</small><strong>${number(page.position, 1)}</strong></span><span><small>Aksiyon</small><span class="action-chip ${meta.className}">${meta.label}</span></span></div></article>`; }).join('');
}

function renderDataState() {
  const live = state.mode === 'live' || state.mode === 'api';
  $('#dataStatus').classList.toggle('live', live);
  $('#dataStatus').innerHTML = `<i></i> ${state.mode === 'api' ? 'API senkronize' : live ? 'Gerçek veri' : 'Demo veri'}`;
  $('#sourcePath').textContent = state.mode === 'live' ? state.directory :
    state.mode === 'api' ? 'API verisi kullanılıyor.' : 'Bu proje için henüz gerçek veri yok.';
  const connected = state.project?.connection === 'connected';
  $('#googleSourceText').textContent = connected ? 'Search Console hesabı bağlı; uygulama açılışında otomatik yenilenir.' :
    state.googleStatus?.configured ? 'OAuth hazır; bu projeyi Google hesabına bağla.' :
      'Otomatik veri akışı için OAuth bağlantısını yapılandır.';
  $('#googleAction').textContent = connected ? 'Şimdi yenile' :
    state.googleStatus?.configured ? 'Google’a bağla' : 'API’yi kur';
}
function nextStepFor(workflow) {
  if (workflow.status === 'AWAITING_APPROVAL') return 'Hazırlanan değişikliği incele ve karar ver';
  if (workflow.status === 'APPROVED') return 'Değişikliği uygula ve ölçüm dönemini başlat';
  if (workflow.status === 'MONITORING') return '14/28 günlük performans değişimini izle';
  if (workflow.status === 'COMPLETED') return 'Sonucu bilgi tabanına ekle';
  if (workflow.status === 'REJECTED') return 'Yeni veri gelene kadar kapalı tut';
  return 'Yeni veri eşiğini otomatik olarak bekle';
}
function workflowButtons(workflow) {
  if (workflow.status === 'AWAITING_APPROVAL') return `<button class="reject-button" data-workflow-action="reject" data-workflow-id="${workflow.id}">Reddet</button><button class="outline-button" data-workflow-action="approve" data-workflow-id="${workflow.id}">Onayla</button>`;
  if (workflow.status === 'APPROVED') return `<button class="outline-button" data-workflow-action="start_monitoring" data-workflow-id="${workflow.id}">Uygulandı, izlemeyi başlat</button>`;
  if (workflow.status === 'MONITORING') return `<button class="outline-button" data-workflow-action="complete" data-workflow-id="${workflow.id}">Sonuçlandı</button>`;
  return '';
}
function renderWorkflows() {
  const counts = state.workflows.reduce((result, workflow) => {
    result[workflow.status] = (result[workflow.status] || 0) + 1; return result;
  }, {});
  const waiting = counts.AWAITING_APPROVAL || 0;
  $('#approvalCount').textContent = waiting;
  $('#automatedCount').textContent = state.workflows.length;
  $('#waitingCount').textContent = waiting;
  $('#approvedCount').textContent = counts.APPROVED || 0;
  $('#monitoringCount').textContent = counts.MONITORING || 0;
  $('#workflowBoard').innerHTML = state.workflows.length ? state.workflows.map((workflow) => {
    const meta = workflowMeta[workflow.status] || workflowMeta.DISCOVERED;
    return `<article class="workflow-card"><span class="priority-rail ${workflow.priority.level}"></span><div class="workflow-copy"><div class="workflow-meta"><span class="priority-label">${workflow.priority.level} · P${workflow.priority.score}</span><span class="workflow-status ${meta.className}">${meta.label}</span></div><h3>${escapeHtml(workflow.title)}</h3><p>${escapeHtml(workflow.brief.action)}</p></div><div class="workflow-score"><strong>${workflow.priority.score}</strong><small>öncelik puanı</small></div><div class="workflow-next"><small>Sonraki adım</small><strong>${escapeHtml(nextStepFor(workflow))}</strong><div class="workflow-actions">${workflowButtons(workflow)}</div></div></article>`;
  }).join('') : '<article class="panel workflow-empty">Bu proje için henüz otomatik görev oluşmadı. Önce Search Console verisini bağla.</article>';
  $$('[data-workflow-action]').forEach((button) => button.addEventListener('click', () =>
    runWorkflowAction(button.dataset.workflowId, button.dataset.workflowAction)));
}
function renderAll() { renderOverview(); renderOpportunities(); renderQueries();
  renderPages(); renderDataState(); renderWorkflows(); }

function initials(name) {
  const words = String(name || '').trim().split(/\s+/u).filter(Boolean);
  if (words.length === 1) {
    const capitals = words[0].match(/[A-ZÇĞİÖŞÜ]/gu) || [];
    return (capitals.length > 1 ? capitals.slice(0, 2).join('') :
      `${words[0][0] || ''}${words[0][1] || ''}`).toLocaleUpperCase('tr');
  }
  return words.slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('tr');
}
function renderProjects() {
  if (!state.project) return;
  $('#currentProjectName').textContent = state.project.name;
  $('#breadcrumbProject').textContent = state.project.name;
  $('#projectInitials').textContent = initials(state.project.name);
  $('#projectList').innerHTML = state.projects.map((project) =>
    `<button class="project-list-item ${project.id === state.project.id ? 'active' : ''}" data-project-id="${escapeHtml(project.id)}"><span class="avatar">${escapeHtml(initials(project.name))}</span><span class="project-list-copy"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.siteUrl)}</small></span><span class="connection-mini ${project.connection}">${project.connection === 'connected' ? 'API bağlı' : project.hasReport ? 'CSV' : 'Yeni'}</span></button>`).join('');
  $$('[data-project-id]').forEach((button) => button.addEventListener('click', () => selectProject(button.dataset.projectId)));
}

function setView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  $('#viewCrumb').textContent = viewLabels[name];
  $('#sidebar').classList.remove('open');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function openDrawer(item) {
  if (!item) return;
  const meta = actionMeta[item.action] || actionMeta.HOLD;
  $('#drawerContent').innerHTML = `<span class="drawer-kicker">${meta.label} · ${confidenceLabel[item.confidence]} güven</span><h2>${escapeHtml(item.label)}</h2><p class="drawer-reason">${escapeHtml(item.reason)}</p><div class="card-metrics"><span><small>Gösterim</small><strong>${number(item.queryMetrics.impressions)}</strong></span><span><small>Konum</small><strong>${number(item.pageMetrics?.position || item.queryMetrics.position, 1)}</strong></span><span><small>Ürün uyumu</small><strong>${item.productFit}/5</strong></span></div><div class="drawer-section"><h3>Hedef sayfa</h3><span class="query-pill">${escapeHtml(item.targetPath)}</span></div><div class="drawer-section"><h3>Eşleşen sorgular</h3>${item.matchedQueries.map((query) => `<span class="query-pill">${escapeHtml(query)}</span>`).join('')}</div><div class="drawer-section"><h3>Önerilen kontrol listesi</h3><ul class="check-list"><li>Arama niyetini başlık ve giriş bölümünde netleştir</li><li>İç bağlantıları ilgili ders ve ürün akışına bağla</li><li>Örnekleri gerçek kullanıcı problemleriyle genişlet</li><li>Değişiklik sonrası 14–28 gün performansı izle</li></ul></div><div class="approval-box"><strong>İnsan onayı zorunlu</strong><br>SEOAutoPilot öneriyi hazırlar; içerik değişikliğini sen onaylamadan yayınlamaz.</div>`;
  $('#drawerBackdrop').hidden = false;
  $('#detailDrawer').classList.add('open');
  $('#detailDrawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() { $('#detailDrawer').classList.remove('open'); $('#detailDrawer').setAttribute('aria-hidden', 'true'); setTimeout(() => { $('#drawerBackdrop').hidden = true; }, 280); }
function showToast(message, type = 'success') {
  $('#toast p').textContent = message;
  $('#toast span').textContent = type === 'error' ? '!' : '✓';
  $('#toast').classList.toggle('error', type === 'error');
  $('#toast').classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}

async function loadReport() {
  const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/report`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Veri alınamadı.');
  Object.assign(state, payload);
  await loadWorkflows();
  renderAll();
}
async function loadWorkflows() {
  const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/workflows`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'İş akışları alınamadı.');
  state.workflows = payload.workflows || [];
}
async function runWorkflowAction(id, action) {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/workflows/${encodeURIComponent(id)}/action`,
        {method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    const index = state.workflows.findIndex((item) => item.id === id);
    if (index >= 0) state.workflows[index] = payload.workflow;
    renderWorkflows();
    showToast(action === 'approve' ? 'Görev onaylandı ve uygulama kuyruğuna alındı.' :
      action === 'reject' ? 'Görev reddedildi.' : 'Görev durumu güncellendi.');
  } catch (exception) { showToast(exception.message, 'error'); }
}
async function loadProjects() {
  const [projectsResponse, googleResponse] = await Promise.all([
    fetch('/api/projects'), fetch('/api/google/status'),
  ]);
  const projectsPayload = await projectsResponse.json();
  state.projects = projectsPayload.projects || [];
  state.googleStatus = await googleResponse.json();
  const requested = new URLSearchParams(location.search).get('project');
  const saved = localStorage.getItem('seo-autopilot-project');
  state.project = state.projects.find((item) => item.id === requested) ||
    state.projects.find((item) => item.id === saved) || state.projects[0];
  renderProjects();
  await loadReport();
  const oauth = new URLSearchParams(location.search).get('oauth');
  if (oauth === 'success') showToast('Google Search Console bağlantısı tamamlandı.');
  if (oauth === 'error') showToast('Google bağlantısı tamamlanamadı.', 'error');
  if (oauth) history.replaceState({}, '', '/');
  await autoSyncOnOpen();
}
async function selectProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  state.project = project; localStorage.setItem('seo-autopilot-project', id);
  $('#projectModal').hidden = true; renderProjects(); await loadReport();
  showToast(`${project.name} projesine geçildi.`);
  await autoSyncOnOpen();
}
async function createNewProject() {
  const button = $('#createProjectButton'); const error = $('#projectError');
  error.textContent = ''; button.disabled = true;
  try {
    const response = await fetch('/api/projects', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: $('#projectNameInput').value, siteUrl: $('#projectUrlInput').value})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    state.projects.push(payload.project); $('#projectNameInput').value = ''; $('#projectUrlInput').value = '';
    await selectProject(payload.project.id);
  } catch (exception) { error.textContent = exception.message; }
  finally { button.disabled = false; }
}
async function importReport() {
  const button = $('#importSubmit'); const error = $('#importError');
  button.disabled = true; button.textContent = 'Analiz ediliyor…'; error.textContent = '';
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/import`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({directory: $('#directoryInput').value})});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'İçe aktarma başarısız.');
    Object.assign(state, payload); await loadWorkflows(); renderAll(); $('#importModal').hidden = true; showToast('Search Console verisi analiz edildi ve görevler güncellendi.');
  } catch (exception) { error.textContent = exception.message; }
  finally { button.disabled = false; button.innerHTML = 'Analizi başlat <span>→</span>'; }
}

function openGoogleModal() {
  const configured = state.googleStatus?.configured;
  $('#googleConfigFields').hidden = configured;
  $('#connectGoogle').hidden = !configured;
  $('#googleModalCopy').textContent = configured ? `${state.project.name} projesini salt okunur Search Console izniyle bağla.` :
    'Google Cloud’da oluşturduğun Web application bilgilerini gir.';
  $('#googleModal').hidden = false;
}
async function saveGoogleConfig() {
  const error = $('#googleError'); error.textContent = '';
  try {
    const response = await fetch('/api/google/config', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({clientId: $('#googleClientId').value, clientSecret: $('#googleClientSecret').value})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    state.googleStatus = payload; $('#googleConfigFields').hidden = true; $('#connectGoogle').hidden = false;
    $('#googleModalCopy').textContent = 'OAuth ayarları hazır. Şimdi Google hesabını bu projeye bağla.';
  } catch (exception) { error.textContent = exception.message; }
}
async function syncGoogle(automatic = false) {
  const button = $('#googleAction'); button.disabled = true; button.textContent = 'Senkronize ediliyor…';
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/google/sync`, {method: 'POST'});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    Object.assign(state, payload); await loadWorkflows(); renderAll(); showToast('Search Console verisi ve görevler güncellendi.');
    sessionStorage.setItem(`seo-auto-synced-${state.project.id}`, '1');
    return true;
  } catch (exception) {
    showToast(automatic ? `Otomatik senkronizasyon: ${exception.message}` : exception.message, 'error');
    return false;
  }
  finally { button.disabled = false; renderDataState(); }
}
async function autoSyncOnOpen() {
  if (state.project?.connection !== 'connected') return;
  const key = `seo-auto-synced-${state.project.id}`;
  if (sessionStorage.getItem(key)) return;
  await syncGoogle(true);
}
async function googleAction() {
  if (state.project.connection !== 'connected') { openGoogleModal(); return; }
  await syncGoogle(false);
}
async function connectGoogle() {
  const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/google/connect`);
  const payload = await response.json();
  if (!response.ok) { $('#googleError').textContent = payload.error; return; }
  location.href = payload.url;
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
$$('.filter').forEach((button) => button.addEventListener('click', () => { $$('.filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter; renderOpportunities(); }));
$('#querySearch').addEventListener('input', renderQueries);
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#importButton').addEventListener('click', () => { $('#importModal').hidden = false; $('#directoryInput').focus(); });
$('#dataImportButton').addEventListener('click', () => $('#importButton').click());
$('#projectMenuButton').addEventListener('click', () => { renderProjects(); $('#projectModal').hidden = false; });
$('#createProjectButton').addEventListener('click', createNewProject);
$('#refreshWorkflows').addEventListener('click', async () => { await loadWorkflows(); renderWorkflows(); showToast('Öncelikler güncellendi.'); });
$$('[data-close-project]').forEach((button) => button.addEventListener('click', () => $('#projectModal').hidden = true));
$('#googleAction').addEventListener('click', googleAction);
$('#saveGoogleConfig').addEventListener('click', saveGoogleConfig);
$('#connectGoogle').addEventListener('click', connectGoogle);
$$('[data-close-google]').forEach((button) => button.addEventListener('click', () => $('#googleModal').hidden = true));
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => $('#importModal').hidden = true));
$('#importModal').addEventListener('click', (event) => { if (event.target === $('#importModal')) $('#importModal').hidden = true; });
$('#importSubmit').addEventListener('click', importReport);
$('#directoryInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') importReport(); });
$('#drawerClose').addEventListener('click', closeDrawer); $('#drawerBackdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('#importModal').hidden = true; $('#projectModal').hidden = true; $('#googleModal').hidden = true; closeDrawer(); } });
loadProjects().catch((error) => { console.error(error); showToast('Veri yüklenemedi; sunucu bağlantısını kontrol et.', 'error'); });
