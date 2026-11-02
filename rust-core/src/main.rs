use std::cmp::Ordering;
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const IDLE_SECS: u64 = 24 * 60 * 60;
const NOISE_BYTES: u64 = 1024 * 1024;

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

fn home_dir() -> PathBuf {
    if let Ok(h) = env::var("HOME") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    PathBuf::from("/Users/iganapolsky")
}

fn now_epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis()
}

fn iso8601_now() -> String {
    // Fast UTC ISO timestamp via unix seconds calculation (no external chrono crate needed)
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0));
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;

    // Howard Hinnant civil_from_days algorithm
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hour, min, sec, millis
    )
}

fn format_bytes(v: u64) -> String {
    let gib = 1024.0 * 1024.0 * 1024.0;
    let mib = 1024.0 * 1024.0;
    let vf = v as f64;
    if vf >= gib {
        let mut s = format!("{:.2}", vf / gib);
        if s.ends_with(".00") {
            s.truncate(s.len() - 3);
        } else if s.ends_with('0') {
            s.pop();
        }
        return format!("{} GB", s);
    }
    if vf >= mib {
        let mb = vf / mib;
        if mb >= 10.0 {
            return format!("{} MB", mb.round() as u64);
        }
        let mut s = format!("{:.1}", mb);
        if s.ends_with(".0") {
            s.truncate(s.len() - 2);
        }
        return format!("{} MB", s);
    }
    if v >= 1024 {
        return format!("{} KB", (vf / 1024.0).round() as u64);
    }
    format!("{} B", v)
}

fn dir_size_bounded(root: &Path, deadline: Instant, max_entries: &mut usize) -> (u64, bool) {
    if !root.exists() {
        return (0, true);
    }
    let meta = match fs::symlink_metadata(root) {
        Ok(m) => m,
        Err(_) => return (0, true),
    };
    if meta.is_file() || meta.file_type().is_symlink() {
        return (meta.len(), true);
    }
    let mut total: u64 = 0;
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(curr) = stack.pop() {
        if Instant::now() >= deadline || *max_entries == 0 {
            return (total, false);
        }
        let rd = match fs::read_dir(&curr) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            if *max_entries == 0 {
                return (total, false);
            }
            *max_entries -= 1;
            if let Ok(m) = entry.metadata() {
                if m.is_dir() && !m.file_type().is_symlink() {
                    stack.push(entry.path());
                } else {
                    total = total.saturating_add(m.len());
                }
            }
        }
    }
    (total, true)
}

fn is_claude_digits_dir(name: &str) -> bool {
    if let Some(rest) = name.strip_prefix("claude-") {
        !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
    } else {
        false
    }
}

fn measure_stale_temp(base: &Path, now: SystemTime, idle_dur: Duration) -> (Vec<PathBuf>, bool) {
    if !base.exists() {
        return (Vec::new(), true);
    }
    let rd = match fs::read_dir(base) {
        Ok(r) => r,
        Err(_) => return (Vec::new(), false),
    };
    let mut stale = Vec::new();
    let mut known = true;
    for ent in rd.flatten() {
        let name = ent.file_name().to_string_lossy().to_string();
        if !is_claude_digits_dir(&name) {
            continue;
        }
        let child_rd = match fs::read_dir(ent.path()) {
            Ok(r) => r,
            Err(_) => {
                known = false;
                continue;
            }
        };
        for child in child_rd.flatten() {
            let cname = child.file_name().to_string_lossy().to_string();
            if cname == "bundled-skills" {
                continue;
            }
            let cpath = child.path();
            if let Ok(meta) = fs::metadata(&cpath) {
                if let Ok(mtime) = meta.modified() {
                    let age = now.duration_since(mtime).unwrap_or(Duration::from_secs(0));
                    if age >= idle_dur {
                        stale.push(cpath);
                    }
                }
            }
        }
    }
    (stale, known)
}

