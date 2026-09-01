'use strict';
const {CLUSTERS} = require('./legacy-preset');
const {analyzeExport} = require('./engine');
function analysisOptions(project) {
  return {clusters:project.profile?.analysisPreset === 'legacy_lingodecoder' ?
    CLUSTERS.filter(item=>project.profile.languages.includes(item.locale)) : []};
}
function reanalyzeReport(report, project) {
  const details = report.details || {};
  const table = (items, key) => [['Anahtar','Tıklamalar','Gösterimler','TO','Konum'], ...(items || []).map(row=>
    [row[key],row.clicks,row.impressions,`${Number(row.ctr || 0)*100}%`,row.position])];
  const result = analyzeExport({chart:table(details.series,'date'), queries:table(details.queries,'query'),
    pages:table(details.pages,'url'), devices:table(details.devices,'device'), countries:table(details.countries,'country')}, analysisOptions(project));
  return {...report, ...result, source:report.source, generatedAt:report.generatedAt,
    analyzedAt:result.generatedAt, profileRevision:project.profile?.revision || 0};
}
function assertProfileWorkflow(project, workflow) {
  if (project.profile?.status !== 'confirmed') throw new Error('Önce Site Profili bölümünde proje kurallarını doğrula.');
  if (workflow.profileRevision !== project.profile.revision) throw new Error('Profil değişti. Önce önerileri yenile ve değişiklikleri tekrar onayla.');
  if (workflow.blockedReason) throw new Error(workflow.blockedReason);
  if (workflow.sourceVerification && ['UPDATE_EXISTING','CTR_TEST'].includes(workflow.action)) {
    const current = require('./source-verification').inspectSourcePage(workflow, project);
    if (current.status !== 'verified') throw new Error(current.blocker);
    const before = workflow.sourceVerification.snapshot || {};
    for (const key of ['sourceFile','language','title','meta','h1','canonical','hreflang']) {
      if (JSON.stringify(before[key]) !== JSON.stringify(current.snapshot[key])) {
        throw new Error('Kaynak sayfa öneri hazırlandıktan sonra değişti. Önerileri yenileyip tekrar incele.');
      }
    }
  }
}
module.exports = {analysisOptions, reanalyzeReport, assertProfileWorkflow};
