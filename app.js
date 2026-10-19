(function(){
const CATS = [
  {k:"Flights", c:"--c1"},{k:"Accommodation", c:"--c2"},{k:"Food", c:"--c3"},
  {k:"Local transport", c:"--c4"},{k:"Activities", c:"--c5"},{k:"Insurance & admin", c:"--c6"}
];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const gbp = (n,dp) => { const d = dp ?? (Math.abs(n%1)>0.001 ? 2 : 0); return (n<0?"−":"")+"£"+Math.abs(n).toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d}); };
const sum = (a,f) => a.reduce((t,x)=>t+(f(x)||0),0);
const D = iso => new Date(iso+"T00:00:00");
const fmtD = (iso,o={day:"numeric",month:"short"}) => D(iso).toLocaleDateString("en-GB",o);
const addD = (iso,n) => { const d=D(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const short = w => String(w||"").split(" – ")[0].split(" · ")[0].split(" (")[0];
const code = s => (String(s||"").match(/\b[A-Z]{3}\b/)||[""])[0];
const now = new Date(); const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
const $ = id => document.getElementById(id);

// ---------- tabs
const TABS = ["overview","food","stays","flights","budget"];
function showTab(t, focus){
  if(!TABS.includes(t)) t = "overview";
  document.querySelectorAll(".tab").forEach(b=>{ const on=b.dataset.tab===t; b.setAttribute("aria-selected",on); b.tabIndex = on?0:-1; if(on&&focus) b.focus(); });
  TABS.forEach(x=>$("p-"+x).hidden = x!==t);
  currentTab = t; try{ localStorage.setItem("sabbatical-tab",t); }catch(e){} try{ history.replaceState(null,"","#"+t); }catch(e){}
  if (t==="food" && MODEL) renderFood(MODEL);
}
document.querySelector(".tabs").addEventListener("click",e=>{ const b=e.target.closest(".tab"); if(b) showTab(b.dataset.tab); });
document.querySelector(".tabs").addEventListener("keydown",e=>{
  if(!["ArrowRight","ArrowLeft"].includes(e.key)) return;
  const cur = TABS.indexOf(document.querySelector('.tab[aria-selected="true"]').dataset.tab);
  showTab(TABS[(cur + (e.key==="ArrowRight"?1:TABS.length-1)) % TABS.length], true); e.preventDefault();
});

// ---------- model
function build(doc){
  const d = doc.data;
  const stops = d.stops.map(s=>{
    const st = s.hotel?.status || "To book";
    const cls = st==="Booked" ? "booked" : /friend|host/i.test(st) ? "host" : "todo";
    const acc=s.nights*s.accN, food=s.nights*s.foodD;
    const notes = [s.hotel?.notes, s.note].filter(Boolean).join(" ");
    let meal = cls==="host" ? "With friends" : /incl\.? (meals|dinner)|meals incl/i.test(s.hotel?.notes||"") ? "Meals incl." : "";
    if (s.nights===1 && s.start===d.stops[0].start) meal = meal || "Land late";
    const cur = s.country==="Malaysia & Singapore" && /singapore/i.test(s.where) ? ["MYR","SGD"] : (COUNTRY_CUR[s.country]||[]);
    return {...s, st, cls, acc, food, total:acc+food+s.trans+s.act, meal, cur};
  });
  const flights = d.flights.map(f=>({...f, booked:/^booked$/i.test(f.status||"")}));
  const groups=[]; stops.forEach(s=>{ const g=groups[groups.length-1]; if(g&&g.country===s.country){g.nights+=s.nights;g.total+=s.total;g.food+=s.food;g.stops.push(s);} else groups.push({country:s.country,start:s.start,nights:s.nights,total:s.total,food:s.food,stops:[s]}); });
  const planned = {
    "Flights": sum(flights,f=>f.cost), "Accommodation": sum(stops,s=>s.acc), "Food": sum(stops,s=>s.food),
    "Local transport": sum(stops,s=>s.trans), "Activities": sum(stops,s=>s.act), "Insurance & admin": sum(d.admin,a=>a.amt)
  };
  const committed={}; CATS.forEach(c=>committed[c.k]=sum(d.spend.filter(s=>s.cat===c.k),s=>s.amt));
  const other = sum(d.spend.filter(s=>!CATS.some(c=>c.k===s.cat)),s=>s.amt);
  const totalPlan = sum(CATS,c=>planned[c.k]);
  const totalCommitted = sum(d.spend,s=>s.amt);
  const nights = sum(stops,s=>s.nights);
  return {doc, d, budget:d.budget, stops, flights, groups, planned, committed, other, totalPlan, totalCommitted,
    buffer:d.budget-totalPlan, nights, ground:sum(stops,s=>s.total)};
}

// ---------- render
let MODEL = null;
function render(M){
  MODEL = M;
  renderHeader(M); renderOverview(M); renderStays(M); renderFlights(M); renderBudget(M);
  if (!$("p-food").hidden) renderFood(M);
}

function renderHeader(M){
  $("subtitle").textContent = M.d.tripSubtitle || "";
  const f0 = M.flights[0], fl = M.flights[M.flights.length-1];
  const depart = f0 ? D(f0.date) : today, home = fl ? D(fl.date) : today;
  const dd = Math.round((depart - today)/864e5);
  if (dd > 0) { $("cd-num").textContent = dd; $("cd-lbl").textContent = (dd===1?"day":"days")+` until ${code(f0.from)} → ${code(M.flights[1]?.to||f0.to)}`; }
  else if (today <= home) { const day = Math.round((today-depart)/864e5)+1; $("cd-num").textContent = "Day "+day; $("cd-lbl").textContent = `of ${Math.round((home-depart)/864e5)+1} on the road`; }
  else { $("cd-num").textContent = "Home"; $("cd-lbl").textContent = "Welcome back"; }
  // route: destination codes, skipping same-day transit hubs
  const codes=[code(f0?.from)];
  M.flights.forEach((f,i)=>{ const n=M.flights[i+1]; const to=code(f.to); if(n && code(n.from)===to && n.date===f.date) return; if(n && code(n.from)===to && (D(n.date)-D(f.date))/864e5<=1 && f.booking===n.booking) return; codes.push(to); });
  $("route").innerHTML = codes.filter(Boolean).map((c,i,a)=>`<span class="code${c==="LHR"?" home":""}">${c}</span>`+(i<a.length-1?'<span class="arr">→</span>':"")).join("");
  $("tab-overview").innerHTML = "Overview" + (M.buffer<0 ? '<span class="badge">Over</span>' : "");
}

function renderOverview(M){
  const B=M.budget, v=$("verdict");
  if (M.buffer < 0) {
    v.className="verdict";
    v.innerHTML = `<div class="icon" aria-hidden="true">!</div><div><strong>The plan is ${gbp(-M.buffer)} over budget</strong><p>Estimates add up to ${gbp(M.totalPlan)} against your ${gbp(B)} budget, with no contingency left. Trimming about ${gbp(Math.ceil((-M.buffer+200)/10)*10,0)} gets you back to a £200 cushion.</p></div>`;
  } else {
    v.className = "verdict ok";
    v.innerHTML = `<div class="icon" aria-hidden="true">✓</div><div><strong>The plan fits with a ${gbp(M.buffer)} buffer</strong><p>Estimates add up to ${gbp(M.totalPlan)} against your ${gbp(B)} budget.${M.buffer<200?" That's under the £200 cushion your spreadsheet asks for.":""}</p></div>`;
  }
  const k = [
    {l:"Total budget",v:gbp(B),n:`${M.nights} nights · ${M.groups.length} legs`},
    {l:"Planned spend",v:gbp(Math.round(M.totalPlan),0),n:M.buffer<0?`${gbp(-M.buffer)} over budget`:`${gbp(M.buffer)} under budget`,cls:M.buffer<0?"crit":""},
    {l:"Committed so far",v:gbp(M.totalCommitted),n:`${Math.round(M.totalCommitted/B*100)}% of budget · ${M.d.spend.length} payments`},
    {l:"Left in the pot",v:gbp(B-M.totalCommitted),n:`Plan still needs ${gbp(M.totalPlan-M.totalCommitted)}`}
  ];
  $("kpis").innerHTML = k.map(x=>`<div class="kpi ${x.cls||""}"><div class="eyebrow">${x.l}</div><div class="v">${x.v}</div><div class="n">${x.n}</div></div>`).join("");

  // next up: urgent flights to book, then open checklist items
  const items = [];
  M.flights.filter(f=>!f.booked && /this week|now|asap/i.test(f.by||"")).forEach(f=>items.push([`Book ${code(f.from)} → ${code(f.to)} flight (${fmtD(f.date)})`, f.by, true]));
  M.d.todo.filter(t=>!t.done).forEach(t=>items.push([t.task, t.due||"", /this week|asap|today/i.test(t.due||"")]));
  const shown = items.slice(0,8);
  $("todo").innerHTML = shown.length ? shown.map(([t,w,u])=>`<li><span>${esc(t)}</span><span class="when chip ${u?"urgent":"todo"}">${esc(w)}</span></li>`).join("") + (items.length>8?`<li class="note">+ ${items.length-8} more on the checklist tab of your spreadsheet</li>`:"") : `<li class="note">Nothing open. Everything on your checklist is ticked.</li>`;

  // booking progress
  const bookable = M.stops.filter(s=>s.cls!=="host"), sb = bookable.filter(s=>s.cls==="booked");
  const fb = M.flights.filter(f=>f.booked);
  const accLeft = sum(bookable.filter(s=>s.cls!=="booked"),s=>s.acc), fLeft = sum(M.flights.filter(f=>!f.booked),f=>f.cost);
  const row = (label, done, total, n, color) => `<div class="prog-row"><div class="top"><b>${label}</b><span>${done} of ${total}</span></div><div class="meter" role="img" aria-label="${done} of ${total}"><div style="width:${total?done/total*100:0}%;background:var(${color})"></div></div><div class="n">${n}</div></div>`;
  const nextStay = bookable.find(s=>s.cls!=="booked");
  $("prog").innerHTML =
    row("Stays booked", sb.length, bookable.length, `${gbp(accLeft)} of accommodation still to book${nextStay?` · next: ${esc(short(nextStay.where))} from ${fmtD(nextStay.start)}`:""}`, "--c2") +
    row("Flights booked", fb.length, M.flights.length, `${gbp(fLeft)} of flights still to book`, "--c1") +
    row("Budget committed", Math.round(M.totalCommitted), Math.round(M.totalPlan), `${gbp(M.totalCommitted)} paid or booked of the ${gbp(Math.round(M.totalPlan),0)} plan`, "--accent").replace(/(\d+) of (\d+)<\/span>/, `${Math.round(M.totalCommitted/M.totalPlan*100)}%</span>`);
}

// ---------- food
const DEFAULT_RATES = {KRW:1790, JPY:208, VND:34430, THB:44.4, MYR:5.4, SGD:1.69, TWD:42.1};
const CUR = {KRW:{sym:"₩",step:500},JPY:{sym:"¥",step:100},VND:{sym:"₫",step:5000},THB:{sym:"฿",step:10},MYR:{sym:"RM",step:1},SGD:{sym:"S$",step:1},TWD:{sym:"NT$",step:10}};
const COUNTRY_CUR = {"Korea":["KRW"],"Japan":["JPY"],"Vietnam":["VND"],"Thailand":["THB"],"Malaysia & Singapore":["MYR"],"Taiwan":["TWD"]};
let RATES = {...DEFAULT_RATES};
try { const saved = JSON.parse(localStorage.getItem("sabbatical-rates")||"null"); if (saved) RATES = {...RATES, ...saved}; } catch(e){}
const local = (g, c) => { const x=CUR[c]; if(!x) return ""; const v=Math.round(g*RATES[c]/x.step)*x.step; return x.sym+v.toLocaleString("en-GB"); };
const localAll = s => s.cur.map(c=>local(s.foodD,c)).join(" · ");

function renderFood(M){
  const S=M.stops, nights=M.nights, foodBudget=M.planned.Food, foodSpent=M.committed.Food;
  const tripStart = D(S[0].start);
  const dayIdx = Math.floor((today - tripStart)/864e5);
  const inTrip = dayIdx >= 0 && dayIdx < nights;
  const daysLeft = inTrip ? nights - dayIdx : (dayIdx < 0 ? nights : 0);
  const stopAt = d => { let a=0; for (const s of S){ if (d < a + s.nights) return s; a += s.nights; } return S[S.length-1]; };
  const current = inTrip ? stopAt(dayIdx) : S[0];
  const avg = foodBudget/nights;
  const lo = Math.min(...S.map(s=>s.foodD)), hi = Math.max(...S.map(s=>s.foodD));
  const names = v => [...new Set(S.filter(s=>s.foodD===v).map(s=>short(s.where)))].join(", ");
  const pace = daysLeft>0 ? (foodBudget-foodSpent)/daysLeft : 0;
  $("food-top").innerHTML = `
    <div class="fstat hero"><div class="eyebrow">${inTrip?"Today's allowance":"Your first allowance"}</div>
      <div class="v">${gbp(current.foodD)}<small> / day</small></div>
      <div class="loc">≈ ${localAll(current)}</div>
      <div class="n">${esc(short(current.where))}, ${esc(current.country)}${inTrip?"":" · from "+fmtD(current.start)}</div></div>
    <div class="fstat"><div class="eyebrow">Trip average</div>
      <div class="v">${gbp(avg,2)}<small> / day</small></div>
      <div class="n">${gbp(foodBudget)} food budget over ${nights} days</div></div>
    <div class="fstat"><div class="eyebrow">Range</div>
      <div class="v">${gbp(lo)}–${gbp(hi)}<small> / day</small></div>
      <div class="n">Lowest in ${esc(names(lo))} · highest in ${esc(names(hi))}</div></div>
    <div class="fstat"><div class="eyebrow">Food spent so far</div>
      <div class="v">${gbp(foodSpent)}<small> of ${gbp(foodBudget)}</small></div>
      <div class="n">${daysLeft>0?`To stay on budget: ${gbp(pace,2)}/day for the ${daysLeft} days ${inTrip?"left":"of the trip"}`:"Trip complete"}</div></div>`;

  const wrap = $("food-chart-wrap");
  const W = Math.max(320, wrap.clientWidth||900), H = 230, m = {l:40,r:12,t:24,b:40};
  const iw = W-m.l-m.r, ih = H-m.t-m.b, yMax = Math.max(35, Math.ceil((hi+5)/10)*10);
  const X = d => m.l + d/nights*iw, Y = v => m.t + ih - v/yMax*ih;
  let g = `<svg class="fchart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Food allowance per day across the trip">`;
  for (let v=0; v<=yMax; v+=10) g += `<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${m.l-8}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">£${v}</text>`;
  let a=0, path=`M${X(0)},${Y(0)}`, line=""; const steps=[];
  S.forEach((s,i)=>{ const x0=X(a), x1=X(a+s.nights), y=Y(s.foodD); path+=` L${x0},${y} L${x1},${y}`; line+=(i?` L${x0},${y}`:`M${x0},${y}`)+` L${x1},${y}`; steps.push({s,x0,x1}); a+=s.nights; });
  path += ` L${X(nights)},${Y(0)} Z`;
  g += `<path d="${path}" fill="var(--c3)" fill-opacity=".2" stroke="none"/><path d="${line}" fill="none" stroke="var(--c3)" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += `<line x1="${m.l}" x2="${W-m.r}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  g += `<text x="${m.l+6}" y="${Y(avg)+14}" font-size="11" font-weight="600" fill="var(--ink-2)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">average ${gbp(avg,2)}</text>`;
  steps.forEach(st=>{
    const w=st.x1-st.x0, s=st.s, cx=(st.x0+st.x1)/2;
    const tip = `<b>${esc(s.where)}</b>${esc(s.country)} · ${s.nights} night${s.nights>1?"s":""}<br>Food: ${gbp(s.foodD)}/day ≈ ${localAll(s)}<br>${gbp(s.food)} for the stay${s.meal?"<br>"+s.meal:""}`;
    g += `<g class="step" tabindex="0" data-tip="${esc(tip)}"><rect class="hit" x="${st.x0}" y="${m.t}" width="${w}" height="${ih}" fill="transparent"/>`;
    if (w >= 24) g += `<text x="${cx}" y="${Y(s.foodD)-7}" text-anchor="middle" font-size="11.5" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">£${s.foodD}</text>`;
    g += `</g>`;
  });
  let a2=0; M.groups.forEach(gr=>{ const x0=X(a2)+1, x1=X(a2+gr.nights)-1; a2+=gr.nights;
    g += `<line x1="${x0}" x2="${x1}" y1="${m.t+ih+8}" y2="${m.t+ih+8}" stroke="var(--ink-2)" stroke-width="2"/>`;
    const lbl = gr.country.replace("Malaysia & Singapore","MY & SG");
    if (x1-x0 >= lbl.length*6) g += `<text x="${x0}" y="${m.t+ih+24}" font-size="11" fill="var(--ink-2)">${esc(lbl)}</text>`;
  });
  g += `<line x1="${m.l}" x2="${W-m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--base)" stroke-width="1"/>`;
  if (inTrip) { const tx = X(dayIdx+0.5); g += `<line x1="${tx}" x2="${tx}" y1="${m.t-6}" y2="${Y(0)}" stroke="var(--crit)" stroke-width="2"/><text x="${tx}" y="${m.t-10}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--crit)">Today</text>`; }
  wrap.innerHTML = g + `</svg>`;

  let ft = `<thead><tr><th>Stop</th><th>Dates</th><th class="r">Food / day</th><th class="r">Local / day</th><th class="r">Days</th><th class="r">Food total</th></tr></thead><tbody>`;
  M.groups.forEach(gr=>{
    ft += `<tr class="grp"><td colspan="2">${esc(gr.country)}</td><td class="r"><span class="num">${gbp(gr.food/gr.nights,2)} avg</span></td><td></td><td class="r"><span class="num">${gr.nights}</span></td><td class="r"><span class="num">${gbp(gr.food)}</span></td></tr>`;
    gr.stops.forEach(s=>{
      ft += `<tr${inTrip&&s===current?' style="background:var(--food-soft)"':""}><td>${esc(short(s.where))}${s.meal?`<span class="meal">${s.meal}</span>`:""}</td><td class="nw">${fmtD(s.start)} – ${fmtD(addD(s.start,s.nights))}</td><td class="r fd">${gbp(s.foodD)}</td><td class="r mono">${localAll(s)}</td><td class="r">${s.nights}</td><td class="r">${gbp(s.food)}</td></tr>`;
    });
  });
  ft += `<tr class="total"><td>Whole trip</td><td></td><td class="r">${gbp(avg,2)} avg</td><td></td><td class="r">${nights}</td><td class="r">${gbp(foodBudget)}</td></tr></tbody>`;
  $("food-table").innerHTML = ft;
}
const rg = $("rates-grid");
rg.innerHTML = Object.keys(DEFAULT_RATES).map(c=>`<label for="rate-${c}">${c}<input id="rate-${c}" type="number" step="any" min="0" value="${RATES[c]}"></label>`).join("") + `<button type="button" class="linkbtn" id="rates-reset">Reset</button>`;
rg.addEventListener("input",e=>{ const c=e.target.id?.replace("rate-",""); const v=parseFloat(e.target.value); if(DEFAULT_RATES[c]&&v>0){ RATES[c]=v; try{localStorage.setItem("sabbatical-rates",JSON.stringify(RATES));}catch(_){} MODEL&&renderFood(MODEL); } });
$("rates-reset").addEventListener("click",()=>{ RATES={...DEFAULT_RATES}; try{localStorage.removeItem("sabbatical-rates");}catch(_){} Object.keys(RATES).forEach(c=>$("rate-"+c).value=RATES[c]); MODEL&&renderFood(MODEL); });
let rz; addEventListener("resize",()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(MODEL && !$("p-food").hidden) renderFood(MODEL); },150); });

