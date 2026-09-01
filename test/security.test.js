'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildEnvironment, firebaseEnvironment} = require('../src/firebase-access');
const {decrypt, encrypt, sanitizeError, securityHeaders} = require('../src/security');

test('encrypts local secrets with authenticated encryption and rejects tampering', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-security-'));
  try {
    const protectedValue = encrypt('private-refresh-token', directory);
    assert.doesNotMatch(protectedValue, /private-refresh-token/u);
    assert.equal(decrypt(protectedValue, directory), 'private-refresh-token');
    assert.throws(() => decrypt(`${protectedValue.slice(0, -1)}A`, directory), /açılamadı/u);
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('child processes receive only an allowlisted environment', () => {
  const source = {PATH: 'safe', SYSTEMROOT: 'system', GOOGLE_CLIENT_SECRET: 'private',
    GITHUB_TOKEN: 'private', NODE_OPTIONS: '--require malicious.js'};
  assert.deepEqual(firebaseEnvironment(source), {PATH: 'safe', SYSTEMROOT: 'system'});
  const build = buildEnvironment(source);
  assert.equal(build.GOOGLE_CLIENT_SECRET, undefined);
  assert.equal(build.GITHUB_TOKEN, undefined);
  assert.equal(build.NODE_OPTIONS, undefined);
  assert.equal(build.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
});

test('security responses block framing, sniffing and broad browser capabilities', () => {
  const headers = securityHeaders();
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/u);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
});

test('operator errors redact paths and token-shaped values', () => {
  const value = sanitizeError(new Error('failed C:\\Users\\name\\secret access_token=private-value'));
  assert.doesNotMatch(value, /Users|private-value/u);
  const childOutput = sanitizeError("'tsc' is not recognized as an internal or external command.",
      'node.exe çalıştırılamadı.');
  assert.match(childOutput, /tsc.*not recognized/u);
  assert.doesNotMatch(childOutput, /node\.exe çalıştırılamadı/u);
});
