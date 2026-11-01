#!/usr/bin/env node
/*
 LANDED demo deck builder — final version.

 Renders 11 slides (wide 1920x1080 + vertical 1080x1920) using the app's real
 type system and tokens:
   paper #f6f6f4 · ink #0a0b0c · lime #2e7d4f
   Shantell Sans (display) · Hanken Grotesk (body) · JetBrains Mono (labels)
 UI images come from video-output/audit/*.png (captured live from the app).

 File naming = narration keys (01-hook … 11-close) so the assembler maps
 video segments 1:1 to voiceover segments.
*/
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { execFileSync } from "child_process";

const ROOT = "/Users/uba/projects/landed/video-output";
const FONTS = `${ROOT}/assets/fonts`;
const AUDIT = `${ROOT}/audit`;
const WIDE = `${ROOT}/assets/slides`;
const VERT = `${ROOT}/assets/slides-v`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

mkdirSync(WIDE, { recursive: true });
mkdirSync(VERT, { recursive: true });

/* ---------- fonts inlined as data URIs (no file:// CORS risk) ---------- */
const b64 = (p) => readFileSync(p).toString("base64");
const FONT_CSS = [
  ['Hanken Grotesk', 'hanken-grotesk.woff2', '100 900'],
  ['Shantell Sans', 'shantell-sans.woff2', '300 800'],
  ['JetBrains Mono', 'jetbrains-mono.woff2', '100 800'],
].map(([fam, file, w]) =>
  `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(`${FONTS}/${file}`)}) format('woff2');font-weight:${w};font-style:normal;}`
).join("\n");

/* ---------- shared base ---------- */
const BASE_CSS = `${FONT_CSS}
:root{--paper:#f6f6f4;--ink:#0a0b0c;--muted:#5d615e;--lime:#2e7d4f;--panel:#ffffff;--line:rgba(10,11,12,.09);}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{background:var(--paper);color:var(--ink);font-family:'Hanken Grotesk',system-ui;-webkit-font-smoothing:antialiased;}
.slide{position:relative;overflow:hidden;background:var(--paper);}
.noise{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(10,11,12,.033) 1px,transparent 1px),linear-gradient(to bottom,rgba(10,11,12,.033) 1px,transparent 1px);background-size:52px 52px;}
.mono{font-family:'JetBrains Mono',monospace;letter-spacing:.18em;text-transform:uppercase;}
.display{font-family:'Shantell Sans',cursive;font-weight:500;letter-spacing:-.015em;}
.mark{border-radius:9px;}
`;

const LOGO = `<svg viewBox="0 0 32 32" class="mark">
  <rect width="32" height="32" rx="9" fill="#0A0B0C"/>
  <path d="M9 7.5V15.5c0 4.4 3.6 8 8 8h1" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="23.6" cy="23.5" r="2.6" fill="#46C67A"/>
</svg>`;

/* ---------- slide content (numbers grounded in video-output/audit/data.json) ---------- */
const KEYS = ["01-hook","02-problem","03-overview","04-plan","05-answer","06-why","07-spend","08-walrus","09-track","10-onchain","11-close"];


