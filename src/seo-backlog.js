'use strict';

const crypto = require('node:crypto');

const LINGO_BACKLOG = Object.freeze([
  {title: 'Almanca nasıl öğrenilir?', targetPath: '/tr/blog/almanca-nasil-ogrenilir', score: 72,
    reason: 'Ana konuyu sahiplenen, ürün yöntemine açılan kapsamlı evergreen rehber.'},
  {title: 'Almanca öğrenmeye nereden başlanır?',
    targetPath: '/tr/blog/a1-almanca-nereden-baslanir', score: 78,
    reason: 'Mevcut başlangıç rehberini arama niyetine göre güçlendirme adayı.'},
  {title: 'Almanca kelime ezberlemeden nasıl öğrenilir?',
    targetPath: '/tr/blog/kelime-ezberlemeden-almanca-ogrenmek', score: 68,
    reason: 'Decode yaklaşımının farkını kullanıcı problemi üzerinden anlatır.'},
  {title: 'Almanca cümleleri kelime kelime çevirmek doğru mu?',
    targetPath: '/tr/blog/almanca-kelime-kelime-ceviri', score: 74,
    reason: 'Türkçe konuşan öğrenciyi doğrudan LingoDecoder yöntemine taşıyan konu.'},
  {title: 'Almanca düşünmeye nasıl başlanır?',
    targetPath: '/tr/blog/almanca-dusunmeye-baslamak', score: 67,
    reason: 'Çeviri bağımlılığı sorununu çözümleyen ürün uyumu yüksek rehber.'},
  {title: 'Almanca cümle yapısı neden Türkçeden farklıdır?',
    targetPath: '/tr/blog/almanca-cumle-kurma', score: 76,
    reason: 'Mevcut cümle yapısı sayfasının Türkçe karşılaştırmalarla genişletilmesi.'},
  {title: 'Almanca anlıyorum ama konuşamıyorum',
    targetPath: '/tr/blog/almanca-anliyorum-konusamiyorum', score: 71,
    reason: 'Yüksek acı noktası ve üyeliğe doğal geçiş sağlayan problem rehberi.'},
  {title: 'Almanca kelimeleri neden unutuyorum?',
    targetPath: '/tr/blog/almanca-kelimeleri-unutmak', score: 62,
    reason: 'Bağlam, tekrar ve cümle içinde öğrenme yaklaşımını açıklar.'},
  {title: 'Almanca dinleme nasıl geliştirilir?',
    targetPath: '/tr/blog/almanca-dinleyerek-ogrenmek', score: 69,
    reason: 'Mevcut dinleme sayfasını sorgu niyetine göre güçlendirme adayı.'},
  {title: 'Almanca konuşurken cümle kuramıyorum',
    targetPath: '/tr/blog/almanca-konusurken-cumle-kurmak', score: 73,
    reason: 'Cümle çözümleme yöntemini konuşma problemine bağlayan dönüşüm içeriği.'},
  {title: 'Almanca artikeller: der, die, das mantığı',
    targetPath: '/tr/blog/almanca-artikeller-der-die-das', score: 80,
    reason: 'Mevcut yüksek gösterimli artikel sayfasını kapsam ve iç bağlantılarla güçlendirir.'},
]);

function idFor(projectId, item) {
  return crypto.createHash('sha256').update(`${projectId}:backlog:${item.targetPath}`)
      .digest('hex').slice(0, 14);
}

function mergeEditorialBacklog(projectId, activeWorkflows, existing = []) {
  if (projectId !== 'lingodecoder') return activeWorkflows;
  const activePaths = new Set(activeWorkflows.map((item) => item.targetPath));
  const previous = new Map(existing.filter((item) => item.source === 'editorial_backlog')
      .map((item) => [item.id, item]));
  const now = new Date().toISOString();
  const planned = LINGO_BACKLOG.filter((item) => !activePaths.has(item.targetPath))
      .map((item) => {
        const id = idFor(projectId, item); const old = previous.get(id);
        return {id, projectId, source: 'editorial_backlog', opportunityId: null,
          title: item.title, action: 'CONTENT_PLAN', priority: {score: item.score,
            level: item.score >= 75 ? 'critical' : item.score >= 65 ? 'high' : 'medium'},
          requiresApproval: true, status: old?.status || 'PLANNED',
          targetPath: item.targetPath, reason: item.reason,
          brief: {objective: item.reason,
            action: 'Search Console sinyali ve içerik çakışmaları doğrulandıktan sonra ayrıntılı taslak hazırla.',
            targetPath: item.targetPath, changes: [], evidence: {impressions: 0, position: 0,
              confidence: 'very_low', productFit: 5}, queryFocus: []},
          steps: [{id: 'research', label: 'Arama niyeti ve içerik çakışmasını doğrula', mode: 'automatic'},
            {id: 'draft', label: 'Ayrıntılı içerik taslağı hazırla', mode: 'automatic'},
            {id: 'approval', label: 'Kesin değişiklikleri kullanıcıya onaylat', mode: 'approval'}],
          events: old?.events || [{type: 'PLANNED',
            label: 'Önceki SEO planından editoryal kuyruğa eklendi', at: now, actor: 'system'}],
          execution: old?.execution || null, result: old?.result || null,
          createdAt: old?.createdAt || now, updatedAt: now};
      });
  return [...activeWorkflows, ...planned].sort((a, b) => b.priority.score - a.priority.score);
}

module.exports = {LINGO_BACKLOG, mergeEditorialBacklog};
