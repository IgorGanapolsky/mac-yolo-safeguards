#!/usr/bin/env python3
"""Verify Firebase App Distribution release visibility (AnswerGuard/Random-Timer pattern)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.parse import quote

FIREBASE_SCOPE = ("https://www.googleapis.com/auth/cloud-platform",)


def _csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _error(details: str) -> dict[str, Any]:
    return {"passed": False, "status": "ERROR", "details": details}


def _load_service_account_dict(key_material: str) -> dict[str, Any]:
    raw = key_material.strip()
    if os.path.isfile(os.path.expanduser(raw)):
        raw = open(os.path.expanduser(raw), encoding="utf-8").read()
    info = json.loads(raw)
    if not isinstance(info, dict):
        raise ValueError("Service account key must be a JSON object")
    return info


class FirebaseInternalDistributor:
    def __init__(
        self,
        *,
        app_id: str,
        service_account_key: str | None = None,
        requests_module: Any | None = None,
    ):
        self.app_id = app_id
        self.project_number = self._project_number_from_app_id(app_id)
        self._service_account_key = service_account_key or os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
        self._requests = requests_module
        self._token: str | None = None

    @staticmethod
    def _project_number_from_app_id(app_id: str) -> str:
        parts = app_id.split(":")
        if len(parts) < 2 or not parts[1].isdigit():
            raise RuntimeError(f"Could not parse project number from Firebase app id '{app_id}'")
        return parts[1]

    def _get_token(self) -> str:
        if self._token:
            return self._token
        try:
            from google.auth.transport.requests import Request
            from google.oauth2 import service_account
        except ImportError as exc:
            raise RuntimeError(
                "Missing google-auth dependencies. Install: pip install google-auth requests"
            ) from exc

        info = _load_service_account_dict(self._service_account_key)
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=list(FIREBASE_SCOPE),
        )
        credentials.refresh(Request())
        self._token = credentials.token
        return self._token

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        requests_module = self._requests
        if requests_module is None:
            try:
                import requests as requests_module  # type: ignore
            except ImportError as exc:
                raise RuntimeError("Missing requests. Install: pip install requests") from exc

        response = requests_module.request(
            method.upper(),
            f"https://firebaseappdistribution.googleapis.com{path}",
            headers={
                "Authorization": f"Bearer {self._get_token()}",
                "Content-Type": "application/json",
            },
            params=params or {},
            json=payload,
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"{method.upper()} {path} failed: HTTP {response.status_code} {response.text[:1000]}"
            )
        return response.json() if getattr(response, "text", "") else {}

    def _list_releases(self) -> list[dict[str, Any]]:
        payload = self._request(
            "GET",
            f"/v1/projects/{self.project_number}/apps/{quote(self.app_id, safe=':')}/releases",
            params={"pageSize": 50},
        )
        return payload.get("releases", [])

    def _find_release(self, *, build_version: str | None, display_version: str | None) -> dict[str, Any]:
        releases = self._list_releases()
        if build_version:
            releases = [release for release in releases if str(release.get("buildVersion", "")) == str(build_version)]
        if display_version:
            releases = [
                release for release in releases if str(release.get("displayVersion", "")) == str(display_version)
            ]
        if not releases:
            raise RuntimeError(
                f"No Firebase release found for app {self.app_id}"
                + (f" buildVersion={build_version}" if build_version else "")
                + (f" displayVersion={display_version}" if display_version else "")
            )
        return max(releases, key=lambda release: release.get("createTime", ""))

    def _distribute_release(self, release_name: str, *, tester_emails: list[str], group_aliases: list[str]) -> None:
        if not tester_emails and not group_aliases:
            return
        self._request(
            "POST",
            f"/v1/{quote(release_name, safe='/:')}:distribute",
            payload={"testerEmails": tester_emails, "groupAliases": group_aliases},
        )

    def _list_testers(self) -> list[dict[str, Any]]:
        payload = self._request(
            "GET",
            f"/v1/projects/{self.project_number}/testers",
            params={"pageSize": 200},
        )
        return payload.get("testers", [])

    def _get_group(self, alias: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/projects/{self.project_number}/groups/{quote(alias, safe='')}")

    def ensure(
        self,
        *,
        build_version: str | None,
        display_version: str | None,
        group_aliases: list[str],
        tester_emails: list[str],
        required_testers: list[str],
    ) -> dict[str, Any]:
        try:
            release = self._find_release(build_version=build_version, display_version=display_version)
            if not tester_emails and not group_aliases:
                return _error(
                    "Firebase release found, but no tester emails or group aliases were provided for visibility verification"
                )

            direct_tester_emails = {email.strip().lower() for email in tester_emails if email.strip()}
            self._distribute_release(
                release["name"],
                tester_emails=tester_emails,
                group_aliases=group_aliases,
            )

            project_testers = {
                (tester.get("email") or "").strip().lower()
                for tester in self._list_testers()
                if tester.get("email")
            }
            missing_project_testers = [email for email in required_testers if email.lower() not in project_testers]
            missing_undistributed_testers = [
                email for email in missing_project_testers if email.lower() not in direct_tester_emails
            ]
            if missing_undistributed_testers:
                return _error(
                    "Required Firebase testers are missing from the project tester list "
                    f"and were not included in direct distribution (count={len(missing_undistributed_testers)})"
                )

            group_summaries: list[str] = []
            group_warnings: list[str] = []
            for alias in group_aliases:
                group = self._get_group(alias)
                tester_count = int(group.get("testerCount", 0))
                release_count = int(group.get("releaseCount", 0))
                if tester_count <= 0:
                    message = f"Firebase group '{alias}' has no testers"
                    if direct_tester_emails:
                        group_warnings.append(message)
                        continue
                    return _error(message)
                if release_count <= 0:
                    message = f"Firebase group '{alias}' has no accessible releases"
                    if direct_tester_emails:
                        group_warnings.append(message)
                        continue
                    return _error(message)
                group_summaries.append(f"{alias}(testers={tester_count}, releases={release_count})")

            direct_summary = (
                f"direct tester distribution accepted for {len(direct_tester_emails)} tester(s)"
                if direct_tester_emails
                else "no direct tester emails requested"
            )
            propagation_summary = (
                f"; project tester list pending for {len(missing_project_testers)} required tester(s)"
                if missing_project_testers
                else ""
            )
            return {
                "passed": True,
                "status": "VISIBLE",
                "details": (
                    f"Firebase release {release.get('displayVersion', '?')} ({release.get('buildVersion', '?')}) "
                    f"is distributed. Firebase distribute API accepted the release; {direct_summary}. "
                    f"Groups verified: {', '.join(group_summaries) if group_summaries else 'none'}"
                    f"{'; group warnings: ' + '; '.join(group_warnings) if group_warnings else ''}"
                    f"{propagation_summary}."
                ),
            }
        except Exception as exc:
            return _error(f"Firebase internal distribution check failed: {exc}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ensure Firebase internal distribution visibility.")
    parser.add_argument("--firebase-app-id", default=os.environ.get("FIREBASE_ANDROID_APP_ID", ""))
    parser.add_argument("--firebase-build-version", default="")
    parser.add_argument("--firebase-display-version", default="")
    parser.add_argument("--firebase-group-aliases", default="")
    parser.add_argument("--firebase-tester-emails", default="")
    parser.add_argument("--firebase-required-testers", default="")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.firebase_app_id:
        print("❌ --firebase-app-id is required for Firebase checks", file=sys.stderr)
        return 2

    result = FirebaseInternalDistributor(app_id=args.firebase_app_id).ensure(
        build_version=args.firebase_build_version or None,
        display_version=args.firebase_display_version or None,
        group_aliases=_csv(args.firebase_group_aliases),
        tester_emails=[email.lower() for email in _csv(args.firebase_tester_emails)],
        required_testers=[
            email.lower()
            for email in _csv(args.firebase_required_testers or args.firebase_tester_emails)
        ],
    )

    icon = "✅" if result["passed"] else "❌"
    print(f"{icon} Firebase: {result['status']} — {result['details']}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
