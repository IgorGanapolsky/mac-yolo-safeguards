// Issue-first coding context loop (HF Context Course × three-bus).
// READ-ONLY orchestration: ranks FOCUS issue + verifies evidence; mutations stay on main agent.

let meta = #{
    name: "coding-context-loop",
    description: "Issue-first coding context: pack inventory → parallel lanes (FOCUS AC, PR/CI, three-bus) → adversarial verify → next coding slice",
    when_to_use: "Session start coding, after ship theater, /coding-context-loop, when choosing next product issue, before claiming done. Complements /mac-yolo-issues-board.",
    phases: [
        #{ title: "Pack", detail: "Run coding-context-pack + open issues/PRs/e2e SSOT" },
        #{ title: "Lanes", detail: "Parallel: FOCUS AC, open PR/CI, three-bus readiness" },
        #{ title: "Verify", detail: "Adversarial recheck — no invented PR/Linear IDs" },
        #{ title: "Slice", detail: "Single next coding slice with skills + stop conditions" },
    ],
};

let pack_schema = #{
    "type": "object",
    "required": [
        "resolved_date_iso",
        "focus_issue",
        "issue_matrix_summary",
        "e2e_proof",
        "ship_gate_ok",
        "surfaces_examined",
        "unverified_claims",
    ],
    "properties": #{
        "resolved_date_iso": #{ "type": "string" },
        "focus_issue": #{
            "type": "object",
            "required": ["number", "title", "score"],
            "properties": #{
                "number": #{ "type": "integer" },
                "title": #{ "type": "string" },
                "score": #{ "type": "number" },
                "linear_id": #{ "type": "string" },
                "related_prs": #{ "type": "array", "items": #{ "type": "integer" }, "maxItems": 8 },
                "acceptance_hints": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
                "skills": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
            },
        },
        "issue_matrix_summary": #{
            "type": "array",
            "maxItems": 10,
            "items": #{
                "type": "object",
                "required": ["number", "title", "score"],
                "properties": #{
                    "number": #{ "type": "integer" },
                    "title": #{ "type": "string" },
                    "score": #{ "type": "number" },
                    "linear_id": #{ "type": "string" },
                    "blocked": #{ "type": "boolean" },
                },
            },
        },
        "e2e_proof": #{ "type": "string" },
        "ship_gate_ok": #{ "type": "boolean" },
        "surfaces_examined": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 20 },
        "unverified_claims": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
    },
};

let lane_schema = #{
    "type": "object",
    "required": ["lane", "findings", "residual_uncertainty"],
    "properties": #{
        "lane": #{ "type": "string" },
        "findings": #{
            "type": "array",
            "maxItems": 6,
            "items": #{
                "type": "object",
                "required": ["id", "severity", "claim_status", "title", "evidence", "next_action"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "severity": #{ "type": "string", "enum": ["blocker", "high", "medium", "low", "info"] },
                    "claim_status": #{ "type": "string", "enum": ["verified", "unverified", "refuted", "stale", "contradiction"] },
                    "title": #{ "type": "string" },
                    "detail": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                    "next_action": #{ "type": "string" },
                },
            },
        },
        "residual_uncertainty": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
    },
};

let slice_schema = #{
    "type": "object",
    "required": [
        "title",
        "resolved_date_iso",
        "next_coding_slice",
        "skills_to_load",
        "verify_commands",
        "three_bus_checklist",
        "do_not",
        "unverified_claims",
        "markdown_report",
    ],
    "properties": #{
        "title": #{ "type": "string" },
        "resolved_date_iso": #{ "type": "string" },
        "next_coding_slice": #{
            "type": "object",
            "required": ["gh_issue", "action", "stop_when", "owner"],
            "properties": #{
                "gh_issue": #{ "type": "integer" },
                "action": #{ "type": "string" },
                "stop_when": #{ "type": "string" },
                "owner": #{ "type": "string" },
                "open_pr": #{ "type": "string" },
                "linear_id": #{ "type": "string" },
            },
        },
        "skills_to_load": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "verify_commands": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 10 },
        "three_bus_checklist": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 6 },
        "do_not": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 10 },
        "unverified_claims": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "markdown_report": #{ "type": "string" },
    },
};

fn smoke_mode() {
    if type_of(args) == "map" {
        if args.contains("smoke") {
            return args["smoke"] == true || args["smoke"] == "true";
        }
    }
    false
}

