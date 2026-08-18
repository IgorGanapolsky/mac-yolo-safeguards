'use strict';
function run(req) {
  return eval(req.body.code);
}
module.exports = { run };
