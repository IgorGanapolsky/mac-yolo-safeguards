/**
 * Blog content as data. Static, no D1, no network on first paint — same rule as
 * the public marketing shell. Offer wording is composed from LOCKED_OFFER
 * (single source of truth) and every composed post body must pass
 * THUMBGATE_PUBLIC_COPY_CONTRACT (tests/blog.test.mjs enforces it).
 */
import { LOCKED_OFFER } from "./content-lane.ts";

export type BlogCategory = "product" | "engineering" | "ideas";

export type BlogSection = {
  heading?: string;
  paragraphs: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: BlogCategory;
  /** ISO date, YYYY-MM-DD */
  publishedAt: string;
  author: string;
  readMinutes: number;
  sections: BlogSection[];
};

/** Standard closing line, composed from the locked offer — never hand-written per post. */
export function offerClose(): string {
  return `${LOCKED_OFFER.product} runs on a ${LOCKED_OFFER.host} for ${LOCKED_OFFER.price} flat, ${LOCKED_OFFER.trial}, ${LOCKED_OFFER.approvals}. If the agent dies when your laptop sleeps, the trial failed — that is the test we invite you to run.`;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "give-hosted-hermes-a-job",
    title: "Give hosted Hermes a job",
    description:
      "ThumbGate.app is hosted Hermes on a fenced VPS. $10/month. Approvals stay in this browser.",
    category: "product",
    publishedAt: "2026-08-19",
    author: "ThumbGate",
    readMinutes: 5,
    sections: [
      {
        paragraphs: [
          "Cursor publishes engineering notes on cursor.com/blog with a date, a topic, a named author, and a read time. We are not affiliated with Cursor. This is that format on thumbgate.app, for the product that actually lives here.",
          "ThumbGate.app is hosted Hermes on a fenced VPS. Sign in, start a 14-day trial or Pro at $10/month, give it a job, and approve money, customer, or production actions in this browser. Mac pairing is not the marketed path.",
        ],
      },
      {
        heading: "Give → Works → Approve",
        paragraphs: [
          "The landing page already shows example jobs: watch CI overnight, a morning digest, a long migration. You give the job. Hosted Hermes works on the fenced VPS. Sensitive steps wait for an in-browser approval.",
          "That is the whole offer. It is not Perplexity Computer. It is not a connector marketplace. It is not OpenClaw on your laptop.",
        ],
      },
      {
        heading: "What this is not",
        paragraphs: [
          "Nous Hermes is the agent runtime we host. We are not affiliated with Nous Research.",
          "Cash is $0 until a stranger pays Stripe. We do not invent traction on this blog.",
        ],
      },
    ],
  },
  {
    slug: "chatbots-answer-agents-sleep-hosted-hermes-works",
    title: "Chatbots answer. Laptop agents sleep. Hosted Hermes keeps working.",
    description:
      "Why every laptop agent pilot dies the same death, and what an always-on fenced VPS with human approval gates changes about the work you can hand off.",
    category: "ideas",
    publishedAt: "2026-08-19",
    author: "ThumbGate",
    readMinutes: 4,
    sections: [
      {
        paragraphs: [
          "There is a ladder of usefulness in AI tools. Chatbots answer questions. Agents do tasks. But almost every agent you can run today shares one embarrassing dependency: your laptop lid.",
          "The pilot always starts well. You give a coding agent a long task, it works, you watch it. Then the machine sleeps, or the terminal session dies — and the process is gone. Nothing reports it. The scheduled check you set up never fires. Work stops until you sit down again. The agent did not fail at reasoning; it failed at existing.",
        ],
      },
      {
        heading: "The failure that matters is boring",
        paragraphs: [
          "Nobody writes postmortems about laptop sleep, because it is not dramatic. But it is the single failure that decides whether an agent is a toy or a worker. A worker keeps working when you leave the room. Watchers keep firing at 3am. A long migration keeps migrating. A CI babysitter is still watching on the fourth retry.",
          "Hosted Hermes is our answer: one always-on agent on a fenced VPS. Not a process on your machine. The run keeps a lease on a hosted box that does not sleep, and you steer it from the browser at thumbgate.app.",
        ],
      },
      {
        heading: "Always-on without always-trusted",
        paragraphs: [
          "The moment an agent survives your absence, a second problem appears: what is it allowed to do while you are gone? Our answer is a hard human gate. Automations can draft and run, but money, customer-facing, and production actions pause until you approve or deny them in the browser. Destructive commands, secret leaks, and spend overruns are checked before the tool call executes, not confessed afterwards.",
          "That split — durable execution, gated consequences — is the whole product, and it comes as one plain offer:",
        ],
      },
    ],
  },
  {
    slug: "leases-receipts-judge-unattended-agents",
    title: "Leases, receipts, and a judge: running unattended agents safely",
    description:
      "The three mechanisms hosted Hermes uses to let an agent run for hours or months without a human babysitter: renewable leases, receipt audit trails, and LLM-as-a-Judge pre-action gates.",
    category: "engineering",
    publishedAt: "2026-08-19",
    author: "ThumbGate",
    readMinutes: 5,
    sections: [
      {
        paragraphs: [
          "An agent that runs while nobody watches needs different machinery than an agent you supervise. Hosted Hermes runs tasks in isolated fenced VPS sandboxes, and three mechanisms carry the safety load: leases, receipts, and a judge.",
        ],
      },
      {
        heading: "Renewable leases: only one live executor",
        paragraphs: [
          "Every task thread holds a 90-second renewable lease on the fenced VPS runner. A healthy run renews its lease continuously; a crashed, wedged, or superseded run loses it. Only the current unexpired lease-holder can complete the task, which kills the classic unattended-agent failure where a zombie process and its replacement both write results.",
        ],
      },
      {
        heading: "Receipts: an audit trail you can replay",
        paragraphs: [
          "Every consequential action produces a receipt. When a run ends — success or not — you can read what the agent actually did rather than what it says it did. Public aggregate numbers from the same pipeline are on our stats endpoint; the private per-task trail stays in your workspace.",
        ],
      },
      {
        heading: "The judge: checks before the tool call",
        paragraphs: [
          "Before sensitive tool calls execute, an LLM-as-a-Judge policy layer evaluates them. Destructive commands, secret exfiltration, and spend overruns get blocked or escalated. Money, customer, and production actions always pause for a human decision in the thumbgate.app browser — the agent cannot approve itself.",
          "None of this requires you to run infrastructure. The mechanisms above are what the flat monthly price buys: an agent that keeps working when you leave, inside fences it cannot quietly climb.",
        ],
      },
    ],
  },
  {
    slug: "agent-telemetry-should-be-content-free",
    title: "Your agent's telemetry should be content-free",
    description:
      "This week's backlash over an AI assistant logging users' keystrokes is a preview of the agent era's trust problem. What an always-on agent's control plane should record — and what it must never see.",
    category: "ideas",
    publishedAt: "2026-08-19",
    author: "Igor Ganapolsky",
    readMinutes: 4,
    sections: [
      {
        paragraphs: [
          "This week a major AI assistant made headlines for a feature that, as reported, captures what users type as they type it. Whatever the implementation details turn out to be, the reaction is the story: people assumed the worst instantly, because nothing in how most AI products are built earns the benefit of the doubt.",
          "For agents the stakes are higher than for chatbots. An always-on agent touches your repositories, your inboxes, your infrastructure. Its control plane sits in the most privileged observation seat imaginable. If that seat records content, you have built a surveillance product with an agent attached.",
        ],
      },
      {
        heading: "What our control plane records",
        paragraphs: [
          "Hosted Hermes runs on a fenced VPS, and thumbgate.app is the pane of glass over it. The analytics that pane collects are aggregate counters with a hard schema: an event name, a day, and optional first-party campaign tokens. No prompts. No thread contents. No keystrokes. No email addresses, IP addresses, cookies, or user-agent strings. Free-form fields are dropped at the door — the endpoint rejects anything not on a fixed allowlist.",
          "Task receipts — the audit trail of what your agent actually did — are the opposite of telemetry: they exist for you, not us. They stay inside your authenticated workspace, and public aggregate stats are computed with canary runs excluded and identities never exposed.",
        ],
      },
      {
        heading: "Counts, not contents",
        paragraphs: [
          "The honest argument for content-free telemetry is that counts are enough. Counts tell us whether the funnel works, whether runs succeed, and where p95 latency lives. Contents would tell us what your business is doing — and that is not ours to know. The whole premise of an approval-gated agent is that the human holds the sensitive decisions; a control plane that quietly reads everything would make that promise a costume.",
          "If you are evaluating any always-on agent — ours included — ask one question first: show me exactly what your control plane records when my agent runs. The answer should fit in a paragraph, and it should contain the word no more often than yes.",
        ],
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function sortedPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Full public text of a post as rendered: body plus the composed offer close. */
export function postBodyText(post: BlogPost): string {
  return [
    post.title,
    post.description,
    ...post.sections.flatMap((section) => [section.heading ?? "", ...section.paragraphs]),
    offerClose(),
  ].join("\n");
}
