'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {applyWorkflowChanges, detectConnection, firebaseInvocation,
  inspectConnection} = require('../src/deployment');

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
