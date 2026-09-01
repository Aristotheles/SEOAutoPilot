'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {targetFile} = require('./deployment');

function decodeText(value) {
  return String(value || '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim()
      .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'iu'))?.[1]?.trim() || '';
}

function baseLanguage(value) {
  return String(value || '').trim().toLowerCase().split(/[-_]/u)[0];
}

function inspectSourcePage(workflow, project) {
  if (!project?.deployment?.repositoryPath) {
    return {status: 'blocked', blocker: 'Kaynak sayfa doğrulanamadı. Önce Site bağlantısını kur.'};
  }
  try {
    const file = targetFile(project.deployment.repositoryPath, workflow.targetPath);
    const html = fs.readFileSync(file, 'utf8');
    const htmlTag = html.match(/<html\b[^>]*>/iu)?.[0] || '';
    const metaTags = html.match(/<meta\b[^>]*>/giu) || [];
    const linkTags = html.match(/<link\b[^>]*>/giu) || [];
    const descriptionTag = metaTags.find(tag => attribute(tag, 'name').toLowerCase() === 'description') || '';
    const canonicalTag = linkTags.find(tag => attribute(tag, 'rel').toLowerCase().split(/\s+/u).includes('canonical')) || '';
    const snapshot = {
      sourceFile: path.relative(project.deployment.repositoryPath, file).replaceAll('\\', '/'),
      language: baseLanguage(attribute(htmlTag, 'lang')),
      title: decodeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]),
      meta: decodeText(attribute(descriptionTag, 'content')),
      h1: decodeText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]),
      canonical: attribute(canonicalTag, 'href'),
      hreflang: linkTags.filter(tag=>attribute(tag,'rel').toLowerCase().split(/\s+/u).includes('alternate')&&attribute(tag,'hreflang'))
          .map(tag=>({language:attribute(tag,'hreflang').toLowerCase(),href:attribute(tag,'href')})),
      checkedAt: new Date().toISOString(),
    };
    const required = [['language', 'HTML dil etiketi'], ['title', 'SEO başlığı'],
      ['meta', 'meta açıklaması'], ['h1', 'H1'], ['canonical', 'canonical adresi']];
    const missing = required.filter(([key]) => !snapshot[key]).map(([, label]) => label);
    if (missing.length) return {status: 'blocked', snapshot,
      blocker: `Kaynak sayfada doğrulanamayan alanlar var: ${missing.join(', ')}.`};
    const expectedLanguage = baseLanguage(workflow.contentLanguage);
    if (expectedLanguage && snapshot.language !== expectedLanguage) {
      return {status: 'blocked', snapshot,
        blocker: `Dil uyuşmazlığı: kaynak sayfa ${snapshot.language.toUpperCase()}, öneri ${expectedLanguage.toUpperCase()}.`};
    }
    const expectedCanonical = new URL(workflow.targetPath, project.siteUrl).href;
    const actualCanonical = new URL(snapshot.canonical, project.siteUrl).href;
    if (actualCanonical !== expectedCanonical) return {status: 'blocked', snapshot,
      blocker: `Canonical uyuşmuyor. Kaynakta ${actualCanonical}, beklenen ${expectedCanonical}.`};
    return {status: 'verified', snapshot};
  } catch (error) {
    return {status: 'blocked', blocker: `Kaynak sayfa doğrulanamadı: ${error.message}`};
  }
}

function enrichWorkflowSource(workflow, project) {
  if (workflow.action === 'HOLD' || workflow.action === 'NEW_PAGE' ||
      workflow.execution?.appliedAt || ['APPLYING', 'PUBLISHING', 'PUBLISHED', 'MONITORING', 'COMPLETED'].includes(workflow.status)) return workflow;
  const verification = inspectSourcePage(workflow, project);
  const snapshot = verification.snapshot || {};
  const currentById = {title: snapshot.title, 'title-a': snapshot.title, 'title-b': snapshot.title,
    meta: snapshot.meta, h1: snapshot.h1};
  const brief = {...workflow.brief, changes: (workflow.brief?.changes || []).map(change =>
    currentById[change.id] ? {...change, current: currentById[change.id]} : change)};
  const noChange = verification.status === 'verified' && brief.changes
      .filter(change => ['title', 'meta', 'h1'].includes(change.id))
      .every(change => !change.proposed || change.proposed.trim() === change.current?.trim());
  const sourceBlocker = noChange ? 'Öneri mevcut kaynakla aynı; gereksiz yayın engellendi.' : verification.blocker;
  return {...workflow, brief, sourceVerification: verification,
    blockedReason: workflow.blockedReason || sourceBlocker || null};
}

function enrichWorkflowSources(workflows, project) {
  return workflows.map(workflow => enrichWorkflowSource(workflow, project));
}

module.exports = {baseLanguage, enrichWorkflowSource, enrichWorkflowSources, inspectSourcePage};
