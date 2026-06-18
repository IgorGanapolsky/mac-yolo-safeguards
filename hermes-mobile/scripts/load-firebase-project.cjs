/** @returns {import('../firebase-project.json')} */
function loadFirebaseProject() {
  return require('../firebase-project.json');
}

module.exports = { loadFirebaseProject };
