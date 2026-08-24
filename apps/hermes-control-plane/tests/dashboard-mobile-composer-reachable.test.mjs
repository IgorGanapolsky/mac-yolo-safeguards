import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    // Isolated worktrees often omit node_modules; walk up and also try the
    // primary mac-yolo-safeguards control-plane install.
  }
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 10; i += 1) {
    const direct = join(dir, "node_modules/playwright/index.js");
    const nested = join(dir, "apps/hermes-control-plane/node_modules/playwright/index.js");
    for (const candidate of [direct, nested]) {
      if (!existsSync(candidate)) continue;
      const mjs = candidate.replace(/index\.js$/, "index.mjs");
      const href = pathToFileURL(existsSync(mjs) ? mjs : candidate).href;
      const mod = await import(href);
      return mod.chromium || mod.default?.chromium || null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

test("mobile Hermes shell reserves the composer instead of locking 100dvh over the statusline", () => {
  assert.match(css, /--turn-statusline-h:5\.75rem/);
  assert.match(
    css,
    /data-mobile-tab="hermes"\]\{\s*height:100%;\s*max-height:calc\(100dvh - var\(--turn-statusline-h/,
  );
  assert.match(css, /data-mobile-tab="hermes"\] \.dashboard-main\{[\s\S]*padding:8px 10px 0;/);
  assert.doesNotMatch(
    css,
    /data-mobile-tab="hermes"\] \.dashboard-main\{[\s\S]*padding:8px 10px calc\(72px/,
  );
  assert.match(css, /task-panel \.composer[\s\S]*flex:0 0 auto/);
  assert.match(
    css,
    /data-mobile-tab="hermes"\] \.task-panel \.composer\{\s*display:grid/,
  );
  assert.match(css, /grid-template-areas:[\s\S]*"text run"/);
  assert.match(css, /composer textarea\{[\s\S]*min-height:40px/);
});

test("390x844 keeps the prompt textarea in the visual viewport", async (t) => {
  const chromium = await loadChromium();
  if (!chromium) {
    t.skip("playwright is not installed");
    return;
  }

  const cssWithoutTailwind = css.replace('@import "tailwindcss";', "");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${cssWithoutTailwind}
html,body{height:100%;margin:0}
.frame{min-height:100dvh;height:100dvh;display:flex;flex-direction:column}
.body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.dashboard-shell{flex:1 1 auto;min-height:0}
.status-foot{flex:0 0 auto;padding:8px 12px;border-top:1px solid #333;font:11px/1.4 monospace;color:#718079}
</style></head>
<body>
<div class="frame">
  <div class="body">
    <main class="dashboard-shell chat-rail-collapsed" data-mobile-tab="hermes">
      <aside class="sidebar is-collapsed"><div class="sidebar-header"><a class="brand">ThumbGate</a></div></aside>
      <section class="dashboard-main">
        <header class="dashboard-header"><div class="dashboard-header-title"><h1>Real Estate</h1></div></header>
        <div class="notice notice-toast"><span>Sent — running on the hosted VPS.</span></div>
        <section class="continuity-usage-meter">
          <div class="continuity-usage-meter-copy">
            <p class="eyebrow">Hosted VPS capacity · ON_DEMAND_MONTHLY</p>
            <strong>17/100 VPS runs used</strong>
            <small>83 remaining · plan pro · 30d window · 0/10 active · 17%</small>
          </div>
        </section>
        <div class="dashboard-grid">
          <section class="panel task-panel" id="hermes-console">
            <div class="panel-heading"><div><h2>Continue the work</h2></div></div>
            <div class="hermes-scroll-pane">
              <div class="conversation-history">
                <article class="conversation-message role-assistant"><p>${"scans all channels, dedupes, writes grounded replies. ".repeat(40)}</p></article>
              </div>
            </div>
            <form class="composer">
              <div class="quick-continuation-chips"><span class="chips-label">2-word prompts</span><div class="chips-scroll"><button type="button" class="chip-button">keep going</button></div></div>
              <textarea aria-label="Message for Hermes" placeholder="Tell Hermes what to do next…"></textarea>
              <div class="run-output" data-testid="run-output"><p class="eyebrow">Output</p><p>Results show here after you send.</p></div>
              <div class="composer-actions"><button type="submit" class="button button-primary composer-run">Run</button></div>
            </form>
          </section>
        </div>
      </section>
      <nav class="mobile-web-tabs" aria-label="Hermes workspace">
        <a class="is-active" href="#hermes-console"><b>H</b><span>Hermes</span></a>
        <a href="#leash-control"><b>✓</b><span>Leash</span></a>
        <a href="/dashboard/lessons"><b>👍</b><span>Lessons</span></a>
        <a href="#web-settings"><b>≡</b><span>Settings</span></a>
      </nav>
    </main>
  </div>
  <div class="status-foot" data-testid="turn-statusline">Turn Statusline | Engine: Hosted Hermes · SuperGrok (grok-4.5) | TTFT: unmeasured | Cost: $0.00 · included in $10/mo</div>
</div>
</body></html>`;

  const dir = await mkdtemp(join(tmpdir(), "thumbgate-composer-"));
  const file = join(dir, "phone.html");
  await writeFile(file, html);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install|browserType\.launch/i.test(msg)) {
      t.skip("playwright chromium is not installed");
      return;
    }
    throw error;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    const geometry = await page.evaluate(() => {
      const textarea = document.querySelector('textarea[aria-label="Message for Hermes"]');
      const run = document.querySelector(".composer-run");
      const chips = document.querySelector(".quick-continuation-chips");
      const output = document.querySelector('[data-testid="run-output"]');
      const rect = textarea?.getBoundingClientRect();
      const runRect = run?.getBoundingClientRect();
      const midX = rect ? rect.left + rect.width / 2 : 0;
      const midY = rect ? rect.top + rect.height / 2 : 0;
      const hit = document.elementFromPoint(midX, midY);
      return {
        textareaHeight: rect?.height ?? 0,
        textareaTop: rect?.top ?? -1,
        textareaBottom: rect?.bottom ?? -1,
        runHeight: runRect?.height ?? 0,
        runBottom: runRect?.bottom ?? -1,
        chipsDisplay: chips ? getComputedStyle(chips).display : "none",
        outputWidth: output?.getBoundingClientRect().width ?? 0,
        hitIsTextarea: Boolean(hit && (hit === textarea || textarea?.contains(hit))),
        viewportHeight: window.innerHeight,
      };
    });
    assert.ok(geometry.textareaHeight >= 40, `textarea height ${geometry.textareaHeight}`);
    assert.ok(geometry.textareaTop >= 0, `textarea top ${geometry.textareaTop} is off-screen`);
    assert.ok(
      geometry.textareaBottom <= geometry.viewportHeight,
      `textarea bottom ${geometry.textareaBottom} exceeds viewport ${geometry.viewportHeight}`,
    );
    assert.ok(geometry.runHeight >= 36, `Run button height ${geometry.runHeight}`);
    assert.ok(
      geometry.runBottom <= geometry.viewportHeight,
      `Run button bottom ${geometry.runBottom} exceeds viewport`,
    );
    assert.equal(geometry.hitIsTextarea, true, "textarea center is covered by another layer");
    assert.equal(geometry.chipsDisplay, "flex");
    assert.ok(geometry.outputWidth > 0 && geometry.outputWidth <= 390);
  } finally {
    await browser.close();
  }
});