// ---------- stays
const stayChip = s => s.cls==="booked"?'<span class="chip booked">Booked</span>':s.cls==="host"?'<span class="chip host">With friends</span>':`<span class="chip todo">${esc(s.st)}</span>`;
function renderStays(M){
  const t0 = D(M.stops[0].start), end = D(addD(M.stops[M.stops.length-1].start, M.stops[M.stops.length-1].nights));
  const span = (end-t0)/864e5, dayOf = iso => (D(iso)-t0)/864e5, P = d => (d/span*100)+"%";
  $("h-journey").textContent = `The journey · ${M.nights} nights`;
  let h = `<div class="tl-months">`;
  for (let d=new Date(t0.getFullYear(),t0.getMonth()+1,1); d<end; d.setMonth(d.getMonth()+1)) h += `<span style="left:${P((d-t0)/864e5)}">${d.toLocaleDateString("en-GB",{month:"short"})}</span>`;
  h += `</div><div class="tl-strip">`;
  M.stops.forEach(s=>{
    const tip = `<b>${esc(s.hotel?.name && s.cls!=="host" ? s.hotel.name : s.where)}</b>${esc(short(s.where))}, ${esc(s.country)} · ${s.nights} night${s.nights>1?"s":""} from ${fmtD(s.start)}<br>${s.acc?gbp(s.accN)+"/night · "+gbp(s.acc):"No accommodation cost"} · ${esc(s.st)}`;
    h += `<div class="tl-seg ${s.cls}" tabindex="0" data-tip="${esc(tip)}" style="left:calc(${P(dayOf(s.start))} + 1px);width:calc(${P(s.nights)} - 2px)">${s.nights>=3?esc(short(s.where)):""}</div>`;
  });
  h += `</div>`;
  [["2026-10-25","Yokohama Marathon"],["2026-11-24","Yi Peng"],["2026-12-25","Christmas"]].forEach(([d,l])=>{ if(dayOf(d)>=0&&dayOf(d)<=span) h += `<div class="tl-event" style="left:${P(dayOf(d)+0.5)}">${l}</div>`; });
  h += `<div class="tl-countries">` + M.groups.map(g=>`<div class="tl-country" title="${esc(g.country)}" style="left:calc(${P(dayOf(g.start))} + 1px);width:calc(${P(g.nights)} - 4px)">${esc(g.country.replace("Malaysia & Singapore","Malaysia & SG"))}<small>${g.nights}n</small></div>`).join("") + `</div>`;
  $("tl").innerHTML = h;

  const bookable = M.stops.filter(s=>s.cls!=="host");
  const booked = bookable.filter(s=>s.cls==="booked");
  $("hotel-sum").textContent = `${booked.length} of ${bookable.length} booked · ${gbp(sum(booked,s=>s.acc))} booked · ${gbp(sum(bookable.filter(s=>s.cls!=="booked"),s=>s.acc))} to book`;
  let t = `<thead><tr><th>Stay</th><th>Dates</th><th class="r">Nights</th><th class="r">£ / night</th><th class="r">Total</th><th>Status</th><th>Details</th></tr></thead><tbody>`;
  M.groups.forEach(g=>{
    t += `<tr class="grp"><td colspan="4">${esc(g.country)}</td><td class="r"><span class="num">${gbp(sum(g.stops,s=>s.acc))}</span></td><td colspan="2"></td></tr>`;
    g.stops.forEach(s=>{
      const hname = s.hotel?.name;
      const det = [
        s.hotel?.payment && s.hotel.payment!=="N/A" ? `Payment: ${esc(s.hotel.payment)}` : "",
        s.hotel?.ref ? `Ref: <span class="mono">${esc(s.hotel.ref)}</span>` : "",
        s.hotel?.cancel ? `Free cancellation until ${esc(s.hotel.cancel)}` : "",
        s.hotel?.contact ? esc(s.hotel.contact) : "",
        s.hotel?.notes ? esc(s.hotel.notes) : ""
      ].filter(Boolean).join("<br>");
      t += `<tr><td><b>${esc(short(s.where))}</b>${hname?`<div class="note">${esc(hname)}</div>`:(s.cls==="todo"?`<div class="note">No property chosen yet</div>`:"")}</td><td class="nw">${fmtD(s.start,{weekday:"short",day:"numeric",month:"short"})} –<br>${fmtD(addD(s.start,s.nights),{weekday:"short",day:"numeric",month:"short"})}</td><td class="r">${s.nights}</td><td class="r">${s.accN?gbp(s.accN):"–"}</td><td class="r"><b>${s.acc?gbp(s.acc):"–"}</b></td><td>${stayChip(s)}</td><td class="note" style="min-width:220px">${det||"–"}</td></tr>`;
    });
  });
  t += `<tr class="total"><td>All stays</td><td></td><td class="r">${M.nights}</td><td></td><td class="r">${gbp(M.planned.Accommodation)}</td><td colspan="2"></td></tr></tbody>`;
  $("hotels").innerHTML = t;
}

