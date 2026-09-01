'use strict';
const crypto=require('node:crypto');
const {assertProfileWorkflow}=require('./profile-analysis');
const {beginExecution,finishExecution,beginPublish,finishPublish,failExecution}=require('./workflow');
const FIELDS=new Set(['title','meta','h1']);
function plan(project){
  const items=[],skipped=[],notReady=[],paths=new Set();
  for(const w of project.workflows||[]){
    if(['PUBLISHED','MONITORING','COMPLETED','REJECTED'].includes(w.status)||w.execution?.appliedAt)continue;
    if(w.blockedReason){
      notReady.push({id:w.id,title:w.title,status:w.status,reason:w.blockedReason});
      continue;
    }
    if(!['AWAITING_APPROVAL','APPROVED','PREVIEW_READY'].includes(w.status)){
      notReady.push({id:w.id,title:w.title,status:w.status,reason:'Henüz uygulanacak değişiklik taslağı hazırlanmamış.'});
      continue;
    }
    let reason='';try{assertProfileWorkflow(project,w);}catch(e){reason=e.message;}
    if(!reason&&w.action!=='UPDATE_EXISTING')reason='Yeni içerik, bekleme veya varyant seçimi gerektiriyor; ayrı incele.';
    const changes=(w.brief?.changes||[]).filter(c=>FIELDS.has(c.id));
    if(!reason&&(!changes.length||changes.some(c=>typeof c.proposed!=='string'||!c.proposed.trim())))reason='Uygulanabilir kesin değişiklik yok.';
    if(!reason&&paths.has(w.targetPath))reason='Aynı sayfa için başka bir öneri var.';
    if(reason){skipped.push({id:w.id,title:w.title,reason,action:w.action});continue;}
    paths.add(w.targetPath);items.push({id:w.id,title:w.title,targetPath:w.targetPath,changes,pending:(w.brief.changes||[]).filter(c=>!FIELDS.has(c.id)),briefHash:w.briefHash,profileRevision:w.profileRevision});
  }
  const token=crypto.createHash('sha256').update(JSON.stringify({site:project.siteUrl,profile:project.profile,connection:project.deployment,items})).digest('hex');
  return {token,items,skipped,notReady};
}
function createBulkPublisher(store,deployment,reportForProject){
  let running=false;
  const isBusy=()=>running;
  function save(id,job,workflow){const p=store.getPrivateProject(id);store.updateProject(id,{bulkPublish:job,...(workflow?{workflows:p.workflows.map(w=>w.id===workflow.id?workflow:w)}:{})});}
  function recover(){for(const p of store.listProjects()){const privateProject=store.getPrivateProject(p.id);if(privateProject.bulkPublish?.status==='running'){
    const job={...privateProject.bulkPublish,status:'interrupted',items:privateProject.bulkPublish.items.map(i=>['preparing','publishing'].includes(i.status)?{...i,status:'interrupted'}:i),error:'Sunucu kapandı. Son yayın gerçekleşmiş olabilir; canlı sayfayı kontrol et. Otomatik tekrar yapılmadı.',finishedAt:new Date().toISOString()};
    const workflows=privateProject.workflows.map(w=>job.items.some(i=>i.id===w.id)&&['APPLYING','PUBLISHING'].includes(w.status)?failExecution(w,job.error):w);
    store.updateProject(p.id,{bulkPublish:job,workflows});
  }}}
  async function execute(id,job,snapshot){
    try{
      for(const item of job.items){
        let p=store.getPrivateProject(id);let w=p.workflows.find(w=>w.id===item.id);
        if(p.profile.revision!==snapshot.profile.revision||JSON.stringify(p.deployment)!==JSON.stringify(snapshot.deployment)||!w||w.briefHash!==item.briefHash)throw Error('Profil, bağlantı veya öneri değişti; toplu yayın durduruldu.');
        assertProfileWorkflow(p,w);
        job.currentId=item.id;item.status='preparing';save(id,job);
        w={...w,status:'APPROVED',approvedAt:job.startedAt,execution:null,events:[...(w.events||[]),{type:'BULK_APPROVED',actor:'user',at:job.startedAt,label:'Bu değişiklikler ve canlı yayın toplu olarak onaylandı.'}]};
        w=beginExecution(w,'bulk_local_git_build');save(id,job,w);
        const prepared=await deployment.preparePreview(w,p.deployment);
        w=finishExecution(w,prepared);save(id,job,w);
        w=beginPublish(w);item.status='publishing';save(id,job,w);
        const published=await deployment.publishPreview(w,p.deployment,p.siteUrl);
        const now=new Date().toISOString();
        w=finishPublish(w,published,now,reportForProject?.(p)||p.lastSyncReport||null);item.status='published';item.url=published.url;item.finishedAt=now;save(id,job,w);
      }
      job.status='completed';
    }catch(error){
      job.status='failed';job.error=error.message;
      const item=job.items.find(i=>i.id===job.currentId);if(item)item.status='failed';
      const w=store.getPrivateProject(id)?.workflows.find(w=>w.id===job.currentId);
      if(w)save(id,job,failExecution(w,error.message));
    }finally{job.finishedAt=new Date().toISOString();save(id,job);running=false;}
  }
  function start(id,input){
    if(running)throw Error('Bir toplu yayın zaten sürüyor.');
    const p=store.getPrivateProject(id);if(!p)throw Error('Proje bulunamadı.');
    if(!p.deployment)throw Error('Önce site yayın bağlantısını kur.');
    if(store.listProjects().some(x=>(store.getPrivateProject(x.id).workflows||[]).some(w=>['APPLYING','PUBLISHING'].includes(w.status))))throw Error('Devam eden hazırlık/yayın var.');
    const review=plan(p);
    if(input.confirmation!=='PUBLISH_REVIEWED_CHANGES'||input.token!==review.token)throw Error('Toplu onay eksik veya öneriler değişmiş. Listeyi yeniden incele.');
    if(!review.items.length)throw Error('Toplu yayına uygun öneri yok.');
    const job={id:crypto.randomUUID(),status:'running',startedAt:new Date().toISOString(),items:review.items.map(i=>({...i,status:'queued'}))};
    save(id,job);running=true;setImmediate(()=>execute(id,job,p));return job;
  }
  return {start,isBusy,recover};
}
module.exports={plan,createBulkPublisher};
