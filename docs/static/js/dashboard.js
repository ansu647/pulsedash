/* PulseDash — SRE Edition (Static Demo) — Simulated Data */
const MAX_POINTS = 75;

// ── Chart setup ───────────────────────────────────────────────
function mkDS(label, color, fill=true){
  return{label,data:[],borderColor:color,backgroundColor:fill?color+"18":"transparent",borderWidth:2,pointRadius:0,tension:0.4,fill};
}
const cOpts=(yMax)=>({responsive:true,maintainAspectRatio:false,animation:{duration:300},
  plugins:{legend:{display:false},tooltip:{backgroundColor:"rgba(8,13,24,.92)",borderColor:"rgba(255,255,255,.1)",borderWidth:1,titleColor:"#94a3b8",bodyColor:"#f0f4ff",padding:10}},
  scales:{x:{ticks:{color:"#475569",maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}},grid:{color:"rgba(255,255,255,.04)"}},
          y:{min:0,max:yMax,ticks:{color:"#475569",font:{family:"JetBrains Mono",size:10}},grid:{color:"rgba(255,255,255,.06)"}}}});
const cpuChart  = new Chart(document.getElementById("cpuChart"),  {type:"line",data:{labels:[],datasets:[mkDS("CPU %","#6ee7f7")]},options:cOpts(100)});
const memChart  = new Chart(document.getElementById("memChart"),  {type:"line",data:{labels:[],datasets:[mkDS("RAM %","#a78bfa")]},options:cOpts(100)});
const diskChart = new Chart(document.getElementById("diskChart"), {type:"line",data:{labels:[],datasets:[mkDS("Disk %","#34d399")]},options:cOpts(100)});
const netChart  = new Chart(document.getElementById("netChart"),  {type:"line",data:{labels:[],datasets:[mkDS("Sent","#f59e0b",false),mkDS("Recv","#60a5fa",false)]},options:cOpts(undefined)});
netChart.options.scales.y.max=undefined;

function pushChart(chart,lbl,...vals){
  chart.data.labels.push(lbl);
  vals.forEach((v,i)=>chart.data.datasets[i].data.push(v));
  while(chart.data.labels.length>MAX_POINTS){chart.data.labels.shift();chart.data.datasets.forEach(ds=>ds.data.shift());}
  chart.update("none");
}

// ── Simulation state ──────────────────────────────────────────
const sim={cpu:22,mem:72,disk:12.4,ns:30,nr:40};
function walk(v,mn,mx,s){return Math.max(mn,Math.min(mx,v+(Math.random()-.5)*s*2));}
let tick_count=0, uptimeS=0, incidents=[], incCounter=0;

// Simulated SLO windows (rolling bool arrays)
const sloWindows={cpu:Array(150).fill(true),mem:Array(150).fill(true),disk:Array(150).fill(true)};
const SLO_DEFS={
  cpu:  {name:"CPU Availability SLO",   threshold:80, target:99.0, runbook:"Run `top` to find high-CPU processes. Throttle or restart offending services."},
  mem:  {name:"Memory Availability SLO",threshold:90, target:99.5, runbook:"Check for memory leaks. Review swap usage with `vmstat`. Restart leaking service."},
  disk: {name:"Disk Availability SLO",  threshold:85, target:99.9, runbook:"Run `du -sh /*` to find large dirs. Clear logs and temp files immediately."},
};

const RUNBOOKS={
  cpu:  {WARNING:"Run `top` to identify top CPU consumers. Throttle or restart if needed.",
         CRITICAL:"IMMEDIATE: Identify runaway process. Consider kill -9 or auto-restart policy."},
  memory:{WARNING:"Check for memory leaks with `vmstat`. Review swap usage.",
          CRITICAL:"IMMEDIATE: Risk of OOM kill. Restart highest-memory process now."},
  disk: {WARNING:"Run `du -sh /*` to find large directories. Clean up logs.",
         CRITICAL:"IMMEDIATE: Disk full will cause service outage. Delete or archive data NOW."},
};

const alertLog=[];

