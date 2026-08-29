'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-google-'));
process.env.SEO_AUTOPILOT_DATA_DIR = directory;
process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
const google = require('../src/google-search-console');

test.after(() => fs.rmSync(directory, {recursive: true, force: true}));

test('builds a read-only Search Console OAuth URL', () => {
  const redirectUri = 'http://127.0.0.1:4173/oauth/google/callback';
  const value = new URL(google.createAuthorizationUrl('project-1', redirectUri));
  assert.equal(value.origin, 'https://accounts.google.com');
  assert.equal(value.searchParams.get('scope'), google.SCOPE);
  assert.equal(value.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(value.searchParams.get('access_type'), 'offline');
  assert.ok(value.searchParams.get('state'));
});
