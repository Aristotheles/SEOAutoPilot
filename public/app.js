'use strict';

const state = {report: null, mode: 'demo', directory: '', filter: 'all'};
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
const viewLabels = {overview: 'Genel bakış', opportunities: 'Fırsatlar', queries: 'Sorgular', pages: 'Sayfalar', data: 'Veri kaynakları'};

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
  if (!rows.length) return;
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
  const live = state.mode === 'live';
  $('#dataStatus').classList.toggle('live', live);
  $('#dataStatus').innerHTML = `<i></i> ${live ? 'Gerçek veri' : 'Demo veri'}`;
  $('#sourcePath').textContent = live ? state.directory : 'Demo veri kullanılıyor — gerçek CSV klasörünü bağlayabilirsin.';
}
function renderAll() { renderOverview(); renderOpportunities(); renderQueries(); renderPages(); renderDataState(); }

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
function showToast(message) { $('#toast p').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3200); }

async function loadReport() {
  const response = await fetch('/api/report');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Veri alınamadı.');
  Object.assign(state, payload);
  renderAll();
}
async function importReport() {
  const button = $('#importSubmit'); const error = $('#importError');
  button.disabled = true; button.textContent = 'Analiz ediliyor…'; error.textContent = '';
  try {
    const response = await fetch('/api/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({directory: $('#directoryInput').value})});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'İçe aktarma başarısız.');
    Object.assign(state, payload); renderAll(); $('#importModal').hidden = true; showToast('Search Console verisi başarıyla analiz edildi.');
  } catch (exception) { error.textContent = exception.message; }
  finally { button.disabled = false; button.innerHTML = 'Analizi başlat <span>→</span>'; }
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
$$('.filter').forEach((button) => button.addEventListener('click', () => { $$('.filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter; renderOpportunities(); }));
$('#querySearch').addEventListener('input', renderQueries);
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#importButton').addEventListener('click', () => { $('#importModal').hidden = false; $('#directoryInput').focus(); });
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => $('#importModal').hidden = true));
$('#importModal').addEventListener('click', (event) => { if (event.target === $('#importModal')) $('#importModal').hidden = true; });
$('#importSubmit').addEventListener('click', importReport);
$('#directoryInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') importReport(); });
$('#drawerClose').addEventListener('click', closeDrawer); $('#drawerBackdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('#importModal').hidden = true; closeDrawer(); } });
loadReport().catch((error) => { console.error(error); showToast('Veri yüklenemedi; sunucu bağlantısını kontrol et.'); });
