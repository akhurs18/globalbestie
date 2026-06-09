// Rendered-app guardrails — the layout safety net we wished we had two days
// ago. Loads dist/index.html and dist/portal.html in a real browser at three
// viewport widths and asserts invariants that would deterministically catch
// the bugs that kept slipping through:
//
//   1. The "one letter per line" hero — H1 ballooning to many times its
//      font-size because a higher-specificity desktop rule squeezed its
//      column on mobile.
//   2. Horizontal scroll — any element wider than the viewport.
//   3. Touch targets under 40×40px — fails the WCAG / Apple HIG threshold.
//   4. Pale-on-pale banners — the FX / demo banners that had ~1.3:1
//      contrast and read as broken to operators.
//   5. White text on a white surface — the cream-on-cream bugs we hunted
//      down across the portal during the dark→light migration.
//
// Runs in Netlify CI right after `check-static-app.mjs`. If any assertion
// fails, the deploy is blocked. The whole thing is ~1.5 min on a cold
// Netlify build (browser download cached after the first run) and runs
// locally in ~10s.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(__dirname, "..", "dist");

// ── Tiny static server — only used while assertions run ──────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
};

function startServer(root) {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const filePath = join(root, urlPath);
        if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
        try {
          const data = await readFile(filePath);
          res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
          res.end(data);
        } catch {
          // No SPA fallback — we want 404s to surface, not be papered over.
          res.writeHead(404); res.end("not found");
        }
      } catch (err) {
        res.writeHead(500); res.end(String(err));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveServer({ server, port });
    });
  });
}