const SLIDES = [
  { key: "01-hook", kind: "title" },
  {
    key: "02-problem", kind: "ui", img: "11b-ledger-failures", pos: "30% 0%",
    eyebrow: "01 · the problem",
    heading: "The app forgets. You pay for it.",
    points: [
      "Quoted a $0.99 fee — charged $14.80 after settlement",
      "Promised 4 hours — delivery took 31",
      "Salary late twice in four months, once after rent",
    ],
    stat: { lab: "the pattern", val: "Quote · send · forget", note: "each confirmed lesson began as a real, recorded outcome" },
  },
  {
    key: "03-overview", kind: "ui", img: "01-overview", pos: "30% 0%",
    eyebrow: "02 · the answer",
    heading: "One honest question.",
    points: [
      "45-day simulation: every bill, every contribution, spending pace",
      "Integer cents — never floating point, never an estimate",
      "Expected income stays excluded until it actually lands",
    ],
    stat: { lab: "safe to move now", val: "$130.00", lime: true, note: "after $1,680.00 protected commitments, $983.78 near-term spending, and a $134.70 buffer" },
  },
  {
    key: "04-plan", kind: "ui", img: "04-plan-form", pos: "30% 0%",
    eyebrow: "03 · plan a move",
    heading: "She asks once.",
    points: [
      "Can I send $300 to my sister today?",
      "Four candidate routes, ranked by what actually lands",
      "Every answer carries its counterfactual",
    ],
    stat: { lab: "requested", val: "$300.00", note: "my sister · USD" },
  },
  {
    key: "05-answer", kind: "ui", img: "05-decision-card", pos: "30% 0%",
    eyebrow: "03 · plan a move",
    heading: "Same request. A wiser answer.",
    points: [
      "No-memory baseline: send all $300 today",
      "With her confirmed lessons: $150 now, the rest after payday",
      "Predicted buffer $150.72 · shortfall risk 8% · confidence 62%",
    ],
    stat: { lab: "recommended", val: "$150.00", lime: true, note: "move $150.00 now, then $150.00 after her paycheck" },
  },
  {
    key: "06-why", kind: "ui", img: "07-decision-autopsy", pos: "30% 72%",
    eyebrow: "04 · why it changed",
    heading: "Every answer shows its counterfactual.",
    points: [
      "Identical input snapshot, with memory removed",
      "Cap a single move at 50% of safe-to-move while rent is near",
      "Prefer the route that actually delivered last time",
    ],
    stat: { lab: "constraints that changed it", val: "2 lessons", note: "each adjustment names the memory that caused it" },
  },
  {
    key: "07-spend", kind: "ui", img: "09-spend-alerts", pos: "30% 0%",
    eyebrow: "05 · your rules",
    heading: "Your alerts. Your limits.",
    points: [
      "Dining is $32 over the $120 limit she set",
      "The streaming bundle charged $21.99 against an approved $18.00",
      "Every alert quotes the memory behind it",
    ],
    stat: { lab: "spend watch", val: "0 alerts without memory", note: "alerts appear only for rules you confirmed" },
  },
  {
    key: "08-walrus", kind: "ui", img: "12-memory-lesson-open", pos: "30% 76%", vp: "43% 0%",
    eyebrow: "06 · walrus memory",
    heading: "Proof you can follow.",
    points: [
      "Confirmed only when the relayer returns a blob ID",
      "Typed rule in JSON, category, decision, timestamp",
      "Restore from Walrus rebuilds it on a fresh device",
    ],
    stat: { lab: "confirmed · mainnet", val: "Blob verified", lime: true, note: "Walrus blob rNfT7QJ2Zfki98qI53lxO79UJSD53liw4W00wKzSh7E" },
  },
  {
    key: "09-track", kind: "ui", img: "10-memory-stats", pos: "30% 0%",
    eyebrow: "07 · track record",
    heading: "Memory that learns.",
    points: [
      "Held lessons gain confidence and act more strongly",
      "Failed lessons lose influence and go to review",
      "After the week-of-Oct-17 miss: 13 lessons learned, 20 in force",
    ],
    stat: { lab: "recorded outcomes", val: "25 confirmed writes", note: "objectives achieved 75% · memory influences 60% of decisions" },
  },
  {
    key: "10-onchain", kind: "ui", img: "14-integrations", pos: "30% 0%",
    eyebrow: "08 · verified, not claimed",
    heading: "Nothing is simulated.",
    points: [
      "Sui Mainnet reads through Tatum",
      "Exchange rates from the Tatum Data API",
      "Unconfigured features read blocked — never fake success",
    ],
    stat: { lab: "sui mainnet · tatum", val: "Checkpoint 340,024,282", note: "RPC reachable · rate API reachable" },
  },
  { key: "11-close", kind: "close" },
];

const WHO_WIDE = "maya chen · synthetic demo";
const WHO_VERT = "maya chen · demo";

/* ---------- html helpers ---------- */
const headerHtml = (who) => `
 <div class="hdr">
  <div class="logo">${LOGO}<span class="word">landed</span></div>
  <div class="who mono">${who}</div>
 </div>`;

const footHtml = (i) => `<div class="foot mono"><span>LANDED · SYNTHETIC DEMO DATA</span><span>${String(i).padStart(2, "0")} / ${SLIDES.length}</span></div>`;

