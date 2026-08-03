// ship-claim-audit — honesty panel over batch ship/LIVE claims
// args.claims_file required (JSON array of claims for ship-claim-batch)
// Deterministic gate first; agents only explain residual risk.

let meta = #{
    name: "ship-claim-audit",
    description: "Batch-verify ship/LIVE claims via ship-claim-gate; adversarial residual review",
    when_to_use: "Before saying shipped/LIVE/done for multi-item fan-outs; CEO honesty checks",
    phases: [
        #{ title: "Gate", detail: "Deterministic ship-claim-batch" },
        #{ title: "Explain", detail: "Parallel explainers for blocked claims" },
        #{ title: "Verify", detail: "Skeptics reject hand-wavy unblocks" },
        #{ title: "Synthesize", detail: "ALLOW/BLOCK matrix + next proofs" },
    ],
};

let explain_schema = #{
    "type": "object",
    "required": ["id", "root_cause", "missing_proof", "next_command"],
    "properties": #{
        "id": #{ "type": "string" },
        "root_cause": #{ "type": "string" },
        "missing_proof": #{ "type": "string" },
        "next_command": #{ "type": "string" },
        "can_honestly_reword": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["id", "still_blocked", "reason"],
    "properties": #{
        "id": #{ "type": "string" },
        "still_blocked": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
    },
};

let claims_file = ();
if args != () && args.claims_file != () {
    claims_file = args.claims_file;
}
if claims_file == () {
    pause("verification", "Pass args.claims_file — path to JSON claims array for ship-claim-batch.");
}

phase("Gate");
let gate = agent(
    "Run from repo root (execute):\n"
        + "node tools/ship-claim-batch.js --claims-file " + claims_file + " --json\n"
        + "Also run: node tools/ship-claim-gate.js --self-test\n"
        + "Return the full JSON stdout of the batch and self-test exit status. Do not edit files. "
        + "Do not re-interpret gates — paste factual output.",
    #{ label: "ship-batch-gate", capability_mode: "execute" },
);
if gate == () || !gate.success {
    pause("infra", "ship-claim-batch failed to run.");
}

let gate_text = "";
if type_of(gate.output) == "string" {
    gate_text = gate.output;
} else {
    gate_text = json_encode(gate.output);
}

phase("Explain");
let exp = agent(
    "From this ship-claim-batch output, list each BLOCKED claim and explain.\n"
        + gate_text + "\n\n"
        + "For each blocked id produce root_cause, missing_proof, next_command "
        + "(e.g. re-run with --results-json, fix e2e, drop 'all LIVE' language), "
        + "and can_honestly_reword (safe partial wording). "
        + "Return JSON array as multiple explain objects by calling tools only if needed to read claim file "
        + claims_file + ". Prefer reading the claims file + gate output only.\n"
        + "Output schema: single object with key items as array — if you must use freeform, list clearly.",
    #{ label: "explain-blocked", capability_mode: "execute" },
);

// Structured parallel on up to 8 synthetic slots from freeform is hard without parse;
// second agent extracts structured items.
let extract = agent(
    "Convert the following explanation into up to 8 objects matching "
        + "{id, root_cause, missing_proof, next_command, can_honestly_reword}.\n"
        + "SOURCE:\n" + (if exp != () && exp.success { if type_of(exp.output) == "string" { exp.output } else { json_encode(exp.output) } } else { gate_text }) + "\n"
        + "If nothing blocked, return one item id=none.",
    #{
        label: "extract-explain",
        capability_mode: "read-only",
        output_schema: #{
            "type": "object",
            "required": ["items"],
            "properties": #{
                "items": #{
                    "type": "array",
                    "maxItems": 8,
                    "items": explain_schema,
                },
            },
        },
    },
);

let items = [];
if extract != () && extract.success && extract.output != () && extract.output.items != () {
    items = extract.output.items;
}

phase("Verify");
let vjobs = [];
for it in items {
    if it.id != "none" {
        let vp = "Skeptic: does this still block a LIVE/ship claim?\n" + json_encode(it) + "\n";
        vp += "Gate context:\n" + gate_text.sub_string(0, 4000) + "\n";
        vp += "still_blocked=true unless missing_proof is already satisfied in the gate output. No charity.";
        vjobs.push(#{
            prompt: vp,
            label: "verify:" + it.id,
            capability_mode: "read-only",
            output_schema: verdict_schema,
        });
    }
}

let still = [];
if vjobs.len() > 0 {
    let verdicts = parallel(vjobs);
    let i = 0;
    for v in verdicts {
        if v != () && v.success && v.output != () && v.output.still_blocked == true {
            still.push(v.output);
        }
        i += 1;
    }
}

phase("Synthesize");
let sp = "Write a founder honesty report.\nGATE:\n" + gate_text + "\n\nEXPLAINED:\n"
    + json_encode(items) + "\n\nSTILL BLOCKED AFTER SKEPTIC:\n" + json_encode(still) + "\n\n"
    + "Markdown: ALLOW vs BLOCK table, forbidden phrases, exact next commands. "
    + "Never recommend claiming all LIVE when batch blocked any row.";
let syn = agent(sp, #{ label: "synthesize", capability_mode: "read-only" });
let report = "";
if syn != () && syn.success {
    if type_of(syn.output) == "string" { report = syn.output; } else { report = json_encode(syn.output); }
} else {
    report = json_encode(#{ gate: gate_text, items: items, still: still });
}
let path = write_scratch_file("ship-claim-audit.md", report);
complete(#{
    summary: "ship-claim audit: " + still.len().to_string() + " still blocked after skeptics",
    path: path,
    still_blocked: still.len(),
    explained: items.len(),
});