// ---------- flights
function renderFlights(M){
  const F=M.flights, booked=F.filter(f=>f.booked), toBook=F.filter(f=>!f.booked);
  const next = F.find(f=>D(f.date)>=today);
  $("flight-kpis").innerHTML = [
    {l:"Flights",v:String(F.length),n:`${booked.length} booked · ${toBook.length} to book`},
    {l:"Paid",v:gbp(sum(booked,f=>f.cost)),n:"Booked flights"},
    {l:"Still to book",v:gbp(sum(toBook,f=>f.cost)),n:"Estimates",cls:""},
    {l:"Next flight",v:next?`${code(next.from)} → ${code(next.to)}`:"–",n:next?`${fmtD(next.date,{weekday:"short",day:"numeric",month:"short"})}${next.flight?" · "+esc(next.flight):""}`:"All flown"}
  ].map(x=>`<div class="kpi"><div class="eyebrow">${x.l}</div><div class="v">${x.v}</div><div class="n">${x.n}</div></div>`).join("");
  const byB=[]; F.forEach(f=>{ const k=f.booking||"Other"; let g=byB.find(x=>x.k===k); if(!g){g={k,items:[]};byB.push(g);} g.items.push(f); });
  $("flights").innerHTML = byB.map(g=>{
    const tot = sum(g.items,f=>f.cost), allB = g.items.every(f=>f.booked);
    return `<div class="fgroup"><h3><span>${esc(g.k)}</span><span>${gbp(tot)}${allB?" · booked":""}</span></h3>` + g.items.map(f=>{
      const urgent = !f.booked && /this week|now|asap/i.test(f.by||"");
      const chip = f.booked?'<span class="chip booked">Booked</span>':`<span class="chip ${urgent?"urgent":"todo"}">Book ${esc((f.by||"").replace(/^(Mid|Late)/,m=>"by "+m.toLowerCase()).replace(/^This/,"this").replace(/^After/,"after"))}</span>`;
      const times = [f.dep?`dep ${esc(f.dep)}`:"", f.arr?`arr ${esc(f.arr)}`:""].filter(Boolean).join(" · ");
      const meta = [f.flight?`<b>${esc(f.flight)}</b>`:"", times, f.ref?`Ref <span class="mono">${esc(f.ref)}</span>`:"", esc(f.notes||"")].filter(Boolean).join(" · ");
      return `<div class="flight${D(f.date)<today?" past":""}"><div class="when"><b>${fmtD(f.date)}</b>${fmtD(f.date,{weekday:"short"})} ${D(f.date).getFullYear()}</div>
        <div style="min-width:0"><div class="codes">${esc(f.from)}<span class="arr">→</span>${esc(f.to)}</div><div class="meta">${meta}</div></div>
        <div class="amt">${f.cost?gbp(f.cost):(f.booked?'<span class="note">in ticket</span>':"–")}${chip}</div></div>`;
    }).join("") + `</div>`;
  }).join("");
}

