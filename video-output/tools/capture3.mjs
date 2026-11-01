import puppeteer from "puppeteer-core";
const OUT = "/Users/uba/projects/landed/video-output/audit";
const BASE = "https://landed-production-3dc8.up.railway.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoRetry(p, url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      return;
    } catch (e) {
      console.log("goto retry", i, e.message.split("\n")[0]);
      await sleep(2000);
      if (i === tries - 1) throw e;
    }
  }
}

const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--disable-dev-shm-usage"],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await gotoRetry(p, BASE + "/login");
await p.evaluate(async () => { await fetch("/api/auth/demo", { method: "POST", credentials: "include" }); });
await sleep(1000);
await gotoRetry(p, BASE + "/app/learning");
await sleep(2500);

const titles = await p.evaluate(() => {
  const els = [...document.querySelectorAll("button, [role=button], div, p")].filter(
    (e) => e.textContent && e.textContent.length < 200 && /fee|aggressive|late|delivery|salary|charge|over|double/i.test(e.textContent)
  );
  return [...new Set(els.map((e) => e.textContent.trim().replace(/\s+/g, " ")))].slice(0, 50);
});
console.log(JSON.stringify(titles, null, 1));

const ok = await p.evaluate(() => {
  const el = [...document.querySelectorAll("button, div")].find((e) =>
    e.textContent.includes("too aggressive before rent") && e.textContent.length < 160
  );
  if (el) { el.scrollIntoView({ block: "center" }); return true; }
  return false;
});
await sleep(1600);
console.log("centered:", ok);
await p.screenshot({ path: OUT + "/11b-ledger-failures.png" });
console.log("saved 11b-ledger-failures.png");
await b.close();
