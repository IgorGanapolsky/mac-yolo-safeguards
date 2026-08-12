#!/usr/bin/env python3
"""Gurobi fleet optimization library (real gurobipy, size-limited free pip license).

Contact (2026-08-12): Fabrizio Ellis <fabrizio.ellis@gurobi.com>
Path: free pip gurobipy first; full trial when models exceed size limits
(≤2000 vars, ≤2000 linear constraints, ≤200 quadratic vars).
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any

try:
    import gurobipy as gp
    from gurobipy import GRB

    GUROBIPY_OK = True
    GUROBI_VERSION = gp.gurobi.version()
except Exception as e:  # pragma: no cover
    GUROBIPY_OK = False
    GUROBI_VERSION = None
    GRB = None  # type: ignore
    gp = None  # type: ignore
    _IMPORT_ERR = str(e)

# Free pip license limits (support article 360051597492)
LIMITS = {
    "max_vars": 2000,
    "max_linear_constrs": 2000,
    "max_quadratic_vars": 200,
    "non_production_only": True,
}


@dataclass
class SolveResult:
    ok: bool
    status: str
    status_code: int | None = None
    objective: float | None = None
    values: dict[str, float] = field(default_factory=dict)
    runtime_sec: float = 0.0
    model_stats: dict[str, Any] = field(default_factory=dict)
    license: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def license_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "gurobipy_import_ok": GUROBIPY_OK,
        "version": GUROBI_VERSION,
        "limits": LIMITS,
        "restricted_message": "Restricted license - for non-production use only",
        "contact": {
            "ae": "Fabrizio Ellis <fabrizio.ellis@gurobi.com>",
            "cc": "Jue Xue <jue.xue@gurobi.com>",
            "path": "free pip first; request full trial when size-limited",
            "resources": [
                "https://support.gurobi.com/hc/en-us/articles/360039862834",
                "https://support.gurobi.com/hc/en-us",
                "https://support.gurobi.com/hc/en-us/community/topics",
                "https://gurobi.com/gurobot",
            ],
            "calendly": "https://calendly.com/d/ctn3-5zn-ykz/gurobi-call",
        },
    }
    if not GUROBIPY_OK:
        info["error"] = globals().get("_IMPORT_ERR", "gurobipy missing")
        return info

    # Probe with a tiny model to surface license banner / expiry path
    try:
        with gp.Env(empty=True) as env:
            env.setParam("OutputFlag", 0)
            env.start()
            m = gp.Model(env=env)
            m.setParam("OutputFlag", 0)
            x = m.addVar(name="probe")
            m.setObjective(x, GRB.MINIMIZE)
            m.addConstr(x >= 0)
            m.optimize()
            info["probe_status"] = int(m.Status)
            info["probe_ok"] = m.Status == GRB.OPTIMAL
            info["license_mode"] = "size_limited_pip"
            info["expires_note"] = "pip restricted license (printed by solver; typically multi-year)"
    except Exception as e:
        info["probe_ok"] = False
        info["error"] = str(e)
    return info


def _status_name(code: int) -> str:
    mapping = {
        GRB.OPTIMAL: "OPTIMAL",
        GRB.INFEASIBLE: "INFEASIBLE",
        GRB.INF_OR_UNBD: "INF_OR_UNBD",
        GRB.UNBOUNDED: "UNBOUNDED",
        GRB.TIME_LIMIT: "TIME_LIMIT",
        GRB.NUMERIC: "NUMERIC",
    }
    return mapping.get(code, f"STATUS_{code}")


def solve_lp(
    variables: list[dict[str, Any]],
    constraints: list[dict[str, Any]],
    sense: str = "minimize",
    objective: dict[str, float] | None = None,
    time_limit: float = 30.0,
) -> SolveResult:
    """Solve a simple LP/MIP.

    variables: [{name, lb?, ub?, vtype?: CONTINUOUS|INTEGER|BINARY}]
    constraints: [{name?, coeffs: {var: coef}, sense: >=|<=|=, rhs: number}]
    objective: {var: coef} linear objective
    """
    if not GUROBIPY_OK:
        return SolveResult(ok=False, status="IMPORT_ERROR", error=globals().get("_IMPORT_ERR"))

    notes: list[str] = []
    t0 = time.perf_counter()
    try:
        with gp.Env(empty=True) as env:
            env.setParam("OutputFlag", 0)
            env.start()
            m = gp.Model(env=env)
            m.setParam("OutputFlag", 0)
            m.setParam("TimeLimit", float(time_limit))

            vtype_map = {
                "CONTINUOUS": GRB.CONTINUOUS,
                "INTEGER": GRB.INTEGER,
                "BINARY": GRB.BINARY,
                "C": GRB.CONTINUOUS,
                "I": GRB.INTEGER,
                "B": GRB.BINARY,
            }
            vars_map: dict[str, Any] = {}
            for v in variables:
                name = v["name"]
                vt = vtype_map.get(str(v.get("vtype", "CONTINUOUS")).upper(), GRB.CONTINUOUS)
                if vt == GRB.BINARY:
                    lb, ub = 0.0, 1.0
                else:
                    lb = float(v["lb"]) if "lb" in v else 0.0
                    ub = float(v["ub"]) if "ub" in v else GRB.INFINITY
                vars_map[name] = m.addVar(lb=lb, ub=ub, vtype=vt, name=name)

            m.update()
            obj = objective or {}
            lin = gp.quicksum(float(coef) * vars_map[name] for name, coef in obj.items())
            m.setObjective(lin, GRB.MINIMIZE if sense.lower().startswith("min") else GRB.MAXIMIZE)

            for i, c in enumerate(constraints):
                coeffs = c.get("coeffs") or {}
                expr = gp.quicksum(float(coef) * vars_map[n] for n, coef in coeffs.items())
                sense_c = c.get("sense", ">=")
                rhs = float(c["rhs"])
                cname = c.get("name") or f"c{i}"
                if sense_c in (">=", "ge"):
                    m.addConstr(expr >= rhs, name=cname)
                elif sense_c in ("<=", "le"):
                    m.addConstr(expr <= rhs, name=cname)
                else:
                    m.addConstr(expr == rhs, name=cname)

            m.update()
            nvars = int(m.NumVars)
            ncons = int(m.NumConstrs)
            if nvars > LIMITS["max_vars"] or ncons > LIMITS["max_linear_constrs"]:
                notes.append(
                    f"Model may exceed free pip limits (vars={nvars}, constrs={ncons}). "
                    "Request full trial from Fabrizio/Jue if solve fails."
                )

            m.optimize()
            runtime = time.perf_counter() - t0
            status = _status_name(int(m.Status))
            values = {}
            obj_val = None
            if m.Status == GRB.OPTIMAL:
                values = {n: float(var.X) for n, var in vars_map.items()}
                obj_val = float(m.ObjVal)
            return SolveResult(
                ok=m.Status == GRB.OPTIMAL,
                status=status,
                status_code=int(m.Status),
                objective=obj_val,
                values=values,
                runtime_sec=runtime,
                model_stats={"num_vars": nvars, "num_constrs": ncons},
                license=license_info(),
                notes=notes,
            )
    except Exception as e:
        msg = str(e)
        if "size-limited" in msg.lower() or "restricted" in msg.lower():
            notes.append("Hit size-limited license — escalate to full Gurobi trial with Fabrizio.")
        return SolveResult(
            ok=False,
            status="ERROR",
            error=msg,
            runtime_sec=time.perf_counter() - t0,
            license=license_info(),
            notes=notes,
        )


def optimize_agent_dispatch(
    tasks: list[dict[str, Any]],
    agents: list[dict[str, Any]],
    max_tasks_per_agent: int = 3,
) -> SolveResult:
    """Assign tasks to agents maximizing total priority under capacity/skills.

    tasks: [{id, priority, skill?}]
    agents: [{id, capacity?, skills?: [str]}]
    """
    if not GUROBIPY_OK:
        return SolveResult(ok=False, status="IMPORT_ERROR", error=globals().get("_IMPORT_ERR"))

    t0 = time.perf_counter()
    try:
        with gp.Env(empty=True) as env:
            env.setParam("OutputFlag", 0)
            env.start()
            m = gp.Model(env=env)
            m.setParam("OutputFlag", 0)

            x = {}
            for ti, task in enumerate(tasks):
                for ai, agent in enumerate(agents):
                    skill_ok = True
                    need = task.get("skill")
                    if need:
                        skills = agent.get("skills") or []
                        skill_ok = need in skills or not skills
                    if not skill_ok:
                        continue
                    x[ti, ai] = m.addVar(vtype=GRB.BINARY, name=f"t{ti}_a{ai}")

            # each task at most once
            for ti, _task in enumerate(tasks):
                m.addConstr(
                    gp.quicksum(x[ti, ai] for ai in range(len(agents)) if (ti, ai) in x) <= 1,
                    name=f"task_once_{ti}",
                )

            # agent capacity
            for ai, agent in enumerate(agents):
                cap = int(agent.get("capacity", max_tasks_per_agent))
                m.addConstr(
                    gp.quicksum(x[ti, ai] for ti in range(len(tasks)) if (ti, ai) in x) <= cap,
                    name=f"cap_{ai}",
                )

            m.setObjective(
                gp.quicksum(
                    float(tasks[ti].get("priority", 1)) * x[ti, ai] for (ti, ai) in x
                ),
                GRB.MAXIMIZE,
            )
            m.optimize()
            runtime = time.perf_counter() - t0
            status = _status_name(int(m.Status))
            assignment: dict[str, float] = {}
            pairs = []
            if m.Status == GRB.OPTIMAL:
                for (ti, ai), var in x.items():
                    if var.X > 0.5:
                        tid = str(tasks[ti].get("id", ti))
                        aid = str(agents[ai].get("id", ai))
                        assignment[f"{tid}->{aid}"] = 1.0
                        pairs.append({"task": tid, "agent": aid, "priority": tasks[ti].get("priority", 1)})
            return SolveResult(
                ok=m.Status == GRB.OPTIMAL,
                status=status,
                status_code=int(m.Status),
                objective=float(m.ObjVal) if m.Status == GRB.OPTIMAL else None,
                values=assignment,
                runtime_sec=runtime,
                model_stats={
                    "num_tasks": len(tasks),
                    "num_agents": len(agents),
                    "num_assign_vars": len(x),
                    "assignments": pairs,
                },
                license=license_info(),
                notes=["agent_dispatch: maximize priority under capacity/skills"],
            )
    except Exception as e:
        return SolveResult(
            ok=False,
            status="ERROR",
            error=str(e),
            runtime_sec=time.perf_counter() - t0,
            license=license_info(),
        )


def optimize_outreach_batch(
    prospects: list[dict[str, Any]],
    daily_capacity: int = 15,
    min_score: float = 0.0,
) -> SolveResult:
    """Select AHLS/outreach prospects maximizing score under daily send capacity.

    prospects: [{id, score, cost_units?}]  cost_units default 1
    """
    if not GUROBIPY_OK:
        return SolveResult(ok=False, status="IMPORT_ERROR", error=globals().get("_IMPORT_ERR"))

    filtered = [p for p in prospects if float(p.get("score", 0)) >= min_score]
    t0 = time.perf_counter()
    try:
        with gp.Env(empty=True) as env:
            env.setParam("OutputFlag", 0)
            env.start()
            m = gp.Model(env=env)
            m.setParam("OutputFlag", 0)
            y = {
                i: m.addVar(vtype=GRB.BINARY, name=f"p{i}")
                for i, _p in enumerate(filtered)
            }
            m.addConstr(
                gp.quicksum(
                    float(filtered[i].get("cost_units", 1)) * y[i] for i in y
                )
                <= int(daily_capacity),
                name="capacity",
            )
            m.setObjective(
                gp.quicksum(float(filtered[i].get("score", 0)) * y[i] for i in y),
                GRB.MAXIMIZE,
            )
            m.optimize()
            runtime = time.perf_counter() - t0
            selected = []
            values = {}
            if m.Status == GRB.OPTIMAL:
                for i, var in y.items():
                    if var.X > 0.5:
                        pid = str(filtered[i].get("id", i))
                        values[pid] = 1.0
                        selected.append(
                            {
                                "id": pid,
                                "score": filtered[i].get("score"),
                                "cost_units": filtered[i].get("cost_units", 1),
                            }
                        )
            return SolveResult(
                ok=m.Status == GRB.OPTIMAL,
                status=_status_name(int(m.Status)),
                status_code=int(m.Status),
                objective=float(m.ObjVal) if m.Status == GRB.OPTIMAL else None,
                values=values,
                runtime_sec=runtime,
                model_stats={
                    "candidates": len(filtered),
                    "daily_capacity": daily_capacity,
                    "selected": selected,
                    "selected_count": len(selected),
                },
                license=license_info(),
                notes=["outreach_batch: max score under capacity — pair with DRAFT-only send policy"],
            )
    except Exception as e:
        return SolveResult(
            ok=False,
            status="ERROR",
            error=str(e),
            runtime_sec=time.perf_counter() - t0,
            license=license_info(),
        )


def run_evaluation() -> dict[str, Any]:
    """Hermetic evaluation suite for CI / session claims."""
    cases: list[dict[str, Any]] = []

    # 1) classic LP
    r1 = solve_lp(
        variables=[{"name": "x"}, {"name": "y"}],
        constraints=[
            {"coeffs": {"x": 1, "y": 2}, "sense": ">=", "rhs": 3},
            {"coeffs": {"x": 2, "y": 1}, "sense": ">=", "rhs": 3},
        ],
        objective={"x": 1, "y": 1},
        sense="minimize",
    )
    cases.append(
        {
            "id": "lp_diet_style",
            "ok": r1.ok and abs((r1.objective or 0) - 2.0) < 1e-6,
            "result": r1.to_dict(),
        }
    )

    # 2) agent dispatch
    r2 = optimize_agent_dispatch(
        tasks=[
            {"id": "ahls-batch", "priority": 10, "skill": "outreach"},
            {"id": "codeql", "priority": 5, "skill": "code"},
            {"id": "garryslist", "priority": 7, "skill": "browser"},
            {"id": "mobile-e2e", "priority": 8, "skill": "mobile"},
        ],
        agents=[
            {"id": "grok", "capacity": 2, "skills": ["outreach", "browser", "code"]},
            {"id": "codex", "capacity": 2, "skills": ["code", "mobile"]},
            {"id": "claude", "capacity": 1, "skills": ["browser", "mobile"]},
        ],
        max_tasks_per_agent=2,
    )
    cases.append(
        {
            "id": "agent_dispatch",
            "ok": r2.ok and (r2.objective or 0) >= 20,
            "result": r2.to_dict(),
        }
    )

    # 3) outreach knapsack
    r3 = optimize_outreach_batch(
        prospects=[
            {"id": "shop_a", "score": 90, "cost_units": 1},
            {"id": "shop_b", "score": 70, "cost_units": 1},
            {"id": "shop_c", "score": 40, "cost_units": 1},
            {"id": "shop_d", "score": 85, "cost_units": 2},
            {"id": "shop_e", "score": 20, "cost_units": 1},
        ],
        daily_capacity=3,
    )
    cases.append(
        {
            "id": "outreach_batch",
            "ok": r3.ok and (r3.model_stats or {}).get("selected_count", 0) >= 2,
            "result": r3.to_dict(),
        }
    )

    # 4) license probe
    lic = license_info()
    cases.append(
        {
            "id": "license_probe",
            "ok": bool(lic.get("gurobipy_import_ok") and lic.get("probe_ok")),
            "result": lic,
        }
    )

    passed = sum(1 for c in cases if c["ok"])
    return {
        "ok": passed == len(cases),
        "passed": passed,
        "total": len(cases),
        "version": GUROBI_VERSION,
        "cases": cases,
        "honesty": {
            "license": "size-limited free pip / non-production",
            "limits": LIMITS,
            "not_mock": True,
        },
    }


if __name__ == "__main__":
    print(json.dumps(run_evaluation(), indent=2, default=str))