fn count_prunable_worktrees_fast(repo: &Path) -> (usize, bool) {
    let wt_dir = repo.join(".git").join("worktrees");
    if !wt_dir.exists() {
        if repo.join(".git").exists() {
            return (0, true);
        }
        return (0, false);
    }
    let rd = match fs::read_dir(&wt_dir) {
        Ok(r) => r,
        Err(_) => return (0, false),
    };
    let mut prunable = 0usize;
    for ent in rd.flatten() {
        let p = ent.path();
        if p.join("locked").exists() {
            continue;
        }
        let gitdir_file = p.join("gitdir");
        if let Ok(raw) = fs::read_to_string(&gitdir_file) {
            let target = raw.trim();
            if !target.is_empty() && !Path::new(target).exists() {
                prunable += 1;
            }
        } else {
            prunable += 1;
        }
    }
    (prunable, true)
}

fn leftover_scan_dirs(home: &Path) -> Vec<PathBuf> {
    vec![
        PathBuf::from("/Applications"),
        home.join("Library/Application Support"),
        home.join("Library/Caches"),
        home.join("Library/Preferences"),
        home.join("Library/LaunchAgents"),
        home.join("Library/Logs"),
    ]
}

fn measure_named_leftovers<F>(dirs: &[PathBuf], matcher: F) -> Vec<PathBuf>
where
    F: Fn(&str) -> bool,
{
    let mut found = Vec::new();
    for dir in dirs {
        let rd = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.starts_with("com.apple.") {
                continue;
            }
            if matcher(&name) {
                found.push(ent.path());
            }
        }
    }
    found
}

fn sum_paths_fast(paths: &[PathBuf], budget_ms: u64) -> (u64, bool, usize) {
    if paths.is_empty() {
        return (0, true, 0);
    }
    if paths.len() > 8 {
        return (0, false, paths.len());
    }
    let deadline = Instant::now() + Duration::from_millis(budget_ms);
    let mut budget_entries = 15_000usize;
    let mut total = 0u64;
    for p in paths {
        let (sz, ok) = dir_size_bounded(p, deadline, &mut budget_entries);
        if !ok {
            return (0, false, paths.len());
        }
        total = total.saturating_add(sz);
    }
    (total, true, paths.len())
}

