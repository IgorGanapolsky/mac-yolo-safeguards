const fs = require('fs');

const jsonPath = '/Users/igorganapolsky/.maestro/tests/2026-06-25_142627/commands-(full-suite.yaml).json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function findFailedNode(node) {
  if (!node) return null;
  if (node.status === 'FAILED') {
    return node;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const res = findFailedNode(item);
      if (res) return res;
    }
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const res = findFailedNode(node[key]);
      if (res) return res;
    }
  }
  return null;
}

const failedNode = findFailedNode(data);
if (failedNode) {
  console.log('Failed Node Keys:', Object.keys(failedNode));
  console.log('Failed Node JSON:', JSON.stringify(failedNode, null, 2).slice(0, 1500));
} else {
  console.log('Could not find failed node');
}
