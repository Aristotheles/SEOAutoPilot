import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const child = spawn(process.execPath, ['server.js'], {cwd: root,
  env: {...process.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

try {
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Sunucu başlamadı. ${stderr}`)), 15_000);
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/u);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
  const landing = await fetch(`${base}/`);
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get('content-security-policy') || '', /frame-ancestors 'none'/u);
  const cookie = (landing.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^seoautopilot_session=/u);
  assert.equal((await fetch(`${base}/api/health`)).status, 401);
  const health = await fetch(`${base}/api/health`, {headers: {Cookie: cookie}});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  console.log(`Temiz kurulum duman testi geçti: ${base}`);
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
}
