'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {execFile} = require('node:child_process');
const {firebaseEnvironment, resolveFirebaseAccount} = require('./firebase-access');

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

function safeDirectory(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      relative.includes('\\') || relative.split('/').some((part) => part === '..')) {
    throw new Error('Kaynak veya yayın klasörü proje içinde olmalı.');
  }
  const resolved = path.resolve(root, relative);
  const inside = path.relative(root, resolved);
  if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Klasör proje dışında.');
  return resolved;
}

function projectLayout(root) {
  const packagePath = path.join(root, 'package.json');
  const pkg = fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, 'utf8')) : {};
  const configPath = path.join(root, 'firebase.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  if (Array.isArray(config.hosting)) throw new Error('Birden fazla Firebase Hosting hedefi için açık hedef seçimi gerekli.');
  const hasFlutter = fs.existsSync(path.join(root, 'pubspec.yaml'));
  const hasVite = Boolean(pkg.dependencies?.vite || pkg.devDependencies?.vite);
  const sourceDirectory = hasVite ? 'public' : 'web';
  const outputDirectory = config.hosting?.public || (hasVite ? 'dist' : hasFlutter ? 'build/web' : 'web');
  safeDirectory(root, sourceDirectory); safeDirectory(root, outputDirectory);
  if (hasVite && !pkg.scripts?.build) throw new Error('Vite projesinde npm build komutu tanımlanmalı.');
  if (config.hosting?.target) throw new Error('Firebase Hosting target eşleştirmesi henüz desteklenmiyor; açık site kimliği gerekli.');
  return {framework: hasFlutter ? 'flutter' : hasVite ? 'vite' : 'static',
    firebaseSite: config.hosting?.site || readFirebaseProject(root),
    sourceDirectory, outputDirectory,
    releaseBuilder: hasFlutter && fs.existsSync(path.join(root, 'tool', 'build_web_release.mjs')) ?
      'lingodecoder_flutter_release' : hasFlutter ? 'flutter_web_release' : hasVite ? 'vite_release' : 'static_site'};
}

function npmInvocation(args) {
  if (process.platform !== 'win32') return {command: 'npm', args};
  const candidates = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find((file) => file && file.endsWith('npm-cli.js') && fs.existsSync(file));
  if (!cli) throw new Error('npm Node giriş dosyası bulunamadı.');
  return {command: process.execPath, args: [cli, ...args]};
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
  const firebaseProject = hasFirebase ? readFirebaseProject(gitRoot) : '';
  const layout = projectLayout(gitRoot);
  let hasOrigin = false;
  try { hasOrigin = Boolean(run('git', ['remote', 'get-url', 'origin'], gitRoot)); } catch (_) { /* local-only repository */ }
  return {source: 'local_git', provider: hasFirebase ? 'firebase_hosting' : 'none',
    requestedPath, repositoryPath: gitRoot, branch, ...layout, hasOrigin,
    firebaseProject, connectedAt: new Date().toISOString()};
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
        production: detected.provider === 'firebase_hosting' && detected.hasOrigin, isolatedWorktree: true},
      publicationWarning: detected.hasOrigin ? null :
        'Yerel Git hazır; önizleme hazırlanabilir. Canlı yayın için origin uzak deposu bağlanmalı.'};
  } catch (error) { return {connected: false, state: 'error', error: error.message}; }
}

function publicConnection(connection) {
  if (!connection) return null;
  const {requestedPath, ...safe} = connection;
  return safe;
}

function firebaseJson(args, cwd) {
  const invocation = firebaseInvocation(args);
  return new Promise((resolve, reject) => {
    execFile(invocation.command, invocation.args, {cwd, encoding: 'utf8', windowsHide: true,
      timeout: 45_000, maxBuffer: 4 * 1024 * 1024, env: firebaseEnvironment()}, (error, stdout) => {
      // Never include raw stdout/stderr here: login:list returns credential objects.
      if (error) return reject(new Error('Firebase erişim kontrolü başarısız.'));
      try { resolve(JSON.parse(stdout)); } catch (_) { reject(new Error('Firebase yanıtı okunamadı.')); }
    });
  });
}

