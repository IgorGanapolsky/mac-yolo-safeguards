#!/usr/bin/env python3
"""
Agent Dispatch & Capacity Optimization Model
---------------------------------------------
An open-source modeling example for Gurobi (gurobipy) demonstrating how to solve
multi-agent task assignment under concurrency, memory, and cost constraints.

Suitable for submission to github.com/Gurobi/modeling-examples.
"""

import gurobipy as gp
from gurobipy import GRB

def solve_agent_dispatch():
    # 1. Define sets
    agents = ['Agent_Alpha', 'Agent_Beta', 'Agent_Gamma']
    tasks = ['CodeReview', 'E2ETestExecution', 'ModelDistillation', 'SecurityScan', 'DataIngestion']

    # Task priority values and resource costs
    task_priority = {'CodeReview': 8, 'E2ETestExecution': 9, 'ModelDistillation': 10, 'SecurityScan': 7, 'DataIngestion': 5}
    task_memory_mb = {'CodeReview': 512, 'E2ETestExecution': 1024, 'ModelDistillation': 4096, 'SecurityScan': 256, 'DataIngestion': 2048}

    # Agent capacity
    max_memory_per_agent = 5120  # 5GB per agent

    # 2. Create model
    model = gp.Model("Agent_Dispatch_Optimization")
    model.Params.TimeLimit = 30
    model.Params.MIPGap = 0.01

    # 3. Decision variables: assign[agent, task] = 1 if task assigned to agent
    assign = model.addVars(agents, tasks, vtype=GRB.BINARY, name="Assign")

    # 4. Objective: Maximize total priority of assigned tasks
    model.setObjective(
        gp.quicksum(task_priority[t] * assign[a, t] for a in agents for t in tasks),
        GRB.MAXIMIZE
    )

    # 5. Constraints
    # Constraint 1: Each task assigned to at most one agent
    for t in tasks:
        model.addConstr(gp.quicksum(assign[a, t] for a in agents) <= 1, name=f"TaskCoverage_{t}")

    # Constraint 2: Memory capacity per agent
    for a in agents:
        model.addConstr(
            gp.quicksum(task_memory_mb[t] * assign[a, t] for t in tasks) <= max_memory_per_agent,
            name=f"Capacity_{a}"
        )

    # 6. Solve
    model.optimize()

    # 7. Print results
    if model.Status == GRB.OPTIMAL:
        print(f"\nOptimal Objective (Total Priority Score): {model.ObjVal}")
        for a in agents:
            assigned = [t for t in tasks if assign[a, t].X > 0.5]
            mem_used = sum(task_memory_mb[t] for t in assigned)
            print(f"  [{a}] Tasks: {assigned} (Memory: {mem_used}MB / {max_memory_per_agent}MB)")
    elif model.Status == GRB.INFEASIBLE:
        print("Model is Infeasible. Computing IIS...")
        model.computeIIS()
        model.write("agent_dispatch.iis")

if __name__ == '__main__':
    solve_agent_dispatch()
