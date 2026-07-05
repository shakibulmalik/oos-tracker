
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyM0UKSNgtYjhnYScQgGl9b6hg_QZTzR92-Jh-3M-treb6xoJEfgBuhak-j4l5ezb76kA/exec";

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let otherTasks = [];
let selectedId = null;
let openCheckins = [];
let currentSubTab = "entries";
let allEntries = []; // local cache for dashboard

// ─────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  document.getElementById("nav-" + page).classList.add("active");
  if (page === "checkout")  loadOpenCheckins();
  if (page === "dashboard") refreshDashboard();
}

// ─────────────────────────────────────────────────────────────
//  CHECK-IN
// ─────────────────────────────────────────────────────────────
async function submitCheckin() {
  const name     = document.getElementById("ci-name").value.trim();
  const date     = document.getElementById("ci-date").value;
  const location = document.getElementById("ci-location").value;
  const timein   = document.getElementById("ci-timein").value;

  if (!name || !date || !location || !timein) {
    alert("Please fill in all required fields.");
    return;
  }

  const btn = document.querySelector("#page-checkin .btn-primary");
  btn.textContent = "Saving...";
  btn.disabled = true;

  const entry = {
    action: "checkin",
    id: Date.now(),
    name, date, location, timein
  };

  try {
    await post(entry);
    showBanner("banner-checkin");
    document.getElementById("ci-name").value     = "";
    document.getElementById("ci-location").value = "";
    document.getElementById("ci-timein").value   = "";
  } catch (e) {
    alert("Could not save check-in. Please check your connection and try again.");
  }

  btn.textContent = "Check in now";
  btn.disabled = false;
}

// ─────────────────────────────────────────────────────────────
//  CHECK-OUT — load open check-ins from sheet
// ─────────────────────────────────────────────────────────────
async function loadOpenCheckins() {
  const el = document.getElementById("open-checkins-list");
  el.innerHTML = '<div class="empty">Loading...</div>';
  document.getElementById("checkout-form").style.display = "none";
  selectedId = null;

  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getOpen`);
    const json = await res.json();
    openCheckins = json.data || [];
    renderOpenCheckins();
  } catch (e) {
    el.innerHTML = '<div class="empty">Could not load check-ins. Check your connection.</div>';
  }
}

function renderOpenCheckins() {
  const el = document.getElementById("open-checkins-list");
  if (!openCheckins.length) {
    el.innerHTML = '<div class="empty">No open check-ins found.<br>Please use the Check-in tab first.</div>';
    document.getElementById("checkout-form").style.display = "none";
    return;
  }
  el.innerHTML = openCheckins.map(e => `
    <div class="open-item ${selectedId === e.id ? "selected" : ""}" onclick="selectCheckin('${e.id}')">
      <div class="open-item-left">
        <div class="name">${esc(e.name)}</div>
        <div class="meta">${esc(e.location)} &nbsp;·&nbsp; ${e.date}</div>
      </div>
      <div class="open-item-time">In: ${e.timein}</div>
    </div>`).join("");
}

function selectCheckin(id) {
  selectedId = id;
  renderOpenCheckins();
  document.getElementById("checkout-form").style.display = "block";
  document.getElementById("co-timeout").value = nowTime();
  window.scrollTo({ top: document.getElementById("checkout-form").offsetTop - 80, behavior: "smooth" });
}

// ─────────────────────────────────────────────────────────────
//  CHECK-OUT — other tasks
// ─────────────────────────────────────────────────────────────
document.getElementById("co-other-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addOther(); }
});

function addOther() {
  const inp = document.getElementById("co-other-input");
  const val = inp.value.trim();
  if (!val) return;
  otherTasks.push(val);
  inp.value = "";
  renderOtherTags();
}

function removeOther(i) { otherTasks.splice(i, 1); renderOtherTags(); }

function renderOtherTags() {
  document.getElementById("co-other-tags").innerHTML = otherTasks
    .map((t, i) => `<div class="other-tag" onclick="removeOther(${i})">${esc(t)} <span class="x">✕</span></div>`)
    .join("");
}

// ─────────────────────────────────────────────────────────────
//  CHECK-OUT — submit
// ─────────────────────────────────────────────────────────────
async function submitCheckout() {
  if (!selectedId) { alert("Please select your check-in first."); return; }

  const timeout  = document.getElementById("co-timeout").value;
  const status   = document.getElementById("co-status").value;
  if (!timeout || !status) { alert("Please fill in time out and task status."); return; }

  const checked = [...document.querySelectorAll("#page-checkout .check-item input:checked")].map(c => c.value);
  const payload = {
    action:   "checkout",
    id:       selectedId,
    timeout,  status,
    tasks:    [...checked, ...otherTasks],
    issues:   document.getElementById("co-issues").value.trim(),
    followup: document.getElementById("co-followup").value
  };

  const btn = document.querySelector(".btn-checkout");
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    await post(payload);
    showBanner("banner-checkout");
    document.getElementById("co-timeout").value  = "";
    document.getElementById("co-status").value   = "";
    document.getElementById("co-issues").value   = "";
    document.getElementById("co-followup").value = "";
    document.querySelectorAll("#page-checkout .check-item input").forEach(c => c.checked = false);
    otherTasks = [];
    renderOtherTags();
    selectedId = null;
    document.getElementById("checkout-form").style.display = "none";
    await loadOpenCheckins();
  } catch (e) {
    alert("Could not save check-out. Please check your connection and try again.");
  }

  btn.textContent = "Submit check-out";
  btn.disabled = false;
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD — reads directly from Google Sheet
// ─────────────────────────────────────────────────────────────
async function refreshDashboard() {
  document.getElementById("entries-list").innerHTML = '<div class="empty">Loading all entries...</div>';
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getAll`, { cache: "no-store" });
    const text = await res.text();
    const json = JSON.parse(text);
    if (json.status === "ok") {
      allEntries = json.data || [];
    } else {
      throw new Error(json.message);
    }
  } catch(e) {
    document.getElementById("entries-list").innerHTML = '<div class="empty">Could not load data. Please check your connection and try again.<br><br><button class="btn-sm" onclick="refreshDashboard()">Retry</button></div>';
    return;
  }
  updateMetrics();
  populateFilters();
  if (currentSubTab === "entries") renderEntries();
  else renderLocSummary();
}

