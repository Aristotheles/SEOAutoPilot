'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {defaultProfile, normalizeProfile, resolveLanguage, draftBlocker} = require('../src/site-profile');
const {analysisOptions, reanalyzeReport, assertProfileWorkflow} = require('../src/profile-analysis');
const {analyzeExport} = require('../src/engine');
const {syncWorkflows, transition} = require('../src/workflow');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-profile-test-'));
process.env.SEO_AUTOPILOT_DATA_DIR = directory;
const store = require('../src/project-store');
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const file = path.join(directory,'projects.json');
const baseProject = {id:'commerce',name:'Shop',siteUrl:'https://shop.example',locales:[]};
function input(languages=['tr','en']) {
  return {...defaultProfile(baseProject), business:{brand:'Shop',description:'Products',objective:'Sales',audience:'Customers',tone:'Clear'},
    languages,primaryLanguage:languages[0],fallbackLanguage:languages.at(-1),openingPolicy:'browser_language',
    languageRoutes:languages.map(language=>({prefix:`/${language}/`,language}))};
}
test('one, two, three and regional languages remain project-defined; no forced translation',()=>{
  for(const codes of [['en'],['tr','en'],['tr','en','de'],['en-GB','fr']]) {
    const p = normalizeProfile(input(codes),baseProject);
    assert.deepEqual(p.languages,codes); assert.equal(p.coverage,'per_content');
    assert.equal(p.fallbackLanguage,codes.at(-1)); assert.equal(p.status,'confirmed');
  }
  assert.deepEqual(defaultProfile(baseProject).languages,[]);
  assert.equal(defaultProfile(baseProject).openingPolicy,'preserve_existing');
});
test('opening language is not article language and no English guessing happens',()=>{
  const p = normalizeProfile(input(),baseProject);
  assert.equal(p.fallbackLanguage,'en');
  assert.equal(resolveLanguage({targetPath:'/tr/article'},p).language,'tr');
  assert.equal(resolveLanguage({targetPath:'/article',label:'English looking title'},p).language,null);
  assert.equal(resolveLanguage({targetPath:'/article'},normalizeProfile(input(['de']),baseProject)).language,'de');
});
test('explicit mappings, longest prefixes and conflicts are checked',()=>{
  const value = input(); value.pageLanguages = [{path:'/blog/example.html',language:'tr'}];
  const p = normalizeProfile(value,baseProject);
  assert.equal(resolveLanguage({targetPath:'/blog/example.html'},p).language,'tr');
  assert.match(resolveLanguage({targetPath:'/blog/example.html',locale:'en'},p).reason,/çelişiyor/);
  assert.match(resolveLanguage({targetPath:'/en/example',locale:'tr'},p).reason,/çelişiyor/);
  assert.match(resolveLanguage({targetPath:'/de/example',locale:'de'},p).reason,/kapsamına/);
});
test('validates fields and excludes injected private or identity fields',()=>{
  assert.throws(()=>normalizeProfile({...input(),languages:[]},baseProject));
  assert.throws(()=>normalizeProfile({...input(),fallbackLanguage:'de'},baseProject));
  assert.throws(()=>normalizeProfile({...input(),languages:['bad language']},baseProject));
  assert.throws(()=>normalizeProfile({...input(),preserveExplicitUrl:false},baseProject));
  assert.throws(()=>normalizeProfile({...input(),countryRules:[{country:'XX',language:'en'}]},baseProject));
  assert.throws(()=>normalizeProfile({...input(),languageRoutes:[{prefix:'//evil.test/',language:'tr'}]},baseProject));
  for (const badPath of ['/one/../two','/one/./two','/one/%2e%2e/two']) assert.throws(()=>normalizeProfile({...input(),pageLanguages:[{path:badPath,language:'tr'}]},baseProject));
  assert.throws(()=>normalizeProfile({...input(),pageLanguages:[{path:'/one',language:'tr'},{path:'/one',language:'en'}]},baseProject));
  const p = normalizeProfile({...input(),oauth:{refreshToken:'do-not-store'},revision:999,analysisPreset:'legacy_lingodecoder'},baseProject);
  assert.equal(p.oauth,undefined); assert.equal(p.revision,1); assert.equal(p.analysisPreset,'generic');
});
test('non-supported languages and unconfirmed projects cannot approve English fallback drafts',()=>{
  const opportunity = {clusterId:'page',targetPath:'/de/product',label:'Produkt',locale:'de',action:'UPDATE_EXISTING',priority:{score:30}};
  const p = normalizeProfile(input(['de']),baseProject);
  const workflow = syncWorkflows('shop',{opportunities:[opportunity]},[],p)[0];
  assert.equal(workflow.blockedReason,null);
  assert.match(workflow.brief.changes[1].proposed,/Informationen zu Produkt/);
  assert.doesNotMatch(workflow.brief.changes[1].proposed,/learn|lernen|rules/i);
  const unknown = syncWorkflows('shop',{opportunities:[{...opportunity,locale:'und',targetPath:'/unknown'}]},[],normalizeProfile(input(),baseProject))[0];
  assert.deepEqual(unknown.brief.changes,[]); assert.throws(()=>transition(unknown,'approve'),/doğrulanmadı/);
  assert.match(draftBlocker({...opportunity,locale:'fr'},normalizeProfile(input(['fr']),baseProject)),/destek|desteği/);
  assert.match(draftBlocker(opportunity,defaultProfile(baseProject)),/onaylanmadı/);
});
test('generic engine never inherits legacy clusters; profiles explicitly opt in',()=>{
  const tables = {queries:[['key'],['almanca artikeller',0,80,'0%',25]],pages:[],chart:[]};
  assert.deepEqual(analyzeExport(tables).opportunities,[]);
  assert.deepEqual(analysisOptions({profile:normalizeProfile(input(),baseProject)}).clusters,[]);
  assert.ok(analysisOptions({profile:{languages:['tr'],analysisPreset:'legacy_lingodecoder'}}).clusters.every(x=>x.locale==='tr'));
  const report = reanalyzeReport({source:'search_console_api',generatedAt:'2026-08-01',details:{pages:[{url:'https://shop.example/item',clicks:1,impressions:50,ctr:.02,position:30}]}},{profile:normalizeProfile(input(['en']),baseProject)});
  assert.equal(report.generatedAt,'2026-08-01'); assert.equal(report.opportunities.length,1);
});
test('migration backs up exactly once, preserves accounts/reports/history and needs review',()=>{
  const original = {schemaVersion:1,projects:[{...baseProject,locales:['tr','en'],oauth:{refreshToken:'test-only-token'},
    workflows:[{id:'published',status:'PUBLISHED',execution:{appliedAt:'2026-08-01'}}],lastSyncReport:{marker:'preserve'},deployment:{repositoryPath:'test-only'}}]};
  const bytes = JSON.stringify(original); fs.writeFileSync(file,bytes);
  const publicValue = store.listProjects()[0];
  assert.equal(publicValue.profile.status,'needs_review'); assert.equal(publicValue.oauth,undefined);
  const privateValue = store.getPrivateProject(baseProject.id);
  assert.deepEqual(privateValue.oauth,original.projects[0].oauth);
  assert.deepEqual(privateValue.lastSyncReport,original.projects[0].lastSyncReport);
  assert.deepEqual(privateValue.workflows,original.projects[0].workflows);
  const backups = fs.readdirSync(path.join(directory,'backups'));
  assert.equal(backups.length,1); assert.equal(fs.readFileSync(path.join(directory,'backups',backups[0]),'utf8'),bytes);
  store.listProjects(); assert.equal(fs.readdirSync(path.join(directory,'backups')).length,1);
});
test('profile updates are isolated, revision checked and invalidate only pending approvals',()=>{
  const second = store.createProject({name:'Second',siteUrl:'https://second.example'});
  const before = store.getPrivateProject(second.id);
  const old = store.getPrivateProject(baseProject.id);
  store.updateProject(old.id,{workflows:[...old.workflows,{id:'pending',status:'PREVIEW_READY',approvedAt:'old',execution:{previewUrl:'test'}}]});
  const saved = store.saveProfile(old.id,input(),0);
  assert.equal(saved.profile.revision,1);
  const after = store.getPrivateProject(old.id);
  assert.deepEqual(after.workflows[0],old.workflows[0]);
  assert.equal(after.workflows[1].execution,null); assert.equal(after.workflows[1].approvedAt,null);
  assert.deepEqual(store.getPrivateProject(second.id),before);
  assert.throws(()=>store.saveProfile(old.id,input(),0),/değişti/);
  assert.throws(()=>assertProfileWorkflow(after,{profileRevision:0}),/Profil değişti/);
  store.updateProject(old.id,{workflows:[{id:'active',status:'PUBLISHING'}]});
  assert.throws(()=>store.saveProfile(old.id,input(),1),/sürüyor/);
});
test('corrupt data and unknown versions fail closed without overwriting',()=>{
  for(const content of ['{broken','{"schemaVersion":99,"projects":[]}','{"schemaVersion":2,"projects":[{"id":"p"}]}']) {
    fs.writeFileSync(file,content);
    assert.throws(()=>store.listProjects()); assert.throws(()=>store.createProject({name:'No',siteUrl:'https://no.example'}));
    assert.equal(fs.readFileSync(file,'utf8'),content);
  }
});

