#!/usr/bin/env python3
"""Push Play listing text + graphics from fastlane/metadata/android.

Usage:
  python3 scripts/push-play-listing.py
  python3 scripts/push-play-listing.py --text-only
  python3 scripts/push-play-listing.py --dry-run
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
PKG = "com.iganapolsky.hermesmobile"
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


def list_pngs(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.suffix.lower() == ".png")


def replace_images(service, edit_id: str, image_type: str, files: list[Path]) -> None:
    if not files:
        print(f"skip {image_type}: no local files")
        return

    existing = []
    try:
        listed = (
            service.edits()
            .images()
            .list(
                packageName=PKG,
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
            packageName=PKG,
            editId=edit_id,
            language=LANG,
            imageType=image_type,
            imageId=image_id,
        ).execute()
    print(f"{image_type}: deleted {len(existing)} existing")

    for path in files:
        media = MediaFileUpload(str(path), mimetype="image/png", resumable=False)
        service.edits().images().upload(
            packageName=PKG,
            editId=edit_id,
            language=LANG,
            imageType=image_type,
            media_body=media,
        ).execute()
        print(f"{image_type}: uploaded {path.name}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    title = read_meta("title.txt")
    short_description = read_meta("short_description.txt")
    full_description = read_meta("full_description.txt")

    if len(title) > 50:
        raise SystemExit(f"title {len(title)} > 50")
    if len(short_description) > 80:
        raise SystemExit(f"shortDescription {len(short_description)} > 80")
    if len(full_description) > 4000:
        raise SystemExit(f"fullDescription {len(full_description)} > 4000")
    if re.search(r"iOS is in App Store review", full_description, re.I):
        raise SystemExit("full_description still claims iOS is in review")

    phone_shots = list_pngs(IMAGES / "phoneScreenshots")
    feature_graphic = IMAGES / "featureGraphic.png"
    icon = IMAGES / "icon.png"

    plan = {
        "package": PKG,
        "language": LANG,
        "title": title,
        "shortDescription": short_description,
        "fullDescriptionLen": len(full_description),
        "fullDescriptionTail": full_description[-180:],
        "phoneScreenshots": len(phone_shots),
        "featureGraphic": feature_graphic.exists(),
        "icon": icon.exists(),
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

    edit_id = service.edits().insert(packageName=PKG, body={}).execute()["id"]
    try:
        service.edits().listings().update(
            packageName=PKG,
            editId=edit_id,
            language=LANG,
            body={
                "language": LANG,
                "title": title,
                "shortDescription": short_description,
                "fullDescription": full_description,
            },
        ).execute()
        print("listing text updated")

        if not args.text_only:
            replace_images(service, edit_id, "phoneScreenshots", phone_shots)
            if feature_graphic.exists():
                replace_images(service, edit_id, "featureGraphic", [feature_graphic])
            if icon.exists():
                replace_images(service, edit_id, "icon", [icon])

        committed = service.edits().commit(packageName=PKG, editId=edit_id).execute()
        print(
            json.dumps(
                {
                    "committed": True,
                    "editId": edit_id,
                    "status": committed,
                    "fullDescriptionTail": full_description[-120:],
                },
                indent=2,
            )
        )
    except Exception:
        try:
            service.edits().delete(packageName=PKG, editId=edit_id).execute()
        except Exception:
            pass
        raise

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HttpError as err:
        print(err, file=sys.stderr)
        if err.content:
            print(err.content.decode("utf-8", errors="replace"), file=sys.stderr)
        raise SystemExit(1)
