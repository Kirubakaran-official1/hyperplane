// Server shell around the Hyperplane dashboard: login, data picker, Admin (settings, Sync now, customers), Compare, Helpdesk.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dashboard, mapDB, parseWorkbookFile, HyperplaneLogo, ThemeToggle, CSS, APP_NAME, FocusCard, Pill, SymCell,
  ListCopy, HealthBadge, HEALTH_C, HEALTH_LEVELS, sectorColor, SectionTitle, EqRow, formatDateLabel,
  InfoTip, classifySignal, TF_WEIGHT, AlgoEditor, prebuiltAlgos, exprText,
} from "./dashboard.jsx";
import { Helpdesk, InboxBell, useHelpdeskUnread } from "../shared/helpdesk.jsx";

// ─── API ──────────────────────────────────────────────────────────────────────
let onUnauthorized = () => {};
async function api(path, opts = {}) {
  const init = { credentials: "same-origin", ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers["content-type"] = "application/json"; }
  const res = await fetch(path, init);
  if (res.status === 401 && !path.endsWith("/login")) { onUnauthorized(); throw new Error("Please log in"); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.detail) || `${res.status} ${res.statusText}`);
  return data;
}

const pref = (k, d) => { try { return window.localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const fmtTime = iso => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const fmtDay = iso => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtDT = iso => iso ? `${fmtDay(iso)} ${fmtTime(iso)}` : "—";
const fmtBytes = b => b == null ? "—" : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const SOURCE_LABEL = { scheduled: "scheduled", manual: "sync", import: "imported", local: "local file" };

const btn = (primary = false) => ({
  padding: "5px 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${primary ? "var(--acc)" : "var(--b2)"}`, background: primary ? "var(--adim)" : "var(--s2)",
  color: primary ? "var(--acc)" : "var(--t1)",
});
const input = { background: "var(--s2)", border: "1px solid var(--b2)", color: "var(--t1)", borderRadius: 6, fontSize: 11.5, padding: "4px 7px", colorScheme: "dark" };

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, theme, setTheme }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr("");
    try { onLogin(await api("/api/login", { method: "POST", json: { username: u, password: p } })); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", position: "relative", padding: "0 16px" }}>
      <div className="grid-bg" />
      <div style={{ position: "absolute", top: 20, right: 24, zIndex: 2 }}><ThemeToggle theme={theme} setTheme={setTheme} /></div>
      <form onSubmit={submit} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 360, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "28px 26px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <HyperplaneLogo size={56} />
          <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--acc)", letterSpacing: "4px", textTransform: "uppercase" }}>{APP_NAME}</div>
        </div>
        <label htmlFor="login-user" style={{ fontSize: 11, color: "var(--t2)" }}>User ID</label>
        <input id="login-user" autoFocus autoComplete="username" value={u} onChange={e => setU(e.target.value)} style={{ ...input, width: "100%", boxSizing: "border-box", fontSize: 14, padding: "9px 10px", margin: "4px 0 12px" }} />
        <label htmlFor="login-pass" style={{ fontSize: 11, color: "var(--t2)" }}>Password</label>
        <input id="login-pass" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} style={{ ...input, width: "100%", boxSizing: "border-box", fontSize: 14, padding: "9px 10px", margin: "4px 0 16px" }} />
        {err && <div style={{ color: "var(--short)", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy || !u || !p} style={{ ...btn(true), width: "100%", padding: "10px", fontSize: 13.5, opacity: busy || !u || !p ? .6 : 1 }}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

// ─── DATA PICKER (header) ─────────────────────────────────────────────────────
function DataPicker({ snaps, sel, setSel, loading }) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const days = useMemo(() => [...new Set(snaps.map(s => s.trade_date))].sort(), [snaps]);
  const latest = snaps[0];
  const curDay = sel.mode === "range" ? null : sel.date;
  const dayColl = snaps.filter(s => s.trade_date === curDay).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const [from, setFrom] = useState(sel.from || days[Math.max(0, days.length - 5)] || "");
  const [to, setTo] = useState(sel.to || days[days.length - 1] || "");
  const [perDay, setPerDay] = useState(sel.perDay || "latest");
  const pickDate = d => {
    if (!d) return;
    const has = days.filter(x => x <= d);                       // snap to the nearest earlier day with data
    const day = days.includes(d) ? d : has[has.length - 1] || days[0];
    const list = snaps.filter(s => s.trade_date === day).sort((a, b) => b.taken_at.localeCompare(a.taken_at));
    setSel({ mode: "single", date: day, id: list[0] && list[0].id, follow: latest && list[0] && list[0].id === latest.id });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, position: "relative" }}>
      <input id="data-date" type="date" value={curDay || ""} min={days[0]} max={days[days.length - 1]} onChange={e => pickDate(e.target.value)} title="Pick a day" style={{ ...input, width: 128 }} />
      {sel.mode !== "range" && (
        <select id="data-collection" value={sel.mode === "day" ? "day" : String(sel.id || "")} style={{ ...input, maxWidth: 190 }}
          onChange={e => e.target.value === "day" ? setSel({ mode: "day", date: curDay }) : setSel({ mode: "single", date: curDay, id: +e.target.value, follow: latest && +e.target.value === latest.id })}>
          {dayColl.map(s => <option key={s.id} value={s.id}>{fmtTime(s.taken_at)} · {SOURCE_LABEL[s.source] || s.source}</option>)}
          {dayColl.length > 1 && <option value="day">All {dayColl.length} collections of this day</option>}
        </select>
      )}
      {sel.mode === "range" && <span style={{ fontSize: 11, color: "var(--acc)", whiteSpace: "nowrap" }}>{fmtDay(sel.from)} → {fmtDay(sel.to)} · {sel.perDay === "all" ? "all" : "latest per day"}</span>}
      <button onClick={() => setRangeOpen(v => !v)} style={btn(sel.mode === "range")} title="Load several days to compare (Trend & Versions)">Range</button>
      {latest && !(sel.mode === "single" && sel.id === latest.id) && <button onClick={() => pickDate(latest.trade_date)} style={btn()} title="Back to the latest collection">Latest</button>}
      {loading && <span style={{ fontSize: 10.5, color: "var(--t3)" }}>loading…</span>}
      {rangeOpen && (
        <div style={{ position: "absolute", top: 40, left: 0, zIndex: 300, background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: 10, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", gap: 8, minWidth: 280 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>Load a date range</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--t2)" }}>
            <input id="range-from" type="date" value={from} min={days[0]} max={days[days.length - 1]} onChange={e => setFrom(e.target.value)} style={input} /> to
            <input id="range-to" type="date" value={to} min={days[0]} max={days[days.length - 1]} onChange={e => setTo(e.target.value)} style={input} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Pill active={perDay === "latest"} onClick={() => setPerDay("latest")}>Latest per day</Pill>
            <Pill active={perDay === "all"} onClick={() => setPerDay("all")}>Every collection</Pill>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--t3)" }}>Each collection becomes one file in the Control Tower scope and in Trend &amp; Versions (up to 60).</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setRangeOpen(false)} style={btn()}>Cancel</button>
            <button disabled={!from || !to} onClick={() => { setSel({ mode: "range", from: from <= to ? from : to, to: from <= to ? to : from, perDay }); setRangeOpen(false); }} style={btn(true)}>Load range</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout, onLocalFiles }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef();
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} style={btn()}>{user.name}{user.admin ? " · admin" : ""} ▾</button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={e => { e.target.files.length && onLocalFiles(e.target.files); e.target.value = ""; setOpen(false); }} />
      {open && (
        <div style={{ position: "absolute", right: 0, top: 34, zIndex: 300, background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: 8, padding: 6, minWidth: 210, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
          <div onClick={() => fileRef.current.click()} className="ct-nav-link" style={{ padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>📂 Open a local Excel file…</div>
          <div onClick={onLogout} className="ct-nav-link" style={{ padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--short)" }}>⎋ Log out</div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
const toForm = st => ({ ...st, skip_text: (st.skip_dates || []).join("\n"),
  add_text: (st.index_add || []).join("\n"), keep_text: (st.index_keep || []).join("\n") });
const symList = t => (t || "").split(/[\s,]+/).map(x => x.trim().toUpperCase().replace(/^NSE:/, "")).filter(Boolean);

function AdminTab({ snaps, reloadSnaps, notify, sync, onSync, onSaved }) {
  const [sys, setSys] = useState(null);
  const running = sync && (sync.status === "queued" || sync.status === "running");
  const elapsed = running && sync.started_at ? Math.round((Date.now() - new Date(sync.started_at)) / 1000) : 0;
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [openJob, setOpenJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [imp, setImp] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [algoSel, setAlgoSel] = useState(0);
  const load = useCallback(async () => {
    const [s, c, j] = await Promise.all([api("/api/admin/system"), api("/api/admin/settings"), api("/api/jobs?limit=40")]);
    setSys(s); setCfg(c); setJobs(j);
    setForm(f => f || toForm(c.settings));
  }, []);
  useEffect(() => { load().catch(e => notify(e.message, "err")); const t = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!openJob) return;
    let stop = false;
    const tick = async () => { try { const j = await api(`/api/jobs/${openJob.id}`); if (!stop) setOpenJob(j); } catch { /* ignore */ } };
    tick(); const t = setInterval(tick, 4000); return () => { stop = true; clearInterval(t); };
  }, [openJob && openJob.id]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, skip_dates: form.skip_text.split(/[\s,]+/).filter(Boolean), index_add: symList(form.add_text), index_keep: symList(form.keep_text) };
      delete body.skip_text; delete body.add_text; delete body.keep_text;
      const c = await api("/api/admin/settings", { method: "PUT", json: body });
      setCfg(c); setForm(toForm(c.settings)); notify("Settings saved"); onSaved && onSaved();
    } catch (e) { notify(e.message, "err"); } finally { setSaving(false); }
  };
  const doImport = async files => {
    const fd = new FormData(); [...files].forEach(f => fd.append("files", f));
    setImp({ busy: true, results: [] });
    try { const r = await api("/api/admin/import", { method: "POST", body: fd }); setImp({ busy: false, results: r.results }); reloadSnaps(); }
    catch (e) { setImp({ busy: false, results: [{ file: "upload", ok: false, error: e.message }] }); }
  };
  const del = async id => {
    try { await api(`/api/admin/snapshots/${id}`, { method: "DELETE" }); setConfirmDel(null); notify("Collection deleted"); reloadSnaps(); }
    catch (e) { notify(e.message, "err"); }
  };
  if (!sys || !form) return <div style={{ padding: 30, color: "var(--t3)" }}>Loading admin…</div>;
  const TH = { position: "sticky", top: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "6px 8px", fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)", textAlign: "left", whiteSpace: "nowrap" };
  const TD = { padding: "5px 8px", fontFamily: "var(--mono)", whiteSpace: "nowrap", fontSize: 11 };
  const ST = { done: "var(--long)", failed: "var(--short)", running: "var(--acc)", queued: "var(--mixed)", cancelled: "var(--t3)" };
  const Tile = ({ label, value, sub, color = "var(--t1)" }) => (
    <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 17, fontWeight: 700, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const times = form.schedule_times || [];
  return (
    <div style={{ padding: "18px 22px" }}>
      <SectionTitle icon="⚙️" title="Admin" sub="Collection schedule, stored data, history and imports. User IDs and passwords are managed in config.ini on the server."
        right={<button onClick={onSync} disabled={running} title="Collect today's data now" style={{ ...btn(true), opacity: running ? .85 : 1 }}>
          {running ? `⟳ Collecting… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "⟳ Sync now"}
        </button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 12 }}>
        <Tile label="Collector" value={sys.worker.alive ? "● Online" : "● Offline"} color={sys.worker.alive ? "var(--long)" : "var(--short)"} sub={sys.worker.last_seen ? `seen ${fmtDT(sys.worker.last_seen)}` : "never seen"} />
        <Tile label="Collections stored" value={sys.collections.toLocaleString()} sub={sys.first ? `${fmtDay(sys.first)} → ${fmtDay(sys.last)}` : "none yet"} />
        <Tile label="Database" value={fmtBytes(sys.db_bytes)} sub={`${fmtBytes(sys.stored_bytes)} of collection data`} />
        <Tile label="Disk free" value={fmtBytes(sys.disk.free)} sub={`of ${fmtBytes(sys.disk.total)}`} />
        <Tile label="Next collection" value={cfg.next_runs[0] ? fmtTime(cfg.next_runs[0]) : "—"} sub={cfg.next_runs[0] ? fmtDay(cfg.next_runs[0]) : "no schedule"} color="var(--acc)" />
        <Tile label="Telegram" value={!form.telegram_enabled ? "Off" : sys.telegram_configured ? "On" : "Not set up"} color={form.telegram_enabled && sys.telegram_configured ? "var(--long)" : "var(--t2)"} sub={sys.telegram_configured ? "bot token in config.ini" : "add bot_token / chat_id in config.ini"} />
      </div>

      <EqRow height={460} cols="minmax(0,1fr) minmax(0,1.3fr)" min={320}>
        <FocusCard icon="🕘" title="Collection schedule" sub="Times are IST. Each time creates one stored collection per trading day.">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginBottom: 5 }}>Collection times</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {times.map((t, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <input id={`slot-${i}`} type="time" value={t} onChange={e => setForm(f => ({ ...f, schedule_times: f.schedule_times.map((x, j) => j === i ? e.target.value : x) }))} style={input} />
                    <button onClick={() => setForm(f => ({ ...f, schedule_times: f.schedule_times.filter((_, j) => j !== i) }))} title="Remove this time" style={{ ...btn(), padding: "3px 7px" }}>✕</button>
                  </span>
                ))}
                <button onClick={() => setForm(f => ({ ...f, schedule_times: [...f.schedule_times, "12:00"] }))} style={btn()}>+ Add time</button>
              </div>
            </div>
            <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}><input id="weekdays-only" type="checkbox" checked={form.weekdays_only} onChange={e => setForm(f => ({ ...f, weekdays_only: e.target.checked }))} /> Weekdays only (skip Saturday and Sunday)</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}><input id="telegram-on" type="checkbox" checked={form.telegram_enabled} onChange={e => setForm(f => ({ ...f, telegram_enabled: e.target.checked }))} /> Send each collection to Telegram</label>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginBottom: 4 }}>Skip these dates (market holidays), one per line, YYYY-MM-DD</div>
              <textarea id="skip-dates" value={form.skip_text} onChange={e => setForm(f => ({ ...f, skip_text: e.target.value }))} rows={3} style={{ ...input, width: "100%", boxSizing: "border-box", fontFamily: "var(--mono)" }} />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label style={{ fontSize: 11.5 }}>Keep collections for <input id="retention" type="number" min="0" value={form.retention_days} onChange={e => setForm(f => ({ ...f, retention_days: +e.target.value || 0 }))} style={{ ...input, width: 64 }} /> days <span style={{ color: "var(--t3)" }}>(0 = forever)</span></label>
              <label style={{ fontSize: 11.5 }}>Run a missed time if back within <input id="catchup" type="number" min="0" max="720" value={form.catch_up_minutes} onChange={e => setForm(f => ({ ...f, catch_up_minutes: +e.target.value || 0 }))} style={{ ...input, width: 60 }} /> min</label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5 }}>Sync now collections:
              <Pill active={form.manual_keep === "all"} onClick={() => setForm(f => ({ ...f, manual_keep: "all" }))}>Keep all</Pill>
              <Pill active={form.manual_keep === "latest"} onClick={() => setForm(f => ({ ...f, manual_keep: "latest" }))}>Keep only the latest per day</Pill>
            </div>
            <label style={{ fontSize: 11.5 }} title="Used by every NR scan and the NR Trap. Applies from the next collection.">
              NR mother candle: body at least <input id="mother-body-pct" type="number" min="1" max="100" step="1" value={form.nr_mother_body_pct} onChange={e => setForm(f => ({ ...f, nr_mother_body_pct: e.target.value === "" ? "" : +e.target.value }))} style={{ ...input, width: 56 }} /> % of the candle (high − low)
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={save} disabled={saving} style={btn(true)}>{saving ? "Saving…" : "Save settings"}</button>
              <span style={{ fontSize: 10.5, color: "var(--t3)" }}>Next: {cfg.next_runs.slice(0, 3).map(fmtDT).join(" · ") || "none"}</span>
            </div>
          </div>
        </FocusCard>

        <FocusCard icon="📜" title="Collection history" sub="Scheduled runs and Sync now requests. Click a row to see its log.">
          <div style={{ overflow: "auto", flex: 1 }} className="tower-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "Started", "Type", "By", "Status", "Took", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {jobs.map(j => {
                  const took = j.started_at && j.finished_at ? Math.round((new Date(j.finished_at) - new Date(j.started_at)) / 1000) : null;
                  return (
                    <tr key={j.id} onClick={() => setOpenJob(j)} className="sec-row" style={{ borderBottom: "1px solid var(--b1)", cursor: "pointer", background: openJob && openJob.id === j.id ? "var(--adim)" : "transparent" }}>
                      <td style={TD}>{j.id}</td>
                      <td style={TD}>{fmtDT(j.started_at || j.created_at)}</td>
                      <td style={TD}>{j.kind === "scheduled" ? `⏰ ${j.slot}` : "⟳ sync"}</td>
                      <td style={TD}>{j.requested_by || ""}</td>
                      <td style={{ ...TD, color: ST[j.status], fontWeight: 700 }}>{j.status}</td>
                      <td style={TD}>{took != null ? `${Math.floor(took / 60)}m ${took % 60}s` : ""}</td>
                      <td style={TD}>{j.status === "queued" && <button onClick={e => { e.stopPropagation(); api(`/api/jobs/${j.id}/cancel`, { method: "POST" }).then(load).catch(x => notify(x.message, "err")); }} style={{ ...btn(), padding: "2px 7px" }}>Cancel</button>}</td>
                    </tr>
                  );
                })}
                {!jobs.length && <tr><td colSpan={7} style={{ padding: 14, color: "var(--t3)", textAlign: "center" }}>No collections have run yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {openJob && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Log of #{openJob.id}</span>
                {openJob.error && <span style={{ fontSize: 10.5, color: "var(--short)" }}>{openJob.error}</span>}
                <button onClick={() => setOpenJob(null)} style={{ ...btn(), padding: "2px 7px", marginLeft: "auto" }}>Close</button>
              </div>
              <pre style={{ maxHeight: 150, overflow: "auto", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 6, padding: 8, fontSize: 10, lineHeight: 1.45, whiteSpace: "pre-wrap", margin: 0 }}>{openJob.log || "(no output yet)"}</pre>
            </div>
          )}
        </FocusCard>
      </EqRow>

      <EqRow height={400} cols="minmax(0,1.6fr) minmax(0,1fr)" min={320}>
        <FocusCard icon="🗄" title={`Stored collections (${snaps.length})`} sub="Download the Excel of any collection, or delete one you don't need.">
          <div style={{ overflow: "auto", flex: 1 }} className="tower-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Date", "Time", "Source", "Stocks", "Signals", "Size", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {snaps.map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--b1)" }}>
                    <td style={TD}>{fmtDay(s.taken_at)}</td>
                    <td style={TD}>{fmtTime(s.taken_at)}</td>
                    <td style={TD}>{SOURCE_LABEL[s.source] || s.source}{s.slot ? ` ${s.slot}` : ""}</td>
                    <td style={TD}>{(s.stocks || 0).toLocaleString()}</td>
                    <td style={TD}>{(s.signals || 0).toLocaleString()}</td>
                    <td style={TD}>{fmtBytes(s.size_bytes)}</td>
                    <td style={{ ...TD, display: "flex", gap: 6 }}>
                      {s.has_excel && <a href={`/api/snapshots/${s.id}/excel`} style={{ ...btn(), padding: "2px 7px", textDecoration: "none" }}>Excel</a>}
                      {confirmDel === s.id
                        ? <><button onClick={() => del(s.id)} style={{ ...btn(), padding: "2px 7px", color: "var(--short)", borderColor: "var(--short)" }}>Confirm delete</button><button onClick={() => setConfirmDel(null)} style={{ ...btn(), padding: "2px 7px" }}>Keep</button></>
                        : <button onClick={() => setConfirmDel(s.id)} style={{ ...btn(), padding: "2px 7px" }}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FocusCard>
        <FocusCard icon="📥" title="Import old Excel files" sub="Load your earlier detailed_signals_YYYYMMDD.xlsx files so the history starts full. The date comes from the file name (15:30 when no time is in it).">
          <input id="import-files" type="file" accept=".xlsx" multiple onChange={e => { e.target.files.length && doImport(e.target.files); e.target.value = ""; }} style={{ fontSize: 11.5, color: "var(--t2)", marginBottom: 10 }} />
          {imp && imp.busy && <div style={{ fontSize: 11.5, color: "var(--acc)" }}>Importing… large files take a few seconds each.</div>}
          {imp && !imp.busy && imp.results.map((r, i) => (
            <div key={i} style={{ fontSize: 11, marginBottom: 3, color: r.ok ? "var(--long)" : "var(--short)" }}>{r.ok ? "✓" : "✗"} {r.file}{r.ok ? ` → ${fmtDT(r.taken_at)}` : ` — ${r.error}`}</div>
          ))}
          <div style={{ borderTop: "1px dashed var(--b2)", margin: "12px 0 8px" }} />
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>👤 Users (from config.ini)</div>
          {sys.users.map(u => <div key={u.name} style={{ fontSize: 11.5, fontFamily: "var(--mono)", marginBottom: 2 }}>{u.name} <span style={{ color: u.admin ? "var(--acc)" : "var(--t3)" }}>{u.admin ? "admin" : "viewer"}</span></div>)}
          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, lineHeight: 1.5 }}>To add or remove a user or change a password, edit <code>config.ini</code> on the server under <code>[users]</code>. It is picked up automatically — no restart.</div>
        </FocusCard>
      </EqRow>

      <FocusCard icon="📊" title="Technical indicators (Control Tower)" style={{ marginBottom: 12 }}
        sub="From the technical-data screener. When on, the Control Tower adds each timeframe's technical reading to every score, sector ranking and setup, and shows the Technical Quant algo builder. Other tabs are not affected.">
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
          <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", fontWeight: 700 }}>
            <input id="tech-on" type="checkbox" checked={!!form.tech_enabled} onChange={e => setForm(f => ({ ...f, tech_enabled: e.target.checked }))} /> Use technical indicators
          </label>
          <label style={{ fontSize: 11.5 }} title="How much one timeframe's technicals count when all indicators agree, in 'zone breaks on that timeframe'. 0 = show the readings but don't score them.">
            Weight <input id="tech-weight" type="number" min="0" max="5" step="0.1" value={form.tech_weight} onChange={e => setForm(f => ({ ...f, tech_weight: e.target.value === "" ? "" : +e.target.value }))} style={{ ...input, width: 60 }} /> × a zone break
          </label>
          <span style={{ fontSize: 10.5, color: "var(--t3)" }}>Bollinger: close above upper = bullish, below lower = bearish · Supertrend: close above = bullish, below = bearish (no levels needed)</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, opacity: form.tech_enabled ? 1 : .55 }}>
            <thead><tr>{["TF", "RSI bullish ≥", "RSI bearish ≤", "ADX", "ADX value", "MACD bullish >", "MACD bearish <", "CCI bullish ≥", "CCI bearish ≤"].map(h => <th key={h} style={{ ...TH, position: "static" }}>{h}</th>)}</tr></thead>
            <tbody>
              {["D", "W", "M", "Q", "Y"].map(tf => {
                const c = (form.tech || {})[tf] || {};
                const set = (k, v) => setForm(f => ({ ...f, tech: { ...(f.tech || {}), [tf]: { ...((f.tech || {})[tf] || {}), [k]: v } } }));
                const num = k => <input id={`tech-${tf}-${k}`} type="number" step="any" value={c[k] ?? ""} onChange={e => set(k, e.target.value)} style={{ ...input, width: 70 }} />;
                return (
                  <tr key={tf} style={{ borderBottom: "1px solid var(--b1)" }}>
                    <td style={{ ...TD, fontWeight: 700 }}>{{ D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly", Y: "Yearly" }[tf]}</td>
                    <td style={TD}>{num("rsi_bull")}</td><td style={TD}>{num("rsi_bear")}</td>
                    <td style={TD}>
                      <select id={`tech-${tf}-adx_mode`} value={c.adx_mode || "below"} onChange={e => set("adx_mode", e.target.value)} style={input} title="below = trend recently started · above = strong, established trend">
                        <option value="below">below (fresh trend)</option><option value="above">above (strong trend)</option>
                      </select>
                    </td>
                    <td style={TD}>{num("adx_value")}</td>
                    <td style={TD}>{num("macd_bull")}</td><td style={TD}>{num("macd_bear")}</td>
                    <td style={TD}>{num("cci_bull")}</td><td style={TD}>{num("cci_bear")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, lineHeight: 1.5 }}>ADX has no direction of its own: when it meets your rule it confirms the trend in the direction of that timeframe's Supertrend.</div>
        <div style={{ marginTop: 8 }}><button onClick={save} disabled={saving} style={btn(true)}>{saving ? "Saving…" : "Save settings"}</button></div>
      </FocusCard>

      {(() => {
        const usingDefault = !form.algos;
        const algos = form.algos || prebuiltAlgos(form.tech || {});
        const i = Math.min(algoSel, Math.max(0, algos.length - 1)), cur = algos[i];
        const setAlgos = fn => setForm(f => ({ ...f, algos: fn(f.algos || prebuiltAlgos(f.tech || {})) }));
        const small = { fontSize: 10.5, padding: "3px 8px", borderRadius: 5, border: "1px solid var(--b2)", color: "var(--t2)", background: "var(--s2)" };
        return (
          <FocusCard icon="🧪" title="Algorithms (Technical Quant)" style={{ marginBottom: 12 }}
            sub="The algorithms every user sees in the Control Tower's Technical Quant section. Only admins can create or change them here. Press Save settings to publish.">
            {usingDefault && <div style={{ fontSize: 11, color: "var(--mixed)", marginBottom: 8 }}>Showing the ready-made set (built from the indicator levels above). Change anything and save to make it your own list.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(190px,230px) minmax(0,1fr)", gap: 12 }}>
              <div>
                <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--b1)", borderRadius: 8, padding: 6 }} className="tower-scroll">
                  {algos.map((a, k) => (
                    <div key={a.id + k} onClick={() => setAlgoSel(k)} className="sec-row" style={{ padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11.5, color: a.dir >= 0 ? "var(--long)" : "var(--short)", background: k === i ? "var(--adim)" : "transparent", fontWeight: k === i ? 700 : 500 }}>
                      {a.dir >= 0 ? "▲" : "▼"} {a.name} <span style={{ color: "var(--t3)", fontWeight: 400 }}>· {a.rules.length}</span>
                    </div>
                  ))}
                  {!algos.length && <div style={{ fontSize: 11, color: "var(--t3)", padding: 6 }}>No algorithms.</div>}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                  <button onClick={() => { setAlgos(l => [...l, { id: `a${Date.now()}`, name: "New algorithm", dir: 1, rules: [{ tf: "D", f: "rsi", op: ">", rhs: "num", v: 70 }] }]); setAlgoSel(algos.length); }} style={{ ...small, color: "var(--acc)", borderColor: "var(--acc)" }}>＋ New</button>
                  {cur && <button onClick={() => { setAlgos(l => [...l, { ...cur, id: `a${Date.now()}`, name: `${cur.name} (copy)` }]); setAlgoSel(algos.length); }} style={small}>Duplicate</button>}
                  {cur && <button onClick={() => { setAlgos(l => l.filter((_, k) => k !== i)); setAlgoSel(Math.max(0, i - 1)); }} style={{ ...small, color: "var(--short)", borderColor: "var(--short)" }}>Delete</button>}
                  {cur && i > 0 && <button onClick={() => { setAlgos(l => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }); setAlgoSel(i - 1); }} style={small} title="Move up">↑</button>}
                  {cur && i < algos.length - 1 && <button onClick={() => { setAlgos(l => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; }); setAlgoSel(i + 1); }} style={small} title="Move down">↓</button>}
                  {!usingDefault && <button onClick={() => { setForm(f => ({ ...f, algos: null })); setAlgoSel(0); }} style={small} title="Go back to the ready-made set built from the indicator levels">Reset to ready-made</button>}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                {cur ? <AlgoEditor algo={cur} onChange={a => setAlgos(l => l.map((x, k) => k === i ? a : x))} />
                     : <div style={{ fontSize: 11.5, color: "var(--t3)" }}>Create an algorithm with ＋ New.</div>}
                {cur && <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 8, lineHeight: 1.6 }}>Reads as: {exprText(cur) || "—"}</div>}
              </div>
            </div>
            <div style={{ marginTop: 10 }}><button onClick={save} disabled={saving} style={btn(true)}>{saving ? "Saving…" : "Save settings"}</button></div>
          </FocusCard>
        );
      })()}

      <FocusCard icon="📉" title="Indices & ETFs" sub="The dashboard hides these when “Hide indices & ETFs” is on (side nav, on by default). Found automatically: sector “Indices”, symbols with NIFTY / SENSEX / BEES or ending in ETF, and names with the word ETF / Index Fund / Fund of Funds.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          {[["add_text", "Also treat as index / ETF (hide)", "e.g. SILVER001, GOLDCASE"], ["keep_text", "Not an index — always show", "e.g. a real stock that got caught"]].map(([k, l, ph]) => (
            <div key={k}>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginBottom: 4 }}>{l} — one symbol per line</div>
              <textarea id={`idx-${k}`} value={form[k]} placeholder={ph} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} rows={4} style={{ ...input, width: "100%", boxSizing: "border-box", fontFamily: "var(--mono)" }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}><button onClick={save} disabled={saving} style={btn(true)}>{saving ? "Saving…" : "Save settings"}</button></div>
      </FocusCard>
    </div>
  );
}

// ─── COMPARE (intraday / day / week / month / custom) ─────────────────────────
const COMPARE_MODES = [
  ["intraday", "Intraday", "first collection of the same day"],
  ["daily", "Day over day", "last collection of the previous day"],
  ["weekly", "Weekly", "last collection of the previous week"],
  ["monthly", "Monthly", "last collection of the previous month"],
  ["custom", "Custom", "pick both collections"],
];
const isoDay = d => d.toISOString().slice(0, 10);
function periodStart(day, mode) {
  const d = new Date(day + "T00:00:00Z");
  if (mode === "daily") return day;
  if (mode === "weekly") { d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return isoDay(d); }   // Monday
  if (mode === "monthly") { d.setUTCDate(1); return isoDay(d); }
  return null;
}
// The "from" collection for a preset, measured back from collection b
function compareFrom(snaps, b, mode) {
  if (!b || mode === "custom") return null;
  const asc = snaps.slice().sort((x, y) => x.taken_at.localeCompare(y.taken_at));
  if (mode === "intraday") { const f = asc.find(s => s.trade_date === b.trade_date); return f && f.id !== b.id ? f : null; }
  const start = periodStart(b.trade_date, mode);
  return asc.filter(s => s.trade_date < start).pop() || null;
}

function CollectionPicker({ id, snaps, days, value, onChange }) {
  const cur = snaps.find(s => s.id === value);
  const day = cur ? cur.trade_date : "";
  const list = snaps.filter(s => s.trade_date === day).sort((x, y) => x.taken_at.localeCompare(y.taken_at));
  const pickDay = d => {
    const earlier = days.filter(x => x <= d);
    const dd = days.includes(d) ? d : earlier[earlier.length - 1] || days[0];
    const l = snaps.filter(s => s.trade_date === dd).sort((x, y) => y.taken_at.localeCompare(x.taken_at));
    if (l[0]) onChange(l[0].id);
  };
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input id={`${id}-date`} type="date" value={day} min={days[0]} max={days[days.length - 1]} onChange={e => e.target.value && pickDay(e.target.value)} title="Pick a day (snaps to the nearest earlier day with data)" style={{ ...input, width: 128 }} />
      <select id={`${id}-time`} value={value || ""} onChange={e => onChange(+e.target.value)} title="Collection of that day" style={input}>
        {list.map(s => <option key={s.id} value={s.id}>{fmtTime(s.taken_at)} · {SOURCE_LABEL[s.source] || s.source}</option>)}
      </select>
    </span>
  );
}

const NR_TYPE = { BO: "Breakout", BD: "Breakdown", HN: "Near High", LW: "Near Low", B2NR: "Back to NR" };
const STAT_FILTERS = {
  all: () => true, up: r => r.move_pct > 0, down: r => r.move_pct < 0,
  new: r => r.new_signals.length > 0, lost: r => r.dropped_signals.length > 0,
};

function CompareTab({ snaps, health, db }) {
  const days = useMemo(() => [...new Set(snaps.map(s => s.trade_date))].sort(), [snaps]);
  const [b, setB] = useState(null);
  const [mode, setMode] = useState(null);
  const [customA, setCustomA] = useState(null);
  useEffect(() => { if (b == null && snaps.length) setB(snaps[0].id); }, [snaps]);
  const bSnap = snaps.find(s => s.id === b);
  useEffect(() => {                                  // default: intraday when the day has 2+ collections, else day over day
    if (mode || !bSnap) return;
    setMode(compareFrom(snaps, bSnap, "intraday") ? "intraday" : "daily");
  }, [bSnap, mode]);
  const presetA = useMemo(() => compareFrom(snaps, bSnap, mode), [snaps, bSnap, mode]);
  const a = mode === "custom" ? customA : presetA && presetA.id;
  const chooseMode = m => { if (m === "custom") setCustomA(a || (snaps[1] && snaps[1].id) || null); setMode(m); };
  const [data, setData] = useState(null); const [err, setErr] = useState("");
  const [q, setQ] = useState(""); const [onlySig, setOnlySig] = useState(true); const [fno, setFno] = useState(false);
  const [sort, setSort] = useState("move"); const [showAll, setShowAll] = useState(false);
  const [statF, setStatF] = useState("all");
  const [by, setBy] = useState("all");
  useEffect(() => {
    if (!a || !b || a === b) { setData(null); return; }
    setErr(""); setData(null);
    api(`/api/compare?a=${a}&b=${b}`).then(setData).catch(e => setErr(e.message));
  }, [a, b]);
  const allow = health && health.allow ? health.allow : new Set(HEALTH_LEVELS);
  const rows = useMemo(() => !data ? [] : data.rows.filter(r => r.move_pct != null
      && (!onlySig || r.n_b > 0 || r.n_a > 0) && (!fno || r.is_fno)
      && (!r.health || allow.has(r.health)) && (!q || r.symbol.includes(q.toUpperCase()) || (r.sector || "").toLowerCase().includes(q.toLowerCase()))),
    [data, onlySig, fno, q, allow]);
  // Strength change: every new / lost signal scored like the Focus score (timeframe weight x signal weight)
  const sigInfo = useMemo(() => {
    const m = {}; ((db && db.summary) || []).forEach(r => { m[r.Signal_Name] = r; });
    return name => {
      const nrm = name.match(/_(BO|BD|HN|LW|B2NR)$/);
      const r = m[name] || { Signal_Name: name, Signal_Category: nrm ? "NR_PATTERN" : "ZONE", Signal_Type: nrm ? NR_TYPE[nrm[1]] : "", Timeframe: "" };
      const c = classifySignal({ Signal_Name: name, Signal_Category: r.Signal_Category, Signal_Type: r.Signal_Type, Timeframe: r.Timeframe || "" });
      return { name, nr: r.Signal_Category === "NR_PATTERN", tf: c.tf, dir: c.dir, pts: c.dir * (TF_WEIGHT[c.tf] || 1) * c.w };
    };
  }, [db]);
  const strength = useMemo(() => {
    const m = new Map();
    (data ? data.rows : []).forEach(r => {
      const g = { zone: 0, nr: 0, gained: [], lost: [] };
      r.new_signals.forEach(n => { const i = sigInfo(n); g[i.nr ? "nr" : "zone"] += i.pts; if (i.dir) g.gained.push(i); });
      r.dropped_signals.forEach(n => { const i = sigInfo(n); g[i.nr ? "nr" : "zone"] -= i.pts; if (i.dir) g.lost.push(i); });
      g.zone = Math.round(g.zone * 10) / 10; g.nr = Math.round(g.nr * 10) / 10;
      m.set(r.symbol, g);
    });
    return m;
  }, [data, sigInfo]);
  const deltaOf = r => { const g = strength.get(r.symbol); if (!g) return 0; return by === "zone" ? g.zone : by === "nr" ? g.nr : Math.round((g.zone + g.nr) * 10) / 10; };
  const fns = { ...STAT_FILTERS, strUp: r => deltaOf(r) > 0, strDn: r => deltaOf(r) < 0 };
  const sorted = useMemo(() => {
    const s = rows.filter(fns[statF]);
    if (sort === "move") s.sort((x, y) => y.move_pct - x.move_pct);
    if (sort === "drop") s.sort((x, y) => x.move_pct - y.move_pct);
    if (sort === "new") s.sort((x, y) => y.new_signals.length - x.new_signals.length || y.move_pct - x.move_pct);
    if (sort === "stronger") s.sort((x, y) => deltaOf(y) - deltaOf(x) || y.move_pct - x.move_pct);
    if (sort === "weaker") s.sort((x, y) => deltaOf(x) - deltaOf(y) || x.move_pct - y.move_pct);
    return s;
  }, [rows, sort, statF, strength, by]);
  const gainUp = useMemo(() => rows.filter(r => deltaOf(r) > 0).sort((x, y) => deltaOf(y) - deltaOf(x) || y.move_pct - x.move_pct), [rows, strength, by]);
  const gainDn = useMemo(() => rows.filter(r => deltaOf(r) < 0).sort((x, y) => deltaOf(x) - deltaOf(y) || x.move_pct - y.move_pct), [rows, strength, by]);
  const byCount = (k, sgn) => rows.filter(r => { const g = strength.get(r.symbol); return g && Math.sign(g[k]) === sgn; }).length;
  const avg = rows.length ? rows.reduce((s, r) => s + r.move_pct, 0) / rows.length : 0;
  const sectors = useMemo(() => {
    const m = {}; rows.forEach(r => { const k = r.sector || "Unknown"; (m[k] = m[k] || { n: 0, sum: 0 }); m[k].n++; m[k].sum += r.move_pct; });
    return Object.entries(m).map(([k, v]) => ({ sector: k, avg: v.sum / v.n, n: v.n })).filter(x => x.n >= 3).sort((x, y) => y.avg - x.avg);
  }, [rows]);
  const secMax = Math.max(0.01, ...sectors.map(s => Math.abs(s.avg)));
  const vis = showAll ? sorted : sorted.slice(0, 60);
  const TH = { position: "sticky", top: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "6px 8px", fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)", textAlign: "left", whiteSpace: "nowrap", zIndex: 1 };
  const TD = { padding: "5px 8px", fontFamily: "var(--mono)", whiteSpace: "nowrap", fontSize: 11 };
  const mc = v => v > 0 ? "var(--long)" : v < 0 ? "var(--short)" : "var(--t2)";
  const modeMeta = COMPARE_MODES.find(m => m[0] === mode) || COMPARE_MODES[0];
  const aSnap = snaps.find(s => s.id === a);
  const tiles = [
    ["all", "Stocks compared", rows.length.toLocaleString(), "var(--t1)"],
    ["up", "Moved up", rows.filter(STAT_FILTERS.up).length.toLocaleString(), "var(--long)"],
    ["down", "Moved down", rows.filter(STAT_FILTERS.down).length.toLocaleString(), "var(--short)"],
    [null, "Average move", `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`, mc(avg)],
    ["new", "New signals", rows.filter(STAT_FILTERS.new).length.toLocaleString(), "var(--acc)"],
    ["lost", "Lost signals", rows.filter(STAT_FILTERS.lost).length.toLocaleString(), "var(--mixed)"],
    ["strUp", "Stronger ▲", gainUp.length.toLocaleString(), "var(--long)"],
    ["strDn", "Stronger ▼", gainDn.length.toLocaleString(), "var(--short)"],
  ];
  return (
    <div style={{ padding: "18px 22px" }}>
      <SectionTitle icon="⏱" title={`${modeMeta[1]} Compare`} sub={`How each stock moved between two collections. From = ${modeMeta[2]}.`}
        right={<div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select id="cmp-mode" value={mode || ""} onChange={e => chooseMode(e.target.value)} title="What to compare against" style={{ ...input, fontWeight: 600, color: "var(--acc)" }}>
            {COMPARE_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "var(--t3)" }}>From</span>
          {mode === "custom"
            ? <CollectionPicker id="cmp-a" snaps={snaps} days={days} value={customA} onChange={setCustomA} />
            : <span style={{ ...input, color: aSnap ? "var(--t1)" : "var(--t3)", fontFamily: "var(--mono)" }} title={modeMeta[2]}>{aSnap ? `${fmtDay(aSnap.taken_at)} ${fmtTime(aSnap.taken_at)}` : "none"}</span>}
          <span style={{ fontSize: 11, color: "var(--t3)" }}>to</span>
          <CollectionPicker id="cmp-b" snaps={snaps} days={days} value={b} onChange={setB} />
        </div>} />
      {snaps.length < 2 && <div style={{ color: "var(--t3)", fontSize: 12.5 }}>You need at least two collections. After today's 09:45 and 14:30 runs, this compares them automatically.</div>}
      {snaps.length >= 2 && bSnap && !a && <div style={{ color: "var(--t3)", fontSize: 12.5 }}>No collection to compare against for {modeMeta[1].toLowerCase()} ({modeMeta[2]}). Pick another comparison or another "to" day.</div>}
      {a && a === b && <div style={{ color: "var(--t3)", fontSize: 12.5 }}>Pick two different collections.</div>}
      {err && <div style={{ color: "var(--short)", fontSize: 12.5 }}>{err}</div>}
      {data && (<>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input id="cmp-search" placeholder="Search symbol or sector" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 190 }} />
          <Pill active={onlySig} onClick={() => setOnlySig(v => !v)}>{onlySig ? "✓ " : ""}Only stocks with signals</Pill>
          <Pill active={fno} color="var(--long)" onClick={() => setFno(v => !v)}>{fno ? "✓ " : ""}F&amp;O only</Pill>
          <span style={{ width: 1, height: 20, background: "var(--b2)" }} />
          {[["move", "Biggest gainers"], ["drop", "Biggest losers"], ["new", "Most new signals"], ["stronger", "Stronger ▲"], ["weaker", "Stronger ▼"]].map(([k, l]) => <Pill key={k} active={sort === k} onClick={() => setSort(k)}>{l}</Pill>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }}>
          {tiles.map(([k, l, v, c]) => {
            const on = k && statF === k && k !== "all";
            return (
              <div key={l} onClick={k ? () => { setStatF(on ? "all" : k); setShowAll(false); } : undefined}
                title={k ? (on ? "Click again to show all stocks" : `Show only these stocks in the table`) : "Average move of the stocks below"}
                style={{ background: on ? "var(--adim)" : "var(--s1)", border: `1px solid ${on ? c : "var(--b1)"}`, borderRadius: 10, padding: "10px 12px", cursor: k ? "pointer" : "default" }}>
                <div style={{ fontSize: 10, color: on ? c : "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700 }}>{on ? "✓ " : ""}{l}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "4px 0 8px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)", display: "flex", alignItems: "center" }}>💪 Who got stronger
            <InfoTip>Each <strong>new</strong> signal adds points and each <strong>lost</strong> signal takes them away: points = timeframe weight (D 1 · W 2 · M 3 · Q 4 · Y 5) × signal weight (break / NR breakout 1 · holding a zone 0.6 · near a level 0.35) — the same weights as the Focus score. Bullish signals count +, bearish −. So a stock is <strong>stronger ▲</strong> when it gained bullish signals or lost bearish ones. <strong>By</strong> limits the score to zone signals or NR signals.</InfoTip>
          </div>
          <span style={{ fontSize: 11, color: "var(--t3)", marginLeft: 8 }}>By</span>
          {[["all", "Zones + NR"], ["zone", "Zones"], ["nr", "NR"]].map(([k, l]) => <Pill key={k} active={by === k} onClick={() => setBy(k)}>{l}</Pill>)}
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 11, fontFamily: "var(--mono)" }}>
            {[["zone", "Zones"], ["nr", "NR"]].map(([k, l]) => (
              <span key={k} onClick={() => setBy(k)} style={{ cursor: "pointer", color: "var(--t2)" }} title={`Stocks whose ${l} score went up / down`}>
                {l}: <span style={{ color: "var(--long)", fontWeight: 700 }}>▲{byCount(k, 1)}</span> <span style={{ color: "var(--short)", fontWeight: 700 }}>▼{byCount(k, -1)}</span>
              </span>
            ))}
          </span>
        </div>
        <EqRow height={380} cols="minmax(0,1fr) minmax(0,1fr)" min={300}>
          {[["▲", "Gaining upside strength", gainUp, "var(--long)"], ["▼", "Gaining downside strength", gainDn, "var(--short)"]].map(([ic, t, list, c]) => (
            <FocusCard key={t} icon={ic} title={`${t} (${list.length})`} sub={by === "all" ? "Zone + NR signals" : by === "zone" ? "Zone signals only" : "NR signals only"} right={<ListCopy symbols={list.map(r => r.symbol)} />}>
              <div style={{ overflow: "auto", flex: 1 }} className="tower-scroll">
                {list.slice(0, 40).map(r => {
                  const g = strength.get(r.symbol), d = deltaOf(r);
                  const chips = [...g.gained.filter(i => by === "all" || (by === "nr") === i.nr).map(i => ({ ...i, lost: false })),
                                 ...g.lost.filter(i => by === "all" || (by === "nr") === i.nr).map(i => ({ ...i, lost: true }))]
                    .filter(i => (i.lost ? -i.dir : i.dir) * Math.sign(d) > 0).slice(0, 4);
                  return (
                    <div key={r.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--b1)" }}>
                      <div style={{ width: 96, flexShrink: 0 }}><SymCell sym={r.symbol} /><div style={{ fontSize: 8.5, color: sectorColor(r.sector || ""), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sector}</div></div>
                      <span style={{ width: 44, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: c, textAlign: "right" }} title={`Zones ${g.zone >= 0 ? "+" : ""}${g.zone} · NR ${g.nr >= 0 ? "+" : ""}${g.nr}`}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>
                      <span style={{ width: 54, fontFamily: "var(--mono)", fontSize: 10.5, color: mc(r.move_pct), textAlign: "right" }}>{r.move_pct > 0 ? "+" : ""}{r.move_pct.toFixed(2)}%</span>
                      <div style={{ flex: 1, display: "flex", gap: 3, flexWrap: "wrap", minWidth: 0 }}>
                        {chips.map((i, k) => (
                          <span key={k} title={`${i.lost ? "Lost" : "New"}: ${i.name}`} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontFamily: "var(--mono)", border: `1px solid ${i.dir > 0 ? "var(--long)" : "var(--short)"}`, color: i.dir > 0 ? "var(--long)" : "var(--short)", textDecoration: i.lost ? "line-through" : "none", whiteSpace: "nowrap" }}>
                            {i.dir > 0 ? "▲" : "▼"} {i.tf} {i.nr ? "NR" : "Zone"}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!list.length && <div style={{ color: "var(--t3)", fontSize: 11.5, padding: 10 }}>No stock got stronger this way.</div>}
              </div>
            </FocusCard>
          ))}
        </EqRow>
        <EqRow height={520} cols="minmax(0,.8fr) minmax(0,2.2fr)" min={300}>
          <FocusCard icon="🏭" title="Sector move" sub="Average move of each sector's stocks (3+ stocks).">
            {sectors.map(s => (
              <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 118, fontSize: 10.5, color: sectorColor(s.sector), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sector}</span>
                <div style={{ flex: 1, display: "flex", height: 10 }}>
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>{s.avg < 0 && <div style={{ width: `${Math.abs(s.avg) / secMax * 100}%`, background: "var(--short)", borderRadius: "3px 0 0 3px" }} />}</div>
                  <div style={{ flex: 1 }}>{s.avg > 0 && <div style={{ width: `${s.avg / secMax * 100}%`, height: "100%", background: "var(--long)", borderRadius: "0 3px 3px 0" }} />}</div>
                </div>
                <span style={{ width: 52, textAlign: "right", fontFamily: "var(--mono)", fontSize: 10.5, color: mc(s.avg) }}>{s.avg >= 0 ? "+" : ""}{s.avg.toFixed(2)}%</span>
              </div>
            ))}
          </FocusCard>
          <FocusCard icon="📋" title={`${sorted.length.toLocaleString()} stocks${statF !== "all" ? ` · ${tiles.find(t => t[0] === statF)[1].toLowerCase()}` : ""} · ${fmtDT(data.a.taken_at)} → ${fmtDT(data.b.taken_at)}`} sub={`${data.a.label}  →  ${data.b.label}`} right={<ListCopy symbols={sorted.map(r => r.symbol)} />}>
            <div style={{ overflow: "auto", flex: 1 }} className="tower-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Symbol", "Price then", "Price now", "Move", "Strength Δ", "Bias", "Signals", "New signals", "Lost signals", "Health"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {vis.map(r => (
                    <tr key={r.symbol} className="sec-row" style={{ borderBottom: "1px solid var(--b1)" }}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><SymCell sym={r.symbol} /><div style={{ fontSize: 8.5, color: sectorColor(r.sector || "") }}>{r.sector}{r.is_fno ? " · FNO" : ""}</div></td>
                      <td style={TD}>{r.price_a}</td>
                      <td style={TD}>{r.price_b}</td>
                      <td style={{ ...TD, fontWeight: 700, color: mc(r.move_pct) }}>{r.move_pct > 0 ? "+" : ""}{r.move_pct.toFixed(2)}%</td>
                      <td style={{ ...TD, fontWeight: 700, color: mc(deltaOf(r)) }} title={(() => { const g = strength.get(r.symbol); return g ? `Zones ${g.zone} · NR ${g.nr}` : ""; })()}>{deltaOf(r) > 0 ? "+" : ""}{deltaOf(r).toFixed(1)}</td>
                      <td style={TD}>{r.bias_a === r.bias_b ? (r.bias_b || "—") : `${r.bias_a || "—"} → ${r.bias_b || "—"}`}</td>
                      <td style={TD}>{r.n_a} → {r.n_b}</td>
                      <td style={{ padding: "5px 8px", maxWidth: 260 }}><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{r.new_signals.slice(0, 4).map(s => <span key={s} title={s} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid var(--acc)", color: "var(--acc)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>)}{r.new_signals.length > 4 && <span style={{ fontSize: 9, color: "var(--t3)" }}>+{r.new_signals.length - 4}</span>}</div></td>
                      <td style={{ padding: "5px 8px", maxWidth: 220 }}><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{r.dropped_signals.slice(0, 3).map(s => <span key={s} title={s} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid var(--b2)", color: "var(--t3)", textDecoration: "line-through", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>)}{r.dropped_signals.length > 3 && <span style={{ fontSize: 9, color: "var(--t3)" }}>+{r.dropped_signals.length - 3}</span>}</div></td>
                      <td style={{ padding: "5px 8px" }}><HealthBadge h={r.health} small /></td>
                    </tr>
                  ))}
                  {!vis.length && <tr><td colSpan={10} style={{ padding: 14, color: "var(--t3)", textAlign: "center" }}>No stocks match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            {sorted.length > 60 && <button onClick={() => setShowAll(v => !v)} style={{ marginTop: 6, fontSize: 10.5, color: "var(--acc)", alignSelf: "flex-start" }}>{showAll ? "Show top 60" : `Show all ${sorted.length}`}</button>}
          </FocusCard>
        </EqRow>
      </>)}
    </div>
  );
}

// ─── CUSTOMERS (the /app customer edition) ───────────────────────────────────
const CUST_STATUS_C = { pending: "var(--mixed)", approved: "var(--long)", blocked: "var(--short)" };
const RCOL = { G: "var(--long)", M: "var(--mixed)", W: "var(--short)", "-": "var(--t3)" };
const EMPTY_CUST = { name: "", email: "", phone: "", country: "India", state: "", city: "", password: "", status: "approved", expires_on: "" };

function CustomersTab({ snaps, notify }) {
  const [list, setList] = useState(null);
  const [pub, setPub] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusF, setStatusF] = useState("all"); const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false); const [nc, setNc] = useState(EMPTY_CUST);
  const [pwFor, setPwFor] = useState(null); const [pw, setPw] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const load = useCallback(async () => {
    const [l, p] = await Promise.all([api("/api/admin/customers"), api("/api/admin/publish")]);
    setList(l); setPub(p);
  }, []);
  useEffect(() => { load().catch(e => notify(e.message, "err")); }, [load]);
  const act = async (fn, okMsg) => { try { await fn(); if (okMsg) notify(okMsg); await load(); } catch (e) { notify(e.message, "err"); } };
  const patch = (id, body, msg) => act(() => api(`/api/admin/customers/${id}`, { method: "PATCH", json: body }), msg);
  const setMode = mode => act(() => api("/api/admin/publish/mode", { method: "PUT", json: { mode } }), mode === "auto" ? "Customers now get every new collection automatically" : "Publishing is now manual");
  const publishNow = async () => { setBusy(true); await act(() => api("/api/admin/publish", { method: "POST" }), "Published to customers"); setBusy(false); };
  const loadPreview = async () => { setBusy(true); try { setPreview(await api("/api/admin/publish/preview")); } catch (e) { notify(e.message, "err"); } setBusy(false); };

  if (!list || !pub) return <div style={{ padding: 30, color: "var(--t3)" }}>Loading customers…</div>;
  const counts = { all: list.length, pending: 0, approved: 0, blocked: 0 }; list.forEach(c => { counts[c.status]++; });
  const today = new Date().toISOString().slice(0, 10);
  const shown = list.filter(c => (statusF === "all" || c.status === statusF) && (!q || `${c.name} ${c.email} ${c.phone} ${c.state} ${c.country} ${c.city}`.toLowerCase().includes(q.toLowerCase())));
  const last = pub.history[0];
  const TH = { position: "sticky", top: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "6px 8px", fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)", textAlign: "left", whiteSpace: "nowrap", zIndex: 1 };
  const TD = { padding: "6px 8px", whiteSpace: "nowrap", fontSize: 11.5 };
  const small = { ...btn(), padding: "2px 7px", fontSize: 10.5 };
  const newer = last && snaps[0] && new Date(snaps[0].taken_at) > new Date(last.as_of);
  return (
    <div style={{ padding: "18px 22px" }}>
      <SectionTitle icon="👥" title="Customers — Hyperplane by QuantFriday" sub="The customer edition lives at /app on this same address. Customers only ever see the published view: Good / Moderate / Weak per timeframe, sector and industry bubbles and the top 10 — never signals, scores or how they are worked out." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }}>
        {[["Customers", counts.all, "var(--t1)"], ["Waiting for approval", counts.pending, "var(--mixed)"], ["Active", counts.approved, "var(--long)"], ["Blocked", counts.blocked, "var(--short)"],
          ["Last published", last ? fmtDT(last.published_at) : "never", "var(--acc)"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700 }}>{l}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: typeof v === "number" ? 18 : 12.5, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>

      <FocusCard icon="📣" title="Publishing to customers" style={{ marginBottom: 12 }}
        sub="Customers see the last published collection. Automatic = every new collection goes out by itself. Manual = only when you press Publish.">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 11.5, color: "var(--t2)" }}>Mode</span>
          <Pill active={pub.mode === "auto"} color="var(--long)" onClick={() => pub.mode !== "auto" && setMode("auto")}>Automatic</Pill>
          <Pill active={pub.mode === "manual"} onClick={() => pub.mode !== "manual" && setMode("manual")}>Manual (admin pushes)</Pill>
          <span style={{ width: 1, height: 20, background: "var(--b2)" }} />
          <button onClick={loadPreview} disabled={busy} style={btn()}>Preview latest collection</button>
          <button onClick={publishNow} disabled={busy || !snaps.length} style={btn(true)}>{busy ? "Working…" : "Publish latest collection now"}</button>
          {newer && <span style={{ fontSize: 11, color: "var(--mixed)" }}>A newer collection ({fmtDT(snaps[0].taken_at)}) has not been published yet.</span>}
        </div>
        {preview && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: "var(--t2)", marginBottom: 6 }}>Preview of {fmtDT(preview.as_of)} · {preview.stocks.toLocaleString()} stocks (indices / ETFs left out)</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, fontFamily: "var(--mono)", marginBottom: 8 }}>
              {Object.entries(preview.breadth).map(([tf, b]) => <span key={tf}><b>{tf}</b> <span style={{ color: "var(--long)" }}>Good {b.G}</span> · <span style={{ color: "var(--mixed)" }}>Mod {b.M}</span> · <span style={{ color: "var(--short)" }}>Weak {b.W}</span>{b["-"] ? <span style={{ color: "var(--t3)" }}> · no data {b["-"]}</span> : null}</span>)}
            </div>
            <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700, marginBottom: 4 }}>Top 10 customers will see</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {preview.top.map((s, i) => (
                <span key={s.s} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--b2)", background: "var(--s2)", fontFamily: "var(--mono)" }}>
                  {i + 1}. {s.s} {[...s.r].map((c, k) => <span key={k} style={{ color: RCOL[c], fontWeight: 700 }}>{"DWMQY"[k]}</span>)}
                </span>
              ))}
              {!preview.top.length && <span style={{ fontSize: 11, color: "var(--t3)" }}>No stock qualifies for the top 10 in this collection.</span>}
            </div>
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700, margin: "6px 0 4px" }}>Recent publishes</div>
        {pub.history.length ? pub.history.slice(0, 5).map(h => (
          <div key={h.id} style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--t2)", marginBottom: 2 }}>
            {fmtDT(h.published_at)} · data {fmtDT(h.as_of)} · {h.stocks} stocks · {h.mode === "auto" ? "automatic" : `by ${h.by}`}
          </div>
        )) : <div style={{ fontSize: 11, color: "var(--t3)" }}>Nothing published yet — customers see "no data yet" until you publish.</div>}
      </FocusCard>

      <FocusCard icon="🧾" title={`Customer accounts (${shown.length})`}
        sub="Customers sign up at /app and wait here for approval. Blocking or resetting a password signs them out everywhere at once. After 5 wrong passwords an account is locked for 15 minutes."
        right={<button onClick={() => setAdding(v => !v)} style={btn(true)}>{adding ? "Cancel" : "＋ Add customer"}</button>}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          {["all", "pending", "approved", "blocked"].map(k => <Pill key={k} active={statusF === k} color={CUST_STATUS_C[k] || "var(--acc)"} onClick={() => setStatusF(k)}>{k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)} · {counts[k]}</Pill>)}
          <input placeholder="Search name, email, phone, place" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 230 }} />
        </div>
        {adding && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: 10, border: "1px dashed var(--b2)", borderRadius: 8, marginBottom: 10 }}>
            {[["name", "Name", 150], ["email", "Email", 190], ["phone", "Phone", 120], ["country", "Country", 110], ["state", "State", 120], ["city", "City", 110], ["password", "Password (8+)", 130]].map(([k, l, w]) => (
              <input key={k} placeholder={l} type={k === "password" ? "password" : "text"} value={nc[k]} onChange={e => setNc(c => ({ ...c, [k]: e.target.value }))} style={{ ...input, width: w }} />
            ))}
            <select value={nc.status} onChange={e => setNc(c => ({ ...c, status: e.target.value }))} style={input}><option value="approved">active</option><option value="pending">pending</option></select>
            <label style={{ fontSize: 11, color: "var(--t2)" }}>Access until <input type="date" value={nc.expires_on} onChange={e => setNc(c => ({ ...c, expires_on: e.target.value }))} style={input} /></label>
            <button onClick={() => act(async () => { await api("/api/admin/customers", { method: "POST", json: { ...nc, expires_on: nc.expires_on || null } }); setNc(EMPTY_CUST); setAdding(false); }, "Customer added")} style={btn(true)}>Save</button>
          </div>
        )}
        <div style={{ overflow: "auto", maxHeight: 520 }} className="tower-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Name", "Contact", "Location", "Status", "Access until", "Joined", "Last login", "Logins", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map(c => {
                const expired = c.expires_on && c.expires_on < today;
                const locked = c.locked_until && new Date(c.locked_until) > new Date();
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--b1)" }}>
                    <td style={TD}><b>{c.name}</b>{c.signup_ip && <div style={{ fontSize: 9.5, color: "var(--t3)" }}>signed up from {c.signup_ip}</div>}</td>
                    <td style={TD}>{c.email}<div style={{ fontSize: 10.5, color: "var(--t3)" }}>{c.phone}</div></td>
                    <td style={TD}>{[c.city, c.state].filter(Boolean).join(", ")}<div style={{ fontSize: 10.5, color: "var(--t3)" }}>{c.country}</div></td>
                    <td style={{ ...TD, color: CUST_STATUS_C[c.status], fontWeight: 700 }}>{c.status === "approved" ? (expired ? "expired" : "active") : c.status}{locked && <div style={{ fontSize: 9.5, color: "var(--short)" }}>locked (wrong passwords)</div>}</td>
                    <td style={TD}>
                      <input type="date" value={c.expires_on || ""} onChange={e => patch(c.id, e.target.value ? { expires_on: e.target.value } : { clear_expiry: true }, "Access date saved")} style={{ ...input, padding: "2px 5px", color: expired ? "var(--short)" : "var(--t1)" }} title="Leave empty for no end date" />
                    </td>
                    <td style={TD}>{fmtDay(c.created_at)}</td>
                    <td style={TD}>{c.last_login ? fmtDT(c.last_login) : "—"}</td>
                    <td style={{ ...TD, fontFamily: "var(--mono)" }}>{c.login_count}</td>
                    <td style={{ ...TD, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {c.status !== "approved" && <button onClick={() => patch(c.id, { status: "approved" }, `${c.name} can now sign in`)} style={{ ...small, color: "var(--long)", borderColor: "var(--long)" }}>Approve</button>}
                      {c.status !== "blocked" && <button onClick={() => patch(c.id, { status: "blocked" }, `${c.name} is blocked`)} style={{ ...small, color: "var(--short)" }}>Block</button>}
                      {locked && <button onClick={() => patch(c.id, { unlock: true }, "Unlocked")} style={small}>Unlock</button>}
                      {pwFor === c.id
                        ? <><input type="password" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} style={{ ...input, width: 120, padding: "2px 6px" }} />
                            <button onClick={() => act(async () => { await api(`/api/admin/customers/${c.id}/password`, { method: "POST", json: { password: pw } }); setPwFor(null); setPw(""); }, "Password changed")} style={small}>Set</button></>
                        : <button onClick={() => { setPwFor(c.id); setPw(""); }} style={small}>Reset password</button>}
                      {confirmDel === c.id
                        ? <><button onClick={() => act(async () => { await api(`/api/admin/customers/${c.id}`, { method: "DELETE" }); setConfirmDel(null); }, "Customer deleted")} style={{ ...small, color: "var(--short)", borderColor: "var(--short)" }}>Confirm delete</button><button onClick={() => setConfirmDel(null)} style={small}>Keep</button></>
                        : <button onClick={() => setConfirmDel(c.id)} style={small}>Delete</button>}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={9} style={{ padding: 16, textAlign: "center", color: "var(--t3)" }}>No customers here yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </FocusCard>
    </div>
  );
}

// ─── ADMIN AREA: settings + customers (admins only) ──────────────────────────
function AdminArea({ snaps, notify, ...adminProps }) {
  const [sub, setSub] = useState(() => pref("hp_admin_sub", "system"));
  const [pending, setPending] = useState(0);
  const pick = k => { setSub(k); setPref("hp_admin_sub", k); };
  useEffect(() => { api("/api/admin/customers").then(l => setPending(l.filter(c => c.status === "pending").length)).catch(() => {}); }, [sub]);
  const tab = (k, label, extra) => (
    <button key={k} onClick={() => pick(k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: 0, borderBottom: `2px solid ${sub === k ? "var(--acc)" : "transparent"}`,
      background: "none", color: sub === k ? "var(--acc)" : "var(--t2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: -1 }}>{label}{extra}</button>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 4, padding: "10px 22px 0", borderBottom: "1px solid var(--b1)" }}>
        {tab("system", "⚙ System & settings")}
        {tab("customers", "👥 Customers", pending > 0 && <span title="Waiting for approval" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--mixed)", color: "#111", fontSize: 10, fontWeight: 800, lineHeight: "18px", textAlign: "center" }}>{pending}</span>)}
      </div>
      {sub === "customers" ? <CustomersTab snaps={snaps} notify={notify} /> : <AdminTab snaps={snaps} notify={notify} {...adminProps} />}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
function idsFor(sel, snaps) {
  if (sel.mode === "single") return sel.id ? [sel.id] : [];
  if (sel.mode === "day") return snaps.filter(s => s.trade_date === sel.date).map(s => s.id);
  const inRange = snaps.filter(s => s.trade_date >= sel.from && s.trade_date <= sel.to);
  if (sel.perDay === "all") return inRange.slice(0, 60).map(s => s.id);
  const seen = new Set(), out = [];
  inRange.forEach(s => { if (!seen.has(s.trade_date)) { seen.add(s.trade_date); out.push(s.id); } });   // newest first → latest per day
  return out.slice(0, 60);
}

export default function Root() {
  const [theme, setThemeState] = useState(() => pref("hp_theme", "dark"));
  const setTheme = f => setThemeState(t => { const n = typeof f === "function" ? f(t) : f; setPref("hp_theme", n); return n; });
  const [user, setUser] = useState(undefined);
  const [snaps, setSnaps] = useState([]);
  const [sel, setSel] = useState({ mode: "single", id: null, date: null, follow: true });
  const [versions, setVersions] = useState([]);
  const [local, setLocal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sync, setSync] = useState(null);
  const [toast, setToast] = useState(null);
  const cache = useRef(new Map());
  const notify = (text, kind = "ok") => { setToast({ text, kind }); setTimeout(() => setToast(null), 4500); };
  onUnauthorized = () => setUser(null);
  const unread = useHelpdeskUnread(api, "/api/helpdesk", !!user);
  const [tabReq, setTabReq] = useState(null); const [hdReq, setHdReq] = useState(null);
  const openHelpdesk = id => { setTabReq({ id: "helpdesk", n: Date.now() }); setHdReq({ id, n: Date.now() }); };

  useEffect(() => { api("/api/me").then(setUser).catch(() => setUser(null)); }, []);

  const reloadSnaps = useCallback(async (followLatest = false) => {
    const list = await api("/api/snapshots");
    setSnaps(list);
    setSel(prev => {
      if (!list.length) return { mode: "single", id: null, date: null, follow: true };
      if (prev.id == null && prev.mode === "single") return { mode: "single", id: list[0].id, date: list[0].trade_date, follow: true };
      if ((followLatest || prev.follow) && prev.mode === "single") return { mode: "single", id: list[0].id, date: list[0].trade_date, follow: true };
      if (prev.mode === "single" && !list.some(s => s.id === prev.id)) return { mode: "single", id: list[0].id, date: list[0].trade_date, follow: true };
      return prev;
    });
    return list;
  }, []);

  useEffect(() => { if (user) reloadSnaps().catch(e => notify(e.message, "err")); }, [user]);
  const [viewCfg, setViewCfg] = useState(null);
  const loadViewCfg = useCallback(() => api("/api/view-config").then(setViewCfg).catch(() => {}), []);
  useEffect(() => { if (user) loadViewCfg(); }, [user]);
  const indexRules = useMemo(() => ({ add: (viewCfg && viewCfg.index_add) || [], keep: (viewCfg && viewCfg.index_keep) || [] }), [viewCfg]);
  const tech = useMemo(() => viewCfg ? { enabled: viewCfg.tech_enabled, weight: viewCfg.tech_weight, cfg: viewCfg.tech, algos: viewCfg.algos } : null, [viewCfg]);

  // Load the selected collections (cached — a collection never changes once stored)
  useEffect(() => {
    if (!user || local) return;
    const ids = idsFor(sel, snaps);
    if (!ids.length) { setVersions([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const metas = ids.map(id => snaps.find(s => s.id === id)).filter(Boolean).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
      const out = [];
      for (let i = 0; i < metas.length; i += 4) {
        const part = await Promise.all(metas.slice(i, i + 4).map(async m => {
          if (!cache.current.has(m.id)) cache.current.set(m.id, mapDB(await api(`/api/snapshots/${m.id}/data`)));
          const d = new Date(m.taken_at);
          return { fileName: `${fmtDay(m.taken_at)} ${fmtTime(m.taken_at)} · ${SOURCE_LABEL[m.source] || m.source}`, db: cache.current.get(m.id), dateValue: d, dateLabel: `${formatDateLabel(d)} ${fmtTime(m.taken_at)}` };
        }));
        out.push(...part);
      }
      if (cache.current.size > 40) [...cache.current.keys()].slice(0, cache.current.size - 40).forEach(k => cache.current.delete(k));
      if (!cancelled) setVersions(out);
    })().catch(e => notify(e.message, "err")).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [user, sel, snaps, local]);

  // New collections (scheduled runs) appear by themselves
  useEffect(() => {
    if (!user) return;
    const t = setInterval(async () => {
      try {
        const [latest, active] = await Promise.all([api("/api/snapshots/latest"), api("/api/jobs?active=true")]);
        if (active.length) setSync(s => (s && s.id === active[0].id) ? { ...s, ...active[0] } : active[0]);
        if (latest && (!snaps.length || latest.id !== snaps[0].id)) {
          await reloadSnaps();
          if (sel.follow && sel.mode === "single") notify(`New collection ${fmtTime(latest.taken_at)} loaded`);
          else notify(`New collection ${fmtTime(latest.taken_at)} is ready — press Latest to see it`);
        }
      } catch { /* offline for a moment */ }
    }, 60000);
    return () => clearInterval(t);
  }, [user, snaps, sel]);

  // Follow a running collection
  useEffect(() => {
    if (!sync || !(sync.status === "queued" || sync.status === "running")) return;
    const t = setInterval(async () => {
      try {
        const j = await api(`/api/jobs/${sync.id}`);
        setSync(j);
        if (j.status === "done") { await reloadSnaps(true); setLocal(null); notify("Today's data is up to date"); }
        if (j.status === "failed") notify(`Collection failed: ${j.error || "see Admin → history"}`, "err");
      } catch { /* retry next tick */ }
    }, 3000);
    return () => clearInterval(t);
  }, [sync && sync.id, sync && sync.status]);

  const onSync = async () => {
    try { const r = await api("/api/sync", { method: "POST" }); setSync(r.job); notify(r.already_running ? "A collection is already running — following it" : "Collecting today's data…"); }
    catch (e) { notify(e.message, "err"); }
  };
  const onLocalFiles = async files => {
    try {
      const list = []; for (const f of files) list.push(await parseWorkbookFile(f));
      list.sort((a, b) => (a.dateValue || 0) - (b.dateValue || 0));
      setLocal(list); notify(`Showing ${list.length} local file${list.length > 1 ? "s" : ""} — pick a date to go back to stored data`);
    } catch (e) { notify(e.message, "err"); }
  };
  const logout = async () => { try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ } window.location.replace("/login.html"); };

  if (user === undefined) return <><style>{CSS}</style><div className={`app-shell theme-${theme}`} style={{ minHeight: "100vh" }} /></>;
  if (!user) return <><style>{CSS}</style><div className={`app-shell theme-${theme}`}><LoginScreen onLogin={u => setUser(u)} theme={theme} setTheme={setTheme} /></div></>;

  const shown = local || versions;
  const extraTabs = [
    { id: "compare", label: "⏱ Compare", render: ({ health, db }) => <CompareTab snaps={snaps} health={health} db={db} /> },
    { id: "helpdesk", label: `🎧 Helpdesk${unread.total ? ` (${unread.total})` : ""}`, render: () => <div style={{ padding: "18px 22px" }}><Helpdesk api={api} base="/api/helpdesk" staff={user.admin} openReq={hdReq} onChanged={unread.refresh} /></div> },
    ...(user.admin ? [{ id: "admin", label: "⚙ Admin", render: () => <AdminArea snaps={snaps} reloadSnaps={() => reloadSnaps()} notify={notify} sync={sync} onSync={onSync} onSaved={loadViewCfg} /> }] : []),
  ];
  const empty = (
    <div style={{ padding: "60px 22px", textAlign: "center", color: "var(--t2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: 6 }}>{snaps.length ? "Loading the collection…" : "No collections stored yet"}</div>
      {!snaps.length && <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        {user.admin ? <>Press <strong>⟳ Sync now</strong> in <strong>⚙ Admin</strong> to collect today's data, or wait for the next scheduled run.<br />Admins can load old Excel files in <strong>⚙ Admin → Import</strong>.</>
          : "No data has been collected yet — wait for the next scheduled run, or ask an admin to sync."}
      </div>}
    </div>
  );
  return (
    <div className={`app-shell theme-${theme}`}>
      <Dashboard rawVersions={shown} theme={theme} setTheme={setTheme} extraTabs={extraTabs} emptyState={empty} indexRules={indexRules} tech={tech} tabReq={tabReq}
        headerCenter={local
          ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 11, color: "var(--mixed)" }}>📂 Local file{local.length > 1 ? "s" : ""}: {local.map(v => v.fileName).join(", ").slice(0, 60)}</span><button onClick={() => setLocal(null)} style={btn(true)}>Back to stored data</button></div>
          : <DataPicker snaps={snaps} sel={sel} setSel={setSel} loading={loading} />}
        headerRight={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><InboxBell unread={unread} onOpen={openHelpdesk} /><UserMenu user={user} onLogout={logout} onLocalFiles={onLocalFiles} /></div>} />
      {toast && (
        <div role="status" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "var(--s1)", border: `1px solid ${toast.kind === "err" ? "var(--short)" : "var(--acc)"}`, color: toast.kind === "err" ? "var(--short)" : "var(--t1)", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, boxShadow: "0 8px 24px rgba(0,0,0,.35)", maxWidth: "90vw" }}>{toast.text}</div>
      )}
    </div>
  );
}
