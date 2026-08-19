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
    slug: "chatbots-answer-agents-sleep-hosted-hermes-works",
    title: "Chatbots answer. Laptop agents sleep. Hosted Hermes keeps working.",
    description:
      "Why every laptop agent pilot dies the same death, and what an always-on fenced VPS with human approval gates changes about the work you can hand off.",
    category: "ideas",
    publishedAt: "2026-08-19",
    author: "Igor Ganapolsky",
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
    author: "Igor Ganapolsky",
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