fn run_hud_disk_recs() -> ExitCode {
    let t0 = Instant::now();
    let now = SystemTime::now();
    let home = home_dir();
    let tmp_base = PathBuf::from(env::var("MAC_YOLO_TMP_BASE").unwrap_or_else(|_| "/private/tmp".to_string()));
    let repo = PathBuf::from(
        env::var("MAC_YOLO_REPO").unwrap_or_else(|_| home.join("workspace/mac-yolo-safeguards").to_string_lossy().to_string()),
    );
    let sim_cache = home.join("Library/Developer/CoreSimulator/Caches");

    let (stale_paths, stale_known) = measure_stale_temp(&tmp_base, now, Duration::from_secs(IDLE_SECS));
    let (stale_bytes, stale_sz_known, _) = sum_paths_fast(&stale_paths, 250);

    let deadline = Instant::now() + Duration::from_millis(250);
    let mut entries = 12_000usize;
    let (swift_bytes, swift_known) = dir_size_bounded(&tmp_base.join("swift-module-cache"), deadline, &mut entries);
    let (node_bytes, node_known) = dir_size_bounded(&tmp_base.join("node-compile-cache"), deadline, &mut entries);
    let (sim_bytes, sim_known) = dir_size_bounded(&sim_cache, deadline, &mut entries);
    let (worktrees, wt_known) = count_prunable_worktrees_fast(&repo);

    let scan_dirs = leftover_scan_dirs(&home);
    let cmm_paths = measure_named_leftovers(&scan_dirs, |name| name.to_ascii_lowercase().contains("cleanmymac"));
    let (cmm_bytes, cmm_known, cmm_count) = sum_paths_fast(&cmm_paths, 250);
    let cmm_primary = cmm_paths
        .first()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let paper_paths = measure_named_leftovers(&scan_dirs, |name| {
        name.eq_ignore_ascii_case("Paper.app") || name.to_ascii_lowercase().starts_with("com.papercompute")
    });
    let (paper_bytes, paper_known, paper_count) = sum_paths_fast(&paper_paths, 250);

    let waste_known = stale_known && stale_sz_known && swift_known && node_known && sim_known && wt_known;
    let waste_bytes = stale_bytes
        .saturating_add(swift_bytes)
        .saturating_add(node_bytes)
        .saturating_add(sim_bytes);
    let stale_count = stale_paths.len();
    let waste_meaningful = waste_bytes >= NOISE_BYTES || worktrees > 0;
    let waste_done = waste_known && !waste_meaningful;

    let mut parts = Vec::new();
    if stale_bytes >= NOISE_BYTES {
        parts.push(format!("{} in idle /private/tmp/claude-*", format_bytes(stale_bytes)));
    }
    if swift_bytes >= NOISE_BYTES {
        parts.push(format!("{} Swift temp cache", format_bytes(swift_bytes)));
    }
    if node_bytes >= NOISE_BYTES {
        parts.push(format!("{} Node temp cache", format_bytes(node_bytes)));
    }
    if sim_bytes >= NOISE_BYTES {
        parts.push(format!("{} simulator cache", format_bytes(sim_bytes)));
    }
    if worktrees > 0 {
        parts.push(if worktrees == 1 {
            "1 orphaned worktree".to_string()
        } else {
            format!("{} orphaned worktrees", worktrees)
        });
    }
    if parts.is_empty() && waste_bytes >= NOISE_BYTES {
        parts.push(format!("{} of stale temp files", format_bytes(waste_bytes)));
    }

    let (waste_text, waste_short) = if !waste_known {
        if stale_count > 0 || worktrees > 0 {
            let mut bits = Vec::new();
            if stale_count > 0 {
                bits.push(if stale_count == 1 {
                    "1 stale temp folder".to_string()
                } else {
                    format!("{} stale temp folders", stale_count)
                });
            }
            if worktrees > 0 {
                bits.push(if worktrees == 1 {
                    "1 orphaned worktree".to_string()
                } else {
                    format!("{} orphaned worktrees", worktrees)
                });
            }
            let short = if stale_count > 0 {
                format!("{} stale {}", stale_count, if stale_count == 1 { "folder" } else { "folders" })
            } else if worktrees == 1 {
                "1 orphaned worktree".to_string()
            } else {
                format!("{} orphaned worktrees", worktrees)
            };
            (
                format!(
                    "Sweep {}. Clean AI Waste removes the stale temp files. The exact size is still being measured.",
                    bits.join(" and ")
                ),
                short,
            )
        } else {
            (
                "AI waste is still being measured. This line checks off when the stale temp files are actually gone."
                    .to_string(),
                "Measuring".to_string(),
            )
        }
    } else if waste_done {
        (
            "AI waste is already clear. Nothing stale is left in /private/tmp/claude-*, Swift or Node temp caches, simulator caches, or orphaned worktrees.".to_string(),
            "Clear".to_string(),
        )
    } else if waste_bytes < NOISE_BYTES && worktrees > 0 {
        (
            format!(
                "Remove {}. Clean AI Waste does not delete live worktrees, only ones git already calls prunable.",
                parts.join(", ")
            ),
            if worktrees == 1 {
                "1 orphaned worktree".to_string()
            } else {
                format!("{} orphaned worktrees", worktrees)
            },
        )
    } else {
        (
            format!("Sweep {}. Clean AI Waste removes the stale temp files.", parts.join(", ")),
            if worktrees > 0 {
                format!("{} + {} worktrees still sweepable", format_bytes(waste_bytes), worktrees)
            } else {
                format!("{} still sweepable", format_bytes(waste_bytes))
            },
        )
    };

    let cmm_done = cmm_count == 0;
    let (cmm_text, cmm_short) = if cmm_done {
        (
            "CleanMyMac 5 is already gone. No app and no leftover LaunchAgents or support folders.".to_string(),
            "Already gone".to_string(),
        )
    } else if !cmm_known {
        (
            format!(
                "CleanMyMac 5 is still on this Mac ({} {}). Uninstall Apps removes the app and those leftovers.",
                cmm_count,
                if cmm_count == 1 { "path" } else { "paths" }
            ),
            format!("{} paths still installed", cmm_count),
        )
    } else {
        (
            format!(
                "CleanMyMac 5 is still on this Mac ({} across {} {}). Uninstall Apps removes the app and those leftovers.",
                format_bytes(cmm_bytes),
                cmm_count,
                if cmm_count == 1 { "path" } else { "paths" }
            ),
            format!("{} still installed", format_bytes(cmm_bytes)),
        )
    };

    let paper_done = paper_count == 0;
    let (paper_text, paper_short) = if paper_done {
        (
            "Paper is already gone. No app and no cache cassettes left.".to_string(),
            "Already gone".to_string(),
        )
    } else if !paper_known {
        (
            format!(
                "Paper is still on this Mac ({} {}).",
                paper_count,
                if paper_count == 1 { "path" } else { "paths" }
            ),
            format!("{} paths still installed", paper_count),
        )
    } else {
        (
            format!("Paper is still on this Mac ({}).", format_bytes(paper_bytes)),
            format!("{} still installed", format_bytes(paper_bytes)),
        )
    };

    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let sampled_at = iso8601_now();
    println!(
        "{{\"ok\":true,\"engine\":\"rust-native\",\"latencyMs\":{:.2},\"waste\":{{\"done\":{},\"text\":\"{}\",\"short\":\"{}\",\"bytes\":{},\"sizeKnown\":{}}},\"cleanMyMac\":{{\"done\":{},\"text\":\"{}\",\"short\":\"{}\",\"bytes\":{},\"pathCount\":{},\"sizeKnown\":{},\"primaryPath\":\"{}\"}},\"paper\":{{\"done\":{},\"text\":\"{}\",\"short\":\"{}\",\"bytes\":{},\"pathCount\":{},\"sizeKnown\":{}}},\"sampledAt\":\"{}\"}}",
        elapsed_ms,
        waste_done,
        json_escape(&waste_text),
        json_escape(&waste_short),
        waste_bytes,
        waste_known,
        cmm_done,
        json_escape(&cmm_text),
        json_escape(&cmm_short),
        cmm_bytes,
        cmm_count,
        cmm_known,
        json_escape(&cmm_primary),
        paper_done,
        json_escape(&paper_text),
        json_escape(&paper_short),
        paper_bytes,
        paper_count,
        paper_known,
        json_escape(&sampled_at)
    );
    ExitCode::SUCCESS
}

