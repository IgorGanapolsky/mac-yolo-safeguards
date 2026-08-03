// megafile-risk-scan — hot-file PR/diff risk with ownership protocol
// args.base optional (default origin/main); args.pr optional; args.body_file optional

let meta = #{
    name: "megafile-risk-scan",
    description: "Scan diff for MEGAFILES, check plan.md / decision cites, report thrash risk",
    when_to_use: "Before merging multi-agent mobile PRs; any PR touching Hermes connect/chat",
    phases: [
        #{ title: "Deterministic", detail: "megafile-risk-scan.js" },
        #{ title: "Context", detail: "plan.md + PR body ownership" },
        #{ title: "Assess", detail: "Parallel risk assessors" },
        #{ title: "Verify", detail: "Skeptics on false positives" },
        #{ title: "Synthesize", detail: "Merge risk report" },
    ],
};

let finding_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 10,
            "items": #{
                "type": "object",
                "required": ["file", "risk", "issue"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "risk": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "mitigation": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let base = "origin/main";
let body_file = "";
let pr = "";
if args != () {
    if args.base != () { base = args.base; }
    if args.body_file != () { body_file = args.body_file; }
    if args.pr != () { pr = args.pr; }
}

phase("Deterministic");
let cmd = "node tools/megafile-risk-scan.js --base " + base + " --json";
if body_file != "" {
    cmd += " --require-decision --body-file " + body_file;
}
let det = agent(
    "Run from repo root:\n" + cmd + "\n"
        + "Also: node tools/agent-swarm-harness.js --json 2>/dev/null | head -c 4000 || true\n"
        + "Return full JSON/text. No edits.",
    #{ label: "megafile-det", capability_mode: "execute" },
);
if det == () || !det.success {
    pause("infra", "megafile-risk-scan.js failed");
}
let det_text = if type_of(det.output) == "string" { det.output } else { json_encode(det.output) };

phase("Context");
let ctx_cmd = "test -f plan.md && head -120 plan.md || echo 'no plan.md'; ";
if pr != "" {
    ctx_cmd += "gh pr view " + pr + " --json title,body,files 2>/dev/null || true; ";
}
if body_file != "" {
    ctx_cmd += "wc -l " + body_file + "; ";
}
let ctx = agent(
    "Gather ownership context (execute):\n" + ctx_cmd + "\n"
        + "Deterministic scan was:\n" + det_text + "\n"
        + "Summarize who owns megafiles and whether PR cites decisions.",
    #{ label: "ownership-ctx", capability_mode: "execute" },
);
let ctx_text = if ctx != () && ctx.success {
    if type_of(ctx.output) == "string" { ctx.output } else { json_encode(ctx.output) }
} else {
    "context missing"
};

phase("Assess");
let lenses = ["merge conflict thrash", "missing plan.md claim", "missing tests for megafile change"];
let jobs = [];
for lens in lenses {
    let p = "Assess megafile risk for lens: " + lens + "\nSCAN:\n" + det_text + "\nCTX:\n" + ctx_text + "\n";
    p += "Return findings {file, risk high|med|low, issue, mitigation}. Empty only if scan hitCount=0 and lens N/A.";
    jobs.push(#{
        prompt: p,
        label: "assess:" + lens,
        capability_mode: "read-only",
        output_schema: finding_schema,
    });
}
let assessments = parallel(jobs);
let findings = [];
for r in assessments {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings { findings.push(f); }
    }
}

if findings.len() == 0 {
    let path0 = write_scratch_file("megafile-risk-scan.md", "# Megafile risk\n\nNo agent findings. Deterministic:\n\n```\n" + det_text + "\n```\n");
    complete(#{ summary: "No megafile agent findings", path: path0, deterministic: det_text });
}

phase("Verify");
let slice = [];
let i = 0;
while i < findings.len() && slice.len() < 16 {
    slice.push(findings[i]);
    i += 1;
}
let vjobs = [];
for f in slice {
    vjobs.push(#{
        prompt: "Verify this megafile risk against the deterministic scan JSON. real=true only with evidence.\nFinding: "
            + json_encode(f) + "\nSCAN:\n" + det_text.sub_string(0, 5000),
        label: "verify-mf",
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);
let confirmed = [];
let vi = 0;
for v in verdicts {
    if v != () && v.success && v.output != () && v.output.real == true && v.output.evidence != () && v.output.evidence != "" {
        let item = slice[vi];
        item.evidence = v.output.evidence;
        confirmed.push(item);
    }
    vi += 1;
}

phase("Synthesize");
let syn = agent(
    "Write merge-risk report for megafiles.\nConfirmed:\n" + json_encode(confirmed)
        + "\nDeterministic:\n" + det_text + "\nContext:\n" + ctx_text
        + "\nInclude: stop/go, required plan.md claims, sequential merge order.",
    #{ label: "synthesize", capability_mode: "read-only" },
);
let report = if syn != () && syn.success {
    if type_of(syn.output) == "string" { syn.output } else { json_encode(syn.output) }
} else {
    json_encode(confirmed)
};
let path = write_scratch_file("megafile-risk-scan.md", report);
complete(#{
    summary: confirmed.len().to_string() + " confirmed megafile risks",
    path: path,
    confirmed: confirmed.len(),
});
