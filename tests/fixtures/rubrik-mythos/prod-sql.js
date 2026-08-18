'use strict';
function lookup(req) {
  return db.query(`SELECT * FROM users WHERE id = ${req.body.id}`);
}
module.exports = { lookup };