function updateMetrics() {
  document.getElementById("m-total").textContent       = allEntries.length;
  document.getElementById("m-open").textContent        = allEntries.filter(e => e.complete === "No").length;
  document.getElementById("m-locations").textContent   = new Set(allEntries.map(e => e.location)).size;
  document.getElementById("m-escalations").textContent = allEntries.filter(e => e.followup && e.followup.includes("Escalation")).length;
}

function populateFilters() {
  const fp = document.getElementById("filter-person");
  const fl = document.getElementById("filter-location");
  const fd = document.getElementById("filter-date");
  const pv = fp.value, lv = fl.value, dv = fd.value;
  const people = [...new Set(allEntries.map(e => e.name))].sort();
  const locs   = [...new Set(allEntries.map(e => e.location))].sort();
  const dates  = [...new Set(allEntries.map(e => e.date))].sort().reverse();
  fp.innerHTML = '<option value="">All staff</option>'     + people.map(p => `<option ${p===pv?"selected":""}>${p}</option>`).join("");
  fl.innerHTML = '<option value="">All locations</option>' + locs.map(l   => `<option ${l===lv?"selected":""}>${l}</option>`).join("");
  fd.innerHTML = '<option value="">All dates</option>'     + dates.map(d  => `<option ${d===dv?"selected":""}>${d}</option>`).join("");
}

function switchSubTab(tab, btn) {
  document.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentSubTab = tab;
  document.getElementById("subtab-entries").style.display   = tab === "entries"   ? "block" : "none";
  document.getElementById("subtab-locations").style.display = tab === "locations" ? "block" : "none";
  if (tab === "locations") renderLocSummary();
}

function renderEntries() {
  const pv = document.getElementById("filter-person").value;
  const lv = document.getElementById("filter-location").value;
  const dv = document.getElementById("filter-date").value;
  const filtered = allEntries
    .filter(e => (!pv||e.name===pv) && (!lv||e.location===lv) && (!dv||e.date===dv))
    .sort((a,b) => b.id - a.id);

  const el = document.getElementById("entries-list");
  if (!filtered.length) { el.innerHTML = '<div class="empty">No entries match the selected filters.</div>'; return; }

  el.innerHTML = filtered.map(e => {
    const isOpen = e.complete === "No";
    const isEsc  = e.followup && e.followup.includes("Escalation");
    const isOk   = e.status === "All tasks completed";
    const bc = isOpen ? "badge-open" : isEsc ? "badge-esc" : isOk ? "badge-ok" : "badge-warn";
    const bt = isOpen ? "On-site"    : isEsc ? "Escalation" : isOk ? "Completed" : "Partial";
    return `<div class="entry-card">
      <span class="entry-name">${esc(e.name)}</span><span class="badge ${bc}">${bt}</span>
      <div class="entry-meta">${esc(e.location)} · ${e.date}<br>In: ${e.timein}${e.timeout ? " · Out: "+e.timeout : " · <em>Still on-site</em>"}</div>
      ${e.tasks ? `<div class="task-pills">${e.tasks.split(", ").map(t=>`<span class="task-pill">${esc(t)}</span>`).join("")}</div>` : ""}
      ${e.issues   ? `<div class="entry-notes">${esc(e.issues)}</div>` : ""}
      ${e.followup && e.followup !== "No follow-up needed" ? `<div class="entry-followup">⚠ ${esc(e.followup)}</div>` : ""}
    </div>`;
  }).join("");
}