// ── Assertions ───────────────────────────────────────────────────────────
// Each runs inside the page via page.evaluate() so it sees real computed
// layout/styles. Returns an array of failure messages (empty = pass).
const PAGE_ASSERTIONS = `(() => {
  const fails = [];
  const vw = window.innerWidth;

  // 1. Horizontal scroll. We check the USER-VISIBLE outcome (can the user
  //    actually scroll the page sideways?) rather than raw scrollWidth,
  //    so a deliberate overflow-x clip on body or html — a legit
  //    defensive fix for overflowing children — is not flagged as a bug.
  //    2px slack absorbs sub-pixel rounding.
  const htmlOv = getComputedStyle(document.documentElement).overflowX;
  const bodyOv = getComputedStyle(document.body).overflowX;
  const horizontallyClipped = ["hidden", "clip"].includes(htmlOv) || ["hidden", "clip"].includes(bodyOv);
  if (!horizontallyClipped && document.documentElement.scrollWidth > vw + 2) {
    fails.push("HSCROLL: documentElement.scrollWidth=" + document.documentElement.scrollWidth + " > viewport " + vw + " (no overflow-x: clip on html/body)");
  }

  // 2. Catastrophic H1 wrapping — the one-letter-per-line catastrophe.
  document.querySelectorAll("h1").forEach((h, i) => {
    if (h.offsetParent === null) return; // hidden
    const fs = parseFloat(getComputedStyle(h).fontSize) || 16;
    const h1H = h.getBoundingClientRect().height;
    if (h1H > fs * 4.5) {
      fails.push("H1_WRAP[" + i + "]: \\"" + h.textContent.trim().slice(0, 30) + "\\" rendered " + Math.round(h1H) + "px tall vs font " + Math.round(fs) + "px (>" + Math.round(fs*4.5) + " threshold)");
    }
  });

  // 3. Element overflow — any single element wider than viewport that ISN'T
  //    intentionally inside an overflow:hidden parent (e.g. the marquee).
  function inOverflowHidden(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const ov = cs.overflowX;
      if (ov === "hidden" || ov === "clip" || ov === "scroll" || ov === "auto") return true;
      // Marquee strips use mask-image instead of overflow:hidden — the
      // mask clips visually, so the wide track isn't really overflowing
      // the viewport even though its bounding rect is huge.
      if ((cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none")) return true;
    }
    return false;
  }
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= vw + 2 || r.height === 0) return;
    if (inOverflowHidden(el)) return;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "absolute") return; // overlays handled elsewhere
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === "string" ? el.className.split(" ")[0] : "") || "";
    fails.push("OVERFLOW: <" + tag + (cls ? "." + cls : "") + "> w=" + Math.round(r.width) + " > viewport " + vw);
  });

  // 4. Touch targets — WCAG / Apple HIG require 44×44pt on touch surfaces.
  //    We only enforce this at mobile viewports (<768px); desktop runs
  //    against a mouse where 36px nav links are fine. We exclude:
  //      - .skip-link (positioned off-screen until focused; a11y chrome)
  //      - inline links inside body copy (inherit line-height, not tap targets)
  //      - main-nav links inside the site header (desktop chrome that
  //        becomes a separate mobile-action-bar on touch viewports)
  if (vw < 768) {
    const interactives = document.querySelectorAll("a, button, input:not([type='hidden']), select, [role='button']");
    let tinyCount = 0;
    const tinySamples = [];
    interactives.forEach((el) => {
      if (el.closest(".skip-link, .main-nav, .footer-col, .footer-base")) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width >= 40 && r.height >= 40) return;
      const inText = el.matches("p a, p button, span a, small a, dt a, dd a, li a, td a, label > input");
      if (inText) return;
      tinyCount += 1;
      if (tinySamples.length < 4) {
        const tag = el.tagName.toLowerCase();
        tinySamples.push(tag + " \\"" + el.textContent.trim().slice(0, 20) + "\\" " + Math.round(r.width) + "x" + Math.round(r.height));
      }
    });
    if (tinyCount > 0) {
      fails.push("TOUCH: " + tinyCount + " interactive el(s) < 40x40 at mobile — e.g. " + tinySamples.join("; "));
    }
  }

  // 5. Contrast spot-check on the elements that historically broke. We don't
  //    walk the whole DOM (false positives explode); we focus on alert/
  //    warning banners + KPI values + status pills.
  function rgbParse(str) {
    const m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] == null ? 1 : parts[3] };
  }
  function relLuminance({ r, g, b }) {
    const c = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(fg, bg) {
    const a = relLuminance(fg) + 0.05;
    const b = relLuminance(bg) + 0.05;
    return a > b ? a / b : b / a;
  }
  function effectiveBg(el) {
    // Walk up until we find a non-transparent background.
    for (let cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
      const bg = rgbParse(getComputedStyle(cur).backgroundColor);
      if (bg && bg.a > 0.05) return bg;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  // Reveal every SPA view so labels in inactive views (checkout, quote, track,
  // size-guide, returns…) are measurable for the contrast probe. Safe here:
  // this runs AFTER the hero/overflow/touch checks above, so it can't create
  // layout false-positives for them, and the page is discarded after.
  document.querySelectorAll(".view").forEach((v) => { v.style.display = "block"; });

  // Probe set: alert/warning banners + KPI values + status pills (the
  // historically-broken elements) PLUS form labels/legends. A 1.18:1 label
  // bug shipped on the checkout because labels weren't probed — they're real,
  // must-read text, so they belong here. We still avoid a full-DOM walk
  // (false positives explode on decorative/muted spans).
  const probes = document.querySelectorAll(
    ".demo-data-banner, .fx-stale-banner, .toast, .banner, [role='alert'], .attention-row, .status-pill, .kpi-value, .kpi-label, label, legend"
  );
  let lowCount = 0;
  const lowSamples = [];
  probes.forEach((el) => {
    // For form labels the text node is often a direct child alongside an
    // <input>; only judge elements that actually render their own text.
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText && !el.matches(".status-pill, .kpi-value, .kpi-label, [role='alert']")) return;
    if (!el.textContent.trim()) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return;
    const fg = rgbParse(cs.color);
    if (!fg || fg.a < 0.05) return;
    const bg = effectiveBg(el);
    const ratio = contrast(fg, bg);
    // WCAG large-text exemption: >=24px, or >=18.66px when bold, needs only
    // 3:1. Everything else needs 4.5:1.
    const px = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const threshold = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    if (ratio < threshold) {
      lowCount += 1;
      if (lowSamples.length < 4) {
        const name = (el.className && typeof el.className === "string" ? el.className : el.tagName).split(" ")[0];
        lowSamples.push(name + " \\"" + el.textContent.trim().slice(0, 16) + "\\" " + ratio.toFixed(2) + ":1");
      }
    }
  });
  if (lowCount > 0) {
    fails.push("CONTRAST: " + lowCount + " text element(s) below WCAG AA — e.g. " + lowSamples.join("; "));
  }

  return fails;
})()`;

