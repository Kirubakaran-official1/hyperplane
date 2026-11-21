// Admin → 🔭 Lens admin → 📊 Fyers Data Lab (Lens Phase 3). Everything runs in Lens's own worker; this screen only shows and steers it
// through /api/admin/lens/fyers/* (main.py → lens-api /internal/admin/fyers/*). The Fyers app secret and the daily token never come here.
//   Connection · Usage & limits · Tests (history depth, coverage, speed) · Bulk download · Data checks · Compliance
import React, { useEffect, useState } from "react";
import { exportRows } from "./access.jsx";

const CSS = `
.fl{display:flex;flex-direction:column;gap:12px}
.fl-sub{display:flex;gap:4px;flex-wrap:wrap}
.fl-card{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.fl-card h3{margin:0;font-size:14px;color:var(--t1)}.fl-card p{margin:0;font-size:12.5px;color:var(--t2);line-height:1.5}
.fl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.fl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fl-f{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--t2);min-width:200px;flex:1}
.fl-f input,.fl-f select,.fl-f textarea{height:34px;border:1px solid var(--b2);border-radius:8px;background:var(--bg);color:var(--t1);padding:0 10px;font:inherit;font-weight:500;font-size:13px}
.fl-f textarea{height:60px;padding:8px 10px;resize:vertical}
.fl-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700}
.fl-pill.on{background:color-mix(in srgb,var(--long) 14%,transparent);color:var(--long)}
.fl-pill.off{background:color-mix(in srgb,var(--short) 12%,transparent);color:var(--short)}
.fl-pill.wait{background:color-mix(in srgb,var(--mixed) 16%,transparent);color:var(--mixed)}
.fl-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.fl-k>div{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:10px 12px}
.fl-k span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.fl-k b{display:block;margin-top:3px;font-size:20px;color:var(--t1)}.fl-k small{font-size:11.5px;color:var(--t2)}
.fl-bar{height:8px;border-radius:999px;background:var(--s2);overflow:hidden}.fl-bar i{display:block;height:100%;background:var(--acc);border-radius:999px}
.fl-note{font-size:12px;color:var(--t2);background:var(--s2);border-radius:8px;padding:8px 10px}
.fl-f>.fl-pill{align-self:flex-start;height:20px;font-size:11px}
.fl label.hp-switch{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:13px;font-weight:600;color:var(--t1);cursor:pointer}
.fl-warn{font-size:12.5px;color:var(--mixed);background:color-mix(in srgb,var(--mixed) 10%,transparent);border-radius:8px;padding:8px 10px}
`;
const fmtDT = s => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const n = v => v == null ? "—" : Number(v).toLocaleString("en-IN");
const KIND = { depth: "History depth", coverage: "Coverage", speed: "Speed test", bulk: "Bulk download", quality: "Data checks", nightly: "Nightly top-up" };
const STATUS = { queued: ["wait", "Queued"], running: ["on", "Running"], waiting: ["wait", "Waiting"], paused: ["wait", "Paused"], done: ["on", "Done"],
  failed: ["off", "Failed"], cancelled: ["off", "Cancelled"] };