// ---------- budget
function renderBudget(M){
  const B=M.budget, scaleMax=Math.max(B,M.totalPlan)*1.02, pct=n=>(n/scaleMax*100)+"%";
  $("h-budget").textContent = `Where the ${gbp(B)} goes`;
  const barRow = (label, sub, vals, withTag) => {
    const tot = sum(CATS,c=>vals[c.k]);
    const segs = CATS.filter(c=>vals[c.k]>0).map(c=>`<div class="seg" tabindex="0" style="background:var(${c.c});flex:${vals[c.k]} 0 0" data-tip="${esc(`<b>${c.k}</b>${label}: ${gbp(vals[c.k])}<br>${Math.round(vals[c.k]/B*100)}% of the ${gbp(B)} budget`)}" aria-label="${c.k} ${label} ${gbp(vals[c.k])}"></div>`).join("");
    return `<div class="bar-row"><div class="lab"><b>${label}</b>${sub}</div><div class="track"><div class="stack" style="width:${pct(tot)}">${segs}</div><div class="limit" style="left:${pct(B)}"></div>${withTag?`<div class="limit-tag" style="left:${pct(B)}">${gbp(B)} budget</div>`:""}</div></div>`;
  };
  let ticks=""; for(let t=0;t<=scaleMax;t+=2000) ticks+=`<span style="left:${pct(t)}">${t===0?"£0":"£"+(t/1000)+"k"}</span>`;
  $("bars").innerHTML = barRow("Planned", gbp(Math.round(M.totalPlan),0), M.planned, true) + barRow("Committed", gbp(M.totalCommitted), M.committed) + `<div class="axis"><div></div><div class="ticks">${ticks}</div></div>`;
  $("legend").innerHTML = CATS.map(c=>`<span><i style="background:var(${c.c})"></i>${c.k}</span>`).join("");
  let th = `<thead><tr><th>Category</th><th class="r">Planned</th><th class="r">Committed</th><th class="r">Still to pay</th><th style="width:22%">Committed of planned</th></tr></thead><tbody>`;
  CATS.forEach(c=>{ const p=M.planned[c.k], cm=M.committed[c.k], sh=p?Math.min(100,cm/p*100):0;
    th += `<tr><td><span class="sw" style="background:var(${c.c})"></span>${c.k}</td><td class="r">${gbp(p)}</td><td class="r">${cm?gbp(cm):"–"}</td><td class="r">${gbp(p-cm)}</td><td><div class="mini" title="${Math.round(sh)}%"><div style="width:${sh}%;background:var(${c.c})"></div></div></td></tr>`; });
  th += `<tr><td>Contingency buffer</td><td class="r ${M.buffer<0?"neg":""}">${gbp(M.buffer)}</td><td class="r">${M.other?gbp(M.other):"–"}</td><td class="r ${M.buffer<0?"neg":""}">${gbp(M.buffer-M.other)}</td><td class="note">${M.buffer<0?"Over budget":""}</td></tr>`;
  th += `<tr class="total"><td>Total</td><td class="r">${gbp(B)}</td><td class="r">${gbp(M.totalCommitted)}</td><td class="r">${gbp(B-M.totalCommitted)}</td><td class="r note">${Math.round(M.totalCommitted/B*100)}% committed</td></tr></tbody>`;
  $("cat-table").innerHTML = th;

  const byC={}; M.stops.forEach(s=>{ byC[s.country]=byC[s.country]||{total:0,nights:0}; byC[s.country].total+=s.total; byC[s.country].nights+=s.nights; });
  const spentC={}; M.d.spend.filter(s=>byC[s.country] && s.cat!=="Flights" && s.cat!=="Insurance & admin").forEach(s=>spentC[s.country]=(spentC[s.country]||0)+s.amt);
  const cmax=Math.max(...Object.values(byC).map(x=>x.total));
  $("cbars").innerHTML = Object.entries(byC).map(([c,x])=>{ const sp=spentC[c]||0;
    return `<div class="cbar" tabindex="0" data-tip="${esc(`<b>${c}</b>${x.nights} nights · ${gbp(x.total)} budget<br>${gbp(Math.round(x.total/x.nights))} per day${sp?`<br>Committed so far: ${gbp(sp)}`:""}`)}"><div>${esc(c)}</div><div class="t"><div style="width:${x.total/cmax*100}%"></div>${sp?`<div class="spent" style="width:${Math.max(sp/cmax*100,0.8)}%"></div>`:""}</div><div class="val"><b>${gbp(x.total)}</b><small>${x.nights}n · ${gbp(Math.round(x.total/x.nights))}/day</small></div></div>`; }).join("");

  const catC = Object.fromEntries(CATS.map(c=>[c.k,c.c]));
  $("spend-sum").textContent = `${gbp(M.totalCommitted)} across ${M.d.spend.length} payments`;
  $("spend").innerHTML = `<thead><tr><th>Date</th><th>What</th><th class="r">Amount</th></tr></thead><tbody>` +
    M.d.spend.map(s=>`<tr><td class="nw">${/^\d{4}-\d\d-\d\d$/.test(s.date||"")?fmtD(s.date):esc(s.date)}</td><td><span class="sw" style="background:var(${catC[s.cat]||"--muted"})"></span>${esc(s.desc)}<div class="note">${esc(s.cat)} · ${esc(s.country)}${s.status&&s.status!=="Paid"?" · "+esc(s.status):""}</div></td><td class="r">${gbp(s.amt)}</td></tr>`).join("") +
    `<tr class="total"><td></td><td>Total committed</td><td class="r">${gbp(M.totalCommitted)}</td></tr></tbody>`;
}

