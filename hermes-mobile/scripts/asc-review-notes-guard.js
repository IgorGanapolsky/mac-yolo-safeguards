/** Fail closed if ASC / store review notes contain operator infrastructure. */
const FORBIDDEN_PATTERNS = [
  { name: 'tailscale_hostname', re: /ts\.net/i },
  { name: 'hermes_api_key', re: /sk-hermes/i },
  { name: 'tailscale_ipv4', re: /100\.\d{1,3}\.\d{1,3}\.\d{1,3}/ },
  { name: 'gateway_credential_deeplink', re: /hermes:\/\/setup\?url=/i },
  { name: 'api_key_paste_instruction', re: /Set the API key/i },
  { name: 'gateway_url_instruction', re: /Gateway URL to:/i },
];

function findReviewNotesViolations(text) {
  if (!text || typeof text !== 'string') return [];
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

function assertReviewNotesSafe(text, context = 'review notes') {
  const violations = findReviewNotesViolations(text);
  if (violations.length) {
    const err = new Error(`${context} contains forbidden patterns: ${violations.join(', ')}`);
    err.violations = violations;
    throw err;
  }
}

module.exports = { FORBIDDEN_PATTERNS, findReviewNotesViolations, assertReviewNotesSafe };

if (require.main === module) {
  const fs = require('fs');
  const input = process.argv[2]
    ? fs.readFileSync(process.argv[2], 'utf8')
    : fs.readFileSync(0, 'utf8');
  try {
    assertReviewNotesSafe(input.trim(), process.argv[2] || 'stdin');
    console.log(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
