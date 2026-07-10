/** Safe App Store Connect reviewer notes — never embed real gateway URLs or API keys. */
const fs = require('fs');
const path = require('path');
const { assertReviewNotesSafe } = require('./asc-review-notes-guard');

const HERMES_IOS_SUPPORT_EMAIL = 'igor.ganapolsky@icloud.com';
const TEMPLATE_PATH = path.join(__dirname, 'asc-review-notes-template.txt');

const ASC_SAFE_REVIEW_NOTES = fs
  .readFileSync(TEMPLATE_PATH, 'utf8')
  .replace(/\{\{SUPPORT_EMAIL\}\}/g, HERMES_IOS_SUPPORT_EMAIL)
  .trim();

assertReviewNotesSafe(ASC_SAFE_REVIEW_NOTES, 'asc-review-notes-template');

module.exports = { ASC_SAFE_REVIEW_NOTES, HERMES_IOS_SUPPORT_EMAIL, TEMPLATE_PATH };
