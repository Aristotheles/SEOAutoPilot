'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {applyWorkflowChanges, detectConnection, findPreviewUrl, firebaseInvocation,
  inspectConnection, inspectFirebaseConnection, npmInvocation, targetFile, verifyBuiltPage, projectLayout, publishPreview} = require('../src/deployment');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-deployment-'));
  execFileSync('git', ['init', '-b', 'main'], {cwd: directory});
  fs.writeFileSync(path.join(directory, 'firebase.json'), '{"hosting":{"public":"web"}}');
  fs.writeFileSync(path.join(directory, '.firebaserc'),
      '{"projects":{"default":"example-project"}}');
  fs.writeFileSync(path.join(directory, 'index.html'), '<h1>Example</h1>');
  execFileSync('git', ['add', '.'], {cwd: directory});
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
    'commit', '-m', 'fixture'], {cwd: directory});
  return directory;
}

test('detects a project-scoped local Git and Firebase connection', () => {
  const directory = fixture();
  const connection = detectConnection(directory);
  assert.equal(connection.source, 'local_git');
  assert.equal(connection.provider, 'firebase_hosting');
  assert.equal(connection.firebaseProject, 'example-project');
  assert.equal(connection.branch, 'main');
  assert.equal(inspectConnection(connection).state, 'ready');
});

test('fails closed for a directory that is not a Git repository', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-not-git-'));
  assert.throws(() => detectConnection(directory), /Git deposu/u);
});

test('local Git alone cannot enable preview or publication in verified connection status', async () => {
  const root = fixture();
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/test.git'], {cwd: root});
  const connection = detectConnection(root);
  const denied = await inspectFirebaseConnection(connection, async () => ({result: []}));
  assert.equal(denied.connected, true);
  assert.equal(denied.state, 'attention');
  assert.equal(denied.capabilities.preview, false);
  assert.equal(denied.capabilities.production, false);
  const verified = await inspectFirebaseConnection(connection, async args => args[0] === 'login:list' ?
    {result: [{user: {email: 'right@example.com'}, tokens: {secret: 'hidden'}}]} :
    {status: 'success', result: {sites: [{name: 'projects/example-project/sites/example-project'}]}});
  assert.equal(verified.connection.firebaseAccount, 'right@example.com');
  assert.equal(verified.capabilities.preview, true);
  assert.equal(verified.capabilities.production, true);
  assert.doesNotMatch(JSON.stringify(verified), /hidden/);
});

test('applies only exact approved HTML fields and reports pending editorial work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-html-'));
  const articleDirectory = path.join(root, 'web', 'tr', 'blog');
  fs.mkdirSync(articleDirectory, {recursive: true});
  const filePath = path.join(articleDirectory, 'ornek.html');
  fs.writeFileSync(filePath, '<title>Eski — LingoDecoder</title>\n' +
    '<meta name="description" content="Eski açıklama">\n<h1>Eski</h1><p>Gövde</p>');
  const workflow = {targetPath: '/tr/blog/ornek', brief: {changes: [
    {id: 'title', proposed: 'Yeni başlık'}, {id: 'meta', proposed: 'Yeni açıklama'},
    {id: 'h1', proposed: 'Yeni H1'}, {id: 'sections', proposed: 'Editoryal taslak'},
  ]}};
  const result = applyWorkflowChanges(workflow, root);
  const html = fs.readFileSync(filePath, 'utf8');
  assert.match(html, /<title>Yeni başlık — LingoDecoder<\/title>/u);
  assert.match(html, /content="Yeni açıklama"/u);
  assert.match(html, /<h1>Yeni H1<\/h1>/u);
  assert.deepEqual(result.pending, ['sections']);
});

test('invokes Firebase through its Node entry point on Windows', () => {
  const invocation = firebaseInvocation(['--version']);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0], /firebase-tools[\\/]lib[\\/]bin[\\/]firebase\.js$/u);
  } else {
    assert.equal(invocation.command, 'firebase');
  }
});

test('extracts a Firebase preview URL from noisy CLI output', () => {
  const output = 'Deploy complete!\n{"status":"success","result":{"url":' +
    '"https://example--seo-task-abcd.web.app"}}\nDone.';
  assert.equal(findPreviewUrl(output), 'https://example--seo-task-abcd.web.app');
});

