'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const PREFIX = 'enc:v1:';
const keyCache = new Map();

function restrictFile(file) {
  try { fs.chmodSync(file, 0o600); } catch (_) { /* best effort outside POSIX */ }
  if (process.platform !== 'win32') return;
  try {
    const identity = execFileSync('whoami', {encoding: 'utf8', windowsHide: true}).trim();
    execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${identity}:(F)`,
      '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'],
    {encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'ignore', 'ignore']});
  } catch (_) { throw new Error('Gizli veri dosyasının Windows erişim izinleri güvenli hale getirilemedi.'); }
}

function secureWriteFile(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, value, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  restrictFile(temporary);
  fs.renameSync(temporary, file);
}

function keyFor(dataDirectory) {
  if (keyCache.has(dataDirectory)) return keyCache.get(dataDirectory);
  const file = path.join(dataDirectory, '.master-key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDirectory, {recursive: true});
    try {
      fs.writeFileSync(file, crypto.randomBytes(32), {mode: 0o600, flag: 'wx'});
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  restrictFile(file);
  const key = fs.readFileSync(file);
  if (key.length !== 32) throw new Error('Yerel gizli veri anahtarı geçersiz; veri korunarak işlem durduruldu.');
  keyCache.set(dataDirectory, key);
  return key;
}

function encrypt(value, dataDirectory) {
  if (value == null || value === '' || String(value).startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(dataDirectory), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decrypt(value, dataDirectory) {
  if (value == null || value === '' || !String(value).startsWith(PREFIX)) return value;
  try {
    const [iv, tag, encrypted] = String(value).slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(dataDirectory), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { throw new Error('Şifrelenmiş yerel veri açılamadı; dosya korunarak işlem durduruldu.'); }
}

function sanitizeError(error, fallback = 'İşlem güvenli biçimde tamamlanamadı.') {
  const raw = typeof error === 'string' ? error : error?.message;
  const message = String(raw || '').replace(/[\r\n\t]+/gu, ' ').trim();
  if (!message) return fallback;
  return message.replace(/[A-Za-z]:\\[^\s"']+/gu, '[yerel-yol]')
      .replace(/(?:access|refresh|id)[_-]?token\s*[:=]\s*[^\s,}]+/giu, 'token=[gizlendi]')
      .slice(0, 500);
}

function securityHeaders() {
  return {'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'};
}

function auditSecurity(dataDirectory, type, detail = '') {
  try {
    fs.mkdirSync(dataDirectory, {recursive: true});
    const file = path.join(dataDirectory, 'security.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
      const archived = path.join(dataDirectory, 'security.previous.log');
      try { fs.rmSync(archived, {force: true}); } catch (_) { /* best effort rotation */ }
      fs.renameSync(file, archived); restrictFile(archived);
    }
    fs.appendFileSync(file, `${JSON.stringify({at: new Date().toISOString(), type,
      detail: sanitizeError(detail, '')})}\n`, {encoding: 'utf8', mode: 0o600});
    restrictFile(file);
  } catch (_) { /* logging failure must not expose secrets or stop operator work */ }
}

module.exports = {auditSecurity, decrypt, encrypt, restrictFile, sanitizeError, secureWriteFile,
  securityHeaders};
