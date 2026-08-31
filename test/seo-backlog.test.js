'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {LINGO_BACKLOG, mergeEditorialBacklog} = require('../src/seo-backlog');
const profile = {editorialBacklog:LINGO_BACKLOG};

test('keeps the agreed LingoDecoder evergreen recommendations in a persistent queue', () => {
  const first = mergeEditorialBacklog('lingodecoder', [], [], profile);
  assert.equal(first.length, LINGO_BACKLOG.length);
  assert.ok(first.every((item) => item.status === 'PLANNED'));
  assert.ok(first.some((item) => item.title === 'Almanca anlıyorum ama konuşamıyorum'));
  const preserved = {...first[0], status: 'AWAITING_APPROVAL'};
  const refreshed = mergeEditorialBacklog('lingodecoder', [], [preserved], profile);
  assert.equal(refreshed.find((item) => item.id === preserved.id).status,
      'AWAITING_APPROVAL');
});

test('does not duplicate an active Search Console target', () => {
  const active = [{targetPath: LINGO_BACKLOG[0].targetPath, priority: {score: 99}}];
  const merged = mergeEditorialBacklog('lingodecoder', active, [], profile);
  assert.equal(merged.filter((item) => item.targetPath === active[0].targetPath).length, 1);
});

test('does not seed LingoDecoder-specific content into another project', () => {
  assert.deepEqual(mergeEditorialBacklog('other-project', [], []), []);
});
