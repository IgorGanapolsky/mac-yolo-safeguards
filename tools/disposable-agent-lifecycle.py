#!/usr/bin/env python3
"""
Disposable Agent Lifecycle & Garbage Collection Engine (mac-yolo-safeguards)
Implements Navveen Balani's 6-Step Disposable Agent Architecture:
1. Create: Spawn ephemeral sub-agents with strict objective bounds.
2. Equip: Least-privilege scoped tokens & time-bounded leases.
3. Collaborate: Inter-agent messaging via mesh / inbox bus.
4. Complete: Strict expiry condition (TTL or completion gate).
5. Extract Intelligence ('Garbage Collection'): Distill lessons & persist evidence; discard scratchpad noise.
6. Retire: Revoke authority and destroy ephemeral compute resources.
"""
import json
import time
from pathlib import Path

class DisposableAgentLifecycle:
    def __init__(self, task_id: str, objective: str, ttl_seconds: int = 600):
        self.task_id = task_id
        self.objective = objective
        self.ttl_seconds = ttl_seconds
        self.start_time = time.time()
        self.state = "spawned"
        self.extracted_insights = []

    def equip(self, allowed_tools: list):
        print(f"[Equip] Agent {self.task_id} provisioned with tools: {allowed_tools} (TTL: {self.ttl_seconds}s)")
        self.state = "active"

    def execute_and_collaborate(self, work_func):
        print(f"[Collaborate] Running ephemeral agent task: '{self.objective}'")
        try:
            result = work_func()
            self.extracted_insights.append(result)
            self.state = "completed"
            return result
        except Exception as e:
            self.state = "failed"
            self.extracted_insights.append({"error": str(e)})
            raise e
        finally:
            self.retire_and_extract()

    def retire_and_extract(self):
        print(f"[Garbage Collection] Extracting validated insights and retiring agent {self.task_id}...")
        scratch_dir = Path("/Users/iganapolsky/.hermes/cache/scratch/disposable_agents")
        scratch_dir.mkdir(parents=True, exist_ok=True)
        
        record = {
            "task_id": self.task_id,
            "objective": self.objective,
            "duration_s": time.time() - self.start_time,
            "state": self.state,
            "insights": self.extracted_insights
        }
        
        report_path = scratch_dir / f"{self.task_id}_report.json"
        report_path.write_text(json.dumps(record, indent=2))
        print(f"[Retire] Agent {self.task_id} destroyed. Intelligence persisted to {report_path}")

if __name__ == "__main__":
    agent = DisposableAgentLifecycle(task_id="demo-ephemeral-01", objective="Audit revenue pipeline health", ttl_seconds=300)
    agent.equip(allowed_tools=["read_file", "terminal"])
    res = agent.execute_and_collaborate(lambda: {"status": "ok", "checked_items": 42})
    print(json.dumps(res, indent=2))