test('profile API enforces origin, revision, language validation and project isolation', async()=>{
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,projects:[{...baseProject,workflows:[]}]}));
  const server = spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),
    env:{...process.env,PORT:'0',SEO_AUTOPILOT_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
  try {
    const base = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);
      server.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
      server.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    const cookie=(await fetch(base+'/')).headers.get('set-cookie').split(';')[0];
    async function request(route,method='GET',body,origin) {
      const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie,
        ...(method!=='GET'?{Origin:origin||base}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    }
    const other=(await request('/api/projects','POST',{name:'Independent',siteUrl:'https://independent.example'})).body.project;
    const uri='/api/projects/commerce/profile';
    assert.equal((await request(uri,'PUT',{profile:input(),expectedRevision:0},'https://attacker.example')).status,403);
    assert.equal((await request(uri,'PUT',{profile:{...input(),fallbackLanguage:'de'},expectedRevision:0})).status,400);
    const saved=await request(uri,'PUT',{profile:input(),expectedRevision:0});
    assert.equal(saved.status,200); assert.equal(saved.body.project.profile.revision,1);
    assert.equal((await request(uri,'PUT',{profile:input(),expectedRevision:0})).status,400);
    assert.deepEqual(store.getProject(other.id),other);
    store.updateProject('commerce',{workflows:[{id:'stale',status:'AWAITING_APPROVAL',profileRevision:0}]});
    assert.equal((await request('/api/projects/commerce/workflows/stale/action','POST',{action:'approve'})).status,400);
    assert.equal(store.getPrivateProject('commerce').workflows[0].status,'AWAITING_APPROVAL');
  } finally {
    server.kill();
    if(server.exitCode===null) await new Promise(resolve=>server.once('exit',resolve));
  }
});
