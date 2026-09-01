'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('tracked repository files pass the secret signature scan',()=>{
  const root=path.join(__dirname,'..');
  const output=execFileSync(process.execPath,['bin/check-secrets.mjs'],{cwd:root,encoding:'utf8'});
  assert.match(output,/gizli bilgi imzası bulunmadı/u);
});