// ---------- tooltip
const tip = $("tip");
function show(t,x,y){ tip.innerHTML=t; tip.hidden=false; const w=tip.offsetWidth,h=tip.offsetHeight; let L=x+14,T=y+14; if(L+w>innerWidth-8)L=x-w-14; if(T+h>innerHeight-8)T=y-h-14; tip.style.left=Math.max(8,L)+"px"; tip.style.top=Math.max(8,T)+"px"; }
document.addEventListener("pointermove",e=>{ const t=e.target.closest?.("[data-tip]"); if(t) show(t.dataset.tip,e.clientX,e.clientY); else tip.hidden=true; });
document.addEventListener("focusin",e=>{ const t=e.target.closest?.("[data-tip]"); if(t){ const r=t.getBoundingClientRect(); show(t.dataset.tip,r.left+r.width/2,r.bottom); } });
document.addEventListener("focusout",()=>tip.hidden=true);
document.addEventListener("scroll",()=>tip.hidden=true,{passive:true});

// ---------- read the spreadsheet in the browser (SheetJS)
const XLSX_URL = "Sabbatical_Plan_and_Budget.xlsx";
const POLL_MS = 5 * 60 * 1000;

function parseWorkbook(buf){
  const wb = XLSX.read(buf, {type:"array", cellDates:false});
  const sh = n => { const s = wb.Sheets[n]; if (!s) throw new Error(`The spreadsheet has no "${n}" tab.`); return s; };
  const raw = (s, ref) => { const c = sh(s)[ref]; return c ? c.v : null; };
  const val = (s, ref) => { let v = raw(s, ref); if (typeof v === "string") { v = v.trim(); return v || null; } return v ?? null; };
  const num = (s, ref) => { const v = raw(s, ref); const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : 0; };
  const serialToISO = n => new Date(Date.UTC(1899,11,30) + Math.round(n)*864e5).toISOString().slice(0,10);
  const dateVal = (s, ref) => { const v = raw(s, ref); if (typeof v === "number") return serialToISO(v); if (typeof v === "string") { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; return v.trim()||null; } return null; };
  const maxRow = s => XLSX.utils.decode_range(sh(s)["!ref"] || "A1").e.r + 1;
  const rowsUntilTotal = (s, start) => { const out=[]; for (let r=start; r<start+400 && r<=maxRow(s); r++){ const a=val(s,"A"+r); if (typeof a==="string" && /^total/i.test(a)) break; out.push(r);} return out; };

  const data = { budget: num("Overview","B3") || 10000, tripTitle: val("Overview","A1"), tripSubtitle: val("Overview","A2") };

  const hasHotels = !!wb.Sheets["Hotels"];
  let d = hasHotels && typeof raw("Hotels","C5")==="number" ? serialToISO(raw("Hotels","C5")) : "2026-10-19";
  const addDays = (iso,n) => new Date(Date.UTC(+iso.slice(0,4), +iso.slice(5,7)-1, +iso.slice(8,10)+n)).toISOString().slice(0,10);
  data.stops = [];
  rowsUntilTotal("Itinerary",5).forEach(r=>{
    if (!val("Itinerary","A"+r)) return;
    const nights = Math.round(num("Itinerary","D"+r));
    const H = k => hasHotels ? val("Hotels", k+r) : null;
    data.stops.push({
      country: val("Itinerary","A"+r), where: val("Itinerary","B"+r), start: d, nights,
      accN: hasHotels && raw("Hotels","H"+r)!=null ? num("Hotels","H"+r) : num("Itinerary","E"+r),
      foodD: num("Itinerary","F"+r), trans: num("Itinerary","G"+r), act: num("Itinerary","H"+r), note: val("Itinerary","N"+r),
      hotel: { name:H("F"), status:H("G") || ({"Yes":"Booked","N/A – host":"Staying with friends"}[val("Itinerary","M"+r)] || "To book"),
               payment:H("J"), ref:H("K"), cancel:H("L"), contact:H("M"), notes:H("N") }
    });
    d = addDays(d, nights);
  });

  data.flights = [];
  rowsUntilTotal("Flights",5).forEach(r=>{
    if (!(val("Flights","C"+r) || val("Flights","D"+r))) return;
    data.flights.push({ date:dateVal("Flights","B"+r), from:val("Flights","C"+r), to:val("Flights","D"+r), flight:val("Flights","E"+r),
      dep:val("Flights","F"+r), arr:val("Flights","G"+r), booking:val("Flights","H"+r), cost:num("Flights","I"+r),
      status:val("Flights","J"+r) || "To book", by:val("Flights","K"+r), ref:val("Flights","L"+r), notes:val("Flights","M"+r) });
  });

  const AD = "Admin & checklist";
  data.admin = [];
  rowsUntilTotal(AD,5).forEach(r=>{ if (val(AD,"A"+r)) data.admin.push({item:val(AD,"A"+r), amt:num(AD,"B"+r), status:val(AD,"C"+r), notes:val(AD,"D"+r)}); });
  data.todo = [];
  let start = 0; for (let r=1; r<=maxRow(AD); r++) if (val(AD,"A"+r)==="Task") { start=r+1; break; }
  if (start) for (let r=start; r<=maxRow(AD); r++) {
    const t = val(AD,"A"+r); if (!t) continue;
    const done = val(AD,"C"+r);
    data.todo.push({task:t, due:val(AD,"B"+r), done: !!done && !/^(no|n|false|0)$/i.test(String(done)), notes:val(AD,"D"+r)});
  }

  data.spend = [];
  for (let r=5; r<=maxRow("Tracker"); r++) {
    if (raw("Tracker","E"+r)==null || raw("Tracker","E"+r)==="") continue;
    data.spend.push({date:dateVal("Tracker","A"+r), country:val("Tracker","B"+r), cat:val("Tracker","C"+r), desc:val("Tracker","D"+r), amt:num("Tracker","E"+r), status:val("Tracker","F"+r)});
  }
  if (!data.stops.length) throw new Error("No stops found on the Itinerary tab.");
  return data;
}

