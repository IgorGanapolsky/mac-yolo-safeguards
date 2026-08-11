# Ready-to-post: answer for 1jehuang/jcode#866

**Target:** https://github.com/1jehuang/jcode/issues/866 ("How to migrate jcode memory from ~/.jcode into .jcode project folder?")
**Posting account:** IgorGanapolsky (via Mac-side `gh` — this CCR session cannot post cross-owner).
**Verified against:** jcode master `5ae2385` (2026-08-09), files cited inline.
**Shelf life:** check the issue is still open and unanswered before posting.

---

Short answer: there's no supported project-local `.jcode/` memory store today — but project-scoped memory already exists, it just lives centrally. What you can do depends on which of two things you're after:

**How it actually works** (as of `5ae2385`): all storage roots resolve through `jcode_dir()` in `crates/jcode-storage/src/lib.rs:150` — `$JCODE_HOME` if set, else `~/.jcode`. Project-scoped memory is already separated per project, but stored centrally: `crates/jcode-base/src/memory.rs:252` (`project_memory_path`) writes to `<jcode_dir>/memory/projects/<hash>.json`, where `<hash>` is a `DefaultHasher` digest of the project directory path (`memory.rs:265-274`).

**If you want everything project-local:** run jcode with `JCODE_HOME=$PWD/.jcode`. That relocates the whole home (memory, logs, state — not just memory) into the project folder. Add `.jcode/` to `.gitignore` unless you actually want memory committed.

**If you want to migrate existing memory into that layout:** copy `~/.jcode/memory/projects/<hash>.json` (find yours by mtime, or hash-match) into `$PWD/.jcode/memory/projects/` — but note the filename must be the hash of the project path as seen by the new setup, so the safest sequence is: start jcode once with `JCODE_HOME` set so it creates the new file, then overwrite that file's contents with your old one.

**One caveat worth knowing:** the hash is `std::collections::hash_map::DefaultHasher`, which is not guaranteed stable across Rust releases — so these filenames can theoretically all change on a toolchain upgrade. If the maintainer is open to it, a stable hash (or a plain sanitized-path filename) plus a first-class `--project-memory` flag would make both migration and backup straightforward.
