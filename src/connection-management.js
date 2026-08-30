'use strict';

const store = require('./project-store');
const google = require('./google-search-console');

function confirmed(value, expected) {
  if (value !== expected) throw new Error('Kaldırma işlemi için açık onay gerekli.');
}
function disconnectGoogle(id, confirmation) {
  confirmed(confirmation, id);
  if (!store.getPrivateProject(id)) throw new Error('Proje bulunamadı.');
  google.invalidateProject(id);
  return store.updateProject(id, {oauth: null});
}
function disconnectDeployment(id, confirmation) {
  confirmed(confirmation, id);
  const project = store.getPrivateProject(id);
  store.assertProjectIdle(project);
  const now = new Date().toISOString();
  const workflows = (project.workflows || []).map((workflow) => {
    if (!['APPROVED', 'PREVIEW_READY', 'FAILED'].includes(workflow.status)) return workflow;
    // Never allow a previous site's preview to be published through a newly connected site.
    return {...workflow, status: 'APPROVED', execution: null, updatedAt: now,
      events: [...(workflow.events || []), {type: 'CONNECTION_REMOVED', actor: 'user', at: now,
        label: 'Site bağlantısı kaldırıldı; önceki önizleme yayın yetkisi iptal edildi'}]};
  });
  return store.updateProject(id, {deployment: null, workflows});
}
function removeProject(id, confirmation) {
  confirmed(confirmation, id);
  store.removeProject(id);
  google.invalidateProject(id);
}
function removeGoogleConfig(confirmation) {
  confirmed(confirmation, 'REMOVE_GOOGLE_CONFIG');
  google.removeConfig();
  store.clearAllOAuth();
  return google.configStatus();
}

module.exports = {disconnectDeployment, disconnectGoogle, removeGoogleConfig, removeProject};
