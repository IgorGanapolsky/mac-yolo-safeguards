// linear-fleet-triage — rank open Linear issues for the multi-agent fleet
// Run: /linear-fleet-triage   or workflow name with optional args.limit
// Depends on: tools/linear-agent-bridge.js (coord-status + list)
// Does NOT claim issues — read-only triage report for the founder / planner.

let meta = #{
    name: "linear-fleet-triage",
    description: "Coord-status + open Linear issues → verified top-N action list for the agent fleet",
    when_to_use: "When the AGENT/IGO board is noisy, after session start, or CEO asks what the fleet should do next",
    phases: [
        #{ title: "Snapshot", detail: "Pull Linear locks + open issues via bridge" },
        #{ title: "Score", detail: "Parallel scorers by revenue, product, hygiene, risk" },
        #{ title: "Verify", detail: "Skeptic rejects unowned megafile thrash and fake urgency" },
        #{ title: "Synthesize", detail: "Top-N action list with owner + next command" },
    ],
};

let score_schema = #{
    "type": "object",
    "required": ["items"],
    "properties": #{
        "items": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "title", "score", "why", "suggested_agent", "next_command"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "score": #{ "type": "number" },
                    "why": #{ "type": "string" },
                    "suggested_agent": #{ "type": "string" },
                    "next_command": #{ "type": "string" },
                    "blocked_by": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["id", "keep", "reason"],
    "properties": #{
        "id": #{ "type": "string" },
        "keep": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "score_delta": #{ "type": "number" },
    },
};

let limit = 10;
if args != () && args.limit != () {
    limit = args.limit;
}

phase("Snapshot");
let snap = agent(
    "Run these shell commands from the repo root and return ONLY factual output (no advice yet):\n"
        + "1) node tools/linear-agent-bridge.js --coord-status\n"
        + "2) node tools/linear-agent-bridge.js --list\n"
        + "3) If present: node tools/plan-coordination-snapshot.js 2>/dev/null | head -80\n"
        + "Paste the full command outputs. Note agent-locked issues, ghosts, in-progress, and open counts. "
        + "Use execute capability for shell only; do not edit files.",
    #{
        label: "coord-snapshot",
        capability_mode: "execute",
    },
);

if snap == () || !snap.success {
    pause("infra", "coord-status snapshot failed — check LINEAR_API_KEY / bridge and resume.");
}

let snapshot_text = "";
if type_of(snap.output) == "string" {
    snapshot_text = snap.output;
} else {
    snapshot_text = json_encode(snap.output);
}

phase("Score");
let lenses = [
    "revenue and cash path (ThumbGate Continuity, outreach, funnel)",
    "Hermes Mobile real-user product (connect, chat, approvals, store)",
    "fleet hygiene (stale agent-locks, scrub, vault Agent-State, plan.md megafiles)",
    "risk and honesty (ship claims, CI red, security, secrets)",
];

let jobs = [];
for lens in lenses {
    let p = "You are scoring Linear issues for a solo-founder multi-agent Mac fleet.\n";
    p += "Lens: " + lens + "\n\n";
    p += "FACTUAL SNAPSHOT (trust this over memory):\n";
    p += snapshot_text + "\n\n";
    p += "Return up to 12 items with id (e.g. AGENT-29), title, score 0-100, why (one sentence), ";
    p += "suggested_agent (grok|claude-code|codex|cursor|Hermes|antigravity), ";
    p += "next_command (real CLI or 'claim then implement'), blocked_by if any.\n";
    p += "Rules: Prefer open In Progress with real product impact. Deprioritize pure smoke/test tickets. ";
    p += "Never invent issue IDs not in the snapshot. Empty items only if snapshot has no open issues.";
    jobs.push(#{
        prompt: p,
        label: "score:" + lens,
        capability_mode: "read-only",
        output_schema: score_schema,
    });
}
let scored = parallel(jobs);

let pool = [];
for r in scored {
    if r != () && r.success && r.output != () && r.output.items != () {
        for it in r.output.items {
            pool.push(it);
        }
    }
}

if pool.len() == 0 {
    complete(#{
        summary: "No scorable issues from snapshot (or scorers returned empty).",
        top: [],
        snapshot_ok: snap.success,
    });
}

// Cap verification budget: take first 20 unique-ish entries by scanning order
let to_verify = [];
let seen = #{};
let i = 0;
while i < pool.len() && to_verify.len() < 20 {
    let it = pool[i];
    let key = "";
    if it.id != () { key = it.id; }
    if key != "" && seen[key] == () {
        seen[key] = true;
        to_verify.push(it);
    }
    i += 1;
}

phase("Verify");
let vjobs = [];
for it in to_verify {
    let vp = "Adversarially verify whether this Linear action item should stay in a founder top-10.\n";
    vp += "Item JSON: " + json_encode(it) + "\n\n";
    vp += "Snapshot excerpt (same facts):\n" + snapshot_text.sub_string(0, 6000) + "\n\n";
    vp += "Set keep=true only if: (1) id appears in snapshot, (2) not pure thrash on a megafile without ownership, ";
    vp += "(3) next_command is plausible. Prefer keep=false on vague or invented IDs. Return id, keep, reason, optional score_delta.";
    vjobs.push(#{
        prompt: vp,
        label: "verify:" + it.id,
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);

let kept = [];
let vi = 0;
for v in verdicts {
    if v != () && v.success && v.output != () && v.output.keep == true {
        let base = to_verify[vi];
        if v.output.score_delta != () {
            base.score = base.score + v.output.score_delta;
        }
        base.verify_reason = v.output.reason;
        kept.push(base);
    }
    vi += 1;
}

phase("Synthesize");
let syn_prompt = "Produce a founder-facing top-" + limit.to_string() + " action list from KEPT items only.\n";
syn_prompt += "KEPT JSON:\n" + json_encode(kept) + "\n\n";
syn_prompt += "Write markdown: ranked table (rank, id, score, agent, next command, why). ";
syn_prompt += "Call out agent-locks already held (do not double-claim). Mention scrub-stale if ghosts. ";
syn_prompt += "End with exact commands: node tools/linear-agent-bridge.js --claim …";

let syn = agent(syn_prompt, #{
    label: "synthesize",
    capability_mode: "read-only",
});

let report = "";
if syn != () && syn.success {
    if type_of(syn.output) == "string" {
        report = syn.output;
    } else {
        report = json_encode(syn.output);
    }
} else {
    report = "Synthesizer failed; raw kept=" + json_encode(kept);
}

let path = write_scratch_file("linear-fleet-triage.md", report);
complete(#{
    summary: "Linear fleet triage: " + kept.len().to_string() + " verified candidates → top report",
    path: path,
    kept_count: kept.len(),
    verified_pool: to_verify.len(),
    limit: limit,
});