const pointsHtml = (points) =>
  points.map((p) => `<div class="point"><div class="dot"></div><p>${p}</p></div>`).join("");

const statHtml = (stat) => (!stat ? "" : `
 <div class="stat">
  <div class="lab mono">${stat.lab}</div>
  <div class="val${stat.lime ? " lime" : ""}">${stat.val}</div>
  ${stat.note ? `<div class="note">${stat.note}</div>` : ""}
 </div>`);

/* ---------- wide layout ---------- */
const WIDE_CSS = `${BASE_CSS}
.slide{width:1920px;height:1080px;}
.hdr{position:absolute;top:0;left:56px;right:56px;display:flex;align-items:center;justify-content:space-between;padding-top:42px;}
.logo{display:flex;align-items:center;gap:12px;}
.mark{width:34px;height:34px;}
.word{font-weight:600;font-size:23px;letter-spacing:-.03em;color:var(--ink);}
.who{font-size:12.5px;color:var(--muted);}
.frame{position:absolute;top:128px;bottom:94px;left:56px;right:56px;display:flex;gap:46px;}
.stage{width:1204px;flex:0 0 auto;border-radius:20px;overflow:hidden;border:1px solid var(--line);box-shadow:0 2px 6px rgba(10,11,12,.05),0 34px 90px -34px rgba(10,11,12,.30);background:#fff;height:100%;}
.stage img{display:block;width:100%;height:100%;object-fit:cover;}
.caption{flex:1;min-width:0;padding-top:8px;}
.eyebrow{font-size:12.5px;color:var(--lime);}
h2{font-family:'Shantell Sans',cursive;font-weight:500;letter-spacing:-.015em;font-size:46px;line-height:1.12;margin-top:14px;}
.points{margin-top:24px;display:flex;flex-direction:column;gap:15px;}
.point{display:flex;gap:13px;align-items:flex-start;}
.dot{width:7px;height:7px;border-radius:99px;background:var(--lime);margin-top:11px;flex:0 0 auto;}
.point p{font-size:20px;line-height:1.5;color:var(--ink);}
.stat{margin-top:26px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:0 1px 2px rgba(10,11,12,.04),0 20px 46px -30px rgba(10,11,12,.24);}
.stat .lab{font-size:11.5px;color:var(--muted);}
.stat .val{font-weight:700;font-size:38px;letter-spacing:-.02em;margin-top:6px;}
.stat .val.lime{color:var(--lime);}
.stat .note{font-size:15px;color:var(--muted);margin-top:6px;line-height:1.45;}
.foot{position:absolute;bottom:32px;left:56px;right:56px;display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 140px;}
.center .eyebrow{font-size:13px;color:var(--lime);}
.center h1{font-family:'Shantell Sans',cursive;font-weight:500;letter-spacing:-.02em;font-size:94px;line-height:1.06;margin-top:24px;}
.center .sub{font-size:24px;color:var(--muted);margin-top:20px;}
.cards{display:flex;gap:26px;margin-top:54px;}
.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:28px 34px;text-align:left;min-width:360px;box-shadow:0 2px 6px rgba(10,11,12,.05),0 26px 70px -34px rgba(10,11,12,.30);}
.card .lab{font-size:12px;color:var(--muted);}
.card .val{font-weight:700;font-size:52px;letter-spacing:-.02em;margin-top:8px;}
.card .val.lime{color:var(--lime);}
.card .note{font-size:16px;color:var(--muted);margin-top:8px;line-height:1.5;}
`;

