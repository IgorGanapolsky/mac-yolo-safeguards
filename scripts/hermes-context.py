#!/usr/bin/env python3
"""hermes-context - local, incremental, multi-repo semantic code search.

Stolen idea, honest scope: JetBrains Context (2026-07) indexes a repo with a
semantic backend so coding agents stop burning turns on cold grep/find, and
supports searching repos that aren't even checked out. This is our $0, fully
local analog: embeds file chunks via Ollama's nomic-embed-text (already on
this fleet), stores the index under ~/.hermes/context-index/, and lets ANY
agent (Claude Code, hermes-yolo, opencode-yolo, kimi-yolo, poolside-yolo,
tinker-yolo) search across every indexed repo at once - whether or not that
repo is the one currently checked out - without shipping code anywhere.
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_INDEX_DIR = os.environ.get(
    "HERMES_CONTEXT_INDEX_DIR", os.path.expanduser("~/.hermes/context-index")
)
DEFAULT_OLLAMA_URL = os.environ.get("HERMES_CONTEXT_OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("HERMES_CONTEXT_MODEL", "nomic-embed-text")
DEFAULT_LINES_PER_CHUNK = 60
DEFAULT_MAX_FILE_KB = 300
# nomic-embed-text's context window is 2048 tokens (`ollama show nomic-embed-text`).
# 4000 chars is a conservative floor assuming ~2 chars/token for dense code/CSS.
DEFAULT_MAX_CHUNK_CHARS = 4000

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".pdf", ".zip",
    ".tar", ".gz", ".mp4", ".mov", ".webm", ".woff", ".woff2", ".ttf", ".eot",
    ".jar", ".class", ".so", ".dylib", ".a", ".o", ".wasm", ".db", ".sqlite",
    ".keystore", ".apk", ".aab", ".ipa", ".p12", ".mobileprovision",
}
SKIP_BASENAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "Gemfile.lock", "poetry.lock", "uv.lock",
}


def eprint(*a, **k):
    print(*a, file=sys.stderr, **k)


def git_ls_files(repo_path):
    out = subprocess.run(
        ["git", "-C", repo_path, "ls-files"],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line for line in out.splitlines() if line]


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def should_skip(relpath, size_bytes, max_file_kb):
    base = os.path.basename(relpath)
    ext = os.path.splitext(relpath)[1].lower()
    if base in SKIP_BASENAMES:
        return "lockfile"
    if ext in SKIP_EXTENSIONS:
        return "binary-extension"
    if size_bytes > max_file_kb * 1024:
        return f"too-large(>{max_file_kb}KB)"
    return None


def chunk_text(text, lines_per_chunk, max_chars=DEFAULT_MAX_CHUNK_CHARS):
    # nomic-embed-text's context window is 2048 tokens (verified via `ollama
    # show`). A line-count-only chunker isn't safe: a single dense/near-
    # minified line (long CSS/JS rules) can alone exceed that, causing Ollama
    # to 500 with "input length exceeds the context length" (hit live on
    # apps/hermes-control-plane/app/globals.css, 2026-07-24). Bound every
    # chunk by character budget as well as line count, and hard-split any
    # single line that alone exceeds the budget.
    lines = text.splitlines()
    chunks = []
    buf, buf_start, buf_len = [], 1, 0

    def flush(end_line):
        if buf and any(l.strip() for l in buf):
            chunks.append((buf_start, end_line, "\n".join(buf)))
        buf.clear()

    for i, line in enumerate(lines, start=1):
        if len(line) > max_chars:
            flush(i - 1)
            for start in range(0, len(line), max_chars):
                chunks.append((i, i, line[start:start + max_chars]))
            buf_start = i + 1
            continue
        if buf and (buf_len + len(line) + 1 > max_chars or len(buf) >= lines_per_chunk):
            flush(i - 1)
            buf_start = i
            buf_len = 0
        if not buf:
            buf_start = i
        buf.append(line)
        buf_len += len(line) + 1
    flush(len(lines))
    return chunks


class ContextLengthExceeded(Exception):
    pass


def embed(text, ollama_url, model, timeout=30):
    payload = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{ollama_url}/api/embeddings", data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if "context length" in detail.lower():
            raise ContextLengthExceeded(detail) from exc
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    vec = body.get("embedding")
    if not vec:
        raise RuntimeError(f"empty embedding response: {body}")
    return vec


def embed_with_split(text, ollama_url, model, min_chars=200):
    # Chunk sizing is a char-count HEURISTIC (chars/token varies by content
    # density); rather than guess a threshold that's safe for every file,
    # degrade gracefully: on a real "exceeds context length" response, bisect
    # the text and retry each half. Caps recursion via min_chars so a
    # pathological single token can't loop forever — it's dropped, not looped.
    try:
        return [(text, embed(text, ollama_url, model))]
    except ContextLengthExceeded:
        if len(text) <= min_chars:
            raise
        mid = len(text) // 2
        return (
            embed_with_split(text[:mid], ollama_url, model, min_chars)
            + embed_with_split(text[mid:], ollama_url, model, min_chars)
        )


def ollama_up(ollama_url, timeout=4):
    try:
        with urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def model_available(ollama_url, model, timeout=4):
    try:
        with urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        names = {m.get("name") for m in data.get("models", [])}
        return model in names or f"{model}:latest" in names
    except Exception:
        return False


def index_paths(index_dir, name):
    return (
        os.path.join(index_dir, f"{name}.jsonl"),
        os.path.join(index_dir, f"{name}.meta.json"),
    )


def load_manifest(meta_path):
    if not os.path.isfile(meta_path):
        return {"repo_path": None, "files": {}}
    with open(meta_path, encoding="utf-8") as fh:
        return json.load(fh)


def load_existing_chunks_by_file(jsonl_path):
    by_file = {}
    if not os.path.isfile(jsonl_path):
        return by_file
    with open(jsonl_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            by_file.setdefault(row["path"], []).append(row)
    return by_file


def cmd_index(args):
    repo_path = os.path.abspath(args.repo_path)
    if not os.path.isdir(os.path.join(repo_path, ".git")):
        eprint(f"hermes-context: {repo_path} is not a git repo root")
        return 2
    name = args.name or os.path.basename(repo_path.rstrip("/"))
    os.makedirs(args.index_dir, exist_ok=True, mode=0o700)
    jsonl_path, meta_path = index_paths(args.index_dir, name)

    if not ollama_up(args.ollama_url):
        eprint(f"hermes-context: Ollama not reachable at {args.ollama_url}")
        return 69
    if not model_available(args.ollama_url, args.model):
        eprint(f"hermes-context: model '{args.model}' not pulled (ollama pull {args.model})")
        return 70

    manifest = load_manifest(meta_path)
    old_files_meta = manifest.get("files", {})
    old_chunks_by_file = load_existing_chunks_by_file(jsonl_path)

    tracked = git_ls_files(repo_path)
    new_manifest_files = {}
    out_rows = []
    reused, embedded, skipped = 0, 0, 0
    t0 = time.time()

    for relpath in tracked:
        abspath = os.path.join(repo_path, relpath)
        if not os.path.isfile(abspath):
            continue
        size_bytes = os.path.getsize(abspath)
        reason = should_skip(relpath, size_bytes, args.max_file_kb)
        if reason:
            skipped += 1
            continue
        with open(abspath, "rb") as fh:
            raw = fh.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            skipped += 1
            continue
        digest = sha256_bytes(raw)
        prior = old_files_meta.get(relpath)
        if prior and prior.get("sha256") == digest and relpath in old_chunks_by_file:
            out_rows.extend(old_chunks_by_file[relpath])
            reused += len(old_chunks_by_file[relpath])
            new_manifest_files[relpath] = prior
            continue
        for start, end, chunk in chunk_text(text, args.lines_per_chunk, args.max_chunk_chars):
            try:
                pieces = embed_with_split(chunk, args.ollama_url, args.model)
            except Exception as exc:
                eprint(f"hermes-context: embed failed for {relpath}:{start}-{end}: {exc}")
                continue
            for piece_text, vec in pieces:
                out_rows.append({
                    "repo": name, "path": relpath,
                    "start_line": start, "end_line": end,
                    "text": piece_text, "embedding": vec,
                })
                embedded += 1
        new_manifest_files[relpath] = {"sha256": digest, "size": size_bytes}

    tmp_jsonl = jsonl_path + ".tmp"
    with open(tmp_jsonl, "w", encoding="utf-8") as fh:
        for row in out_rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")
    os.replace(tmp_jsonl, jsonl_path)
    os.chmod(jsonl_path, 0o600)

    elapsed = round(time.time() - t0, 2)
    new_manifest = {
        "repo": name, "repo_path": repo_path,
        "indexed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "files": new_manifest_files,
        "num_files": len(new_manifest_files),
        "num_chunks": len(out_rows),
        "model": args.model,
    }
    tmp_meta = meta_path + ".tmp"
    with open(tmp_meta, "w", encoding="utf-8") as fh:
        json.dump(new_manifest, fh, indent=2)
    os.replace(tmp_meta, meta_path)
    os.chmod(meta_path, 0o600)

    print(
        f"hermes-context: indexed '{name}' files={len(new_manifest_files)} "
        f"chunks={len(out_rows)} reused_chunks={reused} newly_embedded={embedded} "
        f"skipped_files={skipped} elapsed_s={elapsed}"
    )
    return 0


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def cmd_search(args):
    if not ollama_up(args.ollama_url):
        eprint(f"hermes-context: Ollama not reachable at {args.ollama_url}")
        return 69
    if not os.path.isdir(args.index_dir):
        eprint(f"hermes-context: no index directory at {args.index_dir} — run 'index' first")
        return 1
    try:
        qvec = embed(args.query, args.ollama_url, args.model)
    except Exception as exc:
        eprint(f"hermes-context: failed to embed query: {exc}")
        return 71

    targets = [args.repo] if args.repo else None
    scored = []
    for fname in sorted(os.listdir(args.index_dir)):
        if not fname.endswith(".jsonl"):
            continue
        repo_name = fname[: -len(".jsonl")]
        if targets and repo_name not in targets:
            continue
        with open(os.path.join(args.index_dir, fname), encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                score = cosine(qvec, row["embedding"])
                scored.append((score, row))

    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[: args.top]

    if args.json:
        print(json.dumps([
            {
                "repo": row["repo"], "path": row["path"],
                "start_line": row["start_line"], "end_line": row["end_line"],
                "score": round(score, 4), "text": row["text"],
            }
            for score, row in top
        ]))
        return 0

    if not top:
        print("hermes-context: no results (index may be empty)")
        return 0
    for score, row in top:
        snippet = row["text"].splitlines()[:3]
        print(f"[{score:.3f}] {row['repo']}/{row['path']}:{row['start_line']}-{row['end_line']}")
        for l in snippet:
            print(f"    {l}")
    return 0


def cmd_list(args):
    if not os.path.isdir(args.index_dir):
        print("hermes-context: no repos indexed yet")
        return 0
    for fname in sorted(os.listdir(args.index_dir)):
        if not fname.endswith(".meta.json"):
            continue
        with open(os.path.join(args.index_dir, fname), encoding="utf-8") as fh:
            meta = json.load(fh)
        print(f"{meta['repo']}: files={meta['num_files']} chunks={meta['num_chunks']} path={meta['repo_path']}")
    return 0


def cmd_doctor(args):
    up = ollama_up(args.ollama_url)
    model_ok = model_available(args.ollama_url, args.model) if up else False
    repos = []
    if os.path.isdir(args.index_dir):
        for fname in sorted(os.listdir(args.index_dir)):
            if fname.endswith(".meta.json"):
                with open(os.path.join(args.index_dir, fname), encoding="utf-8") as fh:
                    meta = json.load(fh)
                repos.append({"repo": meta["repo"], "chunks": meta["num_chunks"], "files": meta["num_files"]})
    result = {
        "schema": "hermes-context/doctor-v1", "ok": up and model_ok,
        "ollamaUp": up, "modelAvailable": model_ok, "model": args.model,
        "ollamaUrl": args.ollama_url, "indexDir": args.index_dir,
        "indexedRepos": repos, "autonomous": True, "costUsd": 0,
    }
    if args.json:
        print(json.dumps(result))
    else:
        print(f"HERMES_CONTEXT_OK ollama_up={up} model_available={model_ok} "
              f"model={args.model} indexed_repos={len(repos)}")
        for r in repos:
            print(f"  {r['repo']}: files={r['files']} chunks={r['chunks']}")
    return 0 if result["ok"] else 1


def main():
    parser = argparse.ArgumentParser(prog="hermes-context")
    parser.add_argument("--index-dir", default=DEFAULT_INDEX_DIR)
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    sub = parser.add_subparsers(dest="command", required=True)

    p_index = sub.add_parser("index")
    p_index.add_argument("repo_path")
    p_index.add_argument("--name")
    p_index.add_argument("--lines-per-chunk", type=int, default=DEFAULT_LINES_PER_CHUNK)
    p_index.add_argument("--max-chunk-chars", type=int, default=DEFAULT_MAX_CHUNK_CHARS)
    p_index.add_argument("--max-file-kb", type=int, default=DEFAULT_MAX_FILE_KB)
    p_index.set_defaults(func=cmd_index)

    p_search = sub.add_parser("search")
    p_search.add_argument("query")
    p_search.add_argument("--repo")
    p_search.add_argument("--top", type=int, default=8)
    p_search.add_argument("--json", action="store_true")
    p_search.set_defaults(func=cmd_search)

    p_list = sub.add_parser("list")
    p_list.set_defaults(func=cmd_list)

    p_doctor = sub.add_parser("doctor")
    p_doctor.add_argument("--json", action="store_true")
    p_doctor.set_defaults(func=cmd_doctor)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
