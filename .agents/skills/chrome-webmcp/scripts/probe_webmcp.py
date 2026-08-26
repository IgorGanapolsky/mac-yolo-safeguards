#!/usr/bin/env python3
"""Exercise real WebMCP imperative and declarative APIs in isolated browsers."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import plistlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


FEATURE_ARGS = [
    "--enable-features=WebMCP,WebMCPTesting,DeclarativeWebMCP",
    "--enable-blink-features=WebMCP,WebMCPTesting,DeclarativeWebMCP",
]
BROWSERS = {
    "chrome": {
        "app": Path("/Applications/Google Chrome.app"),
        "executable": Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    },
    "canary": {
        "app": Path("/Applications/Google Chrome Canary.app"),
        "executable": Path("/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"),
    },
    "browseros": {
        "app": Path("/Applications/BrowserOS neo.app"),
        "executable": Path("/Applications/BrowserOS neo.app/Contents/MacOS/BrowserOS neo"),
    },
}
HTML = b"""<!doctype html><meta charset=utf-8><title>WebMCP probe</title>
<form toolname="declarative_echo" tooldescription="Returns the provided probe message." toolautosubmit>
<label>Message <input name="message" required toolparamdescription="A deterministic probe message."></label>
<button type=submit>Submit</button></form>
<script>
document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  if (event.agentInvoked) {
    const message = new FormData(event.target).get('message');
    event.respondWith(Promise.resolve(JSON.stringify({ok: true, message})));
  }
});
</script>"""


class ProbeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.send_header("Origin-Agent-Cluster", "?1")
        self.send_header("Permissions-Policy", "tools=(self)")
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def app_version(app: Path) -> str | None:
    try:
        with (app / "Contents/Info.plist").open("rb") as handle:
            return str(plistlib.load(handle).get("CFBundleShortVersionString"))
    except (OSError, plistlib.InvalidFileException):
        return None


async def probe_browser(playwright: Any, name: str, config: dict[str, Path], url: str) -> dict[str, Any]:
    executable = config["executable"]
    receipt: dict[str, Any] = {
        "browser": name,
        "version": app_version(config["app"]),
        "executable": str(executable),
        "installed": executable.is_file(),
        "supported": False,
    }
    if not executable.is_file():
        receipt["error"] = "browser_not_installed"
        return receipt

    browser = None
    try:
        browser = await playwright.chromium.launch(executable_path=str(executable), headless=True, args=FEATURE_ARGS)
        page = await browser.new_page()
        await page.goto(url, wait_until="domcontentloaded")
        result = await page.evaluate(
            """async () => {
              const modelContext = document.modelContext;
              const result = {
                secureContext: isSecureContext,
                originAgentCluster: window.originAgentCluster,
                userAgent: navigator.userAgent,
                modelContextType: typeof modelContext,
                methods: modelContext ? Object.getOwnPropertyNames(Object.getPrototypeOf(modelContext)).sort() : [],
              };
              if (!modelContext) return result;
              try {
                await modelContext.registerTool({
                  name: 'imperative_echo',
                  description: 'Returns a deterministic probe value.',
                  inputSchema: {
                    type: 'object',
                    properties: {value: {type: 'string', description: 'The probe value.'}},
                    required: ['value'],
                  },
                  annotations: {readOnlyHint: true, untrustedContentHint: false},
                  execute: async ({value}) => JSON.stringify({ok: true, value}),
                });
                const tools = await modelContext.getTools();
                result.tools = tools.map(tool => tool.name);
                const imperative = tools.find(tool => tool.name === 'imperative_echo');
                const declarative = tools.find(tool => tool.name === 'declarative_echo');
                result.imperativeResult = imperative
                  ? await modelContext.executeTool(imperative, JSON.stringify({value: 'ready'}))
                  : null;
                result.declarativeResult = declarative
                  ? await modelContext.executeTool(declarative, JSON.stringify({message: 'ready'}))
                  : null;
              } catch (error) {
                result.error = `${error.name}: ${error.message}`;
              }
              return result;
            }"""
        )
        receipt["api"] = result
        receipt["supported"] = (
            result.get("imperativeResult") == '{"ok":true,"value":"ready"}'
            and result.get("declarativeResult") == '{"ok":true,"message":"ready"}'
        )
    except Exception as exc:  # Playwright wraps browser-specific failures.
        receipt["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if browser is not None:
            await browser.close()
    return receipt


async def async_main(selection: str) -> tuple[dict[str, Any], int]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        receipt = {"schema": "webmcp-browser-probe/v1", "ok": False, "error": "python_playwright_not_installed"}
        return receipt, 1

    server = ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    names = list(BROWSERS) if selection == "all" else [selection]
    try:
        async with async_playwright() as playwright:
            results = [await probe_browser(playwright, name, BROWSERS[name], f"http://127.0.0.1:{server.server_port}/") for name in names]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    supported = [item["browser"] for item in results if item["supported"]]
    ok = bool(supported)
    receipt = {
        "schema": "webmcp-browser-probe/v1",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "selection": selection,
        "preferred": "canary" if "canary" in supported else (supported[0] if supported else None),
        "supported": supported,
        "results": results,
    }
    return receipt, 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", choices=("all", *BROWSERS), default="all")
    parser.add_argument("--output", type=Path, help="also write the JSON receipt to this path")
    args = parser.parse_args()
    receipt, exit_code = asyncio.run(async_main(args.browser))
    rendered = json.dumps(receipt, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(rendered + "\n")
    print(rendered)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