/* ---------- vertical layout ---------- */
const VERT_CSS = `${BASE_CSS}
.slide{width:1080px;height:1920px;}
.hdr{position:absolute;top:36px;left:44px;right:44px;display:flex;flex-direction:column;align-items:flex-start;gap:14px;}
.logo{display:flex;align-items:center;gap:12px;}
.mark{width:40px;height:40px;}
.word{font-weight:600;font-size:26px;letter-spacing:-.03em;color:var(--ink);}
.who{font-size:13px;color:var(--muted);}
.stack{position:absolute;top:216px;left:44px;right:44px;bottom:838px;display:flex;flex-direction:column;justify-content:center;min-height:0;}
.eyebrow{font-size:15px;color:var(--lime);}
.stack h2{font-family:'Shantell Sans',cursive;font-weight:500;letter-spacing:-.015em;font-size:72px;line-height:1.08;margin-top:18px;}
.points{margin-top:26px;display:flex;flex-direction:column;gap:16px;}
.point{display:flex;gap:15px;align-items:flex-start;}
.dot{width:9px;height:9px;border-radius:99px;background:var(--lime);margin-top:16px;flex:0 0 auto;}
.point p{font-size:27px;line-height:1.42;color:var(--ink);}
.stat{margin-top:30px;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:24px 28px;flex:0 0 auto;}
.stat .lab{font-size:13.5px;color:var(--muted);}
.stat .val{font-weight:700;font-size:54px;letter-spacing:-.02em;margin-top:6px;}
.stat .val.lime{color:var(--lime);}
.stat .note{font-size:20px;color:var(--muted);margin-top:6px;line-height:1.42;}
.stage{margin-top:22px;flex:1 1 auto;min-height:0;border-radius:20px;overflow:hidden;border:1px solid var(--line);box-shadow:0 2px 6px rgba(10,11,12,.05),0 34px 90px -34px rgba(10,11,12,.30);background:#fff;}
.stage img{display:block;width:100%;height:100%;object-fit:cover;}
.stage-v{position:absolute;left:0;right:0;bottom:0;height:804px;background:#fff;border-top:1px solid var(--line);overflow:hidden;}
.stage-v img{display:block;width:100%;height:100%;object-fit:cover;}
.foot{position:absolute;bottom:26px;left:44px;right:44px;display:flex;justify-content:space-between;font-size:13px;color:var(--muted);}
.chipv{position:absolute;top:16px;right:16px;background:rgba(246,246,244,.94);border:1px solid var(--line);border-radius:999px;padding:9px 16px;font-size:12px;color:var(--muted);}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 80px;}
.center .eyebrow{font-size:15px;color:var(--lime);}
.center h1{font-family:'Shantell Sans',cursive;font-weight:500;letter-spacing:-.02em;font-size:82px;line-height:1.07;margin-top:24px;}
.center .sub{font-size:26px;color:var(--muted);margin-top:18px;}
.cards{display:flex;flex-direction:column;gap:22px;margin-top:52px;width:100%;}
.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px 30px;text-align:left;}
.card .lab{font-size:13px;color:var(--muted);}
.card .val{font-weight:700;font-size:50px;letter-spacing:-.02em;margin-top:8px;}
.card .val.lime{color:var(--lime);}
.card .note{font-size:18px;color:var(--muted);margin-top:8px;line-height:1.5;}
`;

