/**
 * Everything the page controls is untrusted input.
 *
 * Console lines, network lines, page titles and URLs all travel back into the
 * model's context, which makes them the prompt-injection surface of the browser
 * toolset. Two defences live here: strip values that look sensitive out of the
 * log-style reads, and neutralise page-supplied strings before they are
 * reported inside browser_state.
 */

/** Remove values that look like they authenticate something. */
export function redactUntrustedOutput(text: string): string {
  return text
    .replace(/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 [removed]")
    .replace(/([?&])([a-z_]*(?:token|signature|sig|passwd|apikey|api_key))=[^&\s]+/gi, "$1$2=[removed]")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, "[removed]")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[removed]");
}

/**
 * Neutralise a page-supplied string before reporting it back to the model.
 *
 * Control characters are replaced rather than dropped so a hostile title cannot
 * fabricate line breaks and appear to start a new instruction, and the result
 * is capped at the documented 4096-character field limit.
 */
export function sanitizeBrowserStateField(value: string, maxLength = 4096): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : character;
  }
  return out.slice(0, maxLength);
}