async function inspectFirebaseConnection(connection, runner) {
  const checked = inspectConnection(connection);
  if (!checked.connected) return checked;
  const access = await resolveFirebaseAccount(checked.connection,
    runner || (args => firebaseJson(args, checked.connection.repositoryPath)));
  return {...checked, state: access.verified ? checked.state : 'attention', firebaseAccess: access,
    connection: {...checked.connection, firebaseAccount: access.account},
    capabilities: {...checked.capabilities, preview: checked.capabilities.preview && access.verified,
      production: checked.capabilities.production && access.verified},
    publicationWarning: access.error || checked.publicationWarning};
}

function runAsync(command, args, cwd, timeout = 20 * 60_000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {cwd, encoding: 'utf8', timeout, windowsHide: true, env: firebaseEnvironment(),
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

function seoFields(html) {
  const text=value=>String(value||'').replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim()
      .replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
  const meta=(String(html).match(/<meta\b[^>]*name=["']description["'][^>]*>/iu)?.[0]||
    String(html).match(/<meta\b[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/iu)?.[0]||'');
  return {title:text(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]),
    meta:text(meta.match(/content=["']([^"']*)["']/iu)?.[1]),
    h1:text(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1])};
}

async function verifyLivePage(url, sourceFile, reader=fetch) {
  const expected=seoFields(fs.readFileSync(sourceFile,'utf8'));
  let error='';
  for(let attempt=0;attempt<5;attempt++){
    try{
      const target=new URL(url);target.searchParams.set('_seo_verify',Date.now().toString());
      const response=await reader(target.href,{headers:{'Cache-Control':'no-cache'},redirect:'follow'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const actual=seoFields(await response.text());
      const mismatched=['title','meta','h1'].filter(key=>expected[key]!==actual[key]);
      if(!mismatched.length)return {verifiedAt:new Date().toISOString(),fields:['title','meta','h1']};
      error=`Canlı sayfada eşleşmeyen alanlar: ${mismatched.join(', ')}`;
    }catch(exception){error=exception.message;}
    if(attempt<4)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error(`Firebase yayınlandı ancak canlı URL doğrulanamadı. ${error}`);
}

function targetFile(root, targetPath) {
  const raw = String(targetPath || '').split(/[?#]/u)[0];
  let relative;
  try { relative = decodeURIComponent(raw).replace(/^\/+|\/+$/gu, ''); }
  catch (_) { throw new Error('Hedef sayfa adresi geçersiz.'); }
  if (!relative || relative.includes('\\') || relative.includes(':') ||
      relative.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error('Güvenli bir hedef sayfa yolu bulunamadı.');
  }
  const sourceRoot = safeDirectory(root, projectLayout(root).sourceDirectory);
  const candidates = /\.html?$/iu.test(relative) ? [path.join(sourceRoot, relative)] :
    [path.join(sourceRoot, `${relative}.html`), path.join(sourceRoot, relative, 'index.html')];
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  if (!selected) throw new Error(`Hedef sayfanın kaynak dosyası bulunamadı: ${targetPath}`);
  const actualRoot = fs.realpathSync.native(sourceRoot);
  const actual = fs.realpathSync.native(selected);
  const within = path.relative(actualRoot, actual);
  const rootWithin = path.relative(fs.realpathSync.native(root), actualRoot);
  if (within.startsWith('..') || path.isAbsolute(within) || rootWithin.startsWith('..') ||
      path.isAbsolute(rootWithin) || !fs.statSync(actual).isFile()) {
    throw new Error('Hedef dosya kaynak klasörünün dışında.');
  }
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
    const brand = String(workflow.brandName || '').trim();
    const suffix = brand && current.endsWith(brand) && /\s[—|\-]\s$/u.test(current.slice(0, -brand.length)) &&
      !String(title.proposed).endsWith(brand) ? ` — ${brand}` : '';
    html = replaceRequired(html, /<title>[^<]+<\/title>/u,
        `<title>${htmlEscape(title.proposed)}${suffix}</title>`, 'SEO başlığı');
    applied.push(title.id);
  }
  const meta = changes.get('meta');
  if (meta) {
    html = replaceRequired(html, /<meta name="description" content="[^"]*"\s*\/?>/u,
        `<meta name="description" content="${htmlEscape(meta.proposed, true)}">`,
        'Meta açıklaması');
    applied.push(meta.id);
  }
  const h1 = changes.get('h1');
  if (h1) {
    html = replaceRequired(html, /(<h1(?:\s[^>]*)?>)[\s\S]*?(<\/h1>)/u,
        (_, opening, closing) => `${opening}${htmlEscape(h1.proposed)}${closing}`, 'H1');
    applied.push(h1.id);
  }
  if (!applied.length) throw new Error('Bu öneride otomatik uygulanabilir kesin bir değişiklik yok.');
  fs.writeFileSync(filePath, html, 'utf8');
  return {sourceFile: path.relative(root, filePath).replaceAll('\\', '/'), applied,
    pending: [...changes.keys()].filter((id) => !applied.includes(id))};
}

function verifyBuiltPage(root, sourceFile) {
  const layout = projectLayout(root);
  const sourceRoot = safeDirectory(root, layout.sourceDirectory);
  const outputRoot = safeDirectory(root, layout.outputDirectory);
  const sourcePath = path.resolve(root, sourceFile);
  const relative = path.relative(sourceRoot, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Kaynak sayfa yolu geçersiz.');
  const built = path.join(outputRoot, relative);
  if (!fs.existsSync(built) || fs.readFileSync(sourcePath, 'utf8') !== fs.readFileSync(built, 'utf8')) {
    throw new Error('Derlenen hedef sayfa kaynakla eşleşmiyor; yayın durduruldu.');
  }
  return built;
}

async function buildProject(root, account) {
  const layout = projectLayout(root);
  if (layout.releaseBuilder === 'lingodecoder_flutter_release') {
    if (account) {
      // Nested Firebase calls in the existing release script use only this isolated directory's account.
      if (!fs.existsSync(path.join(root, 'firebase.json'))) throw new Error('İzole Firebase yapılandırması gerekli.');
      const select = firebaseInvocation(['login:use', account, '--non-interactive']);
      try { await runAsync(select.command, select.args, root, 30_000); }
      catch (error) { if (!error.message.includes('Already using account')) throw new Error('Derleme hesabı seçilemedi.'); }
    }
    await runAsync(process.execPath, ['tool/build_web_release.mjs'], root);
  } else if (layout.releaseBuilder === 'vite_release') {
    if (!fs.existsSync(path.join(root, 'package-lock.json'))) throw new Error('Güvenli Vite derlemesi için package-lock.json gerekli.');
    // Install inside the isolated worktree, never copy the source site's node_modules or secrets.
    const install = npmInvocation(['ci', '--no-audit', '--no-fund']);
    await runAsync(install.command, install.args, root);
    const build = npmInvocation(['run', 'build']);
    await runAsync(build.command, build.args, root);
  } else if (layout.releaseBuilder === 'flutter_web_release') {
    throw new Error('Bu Flutter projesi için güvenli release build betiği tanımlanmamış.');
  }
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
  const checked = await inspectFirebaseConnection(connection);
  if (!checked.connected || connection.provider !== 'firebase_hosting') {
    throw new Error(checked.error || 'Firebase Hosting bağlantısı hazır değil.');
  }
  if (!connection.firebaseProject) throw new Error('Firebase proje kimliği bulunamadı.');
  if (!checked.capabilities?.preview) throw new Error(checked.publicationWarning || 'Firebase erişimi doğrulanmadı.');
  const account = checked.firebaseAccess.account;
  if (checked.connection.firebaseProject !== connection.firebaseProject) throw new Error('Firebase proje ayarı değişmiş; bağlantıyı yeniden kaydet.');
  const stamp = Date.now().toString(36);
  const branch = `seoautopilot/${workflow.id}-${stamp}`;
  const worktreePath = path.join(deploymentRoot(), `${workflow.projectId}-${workflow.id}-${stamp}`);
  fs.mkdirSync(path.dirname(worktreePath), {recursive: true});
  await runAsync('git', ['worktree', 'add', '-b', branch, worktreePath,
    connection.branch], connection.repositoryPath, 60_000);
  try {
    if (readFirebaseProject(worktreePath) !== connection.firebaseProject ||
        projectLayout(worktreePath).firebaseSite !== checked.connection.firebaseSite) {
      throw new Error('Kaynak dal ile doğrulanan Firebase hedefi farklı; bağlantıyı kontrol et.');
    }
    const patch = applyWorkflowChanges(workflow, worktreePath);
    await runAsync('git', ['add', '--', patch.sourceFile], worktreePath, 30_000);
    await runAsync('git', ['-c', 'user.name=SEOAutoPilot',
      '-c', 'user.email=seoautopilot@localhost', 'commit', '-m',
      `seo: ${workflow.title}`], worktreePath, 60_000);
    if (fs.existsSync(path.join(worktreePath, 'tool', 'verify_seo.mjs'))) {
      await runAsync('node', ['tool/verify_seo.mjs'], worktreePath, 120_000);
    }
    await buildProject(worktreePath, account);
    verifyBuiltPage(worktreePath, patch.sourceFile);
    const revision = await runAsync('git', ['rev-parse', 'HEAD'], worktreePath, 30_000);
    return {prepared: true, url: null, previewPageUrl: null,
      revision, branch, worktreePath, firebaseAccount: account,
      firebaseProject: connection.firebaseProject, firebaseSite: checked.connection.firebaseSite, sourceFile: patch.sourceFile,
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
  if (!connection?.repositoryPath) throw new Error('Site güncelleme bağlantısı kurulmamış.');
  const checked = inspectConnection(connection);
  if (!checked.capabilities?.production) throw new Error(checked.publicationWarning || checked.error || 'Canlı yayın bağlantısı hazır değil.');
  const authorized = await inspectFirebaseConnection(connection);
  if (!authorized.capabilities?.production) throw new Error(authorized.publicationWarning || 'Firebase erişimi doğrulanmadı.');
  const execution = workflow.execution || {};
  if (authorized.connection.firebaseProject !== connection.firebaseProject ||
      (execution.firebaseProject && execution.firebaseProject !== connection.firebaseProject) ||
      (execution.firebaseSite && execution.firebaseSite !== authorized.connection.firebaseSite)) {
    throw new Error('Önizleme ile yayın hedefi farklı; yeni önizleme gerekli.');
  }
  if (!execution.worktreePath || !execution.branch || !fs.existsSync(execution.worktreePath)) {
    throw new Error('Önizlemenin Git çalışma alanı bulunamadı.');
  }
  if (readFirebaseProject(execution.worktreePath) !== connection.firebaseProject ||
      projectLayout(execution.worktreePath).firebaseSite !== authorized.connection.firebaseSite) {
    throw new Error('Önizleme çalışma alanının Firebase hedefi değişmiş; yeni önizleme gerekli.');
  }
  if (execution.prepared) {
    const revision = run('git', ['rev-parse', 'HEAD'], execution.worktreePath).trim();
    if (revision !== String(execution.revision).trim() || run('git', ['status', '--porcelain', '--untracked-files=no'], execution.worktreePath)) {
      throw new Error('Hazırlanan kaynak değişmiş; değişiklikleri yeniden hazırla.');
    }
    verifyBuiltPage(execution.worktreePath, execution.sourceFile);
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
    connection.firebaseProject, '--json', '--non-interactive', '--account', authorized.firebaseAccess.account]);
  await runAsync(publishCommand.command, publishCommand.args, execution.worktreePath,
      10 * 60_000);
  const liveUrl=new URL(workflow.targetPath,siteUrl).href;
  const liveVerification=await verifyLivePage(liveUrl,path.resolve(execution.worktreePath,execution.sourceFile));
  try {
    await runAsync('git', ['worktree', 'remove', '--force', execution.worktreePath],
        connection.repositoryPath, 60_000);
    await runAsync('git', ['branch', '-d', execution.branch], connection.repositoryPath,
        30_000);
  } catch (_) { /* successful deploy is not invalidated by cleanup failure */ }
  return {url:liveUrl,revision:execution.revision,pushedBranch:connection.branch,liveVerification};
}

module.exports = {applyWorkflowChanges, buildProject, detectConnection, findPreviewUrl, firebaseInvocation,
  inspectConnection, inspectFirebaseConnection, npmInvocation, projectLayout, targetFile, verifyBuiltPage,
  preparePreview, publicConnection, publishPreview,seoFields,verifyLivePage};
