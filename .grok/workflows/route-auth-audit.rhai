// Graph-engineering template: route auth audit (deterministic host tool).
// Claude/Codex agents are optional later; this workflow documents the topology
// and can shell the Node pipeline via an execute-capable agent if desired.
//
// Run: workflow name=route-auth-audit args=#{ max: 15 }
// Or directly: node tools/graph-eng-route-auth-audit.js --max=15

let meta = #{
    name: "route-auth-audit",
    description: "Planner→parallel workers→independent verifiers→synthesize route auth audit",
    when_to_use: "Audit hermes-control-plane API routes for missing auth surfaces using dual-witness graph",
    phases: [
        #{ title: "Plan", detail: "Select route.ts files" },
        #{ title: "Work+Verify", detail: "Deterministic fan-out via Node graph tool" },
        #{ title: "Gate", detail: "Human review if confirmed findings" },
    ],
};

let max_n = 20;
if args != () && args.max != () {
    max_n = args.max;
}

phase("Plan");
log("Graph: Planner → Worker×N → Verifier×M → Synthesizer → HumanGate");
log("Capped fan-out max=" + max_n.to_string());

phase("Work+Verify");
// Single execute agent runs the deterministic graph tool (workers/verifiers inside Node).
// This keeps LLM cost at 1 while preserving parallel structure in the tool.
let r = agent(
    "Run the graph-engineering route auth audit and return a short summary of confirmed findings only. "
        + "Use the execute capability to run: node tools/graph-eng-route-auth-audit.js --max="
        + max_n.to_string()
        + " --json "
        + "Capture exit code (0=pass, 2=review required). "
        + "Do not invent routes; only report what the tool printed. "
        + "Reply with: exit_code, confirmed_count, and up to 10 confirmed route paths.",
    #{
        label: "graph-runner",
        capability_mode: "execute",
        agent_type: "general-purpose",
    },
);

phase("Gate");
if r == () || r.success != true {
    pause("verification", "Graph runner failed or returned no result — inspect logs and re-run.");
}

// Human gate: operator reviews when the tool signals findings.
await_user(
    "user",
    "If the audit exit_code is 2 or confirmed_count > 0, review confirmed routes before deploy. "
        + "Resume after you have triaged (or confirmed clean).",
);

complete(#{
    summary: "route-auth-audit graph completed",
    runner_ok: r.success,
    max: max_n,
});