const page = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="slide"><div class="noise"></div>${body}</div></body></html>`;

/* ---------- per-slide bodies ---------- */
function wideBody(s, i) {
  if (s.kind === "title") return `${headerHtml(WHO_WIDE)}${footHtml(i)}
 <div class="center">
   <div class="eyebrow mono">money that remembers</div>
   <h1 class="display">A balance isn’t the whole story.</h1>
   <p class="sub">Maya wants to send money to her sister.</p>
   <div class="cards">
     <div class="card"><div class="lab mono">cleared balance</div><div class="val">$5,024.50</div><div class="note">what the app shows first</div></div>
     <div class="card"><div class="lab mono">safe to move now</div><div class="val lime">$130.00</div><div class="note">after rent &amp; internet, groceries this week, and the $134.70 cushion she protects</div></div>
   </div>
 </div>`;
  if (s.kind === "close") return `${headerHtml(WHO_WIDE)}${footHtml(i)}
 <div class="center">
   <div class="eyebrow mono">try the demo</div>
   <h1 class="display">Money that remembers<span style="color:var(--lime);">.</span></h1>
   <p class="sub">Advice that shows its evidence. Memory you can verify.</p>
   <div class="cards">
     <div class="card" style="min-width:680px;"><div class="lab mono">landed · demo</div><div class="val" style="font-size:38px;">landed-production-3dc8.up.railway.app</div><div class="note">demo button on the landing page · or create your own account</div></div>
   </div>
   <div class="tail mono" style="margin-top:48px;font-size:12px;color:var(--muted);">demo data is synthetic · integrations show blocked rather than fake success</div>
 </div>`;
  return `${headerHtml(WHO_WIDE)}${footHtml(i)}
 <div class="frame">
  <div class="stage"><img src="file://${AUDIT}/${s.img}.png" style="object-position:${s.pos};"></div>
  <div class="caption">
   <div class="eyebrow mono">${s.eyebrow}</div>
   <h2 class="display">${s.heading}</h2>
   <div class="points">${pointsHtml(s.points)}</div>
   ${statHtml(s.stat)}
  </div>
 </div>`;
}

function vertBody(s, i) {
  if (s.kind === "title") return `${headerHtml(WHO_VERT)}
 <div class="center">
   <div class="eyebrow mono">money that remembers</div>
   <h1 class="display">A balance isn’t<br>the whole story.</h1>
   <p class="sub">Maya wants to send money to her sister.</p>
   <div class="cards">
     <div class="card"><div class="lab mono">cleared balance</div><div class="val">$5,024.50</div><div class="note">what the app shows first</div></div>
     <div class="card"><div class="lab mono">safe to move now</div><div class="val lime">$130.00</div><div class="note">after rent &amp; internet, groceries this week, and the $134.70 cushion she protects</div></div>
   </div>
 </div>${footHtml(i)}`;
  if (s.kind === "close") return `${headerHtml(WHO_VERT)}
 <div class="center">
   <div class="eyebrow mono">try the demo</div>
   <h1 class="display">Money that<br>remembers<span style="color:var(--lime);">.</span></h1>
   <p class="sub">Advice that shows its evidence.<br>Memory you can verify.</p>
   <div class="cards">
     <div class="card"><div class="lab mono">landed · demo</div><div class="val" style="font-size:30px;word-break:break-all;">landed-production-3dc8.up.railway.app</div><div class="note">demo button on the landing page · or create your own account</div></div>
   </div>
   <div class="tail mono" style="margin-top:40px;font-size:13px;color:var(--muted);">demo data is synthetic</div>
 </div>${footHtml(i)}`;
  return `${headerHtml(WHO_VERT)}
 <div class="stack">
  <div class="eyebrow mono">${s.eyebrow}</div>
  <h2 class="display">${s.heading}</h2>
  <div class="points">${pointsHtml(s.points)}</div>
  ${statHtml(s.stat)}
 </div>
 <div class="stage-v"><img src="file://${AUDIT}/${s.img}-v.png"><div class="chipv mono">landed · synthetic demo data · ${String(i).padStart(2, "0")}/${SLIDES.length}</div></div>`;
}

/* ---------- build + render ---------- */
const manifest = [];
for (let i = 0; i < SLIDES.length; i++) {
  const s = SLIDES[i];
  writeFileSync(`${WIDE}/${s.key}.html`, page(WIDE_CSS, wideBody(s, i + 1)));
  writeFileSync(`${VERT}/${s.key}.html`, page(VERT_CSS, vertBody(s, i + 1)));
  manifest.push({ key: s.key, wide: `${WIDE}/${s.key}.png`, vert: `${VERT}/${s.key}.png` });
}
writeFileSync(`${ROOT}/assets/deck-manifest.json`, JSON.stringify(manifest, null, 1));

const VARIANTS = [
  { dir: WIDE, w: 1920, h: 1080 },
  { dir: VERT, w: 1080, h: 1920 },
];
for (const v of VARIANTS) {
  for (const s of SLIDES) {
    const html = `${v.dir}/${s.key}.html`;
    const png = `${v.dir}/${s.key}.png`;
    try {
      execFileSync(CHROME, [
        "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=2",
        `--window-size=${v.w},${v.h}`,
        "--virtual-time-budget=12000",
        `--screenshot=${png}`,
        `file://${html}`,
      ], { stdio: "pipe", timeout: 45000 });
      console.log("rendered", v === WIDE ? "wide" : "vert", s.key);
    } catch (e) {
      console.error("FAILED", v === WIDE ? "wide" : "vert", s.key, String(e.stderr || e.message).slice(0, 300));
      process.exitCode = 1;
    }
  }
}
console.log("deck done:", SLIDES.length, "slides x2");
