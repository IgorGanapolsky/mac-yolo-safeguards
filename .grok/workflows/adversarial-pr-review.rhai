// adversarial-pr-review — multi-lens PR review with independent skeptics
// Run: workflow adversarial-pr-review with args.pr = "1367" or args.target = "origin/main...HEAD"
// Read-only; does not push or merge.

let meta = #{
    name: "adversarial-pr-review",
    description: "Fan-out specialist PR reviewers, adversarially verify findings, synthesize ranked report",
    when_to_use: "Large or multi-feature PRs; before merge; when single-pass review is not enough",
    phases: [
        #{ title: "Context", detail: "Fetch PR metadata and diff stats" },
        #{ title: "Review", detail: "Parallel specialist reviewers" },
        #{ title: "Verify", detail: "Independent skeptics per finding" },
        #{ title: "Synthesize", detail: "Ranked confirmed findings only" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["file", "issue", "severity"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "line_hint": #{ "type": "string" },
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

let pr = ();
let target = ();
if args != () {
    if args.pr != () { pr = args.pr; }
    if args.target != () { target = args.target; }
}
if pr == () && target == () {
    pause("verification", "Pass args.pr (number) or args.target (git ref range like origin/main...HEAD).");
}

phase("Context");
let ctx_prompt = "Gather PR review context with shell/read-only tools. ";
if pr != () {
    ctx_prompt += "Run: gh pr view " + pr.to_string() + " --json title,body,files,additions,deletions,baseRefName,headRefName,url ; ";
    ctx_prompt += "gh pr diff " + pr.to_string() + " --name-only ; ";
    ctx_prompt += "Optionally sample gh pr diff " + pr.to_string() + " | head -c 80000. ";
} else {
    ctx_prompt += "Run: git diff --stat " + target + " ; git diff --name-only " + target + " ; ";
    ctx_prompt += "Sample git diff " + target + " | head -c 80000. ";
}
ctx_prompt += "Also note megafiles if present: hermes-mobile GatewayContext ChatScreen ConnectMacGate. ";
ctx_prompt += "Return a compact factual brief: title, file list, risk hotspots, diff size. Do not invent files.";

let ctx = agent(ctx_prompt, #{
    label: "context",
    capability_mode: "execute",
});
if ctx == () || !ctx.success {
    pause("infra", "Failed to load PR/diff context.");
}

let brief = "";
if type_of(ctx.output) == "string" {
    brief = ctx.output;
} else {
    brief = json_encode(ctx.output);
}

phase("Review");
let dimensions = [
    "correctness and regressions",
    "security secrets and auth",
    "multi-agent coordination hazards (locks, shared trees, false ship claims)",
    "tests and CI evidence gaps",
    "performance and mobile/UX risk if mobile files touched",
];

let ref_label = "";
if pr != () {
    ref_label = "PR #" + pr.to_string();
} else {
    ref_label = target;
}

let rjobs = [];
for d in dimensions {
    let rp = "Review " + ref_label + " for: " + d + ".\n\n";
    rp += "CONTEXT BRIEF:\n" + brief + "\n\n";
    rp += "Use read_file/grep/git or gh as needed to INSPECT actual code — do not answer from memory. ";
    rp += "Report at most 8 findings as {file, issue, severity: high|med|low, line_hint?}. ";
    rp += "Empty findings is valid only after you inspected the changed files. Prefer concrete over style nits.";
    rjobs.push(#{
        prompt: rp,
        label: "review:" + d,
        capability_mode: "execute",
        output_schema: findings_schema,
    });
}
let reviews = parallel(rjobs);

let findings = [];
for r in reviews {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            findings.push(f);
        }
    }
}

if findings.len() == 0 {
    complete(#{
        summary: "No findings from specialist reviewers after code inspection.",
        confirmed: [],
        brief: brief,
    });
}

// Cap skeptics
let cap = 24;
let slice = [];
let fi = 0;
while fi < findings.len() && slice.len() < cap {
    slice.push(findings[fi]);
    fi += 1;
}
if findings.len() > cap {
    log("Truncated findings for verify: " + cap.to_string() + " of " + findings.len().to_string());
}

phase("Verify");
let vjobs = [];
for f in slice {
    let vp = "Adversarially verify this review finding by reading the shipped/changed code.\n";
    vp += "Finding: " + json_encode(f) + "\n";
    vp += "PR/target: " + ref_label + "\n";
    vp += "Set real=true ONLY with concrete evidence you independently inspected (quote or cite lines). ";
    vp += "Default real=false if uncertain, stylistic, or already fixed. evidence must be non-empty when real=true.";
    vjobs.push(#{
        prompt: vp,
        label: "verify:" + f.file,
        capability_mode: "execute",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);

let confirmed = [];
let vj = 0;
for v in verdicts {
    if v != () && v.success && v.output != () && v.output.real == true
        && v.output.evidence != () && v.output.evidence != "" {
        let item = slice[vj];
        item.evidence = v.output.evidence;
        item.verify_reason = v.output.reason;
        confirmed.push(item);
    }
    vj += 1;
}

phase("Synthesize");
let sp = "Synthesize a ranked PR review report for " + ref_label + ".\n";
sp += "Confirmed findings only:\n" + json_encode(confirmed) + "\n\n";
sp += "Context brief:\n" + brief + "\n\n";
sp += "Markdown: (1) merge recommendation (approve / request changes / comment), ";
sp += "(2) table of confirmed issues by severity, (3) residual risks not confirmed, ";
sp += "(4) if megafiles touched, require plan.md / Linear claim note. No fake confidence.";

let syn = agent(sp, #{
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
    report = "# Confirmed findings\n\n" + json_encode(confirmed);
}

let path = write_scratch_file("adversarial-pr-review.md", report);
complete(#{
    summary: confirmed.len().to_string() + "/" + slice.len().to_string() + " findings survived verification",
    path: path,
    confirmed_count: confirmed.len(),
    reviewed_findings: slice.len(),
    target: ref_label,
});
