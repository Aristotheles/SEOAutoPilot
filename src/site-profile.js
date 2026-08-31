'use strict';

const DRAFT_LANGUAGES = ['tr', 'en', 'de'];
const OPENING_POLICIES = ['preserve_existing', 'fixed', 'browser_language', 'country_rules', 'language_selector'];
function locale(value) {
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(value.trim())) throw new Error('Dil kodu geçersiz. Örnek: tr, en, de, en-GB.');
  try { return Intl.getCanonicalLocales(value.trim())[0]; } catch (_) { throw new Error('Dil kodu geçersiz.'); }
}
function string(value, limit = 1000) {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`Metin alanı en fazla ${limit} karakter olmalı.`);
  return value.trim();
}
function list(value, limit = 30) {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Liste geçersiz veya çok uzun.');
  return value;
}
function defaultProfile(project) {
  const languages = [...new Set((project.locales || []).flatMap(code => { try { return [locale(code)]; } catch (_) { return []; } }))];
  return {version: 1, revision: 0, status: 'needs_review', confirmedAt: null,
    business: {brand: project.name || '', description: '', objective: '', audience: '', tone: ''},
    languages, primaryLanguage: '', fallbackLanguage: '', openingPolicy: 'preserve_existing',
    rememberChoice: true, preserveExplicitUrl: true, countryRules: [], targetMarkets: [],
    coverage: 'per_content', languageRoutes: [], pageLanguages: [],
    design: {mode: 'preserve_existing', notes: ''}, analysisPreset: 'generic',
    editorialBacklog: []};
}
function normalizeProfile(input, project) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Site profili gerekli.');
  const base = project.profile || defaultProfile(project);
  const languages = [...new Set(list(input.languages).map(locale))];
  if (!languages.length) throw new Error('En az bir içerik dili seç.');
  const member = value => { const code = locale(value); if (!languages.includes(code)) throw new Error('Seçilen dil içerik dilleri arasında olmalı.'); return code; };
  if (!OPENING_POLICIES.includes(input.openingPolicy)) throw new Error('Açılış davranışı geçersiz.');
  if (!['per_content', 'all_languages'].includes(input.coverage)) throw new Error('İçerik kapsamı geçersiz.');
  if (input.preserveExplicitUrl !== true) throw new Error('Doğrudan dil adresini koruma kapatılamaz.');
  const routePath = value => {
    const source = string(value, 1500);
    if (!source.startsWith('/') || source.startsWith('//') || /[\\#\s]/u.test(source)) throw new Error('Adres / ile başlayan yerel bir yol olmalı; alan adı, boşluk veya # içeremez.');
    const parsed = new URL(source, 'https://profile.invalid');
    if (parsed.origin !== 'https://profile.invalid' || source.split('?')[0].split('/').some(part => part === '.' || part === '..') || /%2e|%2f|%5c/iu.test(source)) throw new Error('Adres yolu geçersiz.');
    return source;
  };
  const unique = (items, field) => { if (new Set(items.map(x => x[field])).size !== items.length) throw new Error('Aynı adres/ülke için birden fazla kural olamaz.'); return items; };
  const country = value => { const code = string(value, 2).toUpperCase(); if (!/^[A-Z]{2}$/u.test(code) || ['XX','ZZ'].includes(code) || new Intl.DisplayNames(['en'],{type:'region',fallback:'none'}).of(code) === undefined) throw new Error('Ülke için geçerli iki harfli kod kullan. Örnek: TR, DE, US.'); return code; };
  const languageRoutes = unique(list(input.languageRoutes || [], 60).map(item => {
    const prefix = routePath(item.prefix);
    if (prefix === '/' || prefix.includes('?') || !prefix.endsWith('/')) throw new Error('Dil öneki /en/ gibi olmalı; kök adres veya sorgu parametresi olamaz.');
    return {prefix, language: member(item.language)};
  }), 'prefix');
  const pageLanguages = unique(list(input.pageLanguages || [], 500).map(item => ({path:routePath(item.path), language:member(item.language)})), 'path');
  const countryRules = unique(list(input.countryRules || []).map(item => ({country:country(item.country), language:member(item.language)})), 'country');
  if (input.openingPolicy === 'country_rules' && !countryRules.length) throw new Error('Ülke bazlı davranış için en az bir ülke kuralı gerekli.');
  const targetMarkets = list(input.targetMarkets || []).map(item => ({country:country(item.country), language:member(item.language)}));
  const business = Object.fromEntries(['brand','description','objective','audience','tone'].map(key => [key,string(input.business?.[key] ?? '', key === 'brand' ? 120 : 1000)]));
  if (!business.brand) throw new Error('Marka adı gerekli.');
  return {version:1, revision:base.revision + 1, status:'confirmed', confirmedAt:new Date().toISOString(), business,
    languages, primaryLanguage:member(input.primaryLanguage), fallbackLanguage:member(input.fallbackLanguage),
    openingPolicy:input.openingPolicy, rememberChoice:input.rememberChoice !== false, preserveExplicitUrl:true,
    countryRules, targetMarkets, coverage:input.coverage, languageRoutes, pageLanguages,
    requirePageEvidence:input.requirePageEvidence === true,
    design:{mode:'preserve_existing', notes:string(input.design?.notes ?? '', 2000)},
    analysisPreset:input.keepLegacyAnalysis === false ? 'generic' : base.analysisPreset,
    editorialBacklog:base.editorialBacklog || []};
}
function resolveLanguage(opportunity, profile) {
  const target = opportunity.targetPath || '';
  const explicit = profile?.pageLanguages?.find(item => item.path === target)?.language;
  if(profile?.requirePageEvidence && !explicit) return {language:null,reason:'Bu sayfanın dili incelemede doğrulanmadı. Siteyi yeniden incele veya gelişmiş ayarlardan kontrol et.'};
  const route = [...(profile?.languageRoutes || [])].sort((a,b)=>b.prefix.length-a.prefix.length)
    .find(item=>target.startsWith(item.prefix))?.language;
  let declared;
  try { if (opportunity.locale && opportunity.locale !== 'und') declared = locale(opportunity.locale); } catch (_) { /* unknown */ }
  const code = explicit || declared || route || (profile?.status === 'confirmed' && !profile.requirePageEvidence && profile.languages.length === 1 ? profile.languages[0] : null);
  if ((explicit && declared && explicit !== declared) || (route && code && route !== code)) return {language:null, reason:'Sayfa dili ile profil kuralları çelişiyor.'};
  if (!code) return {language:null, reason:'Sayfanın dili doğrulanmadı. Site profilinde URL–dil eşleştirmesi ekle.'};
  if (profile && !profile.languages.includes(code)) return {language:null, reason:'Sayfanın dili proje kapsamına dahil değil.'};
  return {language:code, reason:null};
}
function draftBlocker(opportunity, profile) {
  if (profile && profile.status !== 'confirmed') return 'Site profili henüz onaylanmadı. Önce dilleri ve açılış tercihini doğrula.';
  const result = resolveLanguage(opportunity, profile);
  if (result.reason) return result.reason;
  if (!DRAFT_LANGUAGES.includes(result.language.split('-')[0])) return `${result.language} için otomatik taslak desteği henüz yok. İngilizceye çevrilmedi.`;
  return null;
}
module.exports = {DRAFT_LANGUAGES, OPENING_POLICIES, defaultProfile, normalizeProfile, resolveLanguage, draftBlocker};
