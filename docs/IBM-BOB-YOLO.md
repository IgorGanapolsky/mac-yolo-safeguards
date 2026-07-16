# IBM Bob Shell as `ibm-yolo`

`ibm-yolo` launches the official IBM Bob Shell binary with Bob's native
`--yolo` option. It does not emulate Bob and has no fallback provider.

## Install and verify

```bash
bash scripts/install-ibm-yolo.sh
ibm-yolo --doctor --json
bob --version
```

The installer targets this Mac and `hermes-mini` by default. It downloads
IBM's official installer once, verifies the reviewed SHA-256, and copies those
same bytes to the mini. `--skip-bob-install` deploys only the wrapper.

The doctor is deliberately offline: it proves the installed product, binary,
version, and routing contract, but reports authentication as untested. It does
not consume Bobcoins.

## Use

```bash
ibm-yolo
ibm-yolo "review this repository and run its tests"
ibm-yolo --sandbox "inspect this project without host writes"
ibm-yolo --max-coins 1 "perform one bounded task"
ibm-yolo mcp list
```

`ibm-yolo` always selects yolo approval. Use the standalone `bob` command when
you want IBM's default, `auto_edit`, plan, ask, or other non-yolo modes.

## Authentication, license, and cost boundaries

- The wrapper does not accept IBM's license on the operator's behalf.
- Interactive Bob authentication is owned by IBM Bob Shell. No IBM password or
  API key is stored by this repo.
- Non-interactive automation can use IBM's documented `BOBSHELL_API_KEY`, but
  the installer does not create or persist one.
- Installation does not activate a paid plan. Consult IBM's current pricing
  before upgrading; `--max-coins` is available for per-run spend control.

Official references:

- <https://bob.ibm.com/docs/shell/getting-started/install-and-setup>
- <https://bob.ibm.com/docs/shell/getting-started/start-bobshell-non-interactive>
- <https://bob.ibm.com/docs/shell/configuration/configuring>
- <https://bob.ibm.com/pricing>
