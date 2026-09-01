'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-projects-'));
process.env.SEO_AUTOPILOT_DATA_DIR = directory;
const store = require('../src/project-store');

test.after(() => fs.rmSync(directory, {recursive: true, force: true}));

test('creates and isolates multiple SEO projects', () => {
  const created = store.createProject({name: 'Example Commerce', siteUrl: 'https://shop.example.com'});
  const projects = store.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(created.searchConsoleProperty, 'sc-domain:shop.example.com');
  assert.equal(projects[0].id, created.id);
});

test('never exposes OAuth tokens in public project objects', () => {
  const project = store.listProjects()[0];
  store.updateProject(project.id, {oauth: {refreshToken: 'private-token'}});
  const publicValue = store.getProject(project.id);
  const privateValue = store.getPrivateProject(project.id);
  assert.equal(publicValue.oauth, undefined);
  assert.equal(publicValue.connection, 'connected');
  assert.equal(privateValue.oauth.refreshToken, 'private-token');
});

test('stores deployment connections per project without exposing the requested alias', () => {
  const project = store.listProjects()[0];
  store.updateProject(project.id, {deployment: {source: 'local_git',
    requestedPath: 'C:\\Alias', repositoryPath: 'C:\\RealRepo', branch: 'main',
    provider: 'firebase_hosting'}});
  const publicValue = store.getProject(project.id);
  assert.equal(publicValue.deployment.repositoryPath, 'C:\\RealRepo');
  assert.equal(publicValue.deployment.requestedPath, undefined);
});

test('parallel processes cannot overwrite each other project mutations', async () => {
  const modulePath=path.join(__dirname,'../src/project-store.js');
  const jobs=Array.from({length:10},(_,index)=>new Promise((resolve,reject)=>{
    const code=`const s=require(${JSON.stringify(modulePath)});s.createProject({name:'Parallel ${index}',siteUrl:'https://parallel-${index}.example.com'});`;
    const child=spawn(process.execPath,['-e',code],{env:{...process.env,SEO_AUTOPILOT_DATA_DIR:directory},stdio:'pipe'});
    let error='';child.stderr.on('data',(chunk)=>{error+=chunk;});child.on('error',reject);
    child.on('exit',(status)=>status===0?resolve():reject(new Error(error||`child ${status}`)));
  }));
  await Promise.all(jobs);
  const projects=store.listProjects();
  for(let index=0;index<10;index++)assert.ok(projects.some((project)=>project.siteUrl===`https://parallel-${index}.example.com`));
  assert.equal(fs.existsSync(path.join(directory,'projects.lock')),false);
});
