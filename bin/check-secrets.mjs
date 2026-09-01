#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const signatures=[
  ['özel anahtar',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['Google API anahtarı',/AIza[0-9A-Za-z_-]{30,}/u],
  ['Google OAuth gizli anahtarı',/GOCSPX-[0-9A-Za-z_-]{20,}/u],
  ['Google yenileme tokenı',/1\/\/[0-9A-Za-z_-]{30,}/u],
  ['GitHub tokenı',/gh[oprsu]_[0-9A-Za-z]{30,}/u],
];
const findings=[];
for(const file of files){
  let value;try{value=readFileSync(file,'utf8');}catch{continue;}
  for(const [label,pattern] of signatures)if(pattern.test(value))findings.push(`${file}: ${label}`);
}
if(findings.length){console.error(`Gizli bilgi taraması başarısız:\n${findings.join('\n')}`);process.exit(1);}
console.log(`${files.length} izlenen dosya tarandı; bilinen gizli bilgi imzası bulunmadı.`);
