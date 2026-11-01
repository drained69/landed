const BASE = "https://landed-production-3dc8.up.railway.app";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--disable-dev-shm-usage"]});
const p = await b.newPage();
await p.goto(BASE+"/login",{waitUntil:"networkidle2"});
await p.evaluate(async()=>{await fetch("/api/auth/demo",{method:"POST",credentials:"include"});});
const all = await p.evaluate(async()=>{
  const out=[];
  for(let i=1;i<6;i++){
    const r=await fetch(`/api/decisions?page=${i}`, {credentials:"include"});
    if(!r.ok) break;
    const j=await r.json();
    const arr=j.decisions||j;
    if(!Array.isArray(arr)||!arr.length) break;
    out.push(...arr);
    if(arr.length<20) break;
  }
  return out;
});
console.log("total", all.length);
for(const d of all){
  let rec, base;
  try{ rec=JSON.parse(d.recommendedAction); base=JSON.parse(d.baselineAction); }catch{}
  console.log(d.id, "|", d.decisionType, d.requestedAmountMinor, "| asked:", (d.objective||"").slice(0,60), "| rec", rec?.amountMinor, "base", base?.amountMinor, "| refs", (d.memoryReferences||"[]").length>2, "| created", d.createdAt?.slice(0,10));
}
await b.close();