/// Fast JSON string field extractor (zero external crates)
fn extract_json_str_field(raw: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\"", key);
    let mut search_from = 0;
    while let Some(rel_idx) = raw[search_from..].find(&needle) {
        let idx = search_from + rel_idx + needle.len();
        let rest = raw[idx..].trim_start();
        if let Some(after_colon) = rest.strip_prefix(':') {
            let val_start = after_colon.trim_start();
            if let Some(after_quote) = val_start.strip_prefix('"') {
                let mut out = String::new();
                let mut chars = after_quote.chars();
                while let Some(c) = chars.next() {
                    if c == '\\' {
                        if let Some(esc) = chars.next() {
                            match esc {
                                'n' => out.push('\n'),
                                'r' => out.push('\r'),
                                't' => out.push('\t'),
                                '"' => out.push('"'),
                                '\\' => out.push('\\'),
                                other => out.push(other),
                            }
                        }
                    } else if c == '"' {
                        return Some(out);
                    } else {
                        out.push(c);
                    }
                }
            }
        }
        search_from = idx;
    }
    None
}

fn is_sensitive_cred_path(p: &str) -> bool {
    let low = p.to_ascii_lowercase();
    low.contains(".ssh/id_rsa")
        || low.contains(".ssh/id_ed25519")
        || low.contains(".ssh/config")
        || low.contains(".aws/credentials")
        || low.contains(".env.production")
        || low.contains(".env.prod")
        || low.contains("keychain_dump")
}

fn is_rm_rf_token(tok: &str) -> bool {
    if !tok.starts_with('-') || tok.starts_with("--") {
        return false;
    }
    let flags = &tok[1..];
    let has_r = flags.contains('r') || flags.contains('R');
    let has_f = flags.contains('f');
    has_r && has_f && flags.chars().all(|c| c.is_ascii_alphabetic())
}