// ── Severity ──────────────────────────────────────────────────
function severity(resource,val){
  const t={cpu:{info:60,warning:80,critical:95},memory:{info:70,warning:85,critical:95},disk:{info:70,warning:85,critical:95}};
  const r=t[resource]||{};
  if(val>=r.critical) return "CRITICAL";
  if(val>=r.warning)  return "WARNING";
  if(val>=r.info)     return "INFO";
  return "OK";
}

// ── Helpers ───────────────────────────────────────────────────
function fmtT(ts){return new Date((ts||Date.now()/1000)*1000).toLocaleTimeString("en-US",{hour12:false});}
function fmtDur(s){if(!s||s===null)return"--";if(s<60)return`${s}s`;if(s<3600)return`${Math.floor(s/60)}m ${Math.round(s%60)}s`;return`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;}
function fmtUp(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=Math.floor(s%60);if(h>0)return`${h}h ${m}m`;if(m>0)return`${m}m ${sc}s`;return`${sc}s`;}
const SEV_CLASS={OK:"sev-OK",INFO:"sev-INFO",WARNING:"sev-WARNING",CRITICAL:"sev-CRITICAL"};
const CARD_SEV ={OK:"",INFO:"",WARNING:"sev-warning",CRITICAL:"sev-critical"};

// ── Set card ──────────────────────────────────────────────────
function setCard(cardId,sev){const e=document.getElementById(cardId);if(e)e.className="stat-card "+(CARD_SEV[sev]||"");}
function setBadge(id,sev){const e=document.getElementById(id);if(!e)return;e.textContent=sev;e.className="sev-badge "+(SEV_CLASS[sev]||"sev-OK");}

// ── SLO computation ───────────────────────────────────────────
function computeSLOs(cpu,mem,disk){
  const vals={cpu,mem,disk};
  const keys=["cpu","mem","disk"];
  keys.forEach(k=>{
    const def=SLO_DEFS[k];
    sloWindows[k].shift();
    sloWindows[k].push(vals[k]<def.threshold);
  });
  return keys.map(k=>{
    const def=SLO_DEFS[k];
    const w=sloWindows[k];
    const good=w.filter(Boolean).length, total=w.length;
    const compliance=(good/total)*100;
    const errBudget=(1-def.target/100);
    const actualBad=(total-good)/total;
    const budgetUsed=errBudget>0?actualBad/errBudget:0;
    const budgetRem=Math.max(0,Math.round((1-budgetUsed)*100*10)/10);
    const burnRate=Math.round(budgetUsed*100)/100;
    const status=compliance>=def.target?"OK":compliance>=def.target-1?"AT_RISK":"BREACHED";
    return{key:k,name:def.name,compliance:Math.round(compliance*1000)/1000,target:def.target,budgetRem,burnRate,status,runbook:def.runbook,good,total};
  });
}

function renderSLOs(slos){
  const grid=document.getElementById("sloGrid");
  grid.innerHTML=slos.map(s=>{
    const bc=s.budgetRem>50?"budget-high":s.budgetRem>20?"budget-mid":"budget-low";
    const sc="slo-"+s.status;
    const burn=s.burnRate>=1?`🔥 Burn: ${s.burnRate}×`:`Burn: ${s.burnRate}×`;
    return`<div class="slo-card">
      <div class="slo-header"><span class="slo-name">${s.name}</span><span class="slo-status-pill ${sc}">${s.status}</span></div>
      <div class="slo-compliance">${s.compliance.toFixed(3)}%</div>
      <div class="slo-target">Target: ${s.target}% &nbsp;|&nbsp; ${s.good}/${s.total} good</div>
      <div class="budget-bar-wrap"><div class="budget-bar ${bc}" style="width:${s.budgetRem}%"></div></div>
      <div class="budget-meta"><span>Budget: ${s.budgetRem}% left</span><span>${burn}</span></div>
      <div class="slo-runbook">📖 ${s.runbook}</div>
    </div>`;
  }).join("");
}

// ── Alerts ────────────────────────────────────────────────────
function checkAlerts(cpu,mem,disk){
  const checks=[["cpu","CPU",cpu],["memory","Memory",mem],["disk","Disk",disk]];
  checks.forEach(([rk,rn,val])=>{
    const sev=severity(rk,val);
    if(sev==="WARNING"||sev==="CRITICAL"){
      alertLog.unshift({ts:Date.now()/1000,resource:rn,value:val,severity:sev,
        message:`${rn} at ${val.toFixed(1)}% — ${sev}`,
        runbook:RUNBOOKS[rk]?.[sev]||""});
      if(alertLog.length>30)alertLog.pop();
    }
  });
  const list=document.getElementById("alertsList");
  const badge=document.getElementById("alertCount");
  badge.textContent=alertLog.length;
  list.innerHTML=alertLog.length?alertLog.slice(0,15).map(a=>`
    <div class="alert-item sev-${a.severity}">
      <div class="a-header"><span class="a-sev a-sev-${a.severity}">${a.severity}</span><span class="a-msg">${a.message}</span></div>
      ${a.runbook?`<div class="a-runbook">📖 ${a.runbook}</div>`:""}
      <div class="a-time">${fmtT(a.ts)}</div>
    </div>`).join(""):`<div class="no-alerts">✅ All systems normal</div>`;
}

// ── Incident sim ──────────────────────────────────────────────
const openInc={};
function checkIncidents(cpu,mem,disk){
  const checks=[["cpu","CPU",cpu,95],["memory","Memory",mem,95],["disk","Disk",disk,95]];
  checks.forEach(([rk,rn,val,thr])=>{
    if(val>=thr&&!openInc[rk]){
      incCounter++;
      const inc={id:`INC-${String(incCounter).padStart(4,"0")}`,resource:rn,value:val,status:"OPEN",opened_at:Date.now()/1000,closed_at:null,duration_s:null};
      openInc[rk]=inc; incidents.unshift(inc);
    } else if(val<thr&&openInc[rk]){
      const inc=openInc[rk]; delete openInc[rk];
      inc.status="CLOSED"; inc.closed_at=Date.now()/1000; inc.duration_s=Math.round(inc.closed_at-inc.opened_at);
    }
  });
  const active=Object.keys(openInc).length;
  document.getElementById("incidentCount").textContent=active;
  document.getElementById("summaryIncidents").textContent=active;
  document.getElementById("summaryIncidents").closest(".sre-card").className=active>0?"sre-card src-danger":"sre-card src-ok";
  const list=document.getElementById("incidentsList");
  list.innerHTML=incidents.length?incidents.slice(0,10).map(inc=>`
    <div class="inc-item ${inc.status==="CLOSED"?"closed":""}">
      <div class="inc-id">${inc.id} <span style="font-size:.6rem;opacity:.6">${inc.status}</span></div>
      <div class="inc-resource">${inc.resource} at ${inc.value?.toFixed(1)}%${inc.status==="CLOSED"?" · "+fmtDur(inc.duration_s):" · ONGOING"}</div>
      <div class="inc-meta">${fmtT(inc.opened_at)}${inc.status==="CLOSED"?" → "+fmtT(inc.closed_at):" → open"}</div>
    </div>`).join(""):`<div class="no-alerts">✅ No incidents</div>`;
}

// ── Health score ──────────────────────────────────────────────
function computeHealth(cpuSev,memSev,diskSev){
  let s=100;
  [cpuSev,memSev,diskSev].forEach(sev=>{if(sev==="WARNING")s-=10;if(sev==="CRITICAL")s-=25;});
  s-=Object.keys(openInc).length*5;
  return Math.max(0,s);
}

function updateHealth(score){
  document.getElementById("healthScore").textContent=score;
  const chip=document.getElementById("healthChip");
  chip.className=score>=80?"health-score-chip":score>=50?"health-score-chip hs-warning":"health-score-chip hs-critical";
}

// ── Simulated processes ───────────────────────────────────────
const DEMO_PROCS=[{pid:1423,name:"chrome",base:18},{pid:2841,name:"node",base:8},{pid:3312,name:"python3",base:5},
  {pid:4019,name:"Finder",base:2},{pid:5502,name:"Spotlight",base:3},{pid:6120,name:"Safari",base:6},
  {pid:7331,name:"Code",base:4},{pid:8004,name:"Terminal",base:1}];

function renderProcs(){
  const tbody=document.getElementById("procBody");
  tbody.innerHTML=DEMO_PROCS.map(p=>{
    const cpu=Math.max(0,p.base+(Math.random()-.5)*4),mem=+(Math.random()*3+.5).toFixed(2);
    const cc=cpu>15?"cpu-crit":cpu>8?"cpu-warn":"cpu-hot";
    return`<tr><td>${p.pid}</td><td>${p.name}</td><td class="${cc}">${cpu.toFixed(1)}%</td><td>${mem}%</td><td class="status-running">running</td></tr>`;
  }).join("");
}

// ── Main tick ─────────────────────────────────────────────────
function tick(){
  tick_count++; uptimeS+=2;
  sim.cpu  = walk(sim.cpu,  2, 95, 8);
  sim.mem  = walk(sim.mem,  60, 88, 2);
  sim.disk = walk(sim.disk, 11, 14, 0.3);
  sim.ns   = walk(sim.ns,   5, 300, 30);
  sim.nr   = walk(sim.nr,   5, 400, 35);

  const cpu=+sim.cpu.toFixed(1), mem=+sim.mem.toFixed(1), disk=+sim.disk.toFixed(1);
  const ns=+sim.ns.toFixed(1), nr=+sim.nr.toFixed(1);
  const lbl=new Date().toLocaleTimeString("en-US",{hour12:false});

  const cpuSev=severity("cpu",cpu), memSev=severity("memory",mem), diskSev=severity("disk",disk);

  // Cards
  document.getElementById("cpuVal").textContent=`${cpu}%`;
  document.getElementById("cpuBar").style.width=cpu+"%";
  document.getElementById("cpuSub").textContent=`P1≥95% · P2≥80% · P3≥60%`;
  setBadge("cpuSev",cpuSev); setCard("card-cpu",cpuSev);

  document.getElementById("memVal").textContent=`${mem}%`;
  document.getElementById("memBar").style.width=mem+"%";
  document.getElementById("memSub").textContent=`${((mem/100)*8).toFixed(2)} GB / 8 GB`;
  setBadge("memSev",memSev); setCard("card-mem",memSev);

  document.getElementById("diskVal").textContent=`${disk}%`;
  document.getElementById("diskBar").style.width=disk+"%";
  document.getElementById("diskSub").textContent=`${((disk/100)*228).toFixed(1)} GB / 228 GB`;
  setBadge("diskSev",diskSev); setCard("card-disk",diskSev);

  document.getElementById("netVal").textContent=`${(ns+nr).toFixed(1)} KB/s`;
  document.getElementById("netSent").textContent=`${ns} KB/s`;
  document.getElementById("netRecv").textContent=`${nr} KB/s`;

  // Charts
  pushChart(cpuChart,lbl,cpu); pushChart(memChart,lbl,mem);
  pushChart(diskChart,lbl,disk); pushChart(netChart,lbl,ns,nr);

  // SRE panels
  const slos=computeSLOs(cpu,mem,disk);
  renderSLOs(slos);
  checkAlerts(cpu,mem,disk);
  checkIncidents(cpu,mem,disk);

  const healthScore=computeHealth(cpuSev,memSev,diskSev);
  updateHealth(healthScore);

  // Summary strip
  document.getElementById("summaryUptime").textContent=fmtUp(uptimeS);
  document.getElementById("summaryMTTD").textContent="2s";
  const closedInc=incidents.filter(i=>i.status==="CLOSED");
  const mttr=closedInc.length?Math.round(closedInc.reduce((a,i)=>a+i.duration_s,0)/closedInc.length):null;
  document.getElementById("summaryMTTR").textContent=fmtDur(mttr);
  const breached=slos.filter(s=>s.status==="BREACHED").length;
  const ok=slos.filter(s=>s.status==="OK").length;
  document.getElementById("summarySloOk").textContent=ok;
  document.getElementById("summarySloBreached").textContent=breached;
  document.getElementById("summarySloBreached").closest(".sre-card").className=breached>0?"sre-card src-danger":"sre-card src-ok";

  // Status
  document.getElementById("statusPill").className="status-pill live";
  document.getElementById("statusText").textContent="Live Simulation";
}

// ── Boot ──────────────────────────────────────────────────────
setInterval(()=>{document.getElementById("clock").textContent=new Date().toLocaleTimeString("en-US",{hour12:false});},1000);
setInterval(renderProcs,8000); renderProcs();
setInterval(tick,2000); tick();
