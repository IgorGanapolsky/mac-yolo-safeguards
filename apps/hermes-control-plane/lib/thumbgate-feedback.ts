import { runtimeEnv } from "./runtime";

const THUMBGATE_API_URL = "https://thumbgate-production.up.railway.app";

export interface ThumbgateCaptureBody {
  signal: "up" | "down";
  context: string;
  whatWentWrong?: string;
  whatWorked?: string;
  whatToChange?: string;
  tags?: string[];
}

export interface ThumbgateCaptureResult {
  status: "sent" | "failed" | "skipped";
  remoteFeedbackId?: string;
}

export function buildThumbgateCaptureBody(params: {
  signal: "up" | "down";
  threadTitle: string;
  messageContent: string;
}): ThumbgateCaptureBody {
  const clipped = params.messageContent.length > 1800
    ? `${params.messageContent.slice(0, 1800)}...`
    : params.messageContent;
  const context = [
    "ThumbGate Web chat output",
    `thread: ${params.threadTitle}`,
    clipped ? `output: ${clipped}` : "",
  ].filter(Boolean).join(" · ");
  const tags = ["thumbgate-web", "chat-output", params.signal === "down" ? "thumbs-down" : "thumbs-up"];

  if (params.signal === "down") {
    return {
      signal: "down",
      context,
      whatWentWrong: "Operator marked this Hermes output as unhelpful.",
      whatToChange: "Adjust future Hermes outputs using this chat-output feedback signal.",
      tags,
    };
  }
  return {
    signal: "up",
    context,
    whatWorked: "Operator marked this Hermes output as useful.",
    tags,
  };
}

/** Best-effort forward to the hosted ThumbGate lesson engine. Never throws: a missing key or network/rate-limit
 * failure just means the signal stays local-only in feedback_events, it does not block capture. */
export async function sendThumbgateFeedback(body: ThumbgateCaptureBody): Promise<ThumbgateCaptureResult> {
  const apiKey = runtimeEnv().THUMBGATE_API_KEY;
  if (!apiKey) return { status: "skipped" };

  try {
    const response = await fetch(`${THUMBGATE_API_URL}/v1/feedback/capture`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { status: "failed" };
    const parsed = await response.json().catch(() => ({})) as {
      feedbackId?: string;
      feedbackEvent?: { id?: string };
    };
    return { status: "sent", remoteFeedbackId: parsed.feedbackId ?? parsed.feedbackEvent?.id };
  } catch {
    return { status: "failed" };
  }
}