fn has_destructive_rm_rf(cmd: &str) -> bool {
    // Check across shell command segments (; & | \n)
    for seg in cmd.split(|c| c == ';' || c == '&' || c == '|' || c == '\n') {
        let tokens: Vec<&str> = seg.split_whitespace().collect();
        for (i, &t) in tokens.iter().enumerate() {
            if t.eq_ignore_ascii_case("rm") {
                let mut j = i + 1;
                let mut saw_rf = false;
                while j < tokens.len() {
                    let arg = tokens[j];
                    if is_rm_rf_token(arg) {
                        saw_rf = true;
                        j += 1;
                        continue;
                    }
                    if arg.starts_with("--") && arg.len() > 2 {
                        j += 1;
                        continue;
                    }
                    if saw_rf {
                        let low = arg.to_ascii_lowercase();
                        if arg == "/" {
                            return true;
                        }
                        for sys in &[
                            "/etc",
                            "/var",
                            "/usr",
                            "/bin",
                            "/sbin",
                            "/system",
                            "/library",
                            "/applications",
                            "/users",
                        ] {
                            if low == *sys || low.starts_with(&format!("{}/", sys)) {
                                return true;
                            }
                        }
                    }
                    j += 1;
                }
            }
        }
    }
    false
}

fn has_word(hay: &str, word: &str) -> bool {
    let low = hay.to_ascii_lowercase();
    let w = word.to_ascii_lowercase();
    for (idx, _) in low.match_indices(&w) {
        let before_ok = idx == 0
            || !low[..idx]
                .chars()
                .next_back()
                .map(|c| c.is_ascii_alphanumeric() || c == '_')
                .unwrap_or(false);
        let end = idx + w.len();
        let after_ok = end == low.len()
            || !low[end..]
                .chars()
                .next()
                .map(|c| c.is_ascii_alphanumeric() || c == '_')
                .unwrap_or(false);
        if before_ok && after_ok {
            return true;
        }
    }
    false
}

fn is_destructive_command(cmd: &str) -> bool {
    let low = cmd.to_ascii_lowercase();
    // 1. drop database
    let collapsed: String = low.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.contains("drop database") {
        return true;
    }
    // 2. git push ... --force
    for line in low.lines() {
        if let Some(pos) = line.find("git push") {
            let after = &line[pos..];
            if after.contains("--force") {
                return true;
            }
        }
    }
    // 3. rm -rf / or system dir
    has_destructive_rm_rf(cmd)
}

