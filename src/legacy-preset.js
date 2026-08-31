'use strict';
// Explicit opt-in preset for migrated projects; never the generic engine default.
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
module.exports = {CLUSTERS};
