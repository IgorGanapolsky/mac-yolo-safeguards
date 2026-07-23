#!/usr/bin/env python3
"""Push Play listing text + graphics from fastlane/metadata/android.

Usage:
  python3 scripts/push-play-listing.py
  python3 scripts/push-play-listing.py --text-only
  python3 scripts/push-play-listing.py --dry-run
  python3 scripts/push-play-listing.py --package both
  python3 scripts/push-play-listing.py --package com.iganapolsky.hermesmobile.paid
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PKG = "com.iganapolsky.hermesmobile"
PAID_PKG = "com.iganapolsky.hermesmobile.paid"
LANG = "en-US"
META = ROOT / "fastlane/metadata/android" / LANG
IMAGES = META / "images"
DEFAULT_KEY = Path(
    os.environ.get(
        "GOOGLE_PLAY_JSON_KEY",
        str(Path.home() / ".gcloud-keys/hermes-mobile-publisher.json"),
    )
)
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def read_meta(name: str) -> str:
    path = META / name
    if not path.exists():
        raise SystemExit(f"Missing {path}")
    return path.read_text(encoding="utf-8").rstrip()


def read_meta_optional(name: str, fallback: str) -> str:
    path = META / name
    if not path.exists():
        return fallback
    return path.read_text(encoding="utf-8").rstrip()


def list_pngs(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.suffix.lower() == ".png")


def replace_images(
    service, package_name: str, edit_id: str, image_type: str, files: list[Path]
) -> None:
    if not files:
        print(f"skip {image_type}: no local files")
        return

    existing = []
    try:
        listed = (
            service.edits()
            .images()
            .list(
                packageName=package_name,
                editId=edit_id,
                language=LANG,
                imageType=image_type,
            )
            .execute()
        )
        existing = listed.get("images") or []
    except HttpError as err:
        if err.resp.status != 404:
            raise

    for img in existing:
        image_id = img.get("id")
        if not image_id:
            continue
        service.edits().images().delete(
            packageName=package_name,
            editId=edit_id,
            language=LANG,
            imageType=image_type,
            imageId=image_id,
        ).execute()
    print(f"{image_type}: deleted {len(existing)} existing")

    for path in files:
        media = MediaFileUpload(str(path), mimetype="image/png", resumable=False)
        service.edits().images().upload(
            packageName=package_name,
            editId=edit_id,
            language=LANG,
            imageType=image_type,
            media_body=media,
        ).execute()
        print(f"{image_type}: uploaded {path.name}")


def validate_copy(label: str, title: str, short_description: str, full_description: str) -> None:
    if len(title) > 50:
        raise SystemExit(f"{label} title {len(title)} > 50")
    if len(short_description) > 80:
        raise SystemExit(f"{label} shortDescription {len(short_description)} > 80")
    if len(full_description) > 4000:
        raise SystemExit(f"{label} fullDescription {len(full_description)} > 4000")
    if re.search(r"iOS is in App Store review", full_description, re.I):
        raise SystemExit(f"{label} full_description still claims iOS is in review")


def push_one(
    service,
    package_name: str,
    title: str,
    short_description: str,
    full_description: str,
    *,
    text_only: bool,
    release_notes: str | None,
) -> dict:
    phone_shots = list_pngs(IMAGES / "phoneScreenshots")
    feature_graphic = IMAGES / "featureGraphic.png"
    icon = IMAGES / "icon.png"

    edit_id = service.edits().insert(packageName=package_name, body={}).execute()["id"]
    try:
        service.edits().listings().update(
            packageName=package_name,
            editId=edit_id,
            language=LANG,
            body={
                "language": LANG,
                "title": title,
                "shortDescription": short_description,
                "fullDescription": full_description,
            },
        ).execute()
        print(f"{package_name}: listing text updated")

        if not text_only:
            replace_images(
                service, package_name, edit_id, "phoneScreenshots", phone_shots
            )
            if feature_graphic.exists():
                replace_images(
                    service,
                    package_name,
                    edit_id,
                    "featureGraphic",
                    [feature_graphic],
                )
            if icon.exists():
                replace_images(service, package_name, edit_id, "icon", [icon])

        if release_notes:
            tracks = (
                service.edits()
                .tracks()
                .list(packageName=package_name, editId=edit_id)
                .execute()
                .get("tracks")
                or []
            )
            for track in tracks:
                if track.get("track") != "production":
                    continue
                releases = track.get("releases") or []
                if not releases:
                    continue
                for release in releases:
                    release["releaseNotes"] = [
                        {"language": LANG, "text": release_notes[:500]}
                    ]
                service.edits().tracks().update(
                    packageName=package_name,
                    editId=edit_id,
                    track="production",
                    body=track,
                ).execute()
                print(f"{package_name}: production release notes updated")

        committed = (
            service.edits().commit(packageName=package_name, editId=edit_id).execute()
        )
        return {
            "package": package_name,
            "committed": True,
            "editId": edit_id,
            "status": committed,
            "title": title,
            "shortDescription": short_description,
            "fullDescriptionLen": len(full_description),
        }
    except Exception:
        try:
            service.edits().delete(packageName=package_name, editId=edit_id).execute()
        except Exception:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--package",
        default="both",
        choices=[DEFAULT_PKG, PAID_PKG, "both", "free", "paid"],
        help="Play package to update (default both free + paid).",
    )
    args = parser.parse_args()

    free_title = read_meta("title.txt")
    free_short = read_meta("short_description.txt")
    free_full = read_meta("full_description.txt")
    paid_title = read_meta_optional("paid_title.txt", free_title)
    paid_short = read_meta_optional("paid_short_description.txt", free_short)
    paid_full = read_meta_optional("paid_full_description.txt", free_full)

    validate_copy("free", free_title, free_short, free_full)
    validate_copy("paid", paid_title, paid_short, paid_full)

    release_notes = ""
    for name in ("default.txt", "8.txt"):
        p = META / "changelogs" / name
        if p.exists():
            release_notes = p.read_text(encoding="utf-8").rstrip()
            break

    phone_shots = list_pngs(IMAGES / "phoneScreenshots")
    feature_graphic = IMAGES / "featureGraphic.png"
    icon = IMAGES / "icon.png"

    package_arg = args.package
    if package_arg == "free":
        package_arg = DEFAULT_PKG
    elif package_arg == "paid":
        package_arg = PAID_PKG

    packages = [DEFAULT_PKG, PAID_PKG] if package_arg == "both" else [package_arg]

    plan = {
        "packages": packages,
        "language": LANG,
        "freeCopy": {
            "title": free_title,
            "shortDescription": free_short,
            "fullDescriptionLen": len(free_full),
        },
        "paidCopy": {
            "title": paid_title,
            "shortDescription": paid_short,
            "fullDescriptionLen": len(paid_full),
        },
        "phoneScreenshots": len(phone_shots),
        "featureGraphic": feature_graphic.exists(),
        "icon": icon.exists(),
        "releaseNotes": release_notes[:140] if release_notes else None,
        "textOnly": args.text_only,
        "dryRun": args.dry_run,
    }
    print(json.dumps({"plan": plan}, indent=2))

    if args.dry_run:
        print("dry-run: no Play edit committed")
        return 0

    if not DEFAULT_KEY.exists():
        raise SystemExit(f"Missing Play service account JSON at {DEFAULT_KEY}")

    creds = service_account.Credentials.from_service_account_file(
        str(DEFAULT_KEY), scopes=[SCOPE]
    )
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)

    results = []
    for package_name in packages:
        if package_name == PAID_PKG:
            title, short_description, full_description = (
                paid_title,
                paid_short,
                paid_full,
            )
        else:
            title, short_description, full_description = (
                free_title,
                free_short,
                free_full,
            )
        results.append(
            push_one(
                service,
                package_name,
                title,
                short_description,
                full_description,
                text_only=args.text_only,
                release_notes=release_notes or None,
            )
        )

    print(json.dumps({"results": results}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HttpError as err:
        print(err, file=sys.stderr)
        if err.content:
            print(err.content.decode("utf-8", errors="replace"), file=sys.stderr)
        raise SystemExit(1)
