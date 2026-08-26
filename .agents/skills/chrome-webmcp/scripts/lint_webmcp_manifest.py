#!/usr/bin/env python3
"""Audit WebMCP tool definitions, journey evaluations, and runtime evidence."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
from typing import Any


LIMITS = {"name": 30, "description": 500, "parameter_description": 150, "journey_id": 80}
RISKS = {"read", "write", "external"}
HTTPS_ORIGIN = re.compile(r"^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$")


def validate_tool(tool: Any, index: int) -> list[str]:
    errors: list[str] = []
    prefix = f"tools[{index}]"
    if not isinstance(tool, dict):
        return [f"{prefix} must be an object"]

    name = tool.get("name")
    if not isinstance(name, str) or not 1 <= len(name) <= LIMITS["name"]:
        errors.append(f"{prefix}.name must contain 1-{LIMITS['name']} characters")
    description = tool.get("description")
    if not isinstance(description, str) or not 1 <= len(description) <= LIMITS["description"]:
        errors.append(f"{prefix}.description must contain 1-{LIMITS['description']} characters")

    risk = tool.get("risk")
    if risk not in RISKS:
        errors.append(f"{prefix}.risk must be read, write, or external")
    confirmation = tool.get("confirmation")
    if risk == "read" and confirmation not in {"none", "user"}:
        errors.append(f"{prefix}.confirmation must be none or user")
    if risk in {"write", "external"} and confirmation != "user":
        errors.append(f"{prefix} requires user confirmation for {risk} risk")

    annotations = tool.get("annotations")
    if not isinstance(annotations, dict):
        errors.append(f"{prefix}.annotations must be an object")
    else:
        if annotations.get("readOnlyHint") is not (risk == "read"):
            errors.append(f"{prefix}.annotations.readOnlyHint contradicts risk={risk}")
        if not isinstance(annotations.get("untrustedContentHint"), bool):
            errors.append(f"{prefix}.annotations.untrustedContentHint must be boolean")

    schema = tool.get("inputSchema")
    if not isinstance(schema, dict) or schema.get("type") != "object" or not isinstance(schema.get("properties"), dict):
        errors.append(f"{prefix}.inputSchema must be an object schema with properties")
    else:
        properties = schema["properties"]
        for parameter, definition in properties.items():
            if not isinstance(parameter, str) or not 1 <= len(parameter) <= LIMITS["name"]:
                errors.append(f"{prefix} parameter names must contain 1-{LIMITS['name']} characters")
            parameter_description = definition.get("description") if isinstance(definition, dict) else None
            if parameter_description is not None and (
                not isinstance(parameter_description, str)
                or not 1 <= len(parameter_description) <= LIMITS["parameter_description"]
            ):
                errors.append(f"{prefix}.{parameter}.description must contain 1-{LIMITS['parameter_description']} characters")
        required = schema.get("required", [])
        if not isinstance(required, list) or any(not isinstance(item, str) for item in required):
            errors.append(f"{prefix}.inputSchema.required must be an array of parameter names")
        elif any(item not in properties for item in required):
            errors.append(f"{prefix}.inputSchema.required references an unknown parameter")

    exposed_to = tool.get("exposedTo", [])
    if not isinstance(exposed_to, list) or any(
        not isinstance(origin, str) or HTTPS_ORIGIN.fullmatch(origin) is None for origin in exposed_to
    ):
        errors.append(f"{prefix}.exposedTo must contain only explicit HTTPS origins")
    return errors


def validate_journey(journey: Any, index: int, tools: dict[str, dict[str, Any]]) -> list[str]:
    prefix = f"journeys[{index}]"
    if not isinstance(journey, dict):
        return [f"{prefix} must be an object"]

    errors: list[str] = []
    journey_id = journey.get("id")
    if not isinstance(journey_id, str) or not 1 <= len(journey_id) <= LIMITS["journey_id"]:
        errors.append(f"{prefix}.id must contain 1-{LIMITS['journey_id']} characters")
    tool_name = journey.get("tool")
    tool = tools.get(tool_name) if isinstance(tool_name, str) else None
    if tool is None:
        errors.append(f"{prefix}.tool must reference a declared tool")

    journey_input = journey.get("input")
    if not isinstance(journey_input, dict):
        errors.append(f"{prefix}.input must be an object")
    elif tool is not None:
        schema = tool.get("inputSchema", {})
        properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
        required = schema.get("required", []) if isinstance(schema, dict) else []
        if isinstance(required, list):
            missing = [item for item in required if item not in journey_input]
            if missing:
                errors.append(f"{prefix}.input is missing required parameters: {', '.join(missing)}")
        if schema.get("additionalProperties") is False:
            unknown = [item for item in journey_input if item not in properties]
            if unknown:
                errors.append(f"{prefix}.input has unknown parameters: {', '.join(unknown)}")

    expected = journey.get("expected")
    if not isinstance(expected, dict) or not expected:
        errors.append(f"{prefix}.expected must be a non-empty object")
    confirmation_expected = journey.get("confirmationExpected")
    if not isinstance(confirmation_expected, bool):
        errors.append(f"{prefix}.confirmationExpected must be boolean")
    elif tool is not None and confirmation_expected is not (tool.get("risk") != "read"):
        errors.append(f"{prefix}.confirmationExpected contradicts tool risk={tool.get('risk')}")
    return errors


def validate_manifest(data: Any) -> tuple[list[str], int, int]:
    if not isinstance(data, dict):
        return ["manifest must be an object"], 0, 0

    errors: list[str] = []
    if data.get("schema") != "webmcp-readiness/v1":
        errors.append("manifest.schema must be webmcp-readiness/v1")

    tools = data.get("tools")
    if not isinstance(tools, list) or not tools:
        errors.append("manifest.tools must be a non-empty array")
        tools = []
    for index, tool in enumerate(tools):
        errors.extend(validate_tool(tool, index))

    names = [tool.get("name") for tool in tools if isinstance(tool, dict) and isinstance(tool.get("name"), str)]
    if len(names) != len(set(names)):
        errors.append("tool names must be unique")
    tools_by_name = {tool["name"]: tool for tool in tools if isinstance(tool, dict) and isinstance(tool.get("name"), str)}

    journeys = data.get("journeys")
    if not isinstance(journeys, list) or not journeys:
        errors.append("manifest.journeys must be a non-empty array")
        journeys = []
    for index, journey in enumerate(journeys):
        errors.extend(validate_journey(journey, index, tools_by_name))
    journey_ids = [
        journey.get("id")
        for journey in journeys
        if isinstance(journey, dict) and isinstance(journey.get("id"), str)
    ]
    if len(journey_ids) != len(set(journey_ids)):
        errors.append("journey ids must be unique")
    return errors, len(tools), len(journeys)


def validate_probe(probe: Any) -> tuple[dict[str, Any], list[str]]:
    runtime: dict[str, Any] = {"status": "invalid", "browsers": [], "captured_at": None}
    if probe is None:
        runtime["status"] = "unverified"
        return runtime, ["runtime evidence is missing"]
    if not isinstance(probe, dict):
        return runtime, ["runtime evidence must be a JSON object"]
    if probe.get("schema") != "webmcp-browser-probe/v1":
        return runtime, ["runtime evidence schema must be webmcp-browser-probe/v1"]

    captured_at = probe.get("captured_at")
    try:
        parsed = datetime.fromisoformat(captured_at) if isinstance(captured_at, str) else None
    except ValueError:
        parsed = None
    if parsed is None or parsed.tzinfo is None:
        return runtime, ["runtime evidence captured_at must be a timezone-aware ISO-8601 timestamp"]

    supported = probe.get("supported")
    results = probe.get("results")
    if probe.get("ok") is not True or not isinstance(supported, list) or not supported:
        return runtime, ["runtime evidence has no supported browser"]
    if not isinstance(results, list):
        return runtime, ["runtime evidence results must be an array"]
    verified = {
        item.get("browser")
        for item in results
        if isinstance(item, dict) and item.get("supported") is True and isinstance(item.get("browser"), str)
    }
    if any(not isinstance(browser, str) or browser not in verified for browser in supported):
        return runtime, ["runtime evidence supported browsers do not match verified result entries"]

    runtime.update({"status": "verified", "browsers": supported, "captured_at": captured_at})
    return runtime, []


def assess_manifest(
    data: Any, probe: Any = None, *, static_only: bool = False
) -> tuple[dict[str, Any], int]:
    static_errors, tool_count, journey_count = validate_manifest(data)
    if static_only:
        runtime = {"status": "not_checked", "browsers": [], "captured_at": None}
        readiness_errors: list[str] = []
    else:
        runtime, readiness_errors = validate_probe(probe)
    receipt = {
        "schema": "webmcp-readiness-audit/v1",
        "static_ok": not static_errors,
        "ready": not static_errors and runtime["status"] == "verified",
        "tool_count": tool_count,
        "journey_count": journey_count,
        "runtime": runtime,
        "errors": static_errors,
        "readiness_errors": readiness_errors,
    }
    if static_errors:
        return receipt, 1
    if not static_only and runtime["status"] != "verified":
        return receipt, 2
    return receipt, 0


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return {"_load_error": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--probe", type=Path, help="JSON receipt from probe_webmcp.py")
    parser.add_argument("--static-only", action="store_true", help="validate definitions without claiming runtime readiness")
    args = parser.parse_args()
    if args.static_only and args.probe:
        parser.error("--static-only and --probe are mutually exclusive")

    data = load_json(args.manifest)
    if isinstance(data, dict) and "_load_error" in data:
        receipt = {
            "schema": "webmcp-readiness-audit/v1",
            "static_ok": False,
            "ready": False,
            "tool_count": 0,
            "journey_count": 0,
            "runtime": {"status": "not_checked", "browsers": [], "captured_at": None},
            "errors": [data["_load_error"]],
            "readiness_errors": [],
        }
        exit_code = 1
    else:
        probe = load_json(args.probe) if args.probe else None
        receipt, exit_code = assess_manifest(data, probe, static_only=args.static_only)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
