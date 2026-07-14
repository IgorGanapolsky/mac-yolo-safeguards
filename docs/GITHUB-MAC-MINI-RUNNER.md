# GitHub Actions — Mac mini self-hosted runner

Register Igor's always-on **Mac mini** (Tailscale `100.94.135.78`, Apple Silicon, 24 GB) as a GitHub Actions self-hosted runner for Hermes / mac-yolo-safeguards CI offload.

## Why

- Reduce contention on GitHub-hosted `macos-latest` / `macos-26` minutes
- Co-locate Maestro device/simulator work with the Hermes gateway fleet
- Same machine already runs Hermes gateway, Ollama, and continuous E2E LaunchAgents

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Admin on `IgorGanapolsky/mac-yolo-safeguards` | `gh auth status` |
| `gh` CLI on the Mac mini | `command -v gh` |
| Outbound HTTPS to GitHub | `curl -fsSI https://github.com` |
| Optional: Tailscale from laptop | `ping -c1 100.94.135.78` |

## One-command install (preferred)

From repo root on the **Mac mini** (or from MacBook Pro with SSH):

```bash
# Local on mini
bash scripts/register-github-mac-mini-runner.sh

# Remote from MacBook Pro (SSH user defaults to igorganapolsky@, not igor@)
HERMES_MINI_TSIP=100.94.135.78 bash scripts/register-github-mac-mini-runner.sh --remote
```

The script:

1. Resolves a **short-lived registration token** via `gh api` (never printed)
2. Downloads the latest `actions-runner` package for `arm64`
3. Configures labels: `self-hosted`, `macOS`, `macos-arm64`, `mac-mini`, `hermes-e2e`
4. Installs a **LaunchAgent** (`com.igor.github-actions-runner.plist`) for auto-start

### Environment overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `GITHUB_REPO` | `IgorGanapolsky/mac-yolo-safeguards` | Target repo |
| `RUNNER_NAME` | `mac-mini-hermes` | Runner name in GitHub UI |
| `RUNNER_DIR` | `$HOME/actions-runner` | Install directory |
| `HERMES_MINI_TSIP` | `100.94.135.78` | SSH target when using `--remote` |
| `HERMES_MINI_SSH_USER` | `igorganapolsky` | SSH user on the mini (`--remote`); not `igor` |
| `GITHUB_RUNNER_REGISTRATION_TOKEN` | *(fetched)* | Skip `gh` fetch if pre-set (expires in ~1 h) |

**Never commit or paste registration tokens.** They are single-use and short-lived.

## Manual steps (if script fails)

### 1. Registration token

```bash
gh api -X POST "repos/IgorGanapolsky/mac-yolo-safeguards/actions/runners/registration-token" --jq .token
```

Export as `GITHUB_RUNNER_REGISTRATION_TOKEN` (do not log it).

### 2. Download and configure (on Mac mini)

```bash
mkdir -p "$HOME/actions-runner" && cd "$HOME/actions-runner"
curl -fsSLO "https://github.com/actions/runner/releases/download/v2.327.1/actions-runner-osx-arm64-2.327.1.tar.gz"
tar xzf actions-runner-osx-arm64-2.327.1.tar.gz
./config.sh \
  --url "https://github.com/IgorGanapolsky/mac-yolo-safeguards" \
  --token "$GITHUB_RUNNER_REGISTRATION_TOKEN" \
  --name "mac-mini-hermes" \
  --labels "self-hosted,macOS,macos-arm64,mac-mini,hermes-e2e" \
  --unattended \
  --replace
```

### 3. Run as a service

```bash
./svc.sh install
./svc.sh start
```

Or use the LaunchAgent the script generates under `~/Library/LaunchAgents/com.igor.github-actions-runner.plist`.

## Using the runner in workflows

After registration, pin jobs that should use the mini:

```yaml
jobs:
  macos-guard:
    runs-on: [self-hosted, macos-arm64, hermes-e2e]
```

**Shipped in `ci.yml`:** `macOS guard kit` uses `[self-hosted, macos-arm64, hermes-e2e]` by default; fork PRs stay on `macos-latest`. If the mini is offline, temporarily switch the job to `macos-latest`.

## Verify

```bash
gh api "repos/IgorGanapolsky/mac-yolo-safeguards/actions/runners" --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

Expect `mac-mini-hermes` with status `online`.

## Security notes

- Self-hosted runners execute **arbitrary PR code** — keep `pull_request` workflows on GitHub-hosted runners for fork PRs, or restrict runner groups to trusted branches only.
- Prefer **repo-level** runner (this doc) over org-wide until branch trust rules are configured.
- Rotate the runner if the host is reinstalled: `./config.sh remove` then re-register.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `401` on registration token | Re-run `gh auth login` on the mini |
| Runner offline after reboot | `launchctl kickstart -k gui/$(id -u)/com.igor.github-actions-runner` |
| Job stuck queued | Labels in workflow must match runner labels exactly |
| SSH `--remote` fails | `bash scripts/hermes-fleet-ssh-trust.sh` then retry |
