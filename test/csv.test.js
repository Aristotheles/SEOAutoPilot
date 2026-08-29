'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {detectDelimiter, parseCsv} = require('../src/csv');

test('parses quoted commas, escaped quotes and CRLF', () => {
  const source = 'Sorgu,Tıklamalar\r\n"weil, dass",2\r\n"a ""quote""",1\r\n';
  assert.deepEqual(parseCsv(source), [
    ['Sorgu', 'Tıklamalar'],
    ['weil, dass', '2'],
    ['a "quote"', '1'],
  ]);
});

test('detects semicolon and tab exports', () => {
  assert.equal(detectDelimiter('A;B;C\n1;2;3'), ';');
  assert.equal(detectDelimiter('A\tB\tC\n1\t2\t3'), '\t');
});
