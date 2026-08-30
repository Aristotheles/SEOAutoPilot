'use strict';

function pageLabel(targetPath) {
  let pathname = String(targetPath || '');
  try { pathname = new URL(pathname).pathname; } catch (_) { pathname = pathname.split(/[?#]/u)[0]; }
  let segment = pathname.split('/').filter(Boolean).pop() || 'Ana sayfa';
  try { segment = decodeURIComponent(segment); } catch (_) { /* keep malformed input readable */ }
  return segment.replace(/\.html?$/iu, '').replace(/[-_]+/gu, ' ')
      .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toLocaleUpperCase('tr'));
}

function normalizeOpportunity(opportunity) {
  return /^page_\d+$/u.test(opportunity.clusterId || '') ?
    {...opportunity, label: pageLabel(opportunity.targetPath)} : opportunity;
}

function normalizeReport(report) {
  return {...report, opportunities: (report.opportunities || []).map(normalizeOpportunity)};
}

module.exports = {pageLabel, normalizeOpportunity, normalizeReport};
