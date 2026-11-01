import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "fs";

const OUT = "/Users/uba/projects/landed/video-output/audit";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://landed-production-3dc8.up.railway.app";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--disable-dev-shm-usage", "--no-first-run", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 60000 });

  await page.evaluate(async () => {
    await fetch("/api/auth/demo", { method: "POST", credentials: "include" });
  });
  await sleep(1200);

  // Data grounding for narration numbers
  const data = await page.evaluate(async () => {
    const j = async (u) => (await fetch(u, { credentials: "include" })).json();
    const [dash, mem, verify] = await Promise.all([j("/api/dashboard"), j("/api/memories"), j("/api/memories/verify")]);
    const dec = await j("/api/decisions");
    return { dash, mem, verify, dec };
  });
  writeFileSync(OUT + "/data.json", JSON.stringify(data, null, 2));

  async function shot(name, opts = {}) {
    await sleep(2200);
    await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
    console.log("shot", name);
  }
  async function go(path) {
    await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(1500);
  }
  async function scrollDown(px) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), px);
    await sleep(1500);
  }
  async function clickText(sel, text) {
    const ok = await page.evaluate((s, t) => {
      const els = [...document.querySelectorAll(s)];
      const el = els.find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
      if (el) { el.click(); return true; } return false;
    }, sel, text);
    await sleep(1200);
    return ok;
  }

  // 01 Overview hero
  await go("/app");
  await shot("01-overview");
  await scrollDown(700);
  await shot("02-overview-guards");
  await scrollDown(1500);
  await shot("03-overview-cashflow");

  // 04 Plan filled
  await go("/app/plan");
  const filled = await page.evaluate(() => {
    const el = document.querySelector('input[type="text"],input[number="300"],input');
    return !!el;
  });
  console.log("plan input found:", filled);
  await page.evaluate(() => {
    const el = document.querySelector("input");
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      [undefined, "300"].forEach((v) => {});
      setter.call(el, "300");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await sleep(900);
  await shot("04-plan-form");

  // 05-07 Decision detail
  const ids = data.dec?.decisions?.length ? data.dec.decisions.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)) : [];
  const newest = ids[0]?.id;
  if (newest) {
    await go("/app/decisions/" + newest);
    await shot("05-decision-card");
    await scrollDown(600);
    await shot("06-decision-memory");
    await scrollDown(700);
    await shot("07-decision-autopsy");
  }

  // 08-09 Spend Watch
  await go("/app/spending");
  await shot("08-spend-top");
  await scrollDown(500);
  await shot("09-spend-alerts");

  // 10-13 Memory page
  await go("/app/learning");
  await shot("10-memory-stats");
  await scrollDown(700);
  await shot("11-memory-ledger");
  const opened = await clickText("button", "A single transfer before a large bill");
  console.log("ledger expand:", opened);
  await shot("12-memory-lesson-open");
  await clickText("button", "Walrus verification") && await scrollDown(400);
  await shot("13-walrus-verify");
  await clickText("button", "Track record");
  await shot("14-track-record");

  // 15 Settings integrations
  await go("/app/settings");
  await clickText("button", "Integrations");
  await shot("15-integrations");
  await scrollDown(420);
  await shot("16-integrations-tatum");

  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
