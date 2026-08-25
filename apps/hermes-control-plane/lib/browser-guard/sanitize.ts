/**
 * Everything the page controls is untrusted input.
 *
 * Console lines, network lines, page titles and URLs all travel back into the
 * model's context, which makes them the prompt-injection surface of the browser
 * toolset. Two defences live here: strip values that look sensitive out of the
 * log-style reads, and neutralise page-supplied strings before they are
 * reported inside browser_state.
 */

/** Roughly "an opaque value someone would authenticate with". */
const TOKEN_LIKE = "[A-Za-z0-9._~+/-]{8,}=*";

/**
 * Query-parameter names that carry credentials. Kept broad on purpose: a
 * missed parameter leaks a live secret into model context, while an
 * over-redacted one costs only readability in a log line.
 */
const CREDENTIAL_PARAM =
  "[a-z_-]*(?:token|signature|sig|passwd|password|apikey|api_key|auth|key|secret|credential|session|refresh)[a-z_-]*";

/**
 * Remove values that look like they authenticate something.
 *
 * The header rule deliberately consumes an optional scheme word before the
 * value. An earlier version ended in \S+, which matched the scheme instead of
 * the token and turned "Authorization: Bearer SECRET" into
 * "Authorization [removed] SECRET" - leaking the thing it was removing.
 */
export function redactUntrustedOutput(text: string): string {
  return text
    .replace(
      new RegExp(`\\b(authorization)\\s*[:=]\\s*(?:[A-Za-z]+\\s+)?${TOKEN_LIKE}`, "gi"),
      "$1: [removed]",
    )
    .replace(new RegExp(`\\b(bearer)\\s+${TOKEN_LIKE}`, "gi"), "$1 [removed]")
    .replace(new RegExp(`([?&])(${CREDENTIAL_PARAM})=[^&\\s]+`, "gi"), "$1$2=[removed]")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, "[removed]")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[removed]");
}

/**
 * Characters that end a line or hide themselves, beyond the C0 range.
 *
 * U+0085 NEL, U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR all render
 * as breaks, so a page title containing one can fabricate what looks like a new
 * instruction in model context. U+200B-U+200D and U+FEFF are zero-width and can
 * conceal text outright. A code < 32 check catches none of them.
 */
const UNICODE_BREAKS = new Set([0x85, 0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0xfeff]);

/**
 * Neutralise a page-supplied string before reporting it back to the model.
 *
 * Replaces rather than drops, so a hostile title cannot fabricate a line break
 * and appear to begin a new instruction, and caps the result at the documented
 * 4096-character field limit.
 */
export function sanitizeBrowserStateField(value: string, maxLength = 4096): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const unsafe = code < 32 || code === 127 || UNICODE_BREAKS.has(code);
    out += unsafe ? " " : character;
  }
  return out.slice(0, maxLength);
}