fn focus_issue_arg() {
    if type_of(args) == "map" {
        if args.contains("issue") {
            return `${args["issue"]}`;
        }
    }
    ""
}

// --- Phase 1: Pack inventory ---
phase("Pack");
let pack_prompt = `
You are the coding-context inventory agent for IgorGanapolsky/mac-yolo-safeguards.

Run (from monorepo root; if cwd is hermes-mobile, cd ..):
  node tools/coding-context-pack.js --json
  node tools/coding-context-pack.js --write   # optional if tools allow writes to proofs dir

Also read when present:
  hermes-mobile/docs/proofs/continuous/latest.json
  hermes-mobile/docs/proofs/coding-context/latest.json
  ~/Documents/AI-Agent-Sync/Projects/mac-yolo-safeguards/GITHUB-PRODUCT-BOARD.md
  open GH issues via gh issue list --repo IgorGanapolsky/mac-yolo-safeguards --state open

Focus arg if provided: ISSUE=${focus_issue_arg()}

Return JSON matching the schema. Surfaces_examined must list real paths/commands.
Mark unverified_claims for anything not proven by tool output.
Never invent Linear IDs or PR numbers.
Smoke mode=${smoke_mode()}: if true, only use coding-context-pack --minimal text + latest e2e, skip deep PR digs.
`;

let pack = agent(#{
    prompt: pack_prompt,
    schema: pack_schema,
    description: "coding context pack inventory",
    capability_mode: "read-only",
});

write_scratch_file("coding-context-pack.json", pack);

// --- Phase 2: Parallel lanes ---
phase("Lanes");
let focus_num = 0;
if type_of(pack) == "map" && pack.contains("focus_issue") {
    let fi = pack["focus_issue"];
    if type_of(fi) == "map" && fi.contains("number") {
        focus_num = fi["number"];
    }
}

let ac_prompt = `
Lane: FOCUS acceptance criteria for GH issue #${focus_num}.
Read the issue body (gh issue view ${focus_num} --repo IgorGanapolsky/mac-yolo-safeguards) and pack acceptance_hints.
List verified AC items vs missing. Propose ONE next coding slice that fits a single PR.
Evidence only. Residual uncertainty for ambiguous AC.
Return lane_schema JSON with lane="focus_ac".
`;

let pr_prompt = `
Lane: Open PRs / CI for issue #${focus_num} and other top pack issues.
Use gh pr list --repo IgorGanapolsky/mac-yolo-safeguards --state open and gh pr view for related PRs from pack.
Report mergeStateStatus, failing checks, whether landing an open PR beats new work.
Return lane_schema JSON with lane="pr_ci".
`;

let bus_prompt = `
Lane: three-bus readiness (GitHub · Linear · vault).
Check:
  - vault GITHUB-PRODUCT-BOARD.md map for open issues
  - Agent-State/grok.md exists under ~/Documents/AI-Agent-Sync
  - whether ship_claim_gate is ok from pack e2e
Do NOT claim Linear or merge. List next_action for main agent only.
Return lane_schema JSON with lane="three_bus".
`;

let lanes;
if smoke_mode() {
    lanes = parallel([
        #{ prompt: ac_prompt, schema: lane_schema, description: "focus AC (smoke)", capability_mode: "read-only" },
    ]);
} else {
    lanes = parallel([
        #{ prompt: ac_prompt, schema: lane_schema, description: "focus AC lane", capability_mode: "read-only" },
        #{ prompt: pr_prompt, schema: lane_schema, description: "PR/CI lane", capability_mode: "read-only" },
        #{ prompt: bus_prompt, schema: lane_schema, description: "three-bus lane", capability_mode: "read-only" },
    ]);
}

write_scratch_file("coding-context-lanes.json", lanes);

// --- Phase 3: Verify ---
phase("Verify");
let verify_prompt = `
Adversarial verifier for coding-context-loop.
Inputs:
  pack=${pack}
  lanes=${lanes}

Rules:
1. Drop any PR number, Linear ID, or score not backed by pack/lanes evidence.
2. e2e=skipped is NOT pass for device ship claims.
3. Prefer finishing a green open PR over new branches.
4. Single next_coding_slice only — no multi-issue thrash.

Return slice_schema JSON with markdown_report for the main agent.
`;

let slice = agent(#{
    prompt: verify_prompt,
    schema: slice_schema,
    description: "adversarial coding slice",
    capability_mode: "read-only",
});

write_scratch_file("coding-context-slice.json", slice);

complete(slice);
