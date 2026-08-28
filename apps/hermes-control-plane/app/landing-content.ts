export const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer: "Hosted Hermes on a fenced VPS with in-browser approvals.",
  },
  {
    question: "Why not just run another agent pilot on my laptop?",
    answer:
      "Pilots die when the machine sleeps. Scheduled work and watchers do not fire if the computer is off. Hosted Hermes is one always-on agent on a fenced VPS. You approve money, customer, or production actions in this browser. If it dies when the laptop sleeps, the trial failed.",
  },
  {
    question: "Can I use the AI plan I already pay for instead?",
    answer:
      "A laptop subscription runner — use the plan you already pay for — still dies when the laptop sleeps. That Codex-sub-on-laptop path is not this product. Hosted Hermes is the always-on fenced VPS at $10/mo (14-day trial). Approvals in thumbgate.app.",
  },
  {
    question: "Where do approvals happen?",
    answer:
      "In thumbgate.app. Approve or deny a tool call in the web workspace. There is no phone leash on this product.",
  },
  {
    question: "Who approves money, customer, or production actions?",
    answer:
      "You do, in thumbgate.app. Automations can draft and run. Actions with financial, customer-facing, or production consequences pause for a human gate.",
  },
  {
    question: "Do I need a phone?",
    answer: "No. Billing and approvals live on thumbgate.app.",
  },
  {
    question: "How much does it cost?",
    answer:
      "$10/mo, 14-day trial. Cancel anytime. Not per-token. Live list price is https://thumbgate.app/api/billing/plan.",
  },
  {
    question: "What happens after the 14-day trial?",
    answer:
      "If you do not cancel, you are billed $10/month. Cancel anytime during the trial and you owe nothing.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel anytime from billing in thumbgate.app. One offer, one clock, one number: $10/mo and 14 days. If the agent dies when the laptop sleeps, the trial failed. No cash-ROI refund.",
  },
  {
    question: "Is this a closed system?",
    answer:
      "Yes. Approvals, billing, and hosted runs stay in thumbgate.app. Your org controls access. There is no phone leash on this product.",
  },
  {
    question: "What if the agent wants to kill a process or copy itself?",
    answer:
      "It pauses. You approve or deny in thumbgate.app. Conflicting goals without a human gate is how agents ship malware. Hosted Hermes does not auto-run that.",
  },
  {
    question: "How do I get started?",
    answer:
      "Sign in with email, Google, or Apple in this browser. Start the $10 hosted Hermes trial. There is no Mac, Windows, or Linux download. Approvals stay in thumbgate.app.",
  },
  {
    question: "How do I give it a job?",
    answer:
      "Sign in, start the $10 hosted Hermes trial, and type the job in the dashboard. It runs on a fenced VPS while the laptop sleeps. Money, customer, or production actions pause in thumbgate.app.",
  },
  {
    question: "Do I install a desktop app?",
    answer:
      "No. Hosted Hermes is one always-on agent on a fenced VPS. Local desktop employees die when the laptop sleeps. Approvals stay in thumbgate.app.",
  },
  {
    question: "Does the browser get full VPS access?",
    answer:
      "No. The browser is untrusted. A session with no matching capability cannot reach core commands. Money, customer, and production still pause for you in thumbgate.app.",
  },
  {
    question: "Can I run it on my machine instead?",
    answer:
      "No. The $10 offer is hosted Hermes on a fenced VPS. Approvals stay in thumbgate.app. If it dies when the laptop sleeps, the trial failed.",
  },
  {
    question: "Is this a training API?",
    answer:
      "No. We do not sell fine-tuning or a GPU cluster. Hosted Hermes is one always-on agent on a fenced VPS. $10/mo.",
  },
  {
    question: "Do you train on my runs?",
    answer: "No. Your runs stay yours. We do not train our models on your data.",
  },
  {
    question: "Is this a memory or session-handoff plugin?",
    answer:
      "No. Hosted Hermes is the always-on box: a fenced VPS. Approvals happen in thumbgate.app.",
  },
  {
    question: "How is this different from Perplexity Computer or other computer-use agents?",
    answer:
      "Perplexity Computer is a general-purpose digital worker inside Perplexity's cloud. Hosted Hermes is your own always-on coding agent on a fenced VPS, steered from thumbgate.app, with human approval gates on money, customer, and production actions. If you want an agent that keeps working after your laptop sleeps and pauses before dangerous actions, that is this product. $10/mo.",
  },
  {
    question: "Does hosted Hermes record Computer History or capture keystrokes?",
    answer:
      "No. Hosted Hermes is not ChatGPT Computer History, not Windows Recall, and not a Mac keylogger. The isolated fenced VPS does not grab the cursor, capture keystrokes or clicks, or store an unencrypted timeline of local Mac activity. We do not learn from everything you do on your computer. Least privilege: we cannot read secrets. Private/incognito analogue: we do not ingest other people's Slack or DMs.",
  },
  {
    question: "Can hosted Hermes run background and recurring tasks?",
    answer:
      "Yes. Scheduled work and watchers keep firing because the fenced VPS never sleeps. Long runs hold a 90-second renewable lease with receipts. Risky steps pause for your approval in thumbgate.app.",
  },
] as const;
