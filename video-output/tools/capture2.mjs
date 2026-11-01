import puppeteer from "puppeteer-core";
const OUT="/Users/uba/projects/landed/video-output/audit";
const BASE="https://landed-production-3dc8.up.railway.app";
const ID="cmvsy80ss005kpp32q56rhdnk";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--disable-dev-shm-usage"]});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto(BASE+"/login",{waitUntil:"networkidle2"});
await p.evaluate(async()=>{await fetch("/api/auth/demo",{method:"POST",credentials:"include"});});
await sleep(800);
await p.goto(BASE+"/app/decisions/"+ID,{waitUntil:"networkidle2"});
await sleep(2500);
await p.screenshot({path:OUT+"/05-decision-card.png"});
console.log("05 ok");
try {
  const click=(t)=>p.evaluate(async(t)=>{
    const els=[...document.querySelectorAll("button")];
    const el=els.find(e=>e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if(el){el.click();return true;} return false;
  },t);
  // Counterfactual tab may be autopsies; check tabs
  console.log("autopsy tab:", await click("Autopsy"));
  await sleep(1200);
  await p.screenshot({path:OUT+"/06-decision-memory.png"});
  await p.evaluate(()=>window.scrollTo({top:800,behavior:"instant"}));
  await sleep(1500);
  await p.screenshot({path:OUT+"/07-decision-autopsy.png"});
  const replay=await click("Learning replay");
  await sleep(1200);
  await p.evaluate(()=>window.scrollTo({top:800,behavior:"instant"}));
  await sleep(1500);
  await p.screenshot({path:OUT+"/07b-decision-replay.png"});
  // Draft lessons
  const drafts=await click("Draft lessons");
  await sleep(1000);
  await p.evaluate(()=>window.scrollTo({top:900,behavior:"instant"}));
  await sleep(1500);
  await p.screenshot({path:OUT+"/07c-decision-drafts.png"});
  // Spend watch section refresh
} catch(e){console.error("step error", e.message);}
// Spend
await p.goto(BASE+"/app/spending",{waitUntil:"networkidle2"});
await sleep(2000);
await p.screenshot({path:OUT+"/08-spend-top.png"});
await p.evaluate(()=>window.scrollTo({top:520,behavior:"instant"}));
await sleep(1500);
await p.screenshot({path:OUT+"/09-spend-alerts.png"});
await p.evaluate(()=>window.scrollTo({top:1200,behavior:"instant"}));
await sleep(1500);
await p.screenshot({path:OUT+"/09b-spend-rules.png"});
// Memory ledger expanded
await p.goto(BASE+"/app/learning",{waitUntil:"networkidle2"});
await sleep(2500);
await p.screenshot({path:OUT+"/10-memory-stats.png"});
await p.evaluate(()=>window.scrollTo({top:900,behavior:"instant"}));
await sleep(1500);
await p.screenshot({path:OUT+"/11-memory-ledger.png"});
await p.evaluate(async()=>{
  const els=[...document.querySelectorAll("button")];
  const el=els.find(e=>e.textContent.includes("A $300 transfer was too aggressive before rent"));
  if(el){el.scrollIntoView({block:"center"});el.click();}
});
await sleep(1600);
await p.evaluate(()=>{
  const el=[...document.querySelectorAll("p")].find(e=>e.textContent.includes("rNfT7QJ2Zfki98qI53lxO79UJSD53liw4W00wKzSh7E"));
  if(el){el.scrollIntoView({block:"center"});}
});
await sleep(800);
await p.screenshot({path:OUT+"/12-memory-lesson-open.png"});
// Walrus verification tab
await p.evaluate(async()=>{
  const el=[...document.querySelectorAll("button")].find(e=>e.textContent.includes("Walrus verification"));
  if(el){el.scrollIntoView({block:"start"});el.click();}
});
await sleep(1800);
await p.screenshot({path:OUT+"/13-walrus-verify.png"});
// Integ settings
await p.goto(BASE+"/app/settings",{waitUntil:"networkidle2"});
await sleep(1500);
await p.evaluate(async()=>{
  const el=[...document.querySelectorAll("button")].find(e=>e.textContent.trim().startsWith("Integrations"));
  if(el){el.click();}
});
await sleep(1800);
await p.screenshot({path:OUT+"/14-integrations.png"});
await p.evaluate(()=>window.scrollTo({top:650,behavior:"instant"}));
await sleep(1500);
await p.screenshot({path:OUT+"/15-integrations-tatum.png"});
await b.close();
console.log("done");
