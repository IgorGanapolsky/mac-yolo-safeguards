#!/usr/bin/env python3
"""Tests for tinker-brain continuous heal/learn/improve loop."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

REPO = pathlib.Path(__file__).resolve().parents[1]
BRAIN = REPO / "tools" / "tinker-brain"
sys.path.insert(0, str(BRAIN))

import tinker_brain_continuous as cont  # noqa: E402


class HealPolicyTest(unittest.TestCase):
    def test_heal_dry_run_does_not_write(self):
        result = cont.heal_divergence(dry_run=True)
        self.assertIn("direction", result)
        self.assertFalse(result.get("acted"))

    def test_learn_agenda_includes_campaign_action_on_funnel_fail(self):
        health = {"findings": [], "ok": True}
        funnel = {"ok": False, "failStages": [{"id": "campaign_beat", "status": "fail"}]}
        billing = {"ok": True, "body": {"unitAmount": 1000, "active": True}}
        with tempfile.TemporaryDirectory() as tmp:
            agenda_path = pathlib.Path(tmp) / "agenda.json"
            with mock.patch.object(cont, "_AGENDA", agenda_path):
                with mock.patch.object(cont, "read_gaps", return_value={"trademark": 3}):
                    agenda = cont.learn_agenda(health, funnel, billing)
            self.assertTrue(agenda_path.is_file())
            self.assertTrue(any("campaign" in a.lower() for a in agenda["nextActions"]))
            self.assertEqual(agenda["coverageGaps"][0]["term"], "trademark")
            self.assertEqual(agenda["billing"]["unitAmount"], 1000)


class RunOnceTest(unittest.TestCase):
    def test_run_once_dry_run_json_shape(self):
        result = cont.run_once(heal=False, dry_run=True, run_eval=False)
        self.assertIn("ok", result)
        self.assertIn("agenda", result)
        self.assertIn("billing", result)
        self.assertIn("nextActions", result["agenda"])


if __name__ == "__main__":
    unittest.main()