function Jobs({ jobs, act, kinds }) {
  const list = jobs.filter(j => !kinds || kinds.includes(j.kind));
  if (!list.length) return <p className="fl-note">Nothing has run yet.</p>;
  return (
    <div className="ln-tw"><table className="ln-t" id="fl-jobs">
      <thead><tr><th>What</th><th>Status</th><th>Progress</th><th>Started</th><th/></tr></thead>
      <tbody>{list.map(j => {
        const p = j.progress || {}, [c, l] = STATUS[j.status] || ["wait", j.status];
        return (
          <tr key={j.id} data-job={j.kind} data-status={j.status}>
            <td><b>{KIND[j.kind] || j.kind}</b><small>by {j.by_admin || "—"}</small></td>
            <td><span className={`fl-pill ${c}`}>{l}</span>{j.message && <small style={{ whiteSpace: "normal", maxWidth: 320 }}>{j.message}</small>}</td>
            <td style={{ whiteSpace: "normal", minWidth: 220 }}>
              {p.total ? <><div className="fl-bar"><i style={{ width: `${Math.min(100, 100 * (p.done || 0) / p.total)}%` }}/></div>
                <small>{n(p.done)} of {n(p.total)} · {p.gb ?? 0} GB{p.per_min ? ` · ${p.per_min}/min` : ""}{p.eta_min != null ? ` · about ${p.eta_min > 120 ? `${Math.round(p.eta_min / 60)} h` : `${p.eta_min} min`} left` : ""}{p.failed ? ` · ${p.failed} failed` : ""}</small></>
                : <small>{p.step || p.phase || "—"}</small>}
              {p.result && <small>{p.result.calls_per_min}/min · {p.result.error_pct}% errors · {p.result.avg_ms} ms · {p.result.mb} MB · full download ≈ {p.result.eta_hours} h</small>}
              {p.rss_mb && <small>worker memory peak {p.rss_mb} MB</small>}
            </td>
            <td>{fmtDT(j.started_at || j.created_at)}{j.wait_until && j.status === "waiting" ? <small>continues {fmtDT(j.wait_until)}</small> : null}</td>
            <td><div className="ln-act">
              {["queued", "running", "waiting"].includes(j.status) && <button type="button" className="ln-btn" onClick={() => act(j.id, "pause")}>Pause</button>}
              {["paused", "failed", "waiting"].includes(j.status) && <button type="button" className="ln-btn go" onClick={() => act(j.id, "resume")}>Resume</button>}
              {!["done", "cancelled"].includes(j.status) && <button type="button" className="ln-btn" onClick={() => act(j.id, "cancel")}>Cancel</button>}
            </div></td>
          </tr>);
      })}</tbody></table></div>);
}

