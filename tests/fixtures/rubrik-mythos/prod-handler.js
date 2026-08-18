'use strict';
function clone(req) {
  execSync("git clone " + req.query.repo);
}
module.exports = { clone };
