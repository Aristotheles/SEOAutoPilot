'use strict';

const ACTION = Object.freeze({
  hold: 'HOLD',
  updateExisting: 'UPDATE_EXISTING',
  newPage: 'NEW_PAGE',
  ctrTest: 'CTR_TEST',
});

const CONFIDENCE = ['very_low', 'low', 'medium', 'high', 'very_high'];

const CLUSTERS = Object.freeze([
  {
    id: 'artikel_tr',
    label: 'Almanca artikeller',
    locale: 'tr',
    productFit: 4,
    targetPath: '/tr/blog/almanca-artikeller-der-die-das',
    patterns: [
      /\bartikel(?:ler|i|in|e)?\b/iu,
      /\bder die das\b/iu,
      /\b(?:der|die|das) artikelli\b/iu,
    ],
  },
  {
    id: 'sentence_structure_tr',
    label: 'Almanca cümle yapısı',
    locale: 'tr',
    productFit: 5,
    targetPath: '/tr/blog/almanca-cumle-kurma',
    patterns: [
      /almanca cümle/iu,
      /almancada fiil/iu,
      /\b(?:weil|dass)\b.*\bcümle/iu,
    ],
  },
  {
    id: 'sentence_structure_en',
    label: 'German sentence structure',
    locale: 'en',
    productFit: 5,
    targetPath: '/en/blog/german-sentence-structure',
    patterns: [
      /german.*sentence structure/iu,
      /sentence structure.*german/iu,
      /german.*word order/iu,
    ],
  },
  {
    id: 'difficulty_en',
    label: 'Is German hard?',
    locale: 'en',
    productFit: 2,
    targetPath: '/en/blog/is-german-hard',
    patterns: [
      /\b(?:hard|difficult|difficulty|tough)\b.*\bgerman\b/iu,
      /\bgerman\b.*\b(?:hard|difficult|difficulty|tough)\b/iu,
    ],
  },
]);

function metric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').trim().replace('%', '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value) {
  return metric(value) / 100;
}

function metricRows(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  return table.slice(1).map((row) => ({
    key: String(row[0] ?? '').trim(),
    clicks: metric(row[1]),
    impressions: metric(row[2]),
    ctr: percent(row[3]),
    position: metric(row[4]),
  })).filter((row) => row.key !== '');
}

function summarize(rows) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = impressions === 0 ? 0 : rows.reduce(
      (sum, row) => sum + row.position * row.impressions, 0) / impressions;
  return {
    clicks,
    impressions,
    ctr: impressions === 0 ? 0 : clicks / impressions,
    position: weightedPosition,
  };
}

function confidenceFor(impressions, activeDays) {
  let index = impressions < 10 ? 0 : impressions < 30 ? 1 :
    impressions < 100 ? 2 : impressions < 300 ? 3 : 4;
  if (activeDays < 7) index = Math.max(0, index - 1);
  return CONFIDENCE[index];
}

function clusterForQuery(query) {
  return CLUSTERS.find((cluster) =>
    cluster.patterns.some((pattern) => pattern.test(query))) || null;
}

function pageForCluster(pages, cluster) {
  return pages.find((page) => {
    try {
      return new URL(page.key).pathname === cluster.targetPath;
    } catch (_) {
      return page.key.includes(cluster.targetPath);
    }
  }) || null;
}

function recommend({cluster, page, queryMetrics, activeDays}) {
  const evidence = page || queryMetrics;
  const confidence = confidenceFor(evidence.impressions, activeDays);
  if (evidence.impressions < 10) {
    return {
      action: ACTION.hold,
      confidence,
      reason: 'Karar vermek için en az 10 gösterim bekleniyor.',
    };
  }
  if (!page) {
    if (cluster.productFit >= 4 && queryMetrics.impressions >= 30) {
      return {
        action: ACTION.newPage,
        confidence,
        reason: 'Ürün uyumu yüksek küme için mevcut hedef sayfa bulunamadı.',
      };
    }
    return {
      action: ACTION.hold,
      confidence,
      reason: 'Yeni sayfa için ürün uyumu veya veri güveni yetersiz.',
    };
  }
  if (page.position > 20) {
    return {
      action: ACTION.updateExisting,
      confidence,
      reason: 'Arama niyeti mevcut sayfayla eşleşiyor; yeni sayfa açılmamalı.',
    };
  }
  if (page.impressions >= 30 && page.ctr < 0.02) {
    return {
      action: ACTION.ctrTest,
      confidence,
      reason: 'Sayfa görünür; başlık ve açıklama testi değerlendirilebilir.',
    };
  }
  return {
    action: ACTION.hold,
    confidence,
    reason: 'Mevcut performansı değiştirmek için yeterli sinyal yok.',
  };
}

function analyzeExport(tables) {
  const chart = metricRows(tables.chart);
  const queries = metricRows(tables.queries);
  const pages = metricRows(tables.pages);
  const activeDays = chart.filter((row) => row.impressions > 0).length;
  const grouped = new Map(CLUSTERS.map((cluster) => [cluster.id, []]));
  const unclusteredQueries = [];

  for (const query of queries) {
    const cluster = clusterForQuery(query.key);
    if (cluster) grouped.get(cluster.id).push(query);
    else unclusteredQueries.push(query.key);
  }

  const opportunities = CLUSTERS.map((cluster) => {
    const matched = grouped.get(cluster.id);
    const queryMetrics = summarize(matched);
    const page = pageForCluster(pages, cluster);
    return {
      clusterId: cluster.id,
      label: cluster.label,
      locale: cluster.locale,
      productFit: cluster.productFit,
      targetPath: cluster.targetPath,
      queryMetrics,
      pageMetrics: page ? {...page, url: page.key, key: undefined} : null,
      matchedQueries: matched.map((row) => row.key),
      ...recommend({cluster, page, queryMetrics, activeDays}),
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'search_console_csv',
    summary: {
      ...summarize(chart),
      activeDays,
      displayedQueryImpressions: summarize(queries).impressions,
      pageImpressions: summarize(pages).impressions,
    },
    opportunities,
    unclusteredQueries,
  };
}

module.exports = {
  ACTION,
  CLUSTERS,
  analyzeExport,
  clusterForQuery,
  confidenceFor,
  metric,
  percent,
  recommend,
};