// ── Driver ───────────────────────────────────────────────────────────────
const VIEWPORTS = [
  { name: "mobile",  width: 375,  height: 812 },
  { name: "tablet",  width: 768,  height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

// Portal needs the admin gate unlocked. We can't enter the real password
// during build, but the portal in offline-preview mode unlocks if either
// localStorage flag is set — same trick the preview tool uses.
const PAGES = [
  { name: "storefront", path: "/index.html",  unlock: null },
  {
    name: "portal", path: "/portal.html",
    unlock: `try { localStorage.setItem('gb_admin_token','build-check'); localStorage.setItem('mm_admin_token','build-check'); } catch(e){}`,
  },
];

async function run() {
  // Confirm dist/ exists. We rely on check-static-app.mjs running first.
  try { await stat(join(distRoot, "index.html")); }
  catch { console.error("[render-check] dist/ not built. Run check-static-app first."); exit(1); }

  // Dynamic-import playwright so a missing dep gives a clear message and a
  // local skip rather than a stack trace on hobby checkouts.
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    const skipFlag = argv.includes("--allow-skip");
    const msg = "[render-check] playwright not installed. " +
      (skipFlag ? "Skipping (--allow-skip)." : "Install with `npm i -D playwright && npx playwright install chromium`.");
    console.error(msg);
    exit(skipFlag ? 0 : 1);
  }

  const { server, port } = await startServer(distRoot);
  const base = `http://127.0.0.1:${port}`;
  console.log(`[render-check] dist/ served at ${base}`);

  const browser = await chromium.launch();
  let totalFails = 0;
  const results = [];

  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      if (pg.unlock) {
        // Set localStorage on the right origin first.
        await page.goto(`${base}/`);
        await page.evaluate(pg.unlock);
      }
      await page.goto(`${base}${pg.path}`, { waitUntil: "networkidle" });
      // Give late renders (count-up, IntersectionObserver) a beat to settle.
      await page.waitForTimeout(400);
      const fails = await page.evaluate(PAGE_ASSERTIONS);
      const label = `${pg.name} @ ${vp.name} (${vp.width}×${vp.height})`;
      if (fails.length) {
        totalFails += fails.length;
        results.push({ label, fails });
        console.error(`\n❌ ${label} — ${fails.length} failure${fails.length === 1 ? "" : "s"}:`);
        for (const f of fails) console.error("   • " + f);
      } else {
        console.log(`✓  ${label}`);
      }
      await ctx.close();
    }
  }

  await browser.close();
  server.close();

  if (totalFails > 0) {
    console.error(`\n[render-check] BLOCKED: ${totalFails} layout assertion failure${totalFails === 1 ? "" : "s"} across ${results.length} surface(s). Fix before deploy.`);
    exit(1);
  }
  console.log(`\n[render-check] ✓ all ${VIEWPORTS.length * PAGES.length} surface×viewport combinations pass.`);
}

run().catch((err) => {
  console.error("[render-check] runner error:", err);
  exit(1);
});
