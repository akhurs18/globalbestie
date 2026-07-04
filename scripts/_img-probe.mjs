// Read-only probe: try to find a real StockX product image for each product by
// constructing model+colorway slugs and GET-checking the CDN (404 = miss).
// Any real colorway of the correct MODEL is acceptable for a generic listing;
// the model name is embedded in the slug, so a hit is always the right product.
import { readFileSync, writeFileSync } from "node:fs";
const todo = JSON.parse(readFileSync("scripts/_img-todo.json", "utf8"));

const ABBR = new Set(["OG","GS","PS","TD","SE","RFID","USA","NYC","UK","AF1","II","III"]);
const STRIP_TAIL = new Set(["sandal","slipper","clog","sneaker","boot","pump","flat","ballet","loafer","sunglasses","wallet","tote","crossbody","bag","satchel","messenger","hobo","sandals"]);

function tc(t){ return ABBR.has(t.toUpperCase()) ? t.toUpperCase() : t.charAt(0).toUpperCase()+t.slice(1).toLowerCase(); }
function modelSlug(title){
  const clean = title.replace(/[''']/g,"").replace(/·.*$/,"").replace(/&/g," ").replace(/[^A-Za-z0-9 -]/g," ").replace(/\s+/g," ").trim();
  let toks = clean.split(/[ -]+/).filter(Boolean);
  if (STRIP_TAIL.has(toks[toks.length-1]?.toLowerCase())) toks = toks.slice(0,-1);
  const cased = toks.map(tc);
  if (cased[0]==="Adidas") cased[0]="adidas";
  return cased.join("-");
}
// Iconic colorway suffixes worth trying for footwear-type models.
const SUFFIXES = ["", "-Black-White", "-White-Black", "-Cloud-White-Core-Black", "-Core-Black",
  "-Triple-Black", "-Triple-White", "-White-Green", "-Black", "-White", "-Black-Gum",
  "-Sail", "-Grey", "-Beige", "-Optical-White", "-Brown-Gum"];
// Per-id known-good slugs (confirmed or from search) — tried first.
const KNOWN = {
  "adidas-samba-og": "adidas-Samba-OG-Cloud-White-Core-Black",
  "adidas-stan-smith": "adidas-Stan-Smith-H-Crystal-White-Collegiate-Green",
  "adidas-superstar": "adidas-Superstar-Cloud-White-Core-Black",
  "vans-old-skool": "Vans-Old-Skool-Black-White",
  "new-balance-550": "New-Balance-550-White-Green",
  "nike-air-force-1-07": "Nike-Air-Force-1-Low-White-07",
  "nike-cortez": "Nike-Cortez-White-Varsity-Red-2022",
};

async function ok(slug){
  const url = `https://images.stockx.com/360/${slug}/Images/${slug}/Lv2/img01.jpg?w=1000&q=90`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (r.ok && (r.headers.get("content-type")||"").startsWith("image/")) {
      const len = Number(r.headers.get("content-length")||0);
      if (len > 5000) return url;
    }
  } catch {}
  return null;
}
async function findFor(p){
  const cands = [];
  if (KNOWN[p.id]) cands.push(KNOWN[p.id]);
  const m = modelSlug(p.title);
  // Only spray colorway suffixes for footwear-ish categories; others just bare.
  const sfx = (p.category === "shoes") ? SUFFIXES : ["", "-Black", "-White"];
  for (const s of sfx) cands.push(m + s);
  for (const slug of [...new Set(cands)]) { const u = await ok(slug); if (u) return { slug, url: u }; }
  return null;
}
// concurrency pool
const results = new Array(todo.length);
let i = 0;
async function worker(){ while(i < todo.length){ const idx=i++; results[idx]=await findFor(todo[idx]); } }
await Promise.all(Array.from({length:10}, worker));

const byCat={}, hits=[], misses=[];
todo.forEach((p,idx)=>{
  (byCat[p.category]??={hit:0,total:0}).total++;
  if(results[idx]){ byCat[p.category].hit++; hits.push({id:p.id,title:p.title,category:p.category,slug:results[idx].slug,url:results[idx].url}); }
  else misses.push({id:p.id,title:p.title,category:p.category});
});
console.log("=== StockX hit-rate by category (construction + suffix spray) ===");
let H=0,T=0;
for(const [c,s] of Object.entries(byCat).sort((a,b)=>b[1].total-a[1].total)){ console.log(`  ${c.padEnd(12)} ${s.hit}/${s.total}`); H+=s.hit; T+=s.total; }
console.log(`  ${"TOTAL".padEnd(12)} ${H}/${T}`);
writeFileSync("scripts/_img-hits.json", JSON.stringify(hits,null,2));
writeFileSync("scripts/_img-misses.json", JSON.stringify(misses,null,2));
console.log(`\nconfirmed hits → scripts/_img-hits.json (${hits.length}) | misses → scripts/_img-misses.json (${misses.length})`);
console.log("shoe hits:"); for(const h of hits.filter(x=>x.category==="shoes")) console.log(`  ${h.id}  →  ${h.slug}`);
