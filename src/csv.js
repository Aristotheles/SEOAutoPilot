'use strict';

function detectDelimiter(text) {
  const firstLine = String(text || '').replace(/^\uFEFF/u, '')
      .split(/\r?\n/u, 1)[0];
  const counts = {',': 0, ';': 0, '\t': 0};
  let quoted = false;
  for (const character of firstLine) {
    if (character === '"') quoted = !quoted;
    if (!quoted && Object.hasOwn(counts, character)) counts[character] += 1;
  }
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0];
}

function parseCsv(text, delimiter = detectDelimiter(text)) {
  const source = String(text || '').replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += character;
  }

  row.push(field);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

module.exports = {detectDelimiter, parseCsv};
