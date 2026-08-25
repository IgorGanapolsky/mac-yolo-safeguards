/**
 * Hosted InfoQ Aug 25 2026 process steal — cheap filter + MUST enforcement.
 * Keep in lockstep with tools/hosted-infoq-cascade.js. Not Cloudflare Codex.
 *
 * Residual from the same newsletter: isolate each admission step (Newman
 * progressive-collapse) so a throw in the cheap filter fail-closes instead of
 * 500ing the Worker. Durable-step analog — not Cloudflare CI.
 */

export const HOSTED_INFOQ_CASCADE_SCHEMA = "hosted-infoq-cascade/v1";

export const CASCADE_FAULT = {
  allowed: false as const,
  stage: "cheap_filter" as const,
  outcome: "blocked" as const,
  code: "cascade_fault",
  message:
    "Hosted safety cascade failed closed. Retry the send; the fenced VPS did not run it.",
};

const CRITICAL_INTENTS = [
  {
    id: "spend_authorize",
    re: new RegExp(String.raw`\b(${["sk", "live"].join("_")}_|charge (this|the) card|stripe (capture|payout)|buy credits with)\b`, "i"),
    message: "Hosted Hermes cannot spend or use live Stripe secrets.",
  },
  {
    id: "force_push",
    re: /\bgit\s+push\s+(--force|-f)\b|\bforce-push\b/i,
    message: "Hosted Hermes cannot force-push.",
  },
  {
    id: "production_deploy",
    re: /\b(wrangler deploy|npx wrangler deploy|eas submit --platform|ota:gate)\b/i,
    message: "Hosted Hermes cannot deploy production from chat.",
  },
  {
    id: "photon_imessage",
    re: /\b(photon\.codes|hermes photon setup|bluebubbles server|text them via (photon|imessage|bluebubbles))\b/i,
    message: "Photon/BlueBubbles/iMessage is a local Mac adapter, not the hosted VPS.",
  },
] as const;

const SECRET_RE = new RegExp(
  String.raw`\b(${["ghp", ""].join("_")}[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|${["sk", "live"].join("_")}_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{20,}|nsec1[a-z0-9]{20,})\b`,
);

export type HostedInfoqCascadeDecision =
  | {
      allowed: true;
      stage: "pass";
      outcome: "successful";
      code?: undefined;
      message?: undefined;
    }
  | {
      allowed: false;
      stage: "cheap_filter";
      outcome: "blocked";
      code: string;
      message: string;
    };

export function evaluateHostedInfoqCascade(prompt: string): HostedInfoqCascadeDecision {
  const text = String(prompt ?? "");
  if (SECRET_RE.test(text)) {
    return {
      allowed: false,
      stage: "cheap_filter",
      outcome: "blocked",
      code: "secret_shape",
      message:
        "Do not paste live secrets into hosted Hermes. Rotate that credential; the fenced VPS will not use it.",
    };
  }
  for (const intent of CRITICAL_INTENTS) {
    if (intent.re.test(text)) {
      return {
        allowed: false,
        stage: "cheap_filter",
        outcome: "blocked",
        code: intent.id,
        message: intent.message,
      };
    }
  }
  return { allowed: true, stage: "pass", outcome: "successful" };
}

/** Isolate one admission step: throw → onFault, never bubble to the Worker. */
export function isolateAdmissionStep<T>(fn: () => T, onFault: T): T {
  try {
    return fn();
  } catch {
    return onFault;
  }
}

/** Live admission entry: cheap cascade, fail-closed on throw. */
export function admitHostedInfoqCascade(prompt: string): HostedInfoqCascadeDecision {
  return isolateAdmissionStep(() => evaluateHostedInfoqCascade(prompt), CASCADE_FAULT);
}
