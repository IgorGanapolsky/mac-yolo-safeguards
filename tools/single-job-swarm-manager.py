#!/usr/bin/env python3
"""
Single-Job Agent Orchestrator & Meta-Manager (mac-yolo-safeguards)
Implements Liam Fallen's "One Job" Agent Philosophy:
1. Single-Purpose Agent Design: Agents are built for one specific, repeatable business outcome.
2. Human-in-the-Loop Approval Cards: No external action is taken without an explicit approval card.
3. Agent 1:1 Management: A "Chief of Staff" agent interviews specialized agents to optimize performance.
"""
import json
from pathlib import Path

class SingleJobAgent:
    def __init__(self, agent_id: str, job_description: str, tools: list):
        self.agent_id = agent_id
        self.job_description = job_description
        self.tools = tools
        self.status = "idle"

    def run_cycle(self):
        print(f"[*] Agent {self.agent_id} starting job: {self.job_description}")
        # Simulate the "Single Job" workflow: Check -> Draft -> Wait for OK
        steps = ["Checked data sources", "Identified targets", "Drafted communication"]
        for step in steps:
            print(f"  - {step}...")
        
        print(f"[Approval Required] Agent {self.agent_id} is waiting for OK to send.")
        return {"agent_id": self.agent_id, "status": "awaiting_approval", "artifacts": "drafts_ready"}

class ChiefOfStaffAgent:
    """The meta-manager that interviews specialized agents to optimize the swarm."""
    def __init__(self, agents: list):
        self.agents = agents

    def run_1on1_interviews(self):
        print("\n[*] Chief of Staff conducting weekly 1:1 interviews with the swarm...")
        swarm_report = {}
        for agent in self.agents:
            print(f"[Interviewing {agent.agent_id}]")
            # Interview questions: What did you do? What went wrong? What do you need?
            swarm_report[agent.agent_id] = {
                "performance": "optimal",
                "blockers": "none",
                "optimization_suggestion": "increase prompt specificity for tool X"
            }
        return swarm_report

if __name__ == "__main__":
    # 1. Define a swarm of Single-Job Agents
    swarm = [
        SingleJobAgent("InvoiceChaser", "Chase overdue invoices and draft reminders", ["Gmail", "Stripe"]),
        SingleJobAgent("WinBackHelper", "Find churned customers and draft win-back notes", ["Stripe", "CRM"]),
        SingleJobAgent("MorningSummary", "Aggregate daily key numbers and create summary", ["Gmail", "Slack", "Sheets"])
    ]

    # 2. Run a cycle for one agent
    result = swarm[0].run_cycle()
    
    # 3. Run the Chief of Staff management loop
    cos = ChiefOfStaffAgent(swarm)
    final_report = cos.run_1on1_interviews()
    
    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/single_job_swarm_report.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"agent_cycle": result, "cos_report": final_report}, indent=2))
    print(f"\n[+] Swarm management report persisted to {out_path}")
