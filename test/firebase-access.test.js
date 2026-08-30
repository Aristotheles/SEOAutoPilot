'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveFirebaseAccount, firebaseEnvironment} = require('../src/firebase-access');

const accounts = ['first@example.com', 'second@example.com'];
function runnerFor(permissions, calls = []) {
  return async args => {
    calls.push(args);
    if (args[0] === 'login:list') return {status: 'success', result: accounts.map(email => ({
      user: {email}, tokens: {refresh_token: 'DO_NOT_EXPOSE', access_token: 'PRIVATE'}}))};
    const account = args[args.indexOf('--account') + 1];
    const project = args[args.indexOf('--project') + 1];
    if (!permissions[account]?.includes(project)) throw new Error('DO_NOT_EXPOSE authentication failed');
    return {status: 'success', result: {sites: [{name: `projects/${project}/sites/${project}`} ]}};
  };
}

test('automatically isolates accounts by exact Firebase project and never returns tokens', async () => {
  const calls = [];
  const runner = runnerFor({'first@example.com': ['lingo'], 'second@example.com': ['chunks']}, calls);
  const [a, b] = await Promise.all([
    resolveFirebaseAccount({firebaseProject: 'lingo'}, runner),
    resolveFirebaseAccount({firebaseProject: 'chunks'}, runner),
  ]);
  assert.equal(a.account, accounts[0]); assert.equal(b.account, accounts[1]);
  assert.ok(a.verified && b.verified);
  assert.doesNotMatch(JSON.stringify([a, b]), /DO_NOT_EXPOSE|PRIVATE|tokens/);
  assert.ok(calls.every(args => ['login:list', 'hosting:sites:list'].includes(args[0])));
  assert.ok(calls.filter(args => args[0] === 'hosting:sites:list').every(args => args.includes('--account')));
});

test('keeps the saved account preferred and rediscovers when its access disappears', async () => {
  const calls = [];
  const connection = {firebaseProject: 'chunks', firebaseAccount: accounts[1]};
  assert.equal((await resolveFirebaseAccount(connection, runnerFor({[accounts[0]]: ['chunks'], [accounts[1]]: ['chunks']}, calls))).account, accounts[1]);
  assert.equal(calls[1][calls[1].indexOf('--account') + 1], accounts[1]);
  assert.equal((await resolveFirebaseAccount(connection, runnerFor({[accounts[0]]: ['chunks']}))).account, accounts[0]);
});

test('fails closed for wrong Hosting site, no accounts, expired credentials and offline errors', async () => {
  const denied = await resolveFirebaseAccount({firebaseProject: 'chunks', firebaseSite: 'another-site'},
    runnerFor({[accounts[0]]: ['chunks']}));
  assert.equal(denied.verified, false); assert.equal(denied.account, null);
  const empty = await resolveFirebaseAccount({firebaseProject: 'chunks'}, async () => ({result: []}));
  assert.equal(empty.verified, false);
  const offline = await resolveFirebaseAccount({firebaseProject: 'chunks'}, async () => {throw new Error('PRIVATE');});
  assert.equal(offline.verified, false);
  assert.doesNotMatch(JSON.stringify([denied, empty, offline]), /PRIVATE|DO_NOT_EXPOSE/);
});

test('account-selected subprocesses do not inherit credential overrides or mutate parent environment', () => {
  const source = {PATH: 'keep', FIREBASE_TOKEN: 'secret', GOOGLE_APPLICATION_CREDENTIALS: 'private.json', CLOUDSDK_AUTH_ACCESS_TOKEN: 'secret'};
  assert.deepEqual(firebaseEnvironment(source), {PATH: 'keep'});
  assert.equal(source.FIREBASE_TOKEN, 'secret');
});