const fmtStamp = t => t ? new Date(t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "";
function setSource(state, text){
  const el=$("sync"); el.className = "sync " + state; el.querySelector("span").textContent = text;
}
function showError(msg){ $("load-error").hidden = false; $("load-error").innerHTML = `<strong>Couldn't read the spreadsheet.</strong> ${esc(msg)}`; }

let lastSig = null, viewingLocal = false;
function load(buf, when, label){
  const sig = buf.byteLength + ":" + new Uint8Array(buf).slice(-64).join(",");
  if (sig === lastSig) return false;
  const data = parseWorkbook(buf);
  lastSig = sig;
  $("load-error").hidden = true; $("empty").hidden = true; $("app").hidden = false;
  render(build({data}));
  showTab(currentTab);
  return true;
}

async function fetchRepoCopy(manual){
  if (viewingLocal && !manual) return;
  try {
    const res = await fetch(XLSX_URL + "?t=" + Date.now(), {cache:"no-store"});
    if (!res.ok) throw new Error(res.status === 404 ? "404" : "HTTP " + res.status);
    const buf = await res.arrayBuffer();
    const lm = res.headers.get("Last-Modified");
    load(buf);
    viewingLocal = false;
    setSource("live", `Live from ${XLSX_URL}${lm?` · file updated ${fmtStamp(lm)}`:""} · checked ${fmtStamp(Date.now())}`);
  } catch (e) {
    if (String(e.message) === "404" || e instanceof TypeError) {
      if (!MODEL) { $("empty").hidden = false; $("app").hidden = true; }
      setSource("", MODEL ? `Couldn't reach ${XLSX_URL} just now · showing what was loaded ${fmtStamp(Date.now())}` : `No spreadsheet found next to this page yet`);
    } else { showError(e.message); }
  }
}

function openLocal(file){
  if (!file) return;
  file.arrayBuffer().then(buf=>{
    try { lastSig = null; load(buf); viewingLocal = true;
      setSource("local", `Viewing ${file.name} from your computer (saved ${fmtStamp(file.lastModified)}) · not uploaded anywhere`);
    } catch(e){ showError(e.message); }
  });
}
$("file").addEventListener("change", e=>{ openLocal(e.target.files[0]); e.target.value=""; });
document.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>$("file").click()));
$("reload").addEventListener("click", ()=>{ viewingLocal=false; lastSig=null; fetchRepoCopy(true); });
addEventListener("dragover", e=>{ e.preventDefault(); document.body.classList.add("dragging"); });
addEventListener("dragleave", e=>{ if (e.target===document.documentElement || !e.relatedTarget) document.body.classList.remove("dragging"); });
addEventListener("drop", e=>{ e.preventDefault(); document.body.classList.remove("dragging"); const f=[...(e.dataTransfer?.files||[])].find(f=>/\.xlsx$/i.test(f.name)); if(f) openLocal(f); });
document.addEventListener("visibilitychange", ()=>{ if (!document.hidden) fetchRepoCopy(false); });
setInterval(()=>fetchRepoCopy(false), POLL_MS);

// ---------- boot
let currentTab = location.hash.replace("#","");
if (!TABS.includes(currentTab)) { try{ currentTab = localStorage.getItem("sabbatical-tab") || "overview"; }catch(e){ currentTab="overview"; } }
showTab(currentTab);
fetchRepoCopy(true);
})();
