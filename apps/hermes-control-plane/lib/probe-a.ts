export function redactUntrustedOutput(text: string): string {
  return text
    .replace(/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 [removed]")
    .replace(/([?&])([a-z_]*(?:token|signature|sig|passwd|apikey|api_key))=[^&\s]+/gi, "$1$2=[removed]")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, "[removed]")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[removed]");
}