fn run_pre_tool_gate() -> ExitCode {
    let mut raw = String::new();
    let _ = io::stdin().read_to_string(&mut raw);
    let raw_trimmed = raw.trim();
    if raw_trimmed.is_empty() {
        println!("{{\"decision\":\"ALLOW\",\"exitCode\":0,\"reason\":\"empty input\"}}");
        return ExitCode::SUCCESS;
    }

    let cmd = extract_json_str_field(raw_trimmed, "command")
        .or_else(|| extract_json_str_field(raw_trimmed, "CommandLine"))
        .unwrap_or_default();
    let file_path = extract_json_str_field(raw_trimmed, "file_path")
        .or_else(|| extract_json_str_field(raw_trimmed, "notebook_path"))
        .or_else(|| extract_json_str_field(raw_trimmed, "path"))
        .or_else(|| extract_json_str_field(raw_trimmed, "AbsolutePath"))
        .or_else(|| extract_json_str_field(raw_trimmed, "TargetFile"))
        .unwrap_or_default();

    // 1. Secret read guard
    if !file_path.is_empty() && is_sensitive_cred_path(&file_path) {
        let reason = format!("Access to sensitive credential path denied: {}", file_path);
        println!(
            "{{\"decision\":\"BLOCK\",\"exitCode\":2,\"reason\":\"{}\"}}",
            json_escape(&reason)
        );
        return ExitCode::from(2);
    }

    if !cmd.is_empty() {
        // 2. Destructive command check
        if is_destructive_command(&cmd) {
            let reason = format!("Destructive command detected: {}. Requires human consent.", cmd);
            println!(
                "{{\"decision\":\"BLOCK\",\"exitCode\":2,\"reason\":\"{}\"}}",
                json_escape(&reason)
            );
            return ExitCode::from(2);
        }

        // 3. Production release gate
        let is_rel_verb = has_word(&cmd, "deploy") || has_word(&cmd, "release") || has_word(&cmd, "publish");
        let is_prod_target = has_word(&cmd, "prod")
            || has_word(&cmd, "production")
            || has_word(&cmd, "main")
            || has_word(&cmd, "live");
        if is_rel_verb && is_prod_target {
            let authorized = env::var("RELEASE_APPROVAL").map(|v| !v.is_empty()).unwrap_or(false)
                || env::var("HERMES_RELEASE_AUTHORIZED")
                    .map(|v| !v.is_empty())
                    .unwrap_or(false);
            if !authorized {
                println!(
                    "{{\"decision\":\"BLOCK\",\"exitCode\":2,\"reason\":\"Production deployment requires named release authorization (set RELEASE_APPROVAL).\"}}"
                );
                return ExitCode::from(2);
            }
        }

        // 4. Test tampering guard during bugfix
        let bugfix = env::var("SDLC_BUGFIX_MODE").map(|v| v == "1").unwrap_or(false)
            || env::var("FIX_MODE").map(|v| v == "1").unwrap_or(false);
        if bugfix {
            let low = cmd.to_ascii_lowercase();
            let touches_test = low.contains("tests/")
                || low.contains("__tests__/")
                || low.contains(".test.ts")
                || low.contains(".test.tsx")
                || low.contains(".test.js")
                || low.contains(".test.mjs");
            let mutates = has_word(&cmd, "rm")
                || has_word(&cmd, "mv")
                || has_word(&cmd, "sed")
                || (low.contains("echo ") && low.contains('>'))
                || (low.contains("cat ") && low.contains('>'));
            if touches_test && mutates {
                println!(
                    "{{\"decision\":\"BLOCK\",\"exitCode\":2,\"reason\":\"Modifying test files is forbidden during bugfix mode. Fix the code, not the test.\"}}"
                );
                return ExitCode::from(2);
            }
        }
    }

    println!("{{\"decision\":\"ALLOW\",\"exitCode\":0,\"reason\":\"Pre-tool checks passed.\"}}");
    ExitCode::SUCCESS
}

