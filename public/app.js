'use strict';

const state = {report: null, mode: 'demo', directory: '', filter: 'decision',
  projects: [], project: null, googleStatus: null, workflows: [], deploymentStatus: null,
  workflowFilter:'actionable'};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const format = {format:value=>new Intl.NumberFormat(AppI18n.locale()).format(value)};

const actionMeta = {
  UPDATE_EXISTING: {label: 'Sayfayı güncelle', className: 'update', icon: '↗'},
  HOLD: {label: 'Veri bekle', className: 'hold', icon: '◷'},
  NEW_PAGE: {label: 'Yeni sayfa', className: 'new', icon: '+'},
  CTR_TEST: {label: 'CTR testi', className: 'new', icon: 'A/B'},
};
const confidenceLabel = {very_low: 'Çok düşük', low: 'Düşük', medium: 'Orta', high: 'Yüksek', very_high: 'Çok yüksek'};
const viewLabels = {overview: 'Genel bakış', opportunities: 'Fırsatlar',
  workflows: 'Uygulama kuyruğu', queries: 'Sorgular', pages: 'Sayfalar',
  data: 'Veri kaynakları', profile:'Site profili',settings:'Ayarlar'};
const workflowMeta = {
  PLANNED: {label: 'İçerik planında', className: 'planned'},
  DISCOVERED: {label: 'Otomatik izleniyor', className: 'discovered'},
  AWAITING_APPROVAL: {label: 'Onay bekliyor', className: 'awaiting'},
  APPROVED: {label: 'Uygulamaya hazır', className: 'approved'},
  APPLYING: {label: 'Sayfa güncelleniyor', className: 'applying'},
  APPLIED: {label: 'Sayfa güncellendi', className: 'applied'},
  PREVIEW_READY: {label: 'Yayına hazır', className: 'applied'},
  PUBLISHING: {label: 'Canlıya yayınlanıyor', className: 'applying'},
  PUBLISHED: {label: 'Canlıya yayınlandı', className: 'applied'},
  MONITORING: {label: 'Etki izleniyor', className: 'monitoring'},
  COMPLETED: {label: 'Tamamlandı', className: 'completed'},
  REJECTED: {label: 'Reddedildi', className: 'rejected'},
  FAILED: {label: 'Güncelleme başarısız', className: 'failed'},
};

