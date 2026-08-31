'use strict';
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');

function publicAddress(ip) {
  if (net.isIP(ip) === 6) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0):/i.test(ip);
  if (net.isIP(ip) !== 4) return false;
  const [a,b] = ip.split('.').map(Number);
  return !([0,10,127].includes(a) || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&[0,168].includes(b)) || (a===100&&b>=64&&b<=127) || (a===198&&[18,19,51].includes(b)) || (a===203&&b===0));
}
function allowedUrl(value, origin) {
  const url = new URL(value,origin);
  if (url.protocol!=='https:' || url.origin!==origin || url.username || url.password || url.port) throw Error('Yalnız projenin HTTPS alan adı incelenebilir.');
  url.hash=''; return url;
}
async function readPage(value, origin, redirects=0) {
  const url=allowedUrl(value,origin);
  let lookupTimer;
  const addresses=await Promise.race([dns.lookup(url.hostname,{all:true}),new Promise((_,reject)=>{lookupTimer=setTimeout(()=>reject(Error('Alan adı çözümleme zaman aşımı.')),5000);})]).finally(()=>clearTimeout(lookupTimer));
  if (!addresses.length || addresses.some(x=>!publicAddress(x.address))) throw Error('Özel ağ adresi taranamaz.');
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'SEOAutoPilot/0.8 SiteInspection','Accept':'text/html,application/xml,text/xml'},
      lookup:(_host,options,callback)=>callback(null,...(options.all?[[selected]]:[selected.address,selected.family]))},res=>{
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume(); if(redirects>=3) return reject(Error('Çok fazla yönlendirme.'));
        readPage(new URL(res.headers.location||'',url).href,origin,redirects+1).then(resolve,reject); return;
      }
      if(res.statusCode!==200){res.resume();reject(Error(`HTTP ${res.statusCode}`));return;}
      let size=0; const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>1500000) req.destroy(Error('Sayfa boyutu sınırı aşıldı.'));else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolve({url:url.href,body:Buffer.concat(chunks).toString('utf8'),type:res.headers['content-type']||''}));
    });
    const timer=setTimeout(()=>req.destroy(Error('Sayfa zaman aşımı.')),7000);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
}
function decode(value) { return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>'); }
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
}
function language(value) { try {return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value||'')?Intl.getCanonicalLocales(value)[0]:null;} catch{return null;} }
function extract(html,url) {
  // Page contents are evidence, never executable code or instructions.
  const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const declared=language(attrs(clean.match(/<html\b[^>]*>/i)?.[0]||'').lang);
  const links=[...clean.matchAll(/<(?:a|link)\b[^>]*>/gi)].map(m=>attrs(m[0]));
  const title=decode(clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim().slice(0,180);
  const description=[...clean.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>a.name?.toLowerCase()==='description')?.content?.slice(0,1000)||'';
  const styles=links.filter(a=>(a.rel||'').split(/\s+/).includes('stylesheet')).map(a=>a.href).filter(Boolean).slice(0,8);
  const text=clean.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  return {url,title,description,language:text.length>=160?declared:null,declaredLanguage:declared,
    warning:text.length<160?'İçerik yetersiz veya JavaScript ile yükleniyor.':!declared?'Sayfada dil bildirimi yok.':null,
    links:links.filter(a=>a.href).map(a=>({href:a.href,language:language(a.hreflang),alternate:(a.rel||'').includes('alternate')})),styles};
}
async function inspectSite(project,{reader=readPage,onProgress=()=>{}}={}) {
  const origin=new URL(project.siteUrl).origin;
  allowedUrl(project.siteUrl,origin);
  const queue=[project.siteUrl,new URL('/sitemap.xml',origin).href]; const seen=new Set(); const pages=[]; const errors=[];
  const started=Date.now(); let sitemapCount=0;
  const enqueue=value=>{try {const u=allowedUrl(value,origin);if(!/\.(?:png|jpg|svg|css|js|pdf|zip|ico|webp|woff2?)$/i.test(u.pathname)&&queue.length<150)queue.push(u.href);}catch{/* external links excluded */}};
  for(const page of (project.lastSyncReport?.details?.pages||[]).slice(0,20))enqueue(page.url);
  while(queue.length&&seen.size<40&&Date.now()-started<60000){
    const url=queue.shift();if(seen.has(url))continue;seen.add(url);
    onProgress({visited:seen.size,pages:pages.length});
    try {
      const result=await reader(url,origin);
      if(/<urlset\b|<sitemapindex\b/i.test(result.body)) {
        if(++sitemapCount<=5) for(const match of result.body.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi))enqueue(decode(match[1].trim()));
        continue;
      }
      if(!/html/i.test(result.type)&&!/<html\b/i.test(result.body)) continue;
      const page=extract(result.body,result.url);pages.push(page);
      for(const link of page.links) {try{enqueue(new URL(link.href,result.url).href);}catch{}}
    }catch(error){errors.push({url,error:error.message});}
  }
  if(!pages.length)throw Error('Site okunamadı. HTTPS adresini ve erişimi kontrol et.');
  const byUrl=new Map(pages.map(p=>[p.url,p]));
  for(const p of pages)for(const link of p.links.filter(l=>l.alternate&&l.language)){
    try {const target=byUrl.get(new URL(link.href,p.url).href);if(target?.language&&target.language!==link.language){target.warning='Dil bildirimi ile alternatif dil bağlantısı çelişiyor.';target.language=null;}}catch{}
  }
  const languages=[...new Set(pages.map(p=>p.language).filter(Boolean))];
  const home=pages.find(p=>p.url===project.siteUrl||p.url===project.siteUrl+'/')||pages[0];
  return {scannedAt:new Date().toISOString(),profileRevision:project.profile.revision,siteUrl:project.siteUrl,
    languages,homeLanguage:home.language,description:home.description,
    pages:pages.map(({links,...p})=>p),errors,limited:queue.length>0,
    styles:[...new Set(pages.flatMap(p=>p.styles))].slice(0,12),
    note:'Sunucunun gönderdiği HTML incelendi. JavaScript, ülkeye göre açılış ve Googlebot görünümü doğrulanmadı.'};
}
function profileFromInspection(project,result,choice) {
  if(result.profileRevision!==project.profile.revision||result.siteUrl!==project.siteUrl)throw Error('Profil değişti; incelemeyi yenile.');
  if(!result.languages.length)throw Error('İçerik dili doğrulanamadı; otomatik profil kaydedilmedi.');
  const p=project.profile;
  const primary=p.primaryLanguage||result.homeLanguage||choice||(result.languages.length===1?result.languages[0]:'');
  const languages=[...new Set([...p.languages,...result.languages])];
  if(!languages.includes(primary))throw Error('Ana içerik dilini seç.');
  const mappings=new Map(p.pageLanguages.map(x=>[x.path,x]));
  for(const page of result.pages) {const u=new URL(page.url);const path=u.pathname+u.search;
    if(!page.language)mappings.delete(path);
    else if(!mappings.has(path))mappings.set(path,{path,language:page.language});}
  return {...p,languages,requirePageEvidence:true,primaryLanguage:primary,fallbackLanguage:p.fallbackLanguage||primary,
    business:{...p.business,description:p.business.description||result.description},
    pageLanguages:[...mappings.values()],keepLegacyAnalysis:p.analysisPreset==='legacy_lingodecoder'};
}
module.exports={inspectSite,profileFromInspection,extract,publicAddress,allowedUrl};
