'use strict';
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}
module.exports = { cors };
