import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const executable=path.join(root,'dist','SEOAutoPilot.exe');
assert.equal(fs.existsSync(executable),true,'EXE önce npm run build:exe ile oluşturulmalı.');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'seo-autopilot-exe-'));
const child=spawn(executable,[],{cwd:path.dirname(executable),windowsHide:true,
  env:{...process.env,PORT:'0',SEO_AUTOPILOT_NO_BROWSER:'1',SEO_AUTOPILOT_DATA_DIR:dataDir},
  stdio:['ignore','pipe','pipe']});
let stderr=''; child.stderr.on('data',chunk=>{stderr+=chunk;});

try {
  const base=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`EXE başlamadı. ${stderr}`)),20_000);
    child.once('error',reject);
    child.stdout.on('data',chunk=>{
      const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/u);
      if(match){clearTimeout(timeout);resolve(match[0]);}
    });
  });
  const landing=await fetch(`${base}/`);
  assert.equal(landing.status,200);
  const cookie=(landing.headers.get('set-cookie')||'').split(';')[0];
  assert.match(cookie,/^seoautopilot_session=/u);
  const health=await fetch(`${base}/api/health`,{headers:{Cookie:cookie}});
  assert.equal(health.status,200);
  assert.equal((await health.json()).ok,true);
  const duplicate=spawn(executable,[],{cwd:path.dirname(executable),windowsHide:true,
    env:{...process.env,PORT:new URL(base).port,SEO_AUTOPILOT_NO_BROWSER:'1',
      SEO_AUTOPILOT_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  let duplicateOutput='';
  duplicate.stdout.on('data',chunk=>{duplicateOutput+=chunk;});
  const duplicateExit=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{duplicate.kill();reject(new Error('İkinci EXE kapanmadı.'));},10_000);
    duplicate.once('error',reject);
    duplicate.once('exit',code=>{clearTimeout(timeout);resolve(code);});
  });
  assert.equal(duplicateExit,0);
  assert.match(duplicateOutput,/zaten çalışıyor/u);
  console.log(`Windows EXE duman testi geçti: ${base}`);
} finally {
  child.kill();
  if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  fs.rmSync(dataDir,{recursive:true,force:true});
}
