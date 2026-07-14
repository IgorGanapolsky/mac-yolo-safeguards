# ali-yolo

`ali-yolo` is a fail-closed launcher for Alibaba's official Qwen Code CLI. It
pins `@qwen-code/qwen-code@0.19.10`, verifies that Qwen is configured for an
Alibaba DashScope or international Coding Plan endpoint, and invokes Qwen with
its native `--yolo` approval mode.

It never falls back to another provider. `ali-yolo --doctor --json` reports the
binary, version, endpoint host, model, and whether the expected credential is
present without printing the credential.

Install both Macs from the repository root:

```sh
bash scripts/install-ali-yolo.sh
```

The command remains blocked until Qwen Code has an Alibaba ModelStudio Standard
API Key or Coding Plan configuration. Keep the secret in `~/.qwen/.env`; do not
commit it or place its value in `settings.json`.

Supported official routes:

- US (Virginia) Standard API: `https://dashscope-us.aliyuncs.com/compatible-mode/v1` with
  `DASHSCOPE_API_KEY`
- China Standard API: `https://dashscope.aliyuncs.com/compatible-mode/v1` with
  `DASHSCOPE_API_KEY`
- International Coding Plan: `https://coding-intl.dashscope.aliyuncs.com/v1`
  with `BAILIAN_CODING_PLAN_API_KEY`
- China Coding Plan: `https://coding.dashscope.aliyuncs.com/v1` with
  `BAILIAN_CODING_PLAN_API_KEY`

YOLO mode allows tool calls without individual confirmation inside the Qwen
process. It does not grant more operating-system privileges than that process
already has.
