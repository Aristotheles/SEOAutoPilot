'use strict';

const demoReport = Object.freeze({
  schemaVersion: 1,
  generatedAt: '2026-08-29T09:00:00.000Z',
  source: 'demo',
  summary: {
    clicks: 3,
    impressions: 104,
    ctr: 0.0288,
    position: 63.85,
    activeDays: 6,
    displayedQueryImpressions: 84,
    pageImpressions: 111,
  },
  details: {
    series: [
      {date: '24.08.2026', clicks: 0, impressions: 3, ctr: 0, position: 82},
      {date: '25.08.2026', clicks: 0, impressions: 10, ctr: 0, position: 76},
      {date: '26.08.2026', clicks: 1, impressions: 14, ctr: .071, position: 69},
      {date: '27.08.2026', clicks: 0, impressions: 18, ctr: 0, position: 65},
      {date: '28.08.2026', clicks: 1, impressions: 27, ctr: .037, position: 58},
      {date: '29.08.2026', clicks: 1, impressions: 32, ctr: .031, position: 54},
    ],
    queries: [], pages: [], devices: [], countries: [],
  },
  opportunities: [
    {
      clusterId: 'artikel_tr', label: 'Almanca artikeller', locale: 'tr',
      productFit: 4, targetPath: '/tr/blog/almanca-artikeller-der-die-das',
      queryMetrics: {clicks: 0, impressions: 30, ctr: 0, position: 86.3},
      pageMetrics: {clicks: 0, impressions: 40, ctr: 0, position: 84.3,
        url: 'https://lingodecoder.de/tr/blog/almanca-artikeller-der-die-das'},
      matchedQueries: ['artikel bulucu', 'artikel bulma', 'almanca artikeller',
        'almanca der die das', 'almanca artikel tablosu'],
      action: 'UPDATE_EXISTING', confidence: 'low',
      reason: 'Arama niyeti mevcut sayfayla eşleşiyor; yeni sayfa açılmamalı.',
    },
    {
      clusterId: 'sentence_structure_tr', label: 'Almanca cümle yapısı', locale: 'tr',
      productFit: 5, targetPath: '/tr/blog/almanca-cumle-kurma',
      queryMetrics: {clicks: 0, impressions: 7, ctr: 0, position: 48.57},
      pageMetrics: {clicks: 0, impressions: 7, ctr: 0, position: 48.57,
        url: 'https://lingodecoder.de/tr/blog/almanca-cumle-kurma'},
      matchedQueries: ['almanca cümle kurma', 'almanca cümle kurma sırası'],
      action: 'HOLD', confidence: 'very_low',
      reason: 'Karar vermek için en az 10 gösterim bekleniyor.',
    },
    {
      clusterId: 'sentence_structure_en', label: 'German sentence structure', locale: 'en',
      productFit: 5, targetPath: '/en/blog/german-sentence-structure',
      queryMetrics: {clicks: 0, impressions: 22, ctr: 0, position: 66.91},
      pageMetrics: {clicks: 0, impressions: 33, ctr: 0, position: 63,
        url: 'https://lingodecoder.de/en/blog/german-sentence-structure'},
      matchedQueries: ['german sentence structure', 'german grammar sentence structure',
        'what is the sentence structure in german'],
      action: 'UPDATE_EXISTING', confidence: 'low',
      reason: 'Arama niyeti mevcut sayfayla eşleşiyor; yeni sayfa açılmamalı.',
    },
    {
      clusterId: 'difficulty_en', label: 'Is German hard?', locale: 'en',
      productFit: 2, targetPath: '/en/blog/is-german-hard',
      queryMetrics: {clicks: 0, impressions: 11, ctr: 0, position: 52.09},
      pageMetrics: {clicks: 0, impressions: 12, ctr: 0, position: 48.25,
        url: 'https://lingodecoder.de/en/blog/is-german-hard'},
      matchedQueries: ['how hard is german', 'is german hard', 'german difficulty'],
      action: 'UPDATE_EXISTING', confidence: 'very_low',
      reason: 'Arama niyeti mevcut sayfayla eşleşiyor; yeni sayfa açılmamalı.',
    },
  ],
  unclusteredQueries: ['almanca yazıldığı gibi mi okunur', 'german structure'],
});

module.exports = {demoReport};
