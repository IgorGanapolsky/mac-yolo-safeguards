'use strict';
function readUserFile(req) {
  return fs.readFileSync(req.query.file);
}
module.exports = { readUserFile };