function number(value, digits = 0) { return Number(value || 0).toLocaleString(AppI18n.locale(), {maximumFractionDigits: digits}); }
function percent(value) { return new Intl.NumberFormat(AppI18n.locale(),{style:'percent',maximumFractionDigits:1}).format(Number(value||0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char])); }
function formatDateTime(value, short = false) {
  if (!value) return 'Henüz yok';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Bilinmiyor';
  return date.toLocaleString(AppI18n.locale(), short ?
    {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'} :
    {day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'});
}
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
  const decisions = decisionOpportunities();
  const score = scoreFor(report);
  $('#visibilityScore').textContent = score;
  $('#scoreRing').style.setProperty('--score', score);
  $('#clicksMetric').textContent = format.format(report.summary.clicks);
  $('#impressionsMetric').textContent = format.format(report.summary.impressions);
  $('#ctrMetric').textContent = percent(report.summary.ctr);
  $('#activeDays').textContent = `${report.summary.activeDays} aktif gün`;
  $('#opportunityCount').textContent = decisions.length;
  $('#headingOpportunityCount').textContent = `${decisions.length} yeni karar`;
  $('#lastAnalysis').textContent = new Date(report.generatedAt).toLocaleString(AppI18n.locale(), {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  renderChart();
  const focus = decisions.find((item) => item.action === 'UPDATE_EXISTING') || decisions[0];
  if (focus) {
    $('#focusTitle').textContent = `${focus.label} sayfasını güçlendir`;
    $('#focusReason').textContent = focus.reason;
    $('#focusImpressions').textContent = number(focus.queryMetrics.impressions);
    $('#focusPosition').textContent = number(focus.pageMetrics?.position || focus.queryMetrics.position, 1);
    $('#focusFit').textContent = `${focus.productFit}/5`;
    $('[data-open-focus]').onclick = () => openDrawer(focus);
  } else {
    $('#focusTitle').textContent = AppI18n.t('Yeni karar bekleyen fırsat yok');
    $('#focusReason').textContent = AppI18n.t('Mevcut işler uygulama veya izleme aşamasında. Yeni Search Console sinyali geldiğinde burada görünecek.');
    $('#focusImpressions').textContent = '0'; $('#focusPosition').textContent = '—';
    $('#focusFit').textContent = '—'; $('[data-open-focus]').onclick = () => setView('data');
  }
  $('#opportunityPreview').innerHTML = decisions.slice(0, 3).map((item) => {
    const meta = actionMeta[item.action] || actionMeta.HOLD;
    return `<div class="opportunity-row"><span class="opportunity-symbol">${meta.icon}</span><div class="opportunity-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.targetPath)}</small></div><span class="action-chip ${meta.className}">${meta.label}</span><span class="opportunity-metric"><small>Gösterim</small><strong>${number(item.queryMetrics.impressions)}</strong></span><button class="row-arrow" data-detail="${escapeHtml(item.clusterId)}">→</button></div>`;
  }).join('') || '<p class="workflow-empty">Yeni karar bekleyen SEO sinyali yok.</p>';
  $$('[data-detail]').forEach((button) => button.onclick = () => openDrawer(report.opportunities.find((item) => item.clusterId === button.dataset.detail)));
}

function workflowForOpportunity(item) {
  return state.workflows.find((workflow) => workflow.opportunityId === item.clusterId &&
    workflow.targetPath === item.targetPath && !workflow.blockedReason);
}
function decisionOpportunities() {
  return (state.report?.opportunities || []).filter((item) => {
    if (item.action === 'HOLD') return false;
    const workflow = workflowForOpportunity(item);
    return !workflow || ['DISCOVERED','AWAITING_APPROVAL'].includes(workflow.status);
  });
}

function renderOpportunities() {
  const decisions = decisionOpportunities();
  const items = state.filter === 'decision' ? decisions : state.filter === 'HOLD' ?
    state.report.opportunities.filter((item) => item.action === 'HOLD') :
    decisions.filter((item) => item.action === state.filter);
  $('#opportunityBoard').innerHTML = items.length ? items.map((item) => {
    const meta = actionMeta[item.action] || actionMeta.HOLD;
    const page = item.pageMetrics || item.queryMetrics || {};
    return `<article class="opportunity-card"><div class="opportunity-card-top"><span class="action-chip ${meta.className}">${meta.label}</span><span class="confidence">Güven: <strong>${confidenceLabel[item.confidence] || item.confidence}</strong></span></div><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.reason)}</p><div class="card-metrics opportunity-metrics"><span><small>Tıklama</small><strong>${number(page.clicks)}</strong></span><span><small>Gösterim</small><strong>${number(page.impressions)}</strong></span><span><small>CTR</small><strong>${percent(page.ctr)}</strong></span><span><small>Ort. konum</small><strong>${number(page.position, 1)}</strong></span></div><div class="card-footer"><span class="confidence">${item.matchedQueries.length ? `${item.matchedQueries.length} sorgu eşleşti` : 'Sorgu–sayfa eşlemesi bekliyor'}</span><button class="outline-button" data-card-detail="${escapeHtml(item.clusterId)}">${item.action === 'HOLD' ? 'Neden bekleniyor?' : 'Kararı incele'} →</button></div></article>`;
  }).join('') : `<article class="panel workflow-empty"><strong>${state.filter === 'decision' ? 'Yeni karar bekleyen fırsat yok.' : 'Bu grupta kayıt yok.'}</strong><br>${state.filter === 'decision' ? 'Yayınlanmış, izlenen ve reddedilmiş kayıtlar bu ekranda tekrar gösterilmez.' : ''}</article>`;
  $$('[data-card-detail]').forEach((button) => button.onclick = () => openDrawer(state.report.opportunities.find((item) => item.clusterId === button.dataset.cardDetail)));
}

function queryRows() {
  const rows = state.report.details?.queries;
  if (rows?.length) return rows.map((row) => {
    const opportunity = state.report.opportunities.find((item) => item.clusterId === row.clusterId);
    return {...row, cluster: row.clusterLabel,
      action: opportunity?.action || 'HOLD'};
  });
  return state.report.opportunities.flatMap((item) => item.matchedQueries.map((query) => {const detail=(state.report.details?.queries||[]).find(row=>row.query===query)||{};return {query, cluster: item.label, impressions:detail.impressions??item.queryMetrics.impressions, position:detail.position??item.queryMetrics.position, action:item.action};}));
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
  $('#connectionManagementProject').textContent = state.project ? `Seçili proje: ${state.project.name} — ${state.project.siteUrl}` : '';
  $$('[data-remove-connection]').forEach((button) => {
    const kind = button.dataset.removeConnection;
    button.disabled = kind === 'google-config' ? !state.googleStatus?.configured :
      !state.project || (kind === 'google' ? state.project.connection !== 'connected' :
        kind === 'deployment' ? !state.deploymentStatus?.connected : false);
  });
  const live = state.mode === 'live' || state.mode === 'api';
  const lastSyncAt = state.project?.lastSyncAt;
  $('#dataStatus').classList.toggle('live', live);
  const statusText = state.mode === 'api' ? 'API senkronize' : live ? 'Gerçek veri' : state.mode === 'demo' ? 'Demo veri' : 'Veri bekleniyor';
  $('#dataStatus').innerHTML = `<i></i> ${statusText}${lastSyncAt ? ` · ${escapeHtml(formatDateTime(lastSyncAt, true))}` : ''}`;
  $('#sourcePath').textContent = state.mode === 'live' ? state.directory :
    state.mode === 'api' ? 'API verisi kullanılıyor.' : 'Bu proje için henüz gerçek veri yok.';
  const connected = state.project?.connection === 'connected';
  $('#googleSourceText').textContent = connected ? 'Search Console hesabı bağlı; uygulama açılışında otomatik yenilenir.' :
    state.googleStatus?.configured ? 'OAuth hazır; bu projeyi Google hesabına bağla.' :
      'Otomatik veri akışı için OAuth bağlantısını yapılandır.';
  $('#googleAction').textContent = connected ? 'Şimdi yenile' :
    state.googleStatus?.configured ? 'Google’a bağla' : 'API’yi kur';
  $('#lastSyncLabel').textContent = `Son güncelleme: ${formatDateTime(lastSyncAt)}`;
  const deployment = state.deploymentStatus;
  const ready = deployment?.connected;
  $('#deploymentState').textContent = deployment?.state === 'checking' ? 'Firebase hesapları kontrol ediliyor…' : ready ?
    (deployment.state === 'ready' ? 'Firebase erişimi doğrulandı' : 'Kontrol gerekli') : 'Bağlı değil';
  $('#deploymentState').className = `source-state ${ready ?
    (deployment.state === 'ready' ? '' : 'attention') : 'disconnected'}`;
  $('#deploymentAction').textContent = ready ? 'Bağlantıyı incele' : 'Bağlantıyı kur';
  $('#deploymentSourceText').textContent = ready ?
    `${deployment.connection.framework} · ${deployment.connection.provider} · ${deployment.connection.branch} dalı · ${deployment.connection.sourceDirectory || 'web'} → ${deployment.connection.outputDirectory || 'build/web'} · ${deployment.untrackedFiles || 0} izlenmeyen dosya · Firebase hesabı: ${deployment.firebaseAccess?.account || 'doğrulanmadı'} · Erişim kontrolü: ${formatDateTime(deployment.firebaseAccess?.checkedAt)}${deployment.publicationWarning ? ` · ${deployment.publicationWarning}` : ''}` :
    'Onaylanan değişikliklerin gerçekten uygulanması için yerel Git ve yayınlama bağlantısı gerekir.';
}
function nextStepFor(workflow) {
  if (workflow.blockedReason) return workflow.blockedReason;
  if (workflow.status === 'PLANNED') return 'Arama niyetini doğrula ve ayrıntılı taslak hazırla';
  if (workflow.status === 'AWAITING_APPROVAL') return 'Önerilen değişikliklerin tümünü incele';
  if (workflow.status === 'APPROVED') return 'Değişiklikleri hazırla ve kontrol et';
  if (workflow.status === 'APPLYING') return 'Sayfa güncellemesinin tamamlanmasını bekle';
  if (workflow.status === 'PREVIEW_READY') return 'Canlıya yayınla; ardından güncel sayfayı gör';
  if (workflow.status === 'PUBLISHING') return 'Canlı yayının tamamlanmasını bekle';
  if (['PUBLISHED', 'APPLIED'].includes(workflow.status)) return 'Yeni sayfayı doğrula ve izlemeyi başlat';
  if (workflow.status === 'MONITORING') return '14/28 günlük performans değişimini izle';
  if (workflow.status === 'COMPLETED') return 'Sonucu bilgi tabanına ekle';
  if (workflow.status === 'FAILED') return 'Hata ayrıntısını incele ve yeniden dene';
  if (workflow.status === 'REJECTED') return 'Yeni veri gelene kadar kapalı tut';
  return 'Yeni veri eşiğini otomatik olarak bekle';
}
function renderWorkflows() {
  const actionableStatuses = new Set(['APPROVED','APPLYING',
    'PREVIEW_READY','PUBLISHING','PUBLISHED','APPLIED','FAILED']);
  const actionableWorkflows = state.workflows.filter((workflow) =>
    actionableStatuses.has(workflow.status) && !workflow.blockedReason && workflow.action !== 'HOLD');
  const visibleWorkflows = state.workflowFilter === 'monitoring' ? state.workflows.filter((workflow) =>
    ['MONITORING','COMPLETED'].includes(workflow.status) && workflow.execution?.appliedAt) :
    state.workflowFilter === 'awaiting' ? actionableWorkflows.filter((workflow) => workflow.status === 'AWAITING_APPROVAL') :
    state.workflowFilter === 'ready' ? actionableWorkflows.filter((workflow) => ['APPROVED','PREVIEW_READY'].includes(workflow.status)) : actionableWorkflows;
  const counts = state.workflows.reduce((result, workflow) => {
    result[workflow.status] = (result[workflow.status] || 0) + 1; return result;
  }, {});
  const visibleCounts = visibleWorkflows.reduce((result, workflow) => {
    result[workflow.status] = (result[workflow.status] || 0) + 1; return result;
  }, {});
  const waiting = decisionOpportunities().length;
  $('#approvalCount').textContent = actionableWorkflows.length;
  $('#automatedCount').textContent = actionableWorkflows.length;
  $('#waitingCount').textContent = waiting;
  $('#approvedCount').textContent = (visibleCounts.APPROVED || 0) + (visibleCounts.PREVIEW_READY || 0);
  $('#monitoringCount').textContent = (counts.MONITORING || 0) + (counts.COMPLETED || 0);
  $$('[data-workflow-filter]').forEach((button) => button.classList.toggle('active', button.dataset.workflowFilter === state.workflowFilter));
  $('#workflowBoard').innerHTML = visibleWorkflows.length ? visibleWorkflows.map((workflow) => {
    const meta = workflowMeta[workflow.status] || workflowMeta.DISCOVERED;
    return `<article class="workflow-card"><span class="priority-rail ${workflow.priority.level}"></span><div class="workflow-copy"><div class="workflow-meta"><span class="priority-label">${workflow.priority.level} · P${workflow.priority.score}</span><span class="workflow-status ${meta.className}">${meta.label}</span></div><h3>${escapeHtml(workflow.title)}</h3><p>${escapeHtml(workflow.brief.action)}</p></div><div class="workflow-score"><strong>${workflow.priority.score}</strong><small>öncelik puanı</small></div><div class="workflow-next"><small>Sonraki adım</small><strong>${escapeHtml(nextStepFor(workflow))}</strong><div class="workflow-actions"><button class="outline-button" data-workflow-detail="${escapeHtml(workflow.id)}">Ayrıntıları incele →</button></div></div></article>`;
  }).join('') : `<article class="panel workflow-empty"><strong>${state.workflowFilter === 'monitoring' ? 'İzlenen sayfa yok.' : 'Bu grupta senden işlem bekleyen öneri yok.'}</strong><br>${state.workflowFilter === 'monitoring' ? 'Yayınlanan bir sayfada izlemeyi başlattığında burada görünecek.' : 'Performans izleme ve yeni veri bekleyen sayfalar arka planda takip ediliyor.'}</article>`;
  $$('[data-workflow-detail]').forEach((button) => button.addEventListener('click', () =>
    openWorkflowDetail(button.dataset.workflowDetail)));
}
function workflowTargetUrl(workflow) {
  try { return new URL(workflow.targetPath, state.project.siteUrl).href; }
  catch (_) { return workflow.targetPath; }
}
function workflowPreviewUrl(workflow) {
  if (workflow.execution?.previewPageUrl) return workflow.execution.previewPageUrl;
  try { return new URL(workflow.targetPath, workflow.execution?.previewUrl).href; }
  catch (_) { return workflow.execution?.previewUrl || workflowTargetUrl(workflow); }
}
function monitoringReportHtml(workflow, targetUrl) {
  const result=workflow.result;if(!result?.baseline||!result?.current)return `<div class="apply-progress done"><i>✓</i><div><strong>28 günlük izleme tamamlandı</strong><p>${escapeHtml(result?.recommendation||'Güncel Search Console verisini yenileyip sonucu tekrar incele.')}</p></div></div>`;
  const label={improved:'Olumlu sonuç',declined:'Gerileme var',stable:'Belirgin değişim yok',insufficient_data:'Veri yetersiz'}[result.verdict]||'Kontrol gerekli';
  const delta=(value,suffix='')=>`${value>0?'+':''}${number(value,suffix?1:0)}${suffix}`;
  return `<div class="apply-progress done"><i>✓</i><div><strong>28 günlük izleme tamamlandı · ${label}</strong><p>${escapeHtml(result.recommendation)}</p></div></div><div class="evidence-grid monitoring-comparison"><article><small>Tıklama</small><strong>${number(result.baseline.clicks)} → ${number(result.current.clicks)}</strong><small>${delta(result.changes.clicks*100,'%')}</small></article><article><small>Gösterim</small><strong>${number(result.baseline.impressions)} → ${number(result.current.impressions)}</strong><small>${delta(result.changes.impressions*100,'%')}</small></article><article><small>CTR</small><strong>${percent(result.baseline.ctr)} → ${percent(result.current.ctr)}</strong><small>${delta(result.changes.ctr*100,' puan')}</small></article><article><small>Ort. konum</small><strong>${number(result.baseline.position,1)} → ${number(result.current.position,1)}</strong><small>${result.changes.position>0?'İyileşme':'Değişim'}: ${delta(result.changes.position)}</small></article></div><div class="detail-actions"><a class="outline-button view-page-link" href="${escapeHtml(workflow.execution?.url||targetUrl)}" target="_blank" rel="noopener">İlgili sayfayı gör ↗</a></div>`;
}
function workflowActionPanel(workflow, targetUrl) {
  if (workflow.blockedReason) return `<div class="connection-warning"><strong>Profil veya içerik dili kontrolü gerekli</strong><p>${escapeHtml(workflow.blockedReason)}</p></div><button class="outline-button" data-open-profile>Site profilini aç →</button>`;
  if (workflow.action === 'CTR_TEST' && workflow.status === 'APPROVED') return `<div class="approval-box detail-approval"><strong>Önce mevcut sayfayla karşılaştır.</strong><br>Taslak mevcut başlık veya metadan daha iyi değilse değişiklik yapma. Bu seçim öneriyi kapatır ve canlı siteyi değiştirmez.</div><div class="detail-actions"><button class="modal-submit" data-workflow-action="keep_existing" data-workflow-id="${escapeHtml(workflow.id)}">Mevcut başlık ve metayı koru <span>→</span></button></div>`;
  if (workflow.status === 'PREVIEW_READY' && state.deploymentStatus?.capabilities?.production === false) {
    return `<div class="connection-warning"><div><strong>Değişiklikler hazır; canlı yayın bağlantısı eksik</strong><p>${escapeHtml(state.deploymentStatus.publicationWarning || 'Yayın bağlantısını kontrol et.')}</p></div></div><div class="detail-actions"><button class="modal-submit" disabled>Yayın bağlantısını doğrula</button></div>`;
  }
  if (workflow.status === 'PLANNED') return `<div class="approval-box"><strong>Öneri unutulmayacak şekilde editoryal kuyruğa kaydedildi.</strong><br>Search Console sinyali, mevcut içerikle çakışma ve hedef sorgular doğrulanmadan yayın taslağına dönüştürülmeyecek.</div>`;
  if (workflow.status === 'AWAITING_APPROVAL' && workflow.action === 'CTR_TEST') return `<div class="approval-box detail-approval"><strong>İki başlıktan birini seç.</strong><br>Seçtiğin başlık ve yukarıdaki meta açıklaması toplu yayın kuyruğuna alınacak; diğer başlık uygulanmayacak.</div><div class="detail-actions"><button class="reject-button detail-reject" data-workflow-action="reject" data-workflow-id="${escapeHtml(workflow.id)}">Öneriyi reddet</button><button class="outline-button" data-workflow-action="select_variant" data-workflow-variant="a" data-workflow-id="${escapeHtml(workflow.id)}">Varyant A’yı seç</button><button class="modal-submit detail-approve" data-workflow-action="select_variant" data-workflow-variant="b" data-workflow-id="${escapeHtml(workflow.id)}">Varyant B’yi seç <span>→</span></button></div>`;
  if (workflow.status === 'AWAITING_APPROVAL') return `<div class="approval-box detail-approval"><strong>Onaylamadan önce yukarıdaki değişikliklerin tamamını kontrol et.</strong><br>Onay yalnızca bu listelenen taslağı uygulama aşamasına geçirir; siteyi henüz değiştirmez.</div><div class="detail-actions"><button class="reject-button detail-reject" data-workflow-action="reject" data-workflow-id="${escapeHtml(workflow.id)}">Öneriyi reddet</button><button class="modal-submit detail-approve" data-workflow-action="approve" data-workflow-id="${escapeHtml(workflow.id)}">Bu değişiklikleri onayla <span>→</span></button></div>`;
  if (workflow.status === 'APPROVED' && !state.deploymentStatus?.connected) return `<div class="connection-warning"><strong>Site güncelleme bağlantısı henüz kurulmadı</strong><p>Öneri onaylandı fakat kaynak koduna bağlı bir yayınlama kanalı yok. Bu nedenle SEOAutoPilot sayfayı değiştirmiş gibi davranmayacak.</p></div><div class="detail-actions"><button class="outline-button" data-open-data-source>Site bağlantısını kur →</button></div>`;
  if (workflow.status === 'APPROVED' && !state.deploymentStatus?.capabilities?.preview) return `<div class="connection-warning"><strong>Firebase erişimi doğrulanmadı; hazırlık başlatılmadı</strong><p>${escapeHtml(state.deploymentStatus?.publicationWarning || 'Firebase hesabını kontrol et.')}</p></div><div class="detail-actions"><button class="outline-button" data-open-data-source>Bağlantıyı kontrol et →</button></div>`;
  if (workflow.status === 'APPROVED') return `<div class="apply-progress monitoring"><i>↗</i><div><strong>Değişiklikler hazırlanmaya hazır</strong><p>Bu sayfayı tek başına hazırlayabilir veya uygun değişikliklerle toplu yayınlayabilirsin. Hazırlık canlı siteyi değiştirmez.</p></div></div><div class="detail-actions"><button class="outline-button" data-workflow-preview="${escapeHtml(workflow.id)}">Yalnız bu sayfayı hazırla</button><button class="modal-submit" data-open-bulk-publish>Toplu yayın ekranına git <span>→</span></button></div>`;
  if (workflow.status === 'APPLYING') return `<div class="apply-progress"><i></i><div><strong>Sayfa güncelleniyor…</strong><p>Onaylanan değişiklikler bağlı yayınlama kanalı üzerinden uygulanıyor. Bu pencereyi yeniden açarsan işlem bitene kadar aynı durum gösterilir.</p></div></div><div class="detail-actions"><button class="modal-submit" disabled>Güncelleme henüz bitmedi</button></div>`;
  if (workflow.status === 'PREVIEW_READY') return `<div class="apply-progress done"><i>✓</i><div><strong>Değişiklikler yayına hazır</strong><p>${escapeHtml(formatDateTime(workflow.execution?.previewAt))} · ${workflow.execution?.appliedChangeIds?.length || 0} değişiklik hazırlandı. Canlı site henüz değişmedi.</p></div></div><div class="detail-actions"><button class="outline-button" data-open-bulk-publish>Toplu yayın ekranına git</button><button class="modal-submit" data-workflow-publish="${escapeHtml(workflow.id)}">Yalnız bu sayfayı canlıya yayınla <span>→</span></button></div>`;
  if (workflow.status === 'PUBLISHING') return `<div class="apply-progress"><i></i><div><strong>Canlıya yayınlanıyor…</strong><p>Onaylanan Git değişikliği kaydediliyor, uzak depoya gönderiliyor ve Firebase Hosting dağıtımı yapılıyor.</p></div></div><div class="detail-actions"><button class="modal-submit" disabled>Yayın henüz bitmedi</button></div>`;
  if (['PUBLISHED', 'APPLIED'].includes(workflow.status)) return `<div class="apply-progress done"><i>✓</i><div><strong>Sayfa canlıya yayınlandı</strong><p>${escapeHtml(formatDateTime(workflow.execution?.appliedAt))} tarihinde yayın adresi doğrulandı.</p></div></div><div class="detail-actions"><a class="outline-button view-page-link" href="${escapeHtml(workflow.execution?.url || targetUrl)}" target="_blank" rel="noopener">Yeni sayfayı gör ↗</a><button class="modal-submit" data-workflow-action="start_monitoring" data-workflow-id="${escapeHtml(workflow.id)}">İzlemeyi başlat <span>→</span></button></div>`;
  if (workflow.status === 'MONITORING') { const interim=workflow.monitoringInterim; const base=workflow.monitoringBaseline; return `<div class="apply-progress monitoring"><i>◷</i><div><strong>14/28 günlük ölçüm sürüyor</strong><p>Yayın ve baz çizgisi: ${escapeHtml(formatDateTime(workflow.monitoringStartedAt))}${base?.period ? ` · Önceki dönem ${escapeHtml(base.period.start)}–${escapeHtml(base.period.end)}` : ''}. Sonuç yalnız yayın sonrası veri dönemi tamamlanınca hazırlanır.</p></div></div>${interim?`<div class="approval-box"><strong>14 günlük ara kontrol: ${escapeHtml(interim.recommendation)}</strong><br>Bu ara bilgidir; 28 günlük nihai karar değildir.</div>`:''}${workflow.execution?.url ? `<div class="detail-actions"><a class="outline-button view-page-link" href="${escapeHtml(workflow.execution.url)}" target="_blank" rel="noopener">Yayınlanan sayfayı gör ↗</a></div>` : ''}`; }
  if (workflow.status === 'COMPLETED') return monitoringReportHtml(workflow,targetUrl);
  if (workflow.status === 'FAILED') { const retryAction = workflow.execution?.failedPhase === 'PUBLISHING' ? 'publish' : 'preview'; return `<div class="connection-warning error"><strong>Güncelleme tamamlanamadı</strong><p>${escapeHtml(workflow.execution?.error || 'Yayınlama kanalı bilinmeyen bir hata döndürdü.')}</p></div><div class="detail-actions"><button class="outline-button" data-workflow-retry="${escapeHtml(workflow.id)}" data-retry-action="${retryAction}">${retryAction === 'publish' ? 'Canlı yayını' : 'Hazırlığı'} yeniden dene →</button></div>`; }
  if (workflow.status === 'REJECTED') return '<div class="approval-box"><strong>Öneri reddedildi</strong><br>Site üzerinde değişiklik yapılmadı. Yeni Search Console verisi geldiğinde fırsat yeniden değerlendirilebilir.</div>';
  return '<div class="approval-box"><strong>Otomatik veri izleme</strong><br>Yeterli sinyal oluşana kadar site üzerinde değişiklik yapılmayacak.</div>';
}
function openWorkflowDetail(id) {
  const workflow = state.workflows.find((item) => item.id === id);
  if (!workflow) return;
  const meta = workflowMeta[workflow.status] || workflowMeta.DISCOVERED;
  const evidence = workflow.brief?.evidence || {};
  const targetUrl = workflowTargetUrl(workflow);
  const changes = workflow.brief?.changes || [];
  const events = workflow.events || [];
  const source = workflow.sourceVerification;
  const sourcePanel = source ? `<div class="approval-box ${source.status === 'verified' ? '' : 'connection-warning'}"><strong>Kaynak sayfa kontrolü: ${source.status === 'verified' ? 'Doğrulandı' : 'İşlem durduruldu'}</strong><br>${source.snapshot ? `${escapeHtml(source.snapshot.sourceFile)} · ${escapeHtml(String(source.snapshot.language || '').toUpperCase())} · canonical ${escapeHtml(source.snapshot.canonical || 'yok')}` : escapeHtml(source.blocker || '')}</div>` : '';
  $('#workflowDetailContent').innerHTML = `<header class="workflow-detail-head"><div><div class="workflow-meta"><span class="priority-label">${escapeHtml(workflow.priority.level)} · P${workflow.priority.score}</span><span class="workflow-status ${meta.className}">${meta.label}</span></div><h2 id="workflowDetailTitle">${escapeHtml(workflow.title)}</h2><p>${escapeHtml(workflow.reason)}</p></div><div class="workflow-detail-score"><strong>${workflow.priority.score}</strong><small>öncelik puanı</small></div></header><section class="detail-target"><small>Hedef sayfa</small><a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener">${escapeHtml(targetUrl)} ↗</a><p>${escapeHtml(workflow.brief?.action || '')}</p></section><div class="workflow-detail-grid"><main><section class="detail-section"><div class="detail-section-title"><span>1</span><div><h3>Mevcut ve önerilen değişiklikler</h3><p>Onayın tam olarak hangi alanları kapsadığını burada görürsün.</p></div></div>${sourcePanel}${changes.length ? `<div class="change-list">${changes.map((change) => `<article class="change-card"><span class="change-area">${escapeHtml(change.area)}</span>${change.current ? `<small>Mevcut</small><strong>${escapeHtml(change.current)}</strong><small>Önerilen</small>` : ''}<strong class="change-proposed">${escapeHtml(change.proposed)}</strong><p class="change-rationale">Neden: ${escapeHtml(change.rationale)}</p></article>`).join('')}</div>` : '<div class="approval-box">Bu görev site değişikliği önermiyor; yalnızca yeni veri bekliyor.</div>'}</section><section class="detail-section"><div class="detail-section-title"><span>2</span><div><h3>Kararın dayanağı</h3><p>Search Console sinyali ve ürün uyumu.</p></div></div><div class="evidence-grid"><article><small>Gösterim</small><strong>${number(evidence.impressions)}</strong></article><article><small>Ort. konum</small><strong>${number(evidence.position, 1)}</strong></article><article><small>Güven</small><strong>${escapeHtml(confidenceLabel[evidence.confidence] || evidence.confidence || '—')}</strong></article><article><small>Ürün uyumu</small><strong>${evidence.productFit || '—'}/5</strong></article></div>${workflow.brief?.queryFocus?.length ? `<div class="query-focus"><small>Hedef sorgular</small>${workflow.brief.queryFocus.map((query) => `<span class="query-pill">${escapeHtml(query)}</span>`).join('')}</div>` : ''}</section><section class="detail-section"><div class="detail-section-title"><span>3</span><div><h3>Uygulama ve kontrol planı</h3><p>Her adımın kim tarafından ve ne zaman yapılacağı açıkça gösterilir.</p></div></div><div class="detail-step-list">${(workflow.steps || []).map((step) => `<div class="detail-step"><i>${step.mode === 'approval' ? '●' : step.mode === 'controlled' ? '↗' : '✓'}</i><span>${escapeHtml(step.label)}</span><small>${step.mode === 'approval' ? 'Kullanıcı onayı' : step.mode === 'controlled' ? 'Bağlı site kanalı' : 'Otomatik'}</small></div>`).join('')}</div></section></main><aside><section class="detail-section sticky-detail"><h3>İşlem geçmişi</h3><div class="detail-timeline">${events.slice().reverse().map((event) => `<div class="timeline-item"><i></i><div><strong>${escapeHtml(event.label)}</strong><small>${escapeHtml(formatDateTime(event.at))} · ${event.actor === 'user' ? 'Kullanıcı' : 'Sistem'}</small></div></div>`).join('')}</div></section></aside></div><section class="detail-section detail-decision"><div class="detail-section-title"><span>4</span><div><h3>Şimdiki durum ve sonraki adım</h3><p>${escapeHtml(nextStepFor(workflow))}</p></div></div>${workflowActionPanel(workflow, targetUrl)}</section>`;
  $('#workflowDetailModal').hidden = false;
  $$('[data-workflow-action]', $('#workflowDetailContent')).forEach((button) =>
    button.addEventListener('click', () => runWorkflowAction(button.dataset.workflowId,
        button.dataset.workflowAction, button.dataset.workflowVariant)));
  $('[data-workflow-preview]', $('#workflowDetailContent'))?.addEventListener('click', () =>
    runDeploymentAction(workflow.id, 'preview'));
  $('[data-open-bulk-publish]', $('#workflowDetailContent'))?.addEventListener('click',()=>{closeWorkflowDetail();setView('workflows');$('#reviewBulkPublish').click();});
  $('[data-workflow-retry]', $('#workflowDetailContent'))?.addEventListener('click', (event) =>
    runDeploymentAction(workflow.id, event.currentTarget.dataset.retryAction));
  $('[data-workflow-publish]', $('#workflowDetailContent'))?.addEventListener('click', () => {
    if (window.confirm(AppI18n.t('Hazırlanan değişiklikler doğrudan canlı siteye yayınlanacak. Ayrı Firebase önizlemesi yapılmaz. Yayın tamamlanınca güncel sayfayı açabilirsin. Canlıya yayınlansın mı?'))) {
      runDeploymentAction(workflow.id, 'publish');
    }
  });
  $('[data-open-data-source]', $('#workflowDetailContent'))?.addEventListener('click', () => {
    closeWorkflowDetail(); setView('data');
  });
}
function closeWorkflowDetail() { $('#workflowDetailModal').hidden = true; }
function renderAll() { renderOverview(); renderOpportunities(); renderQueries();
  renderPages(); renderDataState(); renderWorkflows(); renderSiteProfile(); }

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
  $('.content').hidden = !state.project && !$('#view-settings').classList.contains('active');
  $('#emptyProjectPanel').hidden = Boolean(state.project);
  $('#importButton').disabled = !state.project;
  $$('.nav-item').forEach((button) => { button.disabled = !state.project && button.dataset.view !== 'settings'; });
  $('#currentProjectName').textContent = state.project?.name || 'Proje ekle';
  $('#breadcrumbProject').textContent = state.project?.name || 'Proje yok';
  $('#projectInitials').textContent = initials(state.project?.name || 'SEO');
  $('#projectList').innerHTML = state.projects.map((project) =>
    `<div class="project-management-row"><button class="project-list-item ${project.id === state.project?.id ? 'active' : ''}" data-project-id="${escapeHtml(project.id)}"><span class="avatar">${escapeHtml(initials(project.name))}</span><span class="project-list-copy"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.siteUrl)}</small></span><span class="connection-mini ${project.connection}">${project.connection === 'connected' ? 'API bağlı' : project.hasReport ? 'CSV' : 'Yeni'}</span></button><button class="danger-button" data-remove-project="${escapeHtml(project.id)}" aria-label="${escapeHtml(project.name)} projesini kaldır">Kaldır</button></div>`).join('') || '<p>Kayıtlı proje yok. Aşağıdan yeni proje ekle.</p>';
  $$('[data-project-id]').forEach((button) => button.addEventListener('click', () => selectProject(button.dataset.projectId)));
  $$('[data-remove-project]').forEach((button) => button.addEventListener('click', () => removeConnection('project', button.dataset.removeProject)));
}

function setView(name) {
  $('.content').hidden = !state.project && name !== 'settings';
  $('#emptyProjectPanel').hidden = Boolean(state.project) || name === 'settings';
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  $('#viewCrumb').textContent = viewLabels[name];
  $('#sidebar').classList.remove('open');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function openDrawer(item) {
  if (!item) return;
  const workflow = workflowForOpportunity(item);
  if (workflow && item.action !== 'HOLD') { openWorkflowDetail(workflow.id); return; }
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
  const projectId = state.project.id;
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report`);
  const payload = await response.json();
  if (state.project?.id !== projectId) return;
  if (!response.ok) throw new Error(payload.error || 'Veri alınamadı.');
  Object.assign(state, payload);
  await evaluateMonitoring();
  await Promise.all([loadWorkflows(), loadDeploymentStatus()]);
  renderAll();
}
async function evaluateMonitoring(){
  const projectId=state.project.id;
  const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/monitoring/evaluate`,{method:'POST'});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||'İzleme değerlendirmesi yapılamadı.');
}
async function loadWorkflows() {
  const projectId = state.project.id;
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workflows`);
  const payload = await response.json();
  if (state.project?.id !== projectId) return;
  if (!response.ok) throw new Error(payload.error || 'İş akışları alınamadı.');
  notifyCompletedMonitoring(projectId, payload.workflows || []);
  state.workflows = payload.workflows || [];
}
function notifyCompletedMonitoring(projectId, workflows) {
  const completed=workflows.filter((workflow)=>workflow.status==='COMPLETED'&&workflow.completedAt);
  if(!completed.length)return;
  const key=`seo-monitoring-notified-${projectId}`;
  let notified=[];try{notified=JSON.parse(localStorage.getItem(key)||'[]');}catch{notified=[];}
  const fresh=completed.filter((workflow)=>!notified.includes(`${workflow.id}:${workflow.completedAt}`));
  if(!fresh.length)return;
  const values=[...new Set([...notified,...fresh.map((workflow)=>`${workflow.id}:${workflow.completedAt}`)])];
  try{localStorage.setItem(key,JSON.stringify(values));}catch{/* notification still appears */}
  const dot=$('#notificationButton .notification-dot');if(dot)dot.hidden=false;
  showToast(`${fresh.length} sayfanın 28 günlük izlemesi tamamlandı. İzlenen kutusundan sonuçları açabilirsin.`);
}
async function loadDeploymentStatus() {
  const projectId = state.project.id;
  state.deploymentStatus = {connected: false, state: 'checking'};
  renderDataState();
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deployment`);
  const payload = await response.json();
  if (state.project?.id !== projectId) return;
  state.deploymentStatus = response.ok ? payload : {connected: false, state: 'error',
    error: payload.error};
}
async function runWorkflowAction(id, action, variant) {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/workflows/${encodeURIComponent(id)}/action`,
        {method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action, variant})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    const index = state.workflows.findIndex((item) => item.id === id);
    if (index >= 0) state.workflows[index] = payload.workflow;
    renderWorkflows(); openWorkflowDetail(id);
    showToast(action === 'select_variant' ? `Varyant ${String(variant).toUpperCase()} seçildi; öneri toplu yayına hazır.` : action === 'approve' ? 'Değişiklik taslağı onaylandı; site henüz güncellenmedi.' :
      action === 'reject' ? 'Görev reddedildi.' : 'Görev durumu güncellendi.');
  } catch (exception) { showToast(exception.message, 'error'); }
}
async function runDeploymentAction(id, action) {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.project.id)}/workflows/${encodeURIComponent(id)}/${action}`,
        {method: 'POST'});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    const index = state.workflows.findIndex((item) => item.id === id);
    if (index >= 0) state.workflows[index] = payload.workflow;
    renderWorkflows(); openWorkflowDetail(id);
    showToast(action === 'preview' ? 'Değişiklikler hazırlanıyor ve kontrol ediliyor. Canlı site henüz değişmez.' :
      'Canlı yayın başladı. Tamamlandığında burada görünecek.');
    pollWorkflow(id);
  } catch (exception) { showToast(exception.message, 'error'); }
}
async function pollWorkflow(id) {
  await new Promise((resolve) => setTimeout(resolve, 1800));
  try {
    await loadWorkflows(); renderWorkflows();
    const workflow = state.workflows.find((item) => item.id === id);
    if (!workflow) return;
    if (!$('#workflowDetailModal').hidden) openWorkflowDetail(id);
    if (['APPLYING', 'PUBLISHING'].includes(workflow.status)) pollWorkflow(id);
    else showToast(workflow.status === 'FAILED' ? 'İşlem tamamlanamadı; hata ayrıntısını aç.' :
      'Yayınlama adımı tamamlandı.', workflow.status === 'FAILED' ? 'error' : 'success');
  } catch (exception) { showToast(exception.message, 'error'); }
}
async function loadProjects(autoSync = true) {
  const [projectsResponse, googleResponse] = await Promise.all([
    fetch('/api/projects'), fetch('/api/google/status'),
  ]);
  const projectsPayload = await projectsResponse.json();
  if (!projectsResponse.ok) throw new Error(projectsPayload.error || 'Proje verisi okunamadı.');
  state.projects = projectsPayload.projects || [];
  state.googleStatus = await googleResponse.json();
  const requested = new URLSearchParams(location.search).get('project');
  const saved = localStorage.getItem('seo-autopilot-project');
  state.project = state.projects.find((item) => item.id === requested) ||
    state.projects.find((item) => item.id === saved) || state.projects[0];
  renderProjects();
  if (!state.project) {
    state.report = null; state.workflows = []; state.deploymentStatus = null;
    localStorage.removeItem('seo-autopilot-project');
    $('#opportunityCount').textContent = '0'; $('#approvalCount').textContent = '0';
    $('#dataStatus').textContent = 'Proje yok';
    return;
  }
  await loadReport();
  const oauth = new URLSearchParams(location.search).get('oauth');
  if (oauth === 'success') showToast('Google Search Console bağlantısı tamamlandı.');
  if (oauth === 'error') showToast('Google bağlantısı tamamlanamadı.', 'error');
  if (oauth) history.replaceState({}, '', '/');
  if (autoSync) await autoSyncOnOpen();
}
async function selectProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  state.project = project; localStorage.setItem('seo-autopilot-project', id);
  if(typeof bulkTimer!=='undefined')clearTimeout(bulkTimer);
  $('#bulkPublishContent').textContent='';$('#reviewBulkPublish').disabled=false;
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
    setView('profile');
  } catch (exception) { error.textContent = exception.message; }
  finally { button.disabled = false; }
}
async function importReport() {
  const projectId = state.project.id;
  const button = $('#importSubmit'); const error = $('#importError');
  button.disabled = true; button.textContent = 'Analiz ediliyor…'; error.textContent = '';
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/import`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({directory: $('#directoryInput').value})});
    const payload = await response.json();
    if (state.project?.id !== projectId) return;
    if (!response.ok) throw new Error(payload.error || 'İçe aktarma başarısız.');
    Object.assign(state, payload);
    if (payload.project) updateCurrentProject(payload.project);
    await loadWorkflows(); renderAll(); $('#importModal').hidden = true; showToast('Search Console verisi analiz edildi ve görevler güncellendi.');
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

async function removeConnection(kind, projectId = state.project?.id) {
  if (state.removing) return;
  const project = state.projects.find((item) => item.id === projectId);
  if (kind !== 'google-config' && !project) return;
  const name = project ? `${project.name} (${project.siteUrl})` : '';
  const messages = {
    deployment: `${name}\n\nSite/Git/Firebase bağlantısı kaldırılacak. Eski önizlemenin yayın yetkisi iptal edilir. Canlı site, kaynak klasörü ve GitHub deposu silinmez. Diğer projeler etkilenmez. Devam edilsin mi?`,
    google: `${name}\n\nBu projenin Google tokenları silinecek ve otomatik senkronizasyonu duracak. Raporlar ve diğer projeler korunur. Google hesabındaki izin iptal edilmez. Devam edilsin mi?`,
    'google-config': `DİKKAT: TÜM ${state.projects.length} PROJEYİ ETKİLER.\n\nOrtak Google OAuth istemci kimliği, gizli anahtar ve tüm projelerin Google tokenları bu uygulamadan silinecek. Ortam değişkenleriyle yapılandırılmış erişim de bu uygulamada devre dışı bırakılır. Yeniden kurulum gerekir. Google Cloud API/anahtarı silinmez; Google hesabındaki izin iptal edilmez. Siteler ve raporlar korunur. Devam edilsin mi?`,
  };
  if (kind === 'project') {
    const answer = window.prompt(`${name}\n\nBu projenin SEOAutoPilot kaydı, raporları, görevleri ve tokenları kalıcı olarak silinir. Canlı site, kaynak kod, GitHub, CSV dosyaları ve diğer projeler korunur. Google hesabındaki izin iptal edilmez.\n\nOnaylamak için proje adını aynen yaz: ${project.name}`);
    if (answer !== project.name) return;
  } else if (!window.confirm(messages[kind])) return;
  state.removing = true;
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const endpoint = kind === 'google-config' ? '/api/google/config' :
    kind === 'project' ? base : `${base}/${kind}`;
  try {
    const response = await fetch(endpoint, {method: 'DELETE',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        confirmation: kind === 'google-config' ? 'REMOVE_GOOGLE_CONFIG' : projectId})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    if (kind === 'google-config') {
      $('#googleClientId').value = ''; $('#googleClientSecret').value = '';
      state.projects.forEach((item) => sessionStorage.removeItem(`seo-auto-synced-${item.id}`));
    } else sessionStorage.removeItem(`seo-auto-synced-${projectId}`);
    closeWorkflowDetail(); $('#googleModal').hidden = true; $('#deploymentModal').hidden = true;
    if (kind === 'project') { $('#projectModal').hidden = true; history.replaceState({}, '', '/'); }
    await loadProjects(false);
    showToast(kind === 'project' ? 'Proje SEOAutoPilot’tan kaldırıldı; site ve kaynak dosyaları korunuyor.' :
      kind === 'google-config' ? 'Ortak OAuth bilgileri ve tüm yerel Google tokenları kaldırıldı.' :
        kind === 'google' ? 'Bu projenin yerel Google bağlantısı kesildi.' : 'Site bağlantısı kaldırıldı; canlı site değiştirilmedi.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { state.removing = false; }
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
  const projectId = state.project.id;
  const button = $('#googleAction'); button.disabled = true; button.textContent = 'Senkronize ediliyor…';
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/google/sync`, {method: 'POST'});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    if (state.project?.id !== projectId) return true;
    Object.assign(state, payload);
    if (payload.project) updateCurrentProject(payload.project);
    await loadWorkflows(); renderAll(); showToast(`Search Console güncellendi: ${formatDateTime(state.project.lastSyncAt)}`);
    sessionStorage.setItem(`seo-auto-synced-${state.project.id}`, '1');
    return true;
  } catch (exception) {
    showToast(automatic ? `Otomatik senkronizasyon: ${exception.message}` : exception.message, 'error');
    return false;
  }
  finally { button.disabled = false; renderDataState(); }
}
function updateCurrentProject(project) {
  state.project = project;
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) state.projects[index] = project;
  renderProjects();
}
async function autoSyncOnOpen() {
  if (!AppI18n.settings.autoSync) return;
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
function openDeploymentModal() {
  $('#repositoryPathInput').value = state.deploymentStatus?.connection?.repositoryPath ||
    state.project?.deployment?.repositoryPath || '';
  $('#deploymentError').textContent = state.deploymentStatus?.error || state.deploymentStatus?.publicationWarning || '';
  $('#trustRepositoryCode').checked = Boolean(state.deploymentStatus?.connection?.codeExecutionTrustedAt);
  $('#deploymentModal').hidden = false;
}
async function saveDeployment() {
  const projectId = state.project.id;
  const button = $('#saveDeployment'); const error = $('#deploymentError');
  button.disabled = true; error.textContent = ''; button.textContent = 'Doğrulanıyor…';
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deployment`,
        {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
          repositoryPath: $('#repositoryPathInput').value,
          trustRepositoryCode: $('#trustRepositoryCode').checked})});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
    if (state.project?.id !== projectId) return;
    state.deploymentStatus = payload.deployment;
    if (payload.project) updateCurrentProject(payload.project);
    renderDataState(); $('#deploymentModal').hidden = true;
    showToast(`Firebase erişimi doğrulandı: ${payload.deployment.firebaseAccess.account}`);
  } catch (exception) { error.textContent = exception.message; }
  finally { button.disabled = false; button.innerHTML = 'Bağlantıyı doğrula ve kaydet <span>→</span>'; }
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
$$('.filter').forEach((button) => button.addEventListener('click', () => { $$('.filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter; renderOpportunities(); }));
$('#querySearch').addEventListener('input', renderQueries);
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#importButton').addEventListener('click', () => { $('#importModal').hidden = false; $('#directoryInput').focus(); });
$('#dataImportButton').addEventListener('click', () => $('#importButton').click());
$('#projectMenuButton').addEventListener('click', () => { renderProjects(); $('#projectModal').hidden = false; });
$$('[data-open-projects]').forEach((button) => button.addEventListener('click', () => $('#projectMenuButton').click()));
$$('[data-remove-connection]').forEach((button) => button.addEventListener('click', () => removeConnection(button.dataset.removeConnection)));
$('#createProjectButton').addEventListener('click', createNewProject);
$('#refreshWorkflows').addEventListener('click', async () => { await evaluateMonitoring();await loadWorkflows(); renderWorkflows(); showToast('İzleme ve uygulama kuyruğu güncellendi.'); });
$$('[data-workflow-filter]').forEach((button)=>button.addEventListener('click',()=>{
  state.workflowFilter=button.dataset.workflowFilter;renderWorkflows();
  $('#workflowBoard').scrollIntoView({behavior:'smooth',block:'start'});
}));
$$('[data-open-opportunities]').forEach((button)=>button.addEventListener('click',()=>{
  state.filter='decision';setView('opportunities');renderOpportunities();
}));
$('#notificationButton').addEventListener('click',()=>{
  if(!state.project)return;state.workflowFilter='monitoring';setView('workflows');renderWorkflows();
  $('#notificationButton .notification-dot').hidden=true;
  $('#workflowBoard').scrollIntoView({behavior:'smooth',block:'start'});
});
$$('[data-close-project]').forEach((button) => button.addEventListener('click', () => $('#projectModal').hidden = true));
$('#googleAction').addEventListener('click', googleAction);
$('#saveGoogleConfig').addEventListener('click', saveGoogleConfig);
$('#connectGoogle').addEventListener('click', connectGoogle);
$('#deploymentAction').addEventListener('click', openDeploymentModal);
$('#saveDeployment').addEventListener('click', saveDeployment);
$$('[data-close-deployment]').forEach((button) => button.addEventListener('click', () => $('#deploymentModal').hidden = true));
$$('[data-close-google]').forEach((button) => button.addEventListener('click', () => $('#googleModal').hidden = true));
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => $('#importModal').hidden = true));
$('#importModal').addEventListener('click', (event) => { if (event.target === $('#importModal')) $('#importModal').hidden = true; });
$('#importSubmit').addEventListener('click', importReport);
$('#directoryInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') importReport(); });
$('#drawerClose').addEventListener('click', closeDrawer); $('#drawerBackdrop').addEventListener('click', closeDrawer);
$$('[data-close-workflow]').forEach((button) => button.addEventListener('click', closeWorkflowDetail));
$('#workflowDetailModal').addEventListener('click', (event) => { if (event.target === $('#workflowDetailModal')) closeWorkflowDetail(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('#importModal').hidden = true; $('#projectModal').hidden = true; $('#googleModal').hidden = true; $('#deploymentModal').hidden = true; closeWorkflowDetail(); closeDrawer(); } });
loadProjects().catch((error) => { console.error(error); showToast('Veri yüklenemedi; sunucu bağlantısını kontrol et.', 'error'); });
