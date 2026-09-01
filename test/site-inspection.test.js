'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {inspectSite,extract,publicAddress,allowedUrl,profileFromInspection}=require('../src/site-inspection');
const {defaultProfile,normalizeProfile,resolveLanguage}=require('../src/site-profile');
const project={name:'Example',siteUrl:'https://example.com',locales:[]};project.profile=defaultProfile(project);
const html=(lang,links='')=>`<html lang="${lang}"><head><title>Example</title><meta name="description" content="Example description"></head><body>${'Useful content. '.repeat(25)}${links}</body></html>`;
test('crawler rejects private networks, other origins, protocols and credentials',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.1.1','::1','::ffff:127.0.0.1','fc00::1','100.64.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const url of ['http://example.com','https://other.example','https://user:pass@example.com','https://example.com:8443'])assert.throws(()=>allowedUrl(url,project.siteUrl));
});
test('extracts declared languages and never executes scripts or guesses thin content',()=>{
  assert.equal(extract(html('de'),project.siteUrl).language,'de');
  assert.equal(extract('<html lang="en"><script>evil()</script><body><div id="app"></div></body></html>',project.siteUrl).language,null);
  assert.equal(extract(`<html lang="de"><script>bad ${'fake content '.repeat(30)}</script ><body>Kurz</body></html>`,project.siteUrl).language,null);
  assert.equal(extract(`<html lang="de"><style>bad ${'fake content '.repeat(30)}</style ><body>Kurz</body></html>`,project.siteUrl).language,null);
  assert.equal(extract(html('invalid-language!'),project.siteUrl).language,null);
});

test('removed title markup cannot join into a new executable tag',()=>{
  const page=extract(`<html lang="en"><head><title>Safe&lt;<b></b>script&gt;Title</title></head><body>${'Useful content. '.repeat(25)}</body></html>`,project.siteUrl);
  assert.equal(page.title,'Safe script>Title');
  assert.doesNotMatch(page.title,/<script/iu);
});
test('discovers sitemap languages, excludes external URLs and blocks unknown pages',async()=>{
  const requested=[];
  const reader=async url=>{requested.push(url);return {url,type:'text/html',body:url.endsWith('/sitemap.xml')?'<urlset><url><loc>https://example.com/de/page</loc></url><url><loc>https://example.com/unknown</loc></url><url><loc>https://evil.example/page</loc></url></urlset>':url.endsWith('/unknown')?'<html lang="en"><body>Loading</body></html>':html(url.endsWith('/de/page')?'de':'tr')};};
  const result=await inspectSite(project,{reader});assert.deepEqual(result.languages,['tr','de']);assert.equal(result.pages.length,3);
  assert.ok(requested.every(u=>u.startsWith(project.siteUrl)));
  const profile=normalizeProfile(profileFromInspection(project,result),project);
  assert.equal(profile.openingPolicy,'preserve_existing');assert.equal(profile.primaryLanguage,'tr');
  assert.equal(resolveLanguage({targetPath:'/de/page'},profile).language,'de');
  assert.equal(resolveLanguage({targetPath:'/unknown'},profile).language,null);
  assert.equal(resolveLanguage({targetPath:'/unscanned'},profile).language,null);
  assert.throws(()=>profileFromInspection({...project,profile:{...project.profile,revision:1}},result),/değişti/);
});
test('conflicting hreflang is not automatically accepted; previous preferences preserved',async()=>{
  const p={...project,profile:{...project.profile,primaryLanguage:'tr',fallbackLanguage:'en',languages:['tr','en'],openingPolicy:'browser_language'}};
  const result=await inspectSite(p,{reader:async url=>({url,type:'text/html',body:html(url.endsWith('/en')?'en':'tr','<link rel="alternate" hreflang="de" href="/en">')})});
  assert.equal(result.pages.find(p=>p.url.endsWith('/en')).language,null);
  const profile=profileFromInspection(p,result);assert.equal(profile.fallbackLanguage,'en');assert.equal(profile.openingPolicy,'browser_language');
});
