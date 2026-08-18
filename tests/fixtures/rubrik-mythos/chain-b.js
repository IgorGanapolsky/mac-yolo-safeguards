'use strict';
function right(userInput) {
  execSync("cat " + userInput);
}
module.exports = { right };