fn run_safety_hook() -> ExitCode {
    let mut raw = String::new();
    let _ = io::stdin().read_to_string(&mut raw);
    let raw_trimmed = raw.trim();
    if raw_trimmed.is_empty() || !raw_trimmed.starts_with('{') {
        println!("{{\"decision\":\"allow\"}}");
        return ExitCode::SUCCESS;
    }

    let tool_name = extract_json_str_field(raw_trimmed, "toolName")
        .or_else(|| extract_json_str_field(raw_trimmed, "tool_name"))
        .unwrap_or_default();
    let command = extract_json_str_field(raw_trimmed, "command")
        .or_else(|| extract_json_str_field(raw_trimmed, "cmd"))
        .unwrap_or_default();
    let file_path = extract_json_str_field(raw_trimmed, "target_file")
        .or_else(|| extract_json_str_field(raw_trimmed, "file_path"))
        .or_else(|| extract_json_str_field(raw_trimmed, "path"))
        .unwrap_or_default();

    let name_low = tool_name.to_ascii_lowercase();
    let is_shell = name_low.contains("run_terminal_command")
        || name_low.contains("bash")
        || name_low.contains("shell")
        || name_low.contains("terminal")
        || !command.is_empty();
    let is_read = name_low.contains("read_file") || name_low.contains("read");

    let mut deny_reason: Option<&'static str> = None;
    if is_read && !file_path.is_empty() {
        let fp_low = file_path.to_ascii_lowercase();
        if fp_low.ends_with(".env")
            || fp_low.contains(".env.")
            || fp_low.ends_with("auth.json")
        {
            deny_reason = Some("Blocked read of secret-bearing path (.env / auth.json)");
        }
    }

    if deny_reason.is_none() && is_shell && !command.is_empty() {
        let cmd_low = command.to_ascii_lowercase();
        let tokens: Vec<&str> = command.split_whitespace().collect();
        let has_rm_rf = tokens.iter().enumerate().any(|(i, t)| {
            t.eq_ignore_ascii_case("rm")
                && tokens[i + 1..]
                    .iter()
                    .any(|a| is_rm_rf_token(a) || a.eq_ignore_ascii_case("--recursive"))
        });
        if has_rm_rf {
            deny_reason = Some("Blocked recursive force delete (rm -rf)");
        } else if cmd_low.contains("git push") && (cmd_low.contains("--force") || cmd_low.contains(" -f")) {
            deny_reason = Some("Blocked git push --force");
        } else if cmd_low.split_whitespace().collect::<Vec<_>>().join(" ").contains("git reset --hard") {
            deny_reason = Some("Blocked git reset --hard");
        } else if cmd_low.contains("git clean") && (cmd_low.contains("-fd") || cmd_low.contains("-df") || (cmd_low.contains("-f") && cmd_low.contains("-d"))) {
            deny_reason = Some("Blocked git clean -fd");
        } else if cmd_low.contains("security ")
            && ["delete", "set", "add", "find", "import", "export"]
                .iter()
                .any(|w| has_word(&cmd_low, w))
        {
            deny_reason = Some("Blocked macOS security keychain mutation/export");
        } else if cmd_low.contains("~/.ssh") || cmd_low.contains("$home/.ssh") || cmd_low.contains("/.ssh/") {
            deny_reason = Some("Blocked access to ~/.ssh");
        } else if cmd_low.contains("~/.gnupg") || cmd_low.contains("$home/.gnupg") || cmd_low.contains("/.gnupg/") {
            deny_reason = Some("Blocked access to ~/.gnupg");
        } else if cmd_low.contains("drop database") || cmd_low.contains("drop table") || cmd_low.contains("truncate table") {
            deny_reason = Some("Blocked destructive SQL");
        } else if has_word(&cmd_low, "mkfs") || cmd_low.contains("dd if=") {
            deny_reason = Some("Blocked disk-destructive command");
        }
    }

    if let Some(reason) = deny_reason {
        let dir = home_dir().join(".hermes/receipts/grok-build-fleet");
        let _ = fs::create_dir_all(&dir);
        let line = format!(
            "{{\"at\":\"{}\",\"event\":\"pre_tool_use_deny\",\"toolName\":\"{}\",\"reason\":\"{}\"}}\n",
            iso8601_now(),
            json_escape(&tool_name),
            json_escape(reason)
        );
        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("denies.jsonl"))
        {
            use std::io::Write;
            let _ = f.write_all(line.as_bytes());
        }
        println!("{{\"decision\":\"deny\",\"reason\":\"{}\"}}", json_escape(reason));
        return ExitCode::from(2);
    }

    println!("{{\"decision\":\"allow\"}}");
    ExitCode::SUCCESS
}

#[derive(Clone)]
struct ProcEntry {
    pid: u32,
    cpu_pct: f64,
    memory_mib: f64,
    name: String,
}

