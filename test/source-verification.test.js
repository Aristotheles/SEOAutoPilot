'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inspectSourcePage, enrichWorkflowSource} = require('../src/source-verification');

function fixture(html) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-source-'));
  fs.writeFileSync(path.join(root, 'firebase.json'), '{"hosting":{"public":"web"}}');
  fs.mkdirSync(path.join(root, 'web', 'blog'), {recursive:true});
  fs.writeFileSync(path.join(root, 'web', 'blog', 'seite.html'), html);
  return {root, project:{siteUrl:'https://example.com',deployment:{repositoryPath:root}},
    workflow:{targetPath:'/blog/seite.html',contentLanguage:'de',action:'UPDATE_EXISTING',status:'AWAITING_APPROVAL',brief:{changes:[{id:'title',proposed:'Neu'},{id:'meta',proposed:'Neue Beschreibung'}]}}};
}

test('reads trusted source SEO fields and adds existing values to the comparison', () => {
  const x=fixture('<html lang="de"><head><title>Alt &amp; gut</title><meta content="Alt" name="description"><link href="https://example.com/blog/seite.html" rel="canonical"></head><body><h1><span>Alte</span> Überschrift</h1></body></html>');
  const check=inspectSourcePage(x.workflow,x.project);
  assert.equal(check.status,'verified'); assert.equal(check.snapshot.title,'Alt & gut');
  assert.equal(check.snapshot.h1,'Alte Überschrift');
  const enriched=enrichWorkflowSource(x.workflow,x.project);
  assert.equal(enriched.brief.changes[0].current,'Alt & gut');
  assert.equal(enriched.blockedReason,null);
});

test('blocks wrong language, canonical mismatch, missing fields, and disconnected sources', () => {
  const wrong=fixture('<html lang="en"><title>Old</title><meta name="description" content="Old"><link rel="canonical" href="https://example.com/wrong"><h1>Old</h1>');
  assert.match(inspectSourcePage(wrong.workflow,wrong.project).blocker,/Dil uyuşmazlığı/u);
  wrong.workflow.contentLanguage='en';
  assert.match(inspectSourcePage(wrong.workflow,wrong.project).blocker,/Canonical uyuşmuyor/u);
  assert.match(inspectSourcePage(wrong.workflow,{siteUrl:'https://example.com'}).blocker,/Site bağlantısını kur/u);
});
