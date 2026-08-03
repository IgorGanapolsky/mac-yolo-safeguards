// rag-gap-harvest — find missing lessons / eval coverage gaps
// Optional args.root (default docs/ + tools/ lessons surfaces)

let meta = #{
    name: "rag-gap-harvest",
    description: "Scan for repeated failure classes lacking tests/lessons; propose capture stubs",
    when_to_use: "After multi-agent thrash, false ship claims, or CEO honesty incidents",
    phases: [
        #{ title: "Inventory", detail: "Existing gates, tests, field guide" },
        #{ title: "Mine", detail: "Parallel miners for gap classes" },
        #{ title: "Verify", detail: "Reject already-covered gaps" },
        #{ title: "Synthesize", detail: "Capture list + test stubs" },
    ],
};

let gap_schema = #{
    "type": "object",
    "required": ["gaps"],
    "properties": #{
        "gaps": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["class", "evidence_path", "missing", "proposed_check"],
                "properties": #{
                    "class": #{ "type": "string" },
                    "evidence_path": #{ "type": "string" },
                    "missing": #{ "type": "string" },
                    "proposed_check": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real_gap", "reason"],
    "properties": #{
        "real_gap": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "existing_coverage": #{ "type": "string" },
    },
};

phase("Inventory");
let inv = agent(
    "Inventory existing honesty/coord feedback loops (execute, read-only tools ok):\n"
        + "ls tools/ship-claim-gate.js tools/social-publish-gate.js tools/linear-agent-bridge.js tools/megafile-risk-scan.js tools/workflow-preflight.js 2>/dev/null; "
        + "ls tests/test-ship-claim* tests/test-linear* tests/test-workflows* tests/test-megafile* 2>/dev/null; "
        + "ls docs/agent-field-guide/index.md docs/WORKFLOWS-XAI-INTEGRATION-AUG-2026.md docs/RESEARCH-LINEAR-OBSIDIAN-MULTIAGENT-AUG-2026.md 2>/dev/null; "
        + "rg -n \"scrub-stale|ship-claim|MEGAFILES|absence-is-not\" tools docs --glob '*.md' --glob '*.js' 2>/dev/null | head -40; "
        + "Return factual inventory only.",
    #{ label: "inventory", capability_mode: "execute" },
);
if inv == () || !inv.success {
    pause("infra", "inventory failed");
}
let inv_text = if type_of(inv.output) == "string" { inv.output } else { json_encode(inv.output) };

phase("Mine");
let topics = [
    "false LIVE/ship completion language",
    "stale Linear agent-lock labels after Done",
    "megafile multi-owner thrash",
    "plugin-as-lock or vault claim skipped",
    "workflow fan-out without verification",
];
let jobs = [];
for t in topics {
    let p = "Find coverage GAPS for failure class: " + t + "\nINVENTORY:\n" + inv_text + "\n";
    p += "Use grep/read_file to confirm whether a deterministic test or gate already encodes this. ";
    p += "Return gaps {class, evidence_path, missing, proposed_check}. Empty gaps if fully covered with proof path.";
    jobs.push(#{
        prompt: p,
        label: "mine:" + t,
        capability_mode: "execute",
        output_schema: gap_schema,
    });
}
let mined = parallel(jobs);
let gaps = [];
for r in mined {
    if r != () && r.success && r.output != () && r.output.gaps != () {
        for g in r.output.gaps { gaps.push(g); }
    }
}

if gaps.len() == 0 {
    let path0 = write_scratch_file("rag-gap-harvest.md", "# RAG gaps\n\nNo gaps found against inventory.\n\n" + inv_text);
    complete(#{ summary: "No RAG/eval gaps found", path: path0 });
}

phase("Verify");
let slice = [];
let i = 0;
while i < gaps.len() && slice.len() < 16 {
    slice.push(gaps[i]);
    i += 1;
}
let vjobs = [];
for g in slice {
    vjobs.push(#{
        prompt: "Is this still a real coverage gap? Check inventory and repo knowledge.\n"
            + json_encode(g) + "\nINVENTORY:\n" + inv_text.sub_string(0, 5000)
            + "\nreal_gap=false if ship-claim-gate/scrub-stale/megafile-risk-scan/tests already cover it.",
        label: "verify-gap",
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);
let real = [];
let vi = 0;
for v in verdicts {
    if v != () && v.success && v.output != () && v.output.real_gap == true {
        let item = slice[vi];
        item.verify_reason = v.output.reason;
        real.push(item);
    }
    vi += 1;
}

phase("Synthesize");
let syn = agent(
    "Produce capture plan for real gaps only:\n" + json_encode(real)
        + "\nMarkdown: prioritized checklist, proposed tools/tests paths, ThumbGate capture stubs. "
        + "Do not invent gaps already closed by ship-claim-batch or scrub-stale.",
    #{ label: "synthesize", capability_mode: "read-only" },
);
let report = if syn != () && syn.success {
    if type_of(syn.output) == "string" { syn.output } else { json_encode(syn.output) }
} else {
    json_encode(real)
};
let path = write_scratch_file("rag-gap-harvest.md", report);
complete(#{
    summary: real.len().to_string() + " real coverage gaps after verification",
    path: path,
    real_gaps: real.len(),
    candidates: slice.len(),
});