fn run_telemetry(write_scratch: bool) -> ExitCode {
    let t0 = Instant::now();
    let home = home_dir();

    // Single-pass `ps -Ao pid,pcpu,rss,comm,args`
    let ps_out = Command::new("/bin/ps")
        .args(["-Ao", "pid,pcpu,rss,args"])
        .output();

    let mut procs: Vec<ProcEntry> = Vec::new();
    let mut chrome_renderers = 0usize;
    let mut chrome_mem_mib = 0.0f64;
    let mut browser_os_mem_mib = 0.0f64;
    let mut orphan_headless_pids: Vec<u32> = Vec::new();

    if let Ok(out) = ps_out {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines().skip(1) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let mut it = trimmed.split_whitespace();
            let pid: u32 = match it.next().and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => continue,
            };
            let cpu_pct: f64 = match it.next().and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => continue,
            };
            let rss_kib: u64 = match it.next().and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => continue,
            };
            let args_vec: Vec<&str> = it.collect();
            if args_vec.is_empty() {
                continue;
            }
            let full_cmd = args_vec.join(" ");
            let first_bin = args_vec[0];
            let base_name = Path::new(first_bin)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| first_bin.to_string());
            let mem_mib = ((rss_kib as f64 / 1024.0) * 10.0).round() / 10.0;

            let cmd_low = full_cmd.to_ascii_lowercase();
            if cmd_low.contains("google chrome helper (renderer)") {
                chrome_renderers += 1;
                chrome_mem_mib += rss_kib as f64 / 1024.0;
            } else if cmd_low.contains("browseros") {
                browser_os_mem_mib += rss_kib as f64 / 1024.0;
            }
            if cmd_low.contains("--headless")
                && (cmd_low.contains("chrome") || cmd_low.contains("chromium") || cmd_low.contains("playwright"))
            {
                orphan_headless_pids.push(pid);
            }

            procs.push(ProcEntry {
                pid,
                cpu_pct,
                memory_mib: mem_mib,
                name: base_name,
            });
        }
    }

    let mut by_cpu = procs.clone();
    by_cpu.sort_by(|a, b| b.cpu_pct.partial_cmp(&a.cpu_pct).unwrap_or(Ordering::Equal));
    let top_cpu: Vec<String> = by_cpu
        .iter()
        .take(5)
        .map(|p| {
            format!(
                "{{\"pid\":{},\"name\":\"{}\",\"cpuPct\":{},\"memoryMiB\":{:.1}}}",
                p.pid,
                json_escape(&p.name),
                p.cpu_pct,
                p.memory_mib
            )
        })
        .collect();

    let mut by_mem = procs.clone();
    by_mem.sort_by(|a, b| b.memory_mib.partial_cmp(&a.memory_mib).unwrap_or(Ordering::Equal));
    let top_mem: Vec<String> = by_mem
        .iter()
        .take(5)
        .map(|p| {
            format!(
                "{{\"pid\":{},\"name\":\"{}\",\"cpuPct\":{},\"memoryMiB\":{:.1}}}",
                p.pid,
                json_escape(&p.name),
                p.cpu_pct,
                p.memory_mib
            )
        })
        .collect();

    let neo_exists = home.join(".browserclaw/neo.toml").exists();
    let audit_exists = home.join(".browserclaw/audit-retention.json").exists();
    let orphan_pids_json: Vec<String> = orphan_headless_pids.iter().map(|p| p.to_string()).collect();

    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let total_rss_mib: f64 = procs.iter().map(|p| p.memory_mib).sum();

    let payload = format!(
        "{{\"ok\":true,\"status\":\"active\",\"engine\":\"rust-native\",\"telemetry_latency_ms\":{:.2},\"memory_pool_mb\":{:.1},\"processCount\":{},\"culprits\":{{\"ok\":true,\"topCpu\":[{}],\"topMemory\":[{}]}},\"browserCare\":{{\"ok\":true,\"chromeRendererCount\":{},\"chromeRendererMemoryMiB\":{:.1},\"browserOsMemoryMiB\":{:.1},\"browserOsConfigTuned\":{},\"orphanHeadlessCount\":{},\"orphanHeadlessPids\":[{}]}}}}",
        elapsed_ms,
        total_rss_mib,
        procs.len(),
        top_cpu.join(","),
        top_mem.join(","),
        chrome_renderers,
        chrome_mem_mib,
        browser_os_mem_mib,
        neo_exists && audit_exists,
        orphan_headless_pids.len(),
        orphan_pids_json.join(",")
    );

    if write_scratch {
        let scratch = home.join(".hermes/cache/scratch");
        let _ = fs::create_dir_all(&scratch);
        let _ = fs::write(scratch.join("rust_telemetry_output.json"), &payload);
    }
    println!("{}", payload);
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let sub = args.first().map(|s| s.as_str()).unwrap_or("telemetry-scratch");
    match sub {
        "hud-disk-recs" => run_hud_disk_recs(),
        "pre-tool-gate" => run_pre_tool_gate(),
        "safety-hook" => run_safety_hook(),
        "telemetry" => run_telemetry(args.iter().any(|a| a == "--write-scratch")),
        "telemetry-scratch" => run_telemetry(true),
        "--version" | "-V" => {
            println!(
                "{{\"binary\":\"mac-yolo-rust-core\",\"version\":\"1.0.0\",\"epochMs\":{}}}",
                now_epoch_ms()
            );
            ExitCode::SUCCESS
        }
        _ => run_telemetry(true),
    }
}
