'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {execFile} = require('node:child_process');

function firebaseInvocation(args) {
  if (process.platform !== 'win32') return {command: 'firebase', args};
  const pathDirectories = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm',
      'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'));
  for (const directory of pathDirectories) {
    candidates.push(path.join(directory, 'node_modules', 'firebase-tools', 'lib', 'bin',
        'firebase.js'));
  }
  const cliPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!cliPath) throw new Error('Firebase CLI Node giriş dosyası bulunamadı.');
  return {command: process.execPath, args: [cliPath, ...args]};
}

function run(command, args, cwd, timeout = 15_000) {
  return execFileSync(command, args, {cwd, encoding: 'utf8', timeout,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function existingDirectory(input) {
  const requested = String(input || '').trim();
  if (!requested) throw new Error('Proje klasörü gerekli.');
  const resolved = fs.realpathSync.native(path.resolve(requested));
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Proje klasörü bulunamadı.');
  return resolved;
}

function readFirebaseProject(root) {
  const rcPath = path.join(root, '.firebaserc');
  if (!fs.existsSync(rcPath)) return '';
  try { return JSON.parse(fs.readFileSync(rcPath, 'utf8')).projects?.default || ''; }
  catch (_) { throw new Error('.firebaserc geçerli JSON değil.'); }
}

function detectConnection(repositoryPath) {
  const requestedPath = String(repositoryPath || '').trim();
  const root = existingDirectory(requestedPath);
  let gitRoot;
  try { gitRoot = fs.realpathSync.native(run('git', ['rev-parse', '--show-toplevel'], root)); }
  catch (_) { throw new Error('Seçilen klasör bir Git deposu değil.'); }
  const branch = run('git', ['branch', '--show-current'], gitRoot) || 'HEAD';
  if (branch === 'HEAD') throw new Error('Bağlantı için Git deposunda bir dal seçili olmalı.');
  const hasFirebase = fs.existsSync(path.join(gitRoot, 'firebase.json'));
  const hasFlutter = fs.existsSync(path.join(gitRoot, 'pubspec.yaml'));
  const firebaseProject = hasFirebase ? readFirebaseProject(gitRoot) : '';
  const releaseBuilder = fs.existsSync(path.join(gitRoot, 'tool', 'build_web_release.mjs')) ?
    'lingodecoder_flutter_release' : hasFlutter ? 'flutter_web_release' : 'static_site';
  return {source: 'local_git', provider: hasFirebase ? 'firebase_hosting' : 'none',
    requestedPath, repositoryPath: gitRoot, branch, framework: hasFlutter ? 'flutter' : 'static',
    firebaseProject, releaseBuilder, connectedAt: new Date().toISOString()};
}

function inspectConnection(connection) {
  if (!connection?.repositoryPath) return {connected: false, state: 'disconnected'};
  try {
    const detected = detectConnection(connection.repositoryPath);
    const trackedChanges = run('git', ['status', '--porcelain', '--untracked-files=no'],
        detected.repositoryPath);
    const untracked = run('git', ['status', '--porcelain', '--untracked-files=normal'],
        detected.repositoryPath).split(/\r?\n/u).filter((line) => line.startsWith('??')).length;
    return {connected: true, state: trackedChanges ? 'attention' : 'ready',
      connection: {...connection, ...detected, connectedAt: connection.connectedAt},
      trackedChanges: trackedChanges ? trackedChanges.split(/\r?\n/u).length : 0,
      untrackedFiles: untracked,
      capabilities: {preview: detected.provider === 'firebase_hosting',
        production: detected.provider === 'firebase_hosting', isolatedWorktree: true}};
  } catch (error) { return {connected: false, state: 'error', error: error.message}; }
}

function publicConnection(connection) {
  if (!connection) return null;
  const {requestedPath, ...safe} = connection;
  return safe;
}

function runAsync(command, args, cwd, timeout = 20 * 60_000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {cwd, encoding: 'utf8', timeout, windowsHide: true,
      maxBuffer: 20 * 1024 * 1024}, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim().split(/\r?\n/u)
            .slice(-8).join('\n');
        reject(new Error(detail || `${command} çalıştırılamadı.`)); return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function htmlEscape(value, attribute = false) {
  const escaped = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  return attribute ? escaped.replaceAll('"', '&quot;') : escaped;
}

function targetFile(root, targetPath) {
  const relative = String(targetPath || '').replace(/^\/+|\/+$/gu, '');
  if (!relative || relative.includes('..')) throw new Error('Güvenli bir hedef sayfa yolu bulunamadı.');
  const candidates = [path.join(root, 'web', `${relative}.html`),
    path.join(root, 'web', relative, 'index.html')];
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  if (!selected) throw new Error(`Hedef sayfanın kaynak dosyası bulunamadı: ${targetPath}`);
  const webRoot = path.join(root, 'web');
  if (!selected.startsWith(webRoot)) throw new Error('Hedef dosya web klasörünün dışında.');
  return selected;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`${label} hedef sayfada bulunamadı.`);
  return source.replace(pattern, replacement);
}

function applyWorkflowChanges(workflow, root) {
  const filePath = targetFile(root, workflow.targetPath);
  const changes = new Map((workflow.brief?.changes || []).map((change) => [change.id, change]));
  let html = fs.readFileSync(filePath, 'utf8');
  const applied = [];
  const title = changes.get('title');
  if (title) {
    const current = html.match(/<title>([^<]+)<\/title>/u)?.[1] || '';
    const suffix = /\s+[—|-]\s+LingoDecoder$/u.test(current) ? ' — LingoDecoder' : '';
    html = replaceRequired(html, /<title>[^<]+<\/title>/u,
        `<title>${htmlEscape(title.proposed)}${suffix}</title>`, 'SEO başlığı');
    applied.push(title.id);
  }
  const meta = changes.get('meta');
  if (meta) {
    html = replaceRequired(html, /<meta name="description" content="[^"]*">/u,
        `<meta name="description" content="${htmlEscape(meta.proposed, true)}">`,
        'Meta açıklaması');
    applied.push(meta.id);
  }
  const h1 = changes.get('h1');
  if (h1) {
    html = replaceRequired(html, /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/u,
        `<h1>${htmlEscape(h1.proposed)}</h1>`, 'H1');
    applied.push(h1.id);
  }
  if (!applied.length) throw new Error('Bu öneride otomatik uygulanabilir kesin bir değişiklik yok.');
  fs.writeFileSync(filePath, html, 'utf8');
  return {sourceFile: path.relative(root, filePath).replaceAll('\\', '/'), applied,
    pending: [...changes.keys()].filter((id) => !applied.includes(id))};
}

function findPreviewUrl(value) {
  if (typeof value === 'string') {
    const match = value.match(/https:\/\/[a-z0-9.-]+(?:web\.app|firebaseapp\.com)(?:\/[^\s"'<>]*)?/iu);
    if (match) return match[0];
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = findPreviewUrl(item); if (found) return found; }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) { const found = findPreviewUrl(item); if (found) return found; }
  }
  return '';
}

function deploymentRoot() {
  const dataRoot = process.env.SEO_AUTOPILOT_DATA_DIR ?
    path.resolve(process.env.SEO_AUTOPILOT_DATA_DIR) : path.join(__dirname, '..', 'data');
  return path.join(dataRoot, 'worktrees');
}

async function preparePreview(workflow, connection) {
  const checked = inspectConnection(connection);
  if (!checked.connected || connection.provider !== 'firebase_hosting') {
    throw new Error(checked.error || 'Firebase Hosting bağlantısı hazır değil.');
  }
  if (!connection.firebaseProject) throw new Error('Firebase proje kimliği bulunamadı.');
  const stamp = Date.now().toString(36);
  const branch = `seoautopilot/${workflow.id}-${stamp}`;
  const worktreePath = path.join(deploymentRoot(), `${workflow.projectId}-${workflow.id}-${stamp}`);
  fs.mkdirSync(path.dirname(worktreePath), {recursive: true});
  await runAsync('git', ['worktree', 'add', '-b', branch, worktreePath,
    connection.branch], connection.repositoryPath, 60_000);
  try {
    const patch = applyWorkflowChanges(workflow, worktreePath);
    await runAsync('git', ['add', '--', patch.sourceFile], worktreePath, 30_000);
    await runAsync('git', ['-c', 'user.name=SEOAutoPilot',
      '-c', 'user.email=seoautopilot@localhost', 'commit', '-m',
      `seo: ${workflow.title}`], worktreePath, 60_000);
    if (fs.existsSync(path.join(worktreePath, 'tool', 'verify_seo.mjs'))) {
      await runAsync('node', ['tool/verify_seo.mjs'], worktreePath, 120_000);
    }
    if (connection.releaseBuilder === 'lingodecoder_flutter_release') {
      await runAsync('node', ['tool/build_web_release.mjs'], worktreePath);
    } else if (connection.releaseBuilder === 'flutter_web_release') {
      throw new Error('Bu Flutter projesi için güvenli release build betiği tanımlanmamış.');
    }
    const channel = `seo-${workflow.id.slice(0, 12)}`;
    const previewCommand = firebaseInvocation(['hosting:channel:deploy', channel,
      '--expires', '7d', '--project', connection.firebaseProject, '--json',
      '--non-interactive']);
    const output = await runAsync(previewCommand.command, previewCommand.args, worktreePath,
        10 * 60_000);
    let parsed;
    try { parsed = JSON.parse(output); } catch (_) { parsed = output; }
    let url = findPreviewUrl(parsed);
    if (!url) {
      const listCommand = firebaseInvocation(['hosting:channel:list', '--project',
        connection.firebaseProject, '--json', '--non-interactive']);
      const listOutput = await runAsync(listCommand.command, listCommand.args, worktreePath,
          2 * 60_000);
      let listValue;
      try { listValue = JSON.parse(listOutput); } catch (_) { listValue = listOutput; }
      const channels = listValue?.result?.channels || [];
      const exactChannel = channels.find((item) => String(item.name || '').endsWith(
          `/channels/${channel}`));
      url = exactChannel?.url || findPreviewUrl(listValue);
    }
    if (!url) throw new Error('Firebase önizleme adresi doğrulanamadı.');
    const revision = await runAsync('git', ['rev-parse', 'HEAD'], worktreePath, 30_000);
    return {url, revision, branch, worktreePath, channel, sourceFile: patch.sourceFile,
      appliedChangeIds: patch.applied, pendingChangeIds: patch.pending};
  } catch (error) {
    try { await runAsync('git', ['worktree', 'remove', '--force', worktreePath],
        connection.repositoryPath, 60_000); } catch (_) { /* preserve original failure */ }
    try { await runAsync('git', ['branch', '-D', branch], connection.repositoryPath, 30_000); }
    catch (_) { /* preserve original failure */ }
    throw error;
  }
}

async function publishPreview(workflow, connection, siteUrl) {
  const execution = workflow.execution || {};
  if (!execution.worktreePath || !execution.branch || !fs.existsSync(execution.worktreePath)) {
    throw new Error('Önizlemenin Git çalışma alanı bulunamadı.');
  }
  const currentBranch = run('git', ['branch', '--show-current'], connection.repositoryPath);
  if (currentBranch !== connection.branch) {
    throw new Error(`Canlı yayın için ${connection.branch} dalı açık olmalı.`);
  }
  const tracked = run('git', ['status', '--porcelain', '--untracked-files=no'],
      connection.repositoryPath);
  if (tracked) throw new Error('Kaynak depoda commit edilmemiş değişiklikler var; canlı yayın durduruldu.');
  await runAsync('git', ['merge', '--ff-only', execution.branch], connection.repositoryPath,
      60_000);
  await runAsync('git', ['push', 'origin', connection.branch], connection.repositoryPath,
      5 * 60_000);
  const publishCommand = firebaseInvocation(['deploy', '--only', 'hosting', '--project',
    connection.firebaseProject, '--json', '--non-interactive']);
  await runAsync(publishCommand.command, publishCommand.args, execution.worktreePath,
      10 * 60_000);
  try {
    await runAsync('git', ['worktree', 'remove', '--force', execution.worktreePath],
        connection.repositoryPath, 60_000);
    await runAsync('git', ['branch', '-d', execution.branch], connection.repositoryPath,
        30_000);
  } catch (_) { /* successful deploy is not invalidated by cleanup failure */ }
  return {url: new URL(workflow.targetPath, siteUrl).href,
    revision: execution.revision, pushedBranch: connection.branch};
}

module.exports = {applyWorkflowChanges, detectConnection, findPreviewUrl, firebaseInvocation,
  inspectConnection,
  preparePreview, publicConnection, publishPreview};