function clearFilters() {
  document.getElementById("filter-person").value   = "";
  document.getElementById("filter-location").value = "";
  document.getElementById("filter-date").value     = "";
  renderEntries();
}

function renderLocSummary() {
  const el = document.getElementById("loc-summary");
  const completed = allEntries.filter(e => e.complete === "Yes");
  if (!completed.length) { el.innerHTML = '<div class="empty">No completed visits yet.</div>'; return; }
  const locs = {};
  completed.forEach(e => {
    if (!locs[e.location]) locs[e.location] = { visits:0, issues:0, escalations:0, partial:0, staff: new Set() };
    const l = locs[e.location]; l.visits++; l.staff.add(e.name);
    if (e.issues && e.issues.trim()) l.issues++;
    if (e.followup && e.followup.includes("Escalation")) l.escalations++;
    if (e.status && e.status.includes("Partial")) l.partial++;
  });
  const sorted = Object.entries(locs).sort((a,b) => b[1].issues - a[1].issues);
  const maxI = Math.max(...sorted.map(([,v])=>v.issues),1);
  const maxE = Math.max(...sorted.map(([,v])=>v.escalations),1);
  el.innerHTML = '<p class="loc-intro">Ranked by reported issues — highest first</p>' +
    sorted.map(([loc,v],i) => {
      const ip = Math.round(v.issues/maxI*100);
      const ep = Math.round(v.escalations/maxE*100);
      const heat = ip>60?"high":ip>25?"mid":"low";
      return `<div class="loc-card ${heat}">
        <div class="loc-rank">#${i+1}</div>
        <div class="loc-name">${esc(loc)}</div>
        <div class="bar-row bar-issues"><span class="bar-lbl">Issues</span><div class="bar-track"><div class="bar-fill" style="width:${ip}%"></div></div><span class="bar-val">${v.issues}</span></div>
        <div class="bar-row bar-esc"><span class="bar-lbl">Escalations</span><div class="bar-track"><div class="bar-fill" style="width:${ep}%"></div></div><span class="bar-val">${v.escalations}</span></div>
        <div class="loc-stats">
          <div class="loc-stat"><strong>${v.visits}</strong>visits</div>
          <div class="loc-stat"><strong>${v.staff.size}</strong>staff</div>
          <div class="loc-stat"><strong>${v.partial}</strong>partial</div>
        </div>
      </div>`;
    }).join("");
}

// ─────────────────────────────────────────────────────────────
//  CSV EXPORT
// ─────────────────────────────────────────────────────────────
function exportCSV() {
  if (!allEntries.length) { alert("No data to export yet."); return; }
  const headers = ["Name","Date","Location","Time In","Time Out","Status","Tasks","Issues","Follow-up","Complete"];
  const rows = allEntries.map(e => [
    cell(e.name), cell(e.date), cell(e.location), cell(e.timein),
    cell(e.timeout), cell(e.status), cell(e.tasks),
    cell(e.issues), cell(e.followup), cell(e.complete)
  ]);
  const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `OOS_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
async function post(data) {
  const url = SCRIPT_URL + "?payload=" + encodeURIComponent(JSON.stringify(data));
  const res = await fetch(url, { method: "GET" });
  return res.json();
}
function showBanner(id) {
  const b = document.getElementById(id);
  b.style.display = "block";
  setTimeout(() => b.style.display = "none", 4000);
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function nowTime()  { const n = new Date(); return String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0"); }
function esc(s)     { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function cell(v)    { return `"${(v||"").replace(/"/g,'""')}"`; }

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────
document.getElementById("ci-date").value = todayStr();
