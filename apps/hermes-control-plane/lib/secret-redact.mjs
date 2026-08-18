/**
 * Vellum steal: credentials live outside the model.
 * Never forward raw secrets in tool results or prompts.
 */
const PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g,
];

export function redactSecretsForModel(text) {
  let out = String(text ?? "");
  for (const re of PATTERNS) {
    out = out.replace(re, "[redacted-secret]");
  }
  return out;
}

export function assertSafeForModel(text) {
  const redacted = redactSecretsForModel(text);
  if (redacted !== String(text ?? "")) {
    return { safe: false, redacted };
  }
  return { safe: true, redacted };
}
