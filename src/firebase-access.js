'use strict';

function firebaseEnvironment(source = process.env) {
  const env = {...source};
  // Explicit per-command accounts must not be overridden by ambient credentials.
  for (const key of Object.keys(env)) {
    if (['FIREBASE_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_AUTH_ACCESS_TOKEN'].includes(key.toUpperCase())) delete env[key];
  }
  return env;
}

async function resolveFirebaseAccount(connection, runJson) {
  const checkedAt = new Date().toISOString();
  const fail = (error, accounts = []) => ({verified: false, account: null, checkedAt, accounts, error});
  if (!connection.firebaseProject) return fail('Firebase proje kimliği eksik.');
  let accounts;
  try {
    const result = await runJson(['login:list', '--json', '--non-interactive']);
    // CLI JSON contains tokens. Only email addresses may leave this boundary.
    accounts = [...new Set((Array.isArray(result.result) ? result.result : [])
        .map(item => item.user?.email).filter(email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)))];
  } catch (_) { return fail('Firebase hesapları okunamadı. Firebase CLI girişini kontrol et.'); }
  if (!accounts.length) return fail('Firebase hesabı eklenmeli: firebase login veya firebase login:add eposta');
  const ordered = [...accounts].sort((a, b) => a === connection.firebaseAccount ? -1 : b === connection.firebaseAccount ? 1 : a.localeCompare(b));
  for (const account of ordered) {
    try {
      const result = await runJson(['hosting:sites:list', '--project', connection.firebaseProject,
        '--account', account, '--json', '--non-interactive']);
      const siteName = `projects/${connection.firebaseProject}/sites/${connection.firebaseSite || connection.firebaseProject}`;
      if (result.status === 'success' && result.result?.sites?.some(site => site.name === siteName)) {
        return {verified: true, account, checkedAt, accounts, error: null};
      }
    } catch (_) { /* Try the other authorized accounts; never forward credential-bearing errors. */ }
  }
  return fail(`${connection.firebaseProject} / ${connection.firebaseSite || connection.firebaseProject} için kayıtlı hesaplarla Hosting erişimi doğrulanamadı. Hesap iznini, site kimliğini ve internet bağlantısını kontrol et; eksik hesabı firebase login:add eposta ile ekle.`, accounts);
}

module.exports = {firebaseEnvironment, resolveFirebaseAccount};