function viteFixture() {
  const directory = fixture();
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
    devDependencies: {vite: 'test'}, scripts: {build: 'vite build'}}));
  fs.writeFileSync(path.join(directory, 'firebase.json'), JSON.stringify({hosting: {public: 'dist', site: 'example-project'}}));
  fs.mkdirSync(path.join(directory, 'public', 'blog'), {recursive: true});
  fs.writeFileSync(path.join(directory, 'public', 'blog', 'german-b1-vs-b2.html'),
    '<title>B1 vs B2</title>\n<meta name="description" content="Before" />\n<h1 class="hero">Before</h1><p>Keep body</p>');
  return directory;
}

test('detects Vite public sources and dist output independently of Flutter', () => {
  const root = viteFixture();
  const value = detectConnection(root);
  assert.equal(value.framework, 'vite');
  assert.equal(value.releaseBuilder, 'vite_release');
  assert.equal(value.sourceDirectory, 'public');
  assert.equal(value.outputDirectory, 'dist');
  assert.equal(value.hasOrigin, false);
  assert.equal(inspectConnection(value).capabilities.preview, true);
  assert.equal(inspectConnection(value).capabilities.production, false);
});

test('blocks production before any mutation when origin is missing', async () => {
  const root = viteFixture();
  const before = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'});
  await assert.rejects(publishPreview({execution: {}}, detectConnection(root), 'https://example.com'), /origin/u);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}), before);
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/test.git'], {cwd: root});
  assert.equal(inspectConnection(detectConnection(root)).capabilities.production, true);
});

test('resolves explicit .html URLs without adding another extension and accepts self-closing meta', () => {
  const root = viteFixture();
  const file = targetFile(root, '/blog/german-b1-vs-b2.html');
  assert.equal(targetFile(root, '/blog/german-b1-vs-b2'), file);
  assert.equal(targetFile(root, '/blog/german-b1-vs-b2.html?source=test#intro'), file);
  const result = applyWorkflowChanges({targetPath: '/blog/german-b1-vs-b2.html', brief: {changes: [
    {id: 'title', proposed: 'New title'}, {id: 'meta', proposed: 'New description'}, {id: 'h1', proposed: 'New H1'},
  ]}}, root);
  assert.equal(result.sourceFile, 'public/blog/german-b1-vs-b2.html');
  assert.deepEqual(result.applied, ['title', 'meta', 'h1']);
  assert.match(fs.readFileSync(file, 'utf8'), /<h1 class="hero">New H1<\/h1>/u);
  assert.match(fs.readFileSync(file, 'utf8'), /content="New description"/u);
  assert.match(fs.readFileSync(file, 'utf8'), /<p>Keep body<\/p>/u);
});

test('rejects path traversal and does not edit generated dist instead of source', () => {
  const root = viteFixture();
  for (const url of ['/../index.html', '/%2e%2e/index.html', '/blog/..%5cindex.html', '/C:/secret.html', '/%ZZ']) {
    assert.throws(() => targetFile(root, url), /Güvenli|geçersiz/u);
  }
  fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
  fs.writeFileSync(path.join(root, 'dist', 'generated.html'), '<h1>generated</h1>');
  assert.throws(() => targetFile(root, '/generated.html'), /bulunamadı/u);
});

test('requires a matching rebuilt page and safe hosting output', () => {
  const root = viteFixture();
  const sourceFile = 'public/blog/german-b1-vs-b2.html';
  assert.throws(() => verifyBuiltPage(root, sourceFile), /eşleşmiyor/u);
  fs.mkdirSync(path.join(root, 'dist', 'blog'), {recursive: true});
  const built = path.join(root, 'dist', 'blog', 'german-b1-vs-b2.html');
  fs.copyFileSync(path.join(root, sourceFile), built);
  assert.equal(verifyBuiltPage(root, sourceFile), built);
  fs.writeFileSync(built, 'stale build');
  assert.throws(() => verifyBuiltPage(root, sourceFile), /eşleşmiyor/u);
  fs.writeFileSync(path.join(root, 'firebase.json'), '{"hosting":{"public":"../elsewhere"}}');
  assert.throws(() => projectLayout(root), /proje içinde/u);
});

test('preserves Flutter layout and supports explicit HTML extension there too', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'pubspec.yaml'), 'name: example');
  fs.mkdirSync(path.join(root, 'web'), {recursive: true});
  fs.writeFileSync(path.join(root, 'web', 'example.html'), '<h1>Example</h1>');
  assert.equal(projectLayout(root).framework, 'flutter');
  assert.equal(targetFile(root, '/example.html'), path.join(root, 'web', 'example.html'));
});

test('runs npm through its Node entry point on Windows', () => {
  const invocation = npmInvocation(['--version']);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0], /npm-cli\.js$/u);
  }
  assert.match(execFileSync(invocation.command, invocation.args, {encoding: 'utf8'}), /\d+\.\d+\.\d+/u);
});