export function FyersLab({ api, notify }) {
  const [st, setSt] = useState(null), [sub, setSub] = useState("connect"), [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null), [consent, setConsent] = useState(null);
  const [scope, setScope] = useState({ indices: ["NIFTY", "BANKNIFTY", "SENSEX"], strikes: 25, full_chain: false, spot: true, futures: true, options: true });
  const load = () => api("/api/admin/lens/fyers/status").then(s => {
    setSt(s);
    setForm(f => f || { app_id: s.settings.app_id, secret: "", redirect_uri: s.settings.redirect_uri || "https://lens.quantfriday.in/api/fyers/callback", plan: s.settings.plan });
    setConsent(c => c || { on: s.settings.consent.on || "", ref: s.settings.consent.ref || "", note: s.settings.consent.note || "" });
  }).catch(e => notify(e.message, "err"));
  const live = st && st.jobs.some(j => ["queued", "running"].includes(j.status));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(load, live ? 4000 : 30000); return () => clearInterval(t); }, [live]);
  const post = async (path, json, ok) => {
    setBusy(true);
    try { const r = await api(`/api/admin/lens/fyers/${path}`, { method: "POST", json }); if (ok) notify(ok); await load(); return r; }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  const act = (id, action) => post(`jobs/${id}`, { action }, { pause: "Pausing", resume: "Resumed", cancel: "Cancelled", retry_failed: "Failed items queued again" }[action]);
  const run = (kind, extra = {}) => post("jobs", { kind, ...extra }, `${KIND[kind]} queued`);
  if (!st || !form) return <div className="ln-empty">Loading…</div>;
  const s = st.settings, u = st.usage, standard = s.plan === "standard";
  const man = st.manifest.reduce((a, r) => { a.total += r.n; a.bytes += r.bytes; a.rows += r.rows; if (["done", "no_data"].includes(r.status)) a.done += r.n; return a; }, { total: 0, done: 0, bytes: 0, rows: 0 });
  const conn = s.connected ? <span className="fl-pill on" id="fl-conn">Connected{s.profile ? ` · ${s.profile}` : ""}</span>
    : <span className="fl-pill off" id="fl-conn">{s.token_bad ? "Sign-in expired" : "Not connected"}</span>;
  const peak = Math.max(0, ...st.per_min.map(m => m.n)), avg = st.per_min.length ? (st.per_min.reduce((a, m) => a + m.n, 0) / st.per_min.length).toFixed(1) : 0;
  return (
    <div className="fl" id="fl">
      <style>{CSS}</style>
      <div className="fl-row">{conn}<span className="fl-pill wait">{standard ? "Standard plan" : "Prime plan"}</span>
        <span className={`fl-pill ${s.consent.on ? "on" : "wait"}`} id="fl-consent-pill">{s.consent.on ? `Consent recorded ${s.consent.on}` : "Consent not recorded"}</span>
        <small style={{ color: "var(--t3)" }}>Stored: {n(man.done)} of {n(man.total)} pieces · {(man.bytes / 1e9).toFixed(2)} GB</small></div>
      <div className="ln-chips fl-sub" role="tablist">{[["connect", "Connection"], ["usage", "Usage & limits"], ["tests", "Tests"], ["bulk", "Bulk download"],
        ["quality", "Data checks"], ["results", "Depth & coverage"], ["compliance", "Compliance"]].map(([k, l]) =>
        <button key={k} type="button" id={`fl-tab-${k}`} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>

      {sub === "connect" && <div className="fl-grid">
        <div className="fl-card"><h3>Fyers app</h3>
          <p>From your Fyers API dashboard (myapi.fyers.in). Register the redirect address below in that app. An individual Fyers app can only be signed in by its creator.</p>
          <label className="fl-f">App ID<input id="fl-app" value={form.app_id} onChange={e => setForm({ ...form, app_id: e.target.value.trim() })} placeholder="e.g. XB12345-100"/></label>
          <label className="fl-f">App secret {s.secret_set && <span className="fl-pill on">saved</span>}<input id="fl-secret" type="password" value={form.secret}
            onChange={e => setForm({ ...form, secret: e.target.value })} placeholder={s.secret_set ? "Leave empty to keep the saved one" : "Paste the secret"} autoComplete="off"/></label>
          <label className="fl-f">Redirect address<input id="fl-redirect" value={form.redirect_uri} onChange={e => setForm({ ...form, redirect_uri: e.target.value.trim() })}/></label>
          <label className="fl-f">Plan<select id="fl-plan" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
            <option value="standard">Standard (free): 50 a minute, 5,000 a day, 10 expired-contract minute requests a day</option>
            <option value="prime">Prime: 500 a minute, 5,00,000 a day</option></select></label>
          <div className="fl-row"><button type="button" className="ln-btn go" id="fl-save" disabled={busy} onClick={async () => {
            const json = { app_id: form.app_id, redirect_uri: form.redirect_uri, plan: form.plan, ...(form.secret ? { secret: form.secret } : {}) };
            if (await post("settings", json, "Saved")) setForm(f => ({ ...f, secret: "" }));
          }}>Save</button></div>
        </div>
        <div className="fl-card"><h3>Connection</h3>
          <div className="fl-row">{conn}{s.token_at && <small style={{ color: "var(--t3)" }}>signed in {fmtDT(s.token_at)}</small>}</div>
          <p>Fyers' sign-in lasts one day (until 6 am). Connect opens Fyers in a new tab; after you sign in there, come back here.</p>
          {s.token_bad && <div className="fl-warn">Fyers refused the last sign-in: {s.token_bad}</div>}
          <div className="fl-row">
            <button type="button" className="ln-btn go" id="fl-connect" disabled={busy || !s.app_id || !s.secret_set} onClick={async () => {
              const r = await post("connect", {}); if (r && r.url) window.open(r.url, "_blank", "noopener");
            }}>{s.connected ? "Reconnect Fyers" : "Connect Fyers"}</button>
            {s.connected && <button type="button" className="ln-btn" onClick={() => post("disconnect", {}, "Disconnected")}>Disconnect</button>}
          </div>
        </div>
      </div>}

      {sub === "usage" && <>
        <div className="fl-k" id="fl-usage">
          <div><span>Requests today</span><b>{n(u.calls)}</b><small>{n(u.left_day)} left of {n(u.cap_day)} (80% of the plan)</small></div>
          {u.cap_expired != null && <div><span>Expired-contract minute requests</span><b>{u.expired} / {u.cap_expired}</b><small>{u.left_expired} left today</small></div>}
          <div><span>Limit hits (-429)</span><b>{n(u.limited)}</b><small>each one waits and tries again</small></div>
          <div><span>Failed requests</span><b>{n(u.failed)}</b><small>today</small></div>
          <div><span>Average answer time</span><b>{u.avg_ms} ms</b><small>today</small></div>
          <div><span>Last 60 minutes</span><b>{peak}/min peak</b><small>{avg}/min on average · limit {st.limits.per_min}/min</small></div>
        </div>
        <div className="ln-tw"><table className="ln-t" id="fl-calls"><thead><tr><th>When</th><th>Request</th><th>Symbol</th><th>Result</th><th className="num">Rows</th><th className="num">ms</th></tr></thead>
          <tbody>{st.calls.map((c, i) => <tr key={i}><td>{fmtDT(c.at)}</td><td>{c.endpoint}</td><td>{c.symbol}</td>
            <td><span className={`ln-st ${c.ok ? "ok" : "failed"}`}>{c.ok ? "OK" : `${c.code ?? c.http}${c.note ? `: ${c.note}` : ""}`}</span></td>
            <td className="num">{n(c.rows)}</td><td className="num">{c.ms}</td></tr>)}
            {!st.calls.length && <tr><td colSpan={6} className="ln-empty">No requests yet.</td></tr>}</tbody></table></div>
      </>}

      {sub === "tests" && <>
        <div className="fl-grid">
          {[["depth", "History depth", "How far back 1-minute data really goes: the index, expired futures and expired options of each index. A few requests per index."],
            ["coverage", "Coverage", "For every year, two expiries per index: how many strikes are listed, and how complete the at-the-money option's last week is (missing minutes, open interest, Greeks)."],
            ["speed", "Speed test (Prime)", "Runs the real download for 10 minutes at 80% of the limits: requests a minute, errors, answer time, MB → how long the full download takes."]].map(([k, h, t]) =>
            <div key={k} className="fl-card"><h3>{h}</h3><p>{t}</p>
              {k === "speed" && standard ? <div className="fl-note">Needs the Prime plan.</div>
                : k === "speed" && !s.consent.on ? <div className="fl-note">Needs the consent recorded (it stores data).</div>
                : <div className="fl-row"><button type="button" className="ln-btn go" id={`fl-run-${k}`} disabled={busy || !s.connected} onClick={() => run(k)}>Run</button>
                  {!s.connected && <small style={{ color: "var(--t3)" }}>Connect Fyers first</small>}</div>}
              {standard && k !== "speed" && <small style={{ color: "var(--t3)" }}>Standard plan: at most {u.cap_expired} expired-contract requests a day — it waits for the next day when they run out.</small>}
            </div>)}
        </div>
        <Jobs jobs={st.jobs} act={act} kinds={["depth", "coverage", "speed"]}/>
      </>}

      {sub === "bulk" && <>
        {!s.consent.on && <div className="fl-warn" id="fl-bulk-locked">The full download stays locked until Fyers' written consent is recorded (Compliance). Fyers' API terms (§12) require it to keep a copy of their data.</div>}
        {standard && <div className="fl-note">On the Standard plan only {u.cap_expired} expired-contract requests a day are allowed, so a full download would take years. Use Prime for the full download.</div>}
        <div className="fl-card"><h3>What to download</h3>
          <div className="fl-row">{["NIFTY", "BANKNIFTY", "SENSEX"].map(i => <label key={i} className="hp-switch"><input type="checkbox" checked={scope.indices.includes(i)}
            onChange={e => setScope(x => ({ ...x, indices: e.target.checked ? [...x.indices, i] : x.indices.filter(y => y !== i) }))}/>{i}</label>)}</div>
          <div className="fl-row">{[["spot", "Index (1 min)"], ["futures", "Futures"], ["options", "Options"]].map(([k, l]) => <label key={k} className="hp-switch">
            <input type="checkbox" checked={scope[k]} onChange={e => setScope(x => ({ ...x, [k]: e.target.checked }))}/>{l}</label>)}
            <label className="hp-switch"><input type="checkbox" checked={scope.full_chain} onChange={e => setScope(x => ({ ...x, full_chain: e.target.checked }))}/>Full option chain</label></div>
          <label className="fl-f" style={{ maxWidth: 220 }}>Start from (empty = the first day Fyers has)
            <input id="fl-start" type="date" value={scope.start || ""} onChange={e => setScope(x => ({ ...x, start: e.target.value || null }))}/></label>
          {!scope.full_chain && <label className="fl-f" style={{ maxWidth: 360 }}>Strikes around the money: ±{scope.strikes}
            <input type="range" min="5" max="60" step="5" value={scope.strikes} onChange={e => setScope(x => ({ ...x, strikes: +e.target.value }))}/></label>}
          <p>Each expiry's options: from the previous expiry until it expires, strikes around the index range of its last 7 trading days. Futures: the last ~95 days of each contract. Pieces already stored are never fetched again; pause and resume any time.</p>
          <div className="fl-row"><button type="button" className="ln-btn go" id="fl-bulk-start" disabled={busy || !s.consent.on || !s.connected || !scope.indices.length}
            onClick={() => run("bulk", scope)}>Start the download</button></div>
        </div>
        <Jobs jobs={st.jobs} act={act} kinds={["bulk", "nightly"]}/>
        <div className="fl-k">{["spot", "fut", "opt"].map(k => {
          const r = st.manifest.filter(m => m.kind === k), t = r.reduce((a, m) => a + m.n, 0), dn = r.filter(m => ["done", "no_data"].includes(m.status)).reduce((a, m) => a + m.n, 0);
          return <div key={k}><span>{{ spot: "Index", fut: "Futures", opt: "Options" }[k]}</span><b>{n(dn)} / {n(t)}</b><small>{(r.reduce((a, m) => a + m.bytes, 0) / 1e6).toFixed(1)} MB · {n(r.reduce((a, m) => a + m.rows, 0))} candles</small></div>;
        })}</div>
        {st.failures.length > 0 && <div className="fl-card"><div className="fl-row"><h3>Failed pieces ({st.failures.length})</h3>
          {st.jobs.find(j => j.kind === "bulk") && <button type="button" className="ln-btn" id="fl-retry" onClick={() => act(st.jobs.find(j => j.kind === "bulk").id, "retry_failed")}>Try them again</button>}</div>
          <div className="ln-tw"><table className="ln-t"><thead><tr><th>Symbol</th><th>Dates</th><th>Tries</th><th>Why</th></tr></thead>
            <tbody>{st.failures.map(f => <tr key={f.id}><td>{f.symbol}</td><td>{f.range_from} → {f.range_to}</td><td>{f.attempts}</td><td style={{ whiteSpace: "normal" }}>{f.last_error}</td></tr>)}</tbody></table></div></div>}
      </>}

      {sub === "quality" && <>
        <div className="fl-row"><button type="button" className="ln-btn go" id="fl-run-quality" disabled={busy} onClick={() => run("quality")}>Check the stored data</button>
          {st.quality.length > 0 && <button type="button" className="ln-btn" onClick={() => exportRows("lens-data-checks", ["File", "Kind", "Index", "Candles", "Days", "Missing minutes %", "Duplicate times", "Bad candles", "Zero / negative prices", "Zero volume %", "From", "To"],
            st.quality.map(q => [q.path, q.kind, q.idx, q.rows, q.days, q.missing_pct, q.dup_ts, q.bad_ohlc, q.nonpos, q.zero_vol_pct, fmtDT(q.first_ts), fmtDT(q.last_ts)]))}>⬇ Excel</button>}</div>
        <p className="fl-note">Per file: candles, trading days, missing minutes (375 a day, 09:15–15:29), duplicate times, impossible candles (high below open/close or low above), zero or negative prices, and zero-volume minutes. No Fyers requests.</p>
        <Jobs jobs={st.jobs} act={act} kinds={["quality"]}/>
        <div className="ln-tw"><table className="ln-t" id="fl-quality"><thead><tr><th>File</th><th className="num">Candles</th><th className="num">Days</th><th className="num">Missing %</th><th className="num">Duplicates</th><th className="num">Bad candles</th><th className="num">≤ 0 prices</th><th className="num">Zero volume %</th></tr></thead>
          <tbody>{st.quality.map(q => <tr key={q.path}><td>{q.path}</td><td className="num">{n(q.rows)}</td><td className="num">{q.days}</td><td className="num">{q.missing_pct}</td>
            <td className="num">{n(q.dup_ts)}</td><td className="num">{n(q.bad_ohlc)}</td><td className="num">{n(q.nonpos)}</td><td className="num">{q.zero_vol_pct ?? "—"}</td></tr>)}
            {!st.quality.length && <tr><td colSpan={8} className="ln-empty">No data checked yet.</td></tr>}</tbody></table></div>
      </>}

      {sub === "results" && <>
        <div className="fl-card"><h3>History depth: earliest 1-minute data found</h3>
          <div className="ln-tw"><table className="ln-t" id="fl-depth"><thead><tr><th>Index</th><th>Index (spot)</th><th>Expired futures</th><th>Expired options</th></tr></thead>
            <tbody>{Object.keys(st.indices).map(i => <tr key={i}><td><b>{i}</b></td>{["spot", "fut", "opt"].map(k => {
              const r = st.depth.find(x => x.idx === i && x.kind === k);
              return <td key={k} style={{ whiteSpace: "normal" }}>{r ? <>{r.earliest || "none found"}<small>{r.note}</small></> : "—"}</td>;
            })}</tr>)}</tbody></table></div></div>
        <div className="fl-card"><h3>Coverage by expiry</h3>
          <div className="ln-tw"><table className="ln-t" id="fl-coverage"><thead><tr><th>Index</th><th>Expiry</th><th>Type</th><th className="num">Strikes</th><th className="num">Futures</th><th className="num">ATM candles</th><th className="num">Missing %</th><th>OI</th><th>Greeks</th></tr></thead>
            <tbody>{st.coverage.map(r => <tr key={r.idx + r.expiry}><td>{r.idx}</td><td>{r.expiry}</td><td>{r.weekly ? "Weekly" : "Monthly"}</td><td className="num">{r.strikes}</td><td className="num">{r.futures}</td>
              <td className="num">{r.rows ?? "waiting"}</td><td className="num">{r.missing_pct ?? "—"}</td><td>{r.has_oi == null ? "—" : r.has_oi ? "Yes" : "No"}</td><td>{r.has_greeks == null ? "—" : r.has_greeks ? "Yes" : "No"}</td></tr>)}
              {!st.coverage.length && <tr><td colSpan={9} className="ln-empty">Run the Coverage test first.</td></tr>}</tbody></table></div></div>
      </>}

      {sub === "compliance" && <div className="fl-card" style={{ maxWidth: 640 }}><h3>Fyers' written consent</h3>
        <p>Fyers' API terms (§12) need their written consent before a database or copy of API data is built. The data is for QuantFriday's internal research only: no redistribution. Record the consent here once received; the bulk download unlocks.</p>
        <div className="fl-row">
          <label className="fl-f" style={{ maxWidth: 180 }}>Received on<input id="fl-consent-on" type="date" value={consent.on} onChange={e => setConsent({ ...consent, on: e.target.value })}/></label>
          <label className="fl-f">Reference (email / letter)<input id="fl-consent-ref" value={consent.ref} onChange={e => setConsent({ ...consent, ref: e.target.value })}/></label>
        </div>
        <label className="fl-f">Notes<textarea value={consent.note} onChange={e => setConsent({ ...consent, note: e.target.value })}/></label>
        <div className="fl-row"><button type="button" className="ln-btn go" id="fl-consent-save" disabled={busy} onClick={() => post("consent", { on: consent.on || null, ref: consent.ref, note: consent.note }, "Saved")}>Save</button>
          {s.consent.on && <button type="button" className="ln-btn" onClick={() => { setConsent({ on: "", ref: "", note: "" }); post("consent", { on: null, ref: "", note: "" }, "Consent removed — the download is locked"); }}>Remove</button>}
          {s.consent.by && <small style={{ color: "var(--t3)" }}>recorded by {s.consent.by}</small>}</div>
      </div>}
    </div>);
}
