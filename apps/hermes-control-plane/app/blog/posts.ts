export type BlogTopic = "product" | "research";

export type BlogSection = {
  heading?: string;
  paragraphs: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  dek: string;
  topic: BlogTopic;
  date: string;
  author: string;
  readMinutes: number;
  sections: BlogSection[];
};

export const POSTS: readonly BlogPost[] = [
  {
    slug: "give-hosted-hermes-a-job",
    title: "Give hosted Hermes a job",
    dek: "ThumbGate.app is hosted Hermes on a fenced VPS. $10/month. Approvals stay in this browser.",
    topic: "product",
    date: "2026-08-19",
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
];

export function postBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((post) => post.slug === slug);
}
