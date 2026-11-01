// Admin → 📈 Adoption (owner, 2026-11-01: "convert the activity log to an adoption report … a standard framework …
// usage and output matter more than a glamorous UI"). Google HEART + the AARRR funnel as one path:
// Reach → Activate → Adopt → Retain, with engagement depth and task success per application. The numbers come from
// backend/app/adoption.py; every table exports to Excel. The old Activity log stays as the "Audit log" sub-tab.
import React, { useEffect, useState } from "react";
import { FocusCard, SectionTitle } from "./dashboard.jsx";
import { ActivityTab, PersonDrawer, Seg, exportRows } from "./access.jsx";
import { AM_CSS, Badge, Empty, btn, fmtDay, input, plural } from "./access/shared.jsx";

const PERIODS = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"]];
const SEG_TONE = { champion: "var(--long)", regular: "var(--acc)", casual: "var(--t2)", at_risk: "var(--mixed)", dormant: "var(--short)", not_started: "var(--t3)" };
const SEG_HELP = {
  champion: "Active on 12+ days of the last 30 and uses 2+ applications properly",
  regular: "Active on 4–11 days of the last 30",
  casual: "Active on 1–3 days of the last 30",
  at_risk: "Was active, but not in the last 15–29 days",
  dormant: "Was active, but nothing for 30+ days",
  not_started: "Approved but has never used the app",
};
const num = v => v == null ? "—" : v.toLocaleString("en-IN");
const pctTxt = v => v == null ? "—" : `${v}%`;
const hours = h => h == null ? "—" : h < 1 ? "< 1 hour" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;

function Delta({ v, prev, unit = "" }) {
  if (v == null || prev == null) return <span className="ad-delta">—</span>;
  const d = Math.round((v - prev) * 10) / 10;
  if (!d) return <span className="ad-delta">no change</span>;
  return <span className={`ad-delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d).toLocaleString("en-IN")}{unit} vs before</span>;
}

function Metric({ label, value, sub, help, id }) {
  return (
    <div className="ad-m" id={id} title={help}>
      <div className="ad-ml">{label} <span className="ad-i" aria-label={help} title={help}>ⓘ</span></div>
      <div className="ad-mv">{value}</div>
      <div className="ad-ms">{sub}</div>
    </div>);
}

export function AdoptionTab({ api, notify }) {
  const [view, setView] = useState(() => { try { return localStorage.getItem("hp_adopt_view") || "report"; } catch { return "report"; } });
  const go = v => { setView(v); try { localStorage.setItem("hp_adopt_view", v); } catch { /* storage blocked */ } };
  return (
    <div className="am">
      <style>{AM_CSS}</style><style>{AD_CSS}</style>
      <div className="ad-sub" role="tablist" id="ad-sub" style={{ padding: "14px 22px 0" }}>
        {[["report", "📈 Adoption report"], ["audit", "📜 Audit log"]].map(([k, l]) =>
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => go(k)} id={`ad-tab-${k}`}>{l}</button>)}
      </div>
      {view === "report" ? <Report api={api} notify={notify}/> : <ActivityTab api={api} notify={notify}/>}
    </div>);
}

function Report({ api, notify }) {
  const [days, setDays] = useState(() => { try { return localStorage.getItem("hp_adopt_days") || "30"; } catch { return "30"; } });
  const [r, setR] = useState(null); const [person, setPerson] = useState(null); const [n, setN] = useState(0);
  useEffect(() => {
    setR(null);
    api(`/api/admin/adoption?days=${days}`).then(setR).catch(e => notify(e.message, "err"));
    try { localStorage.setItem("hp_adopt_days", days); } catch { /* storage blocked */ }
  }, [days, n]);
  const appName = k => ((r && r.apps.find(a => a.k === k)) || {}).name || k;
  if (!r) return <div style={{ padding: 30, color: "var(--t3)" }}>Working out the adoption report…</div>;
  const h = r.headline, rules = r.rules;
  const exportFunnel = kind => exportRows("Adoption funnel", ["Stage", "Customers", "% of previous stage", "Lost at this stage"],
    r.funnel.map(s => [s.label, s.n, s.of_prev ?? "", s.drop]), kind);
  const exportApps = kind => exportRows("Application adoption", ["Application", "Have access", "Tried (period)", "Tried (before)", "Adopted", "Adoption rate %", "Active days per user", "Minutes per user", ...r.apps.flatMap(a => a.actions.map(x => `${a.name}: ${x.label}`))],
    r.apps.map(a => [a.name, a.access, a.tried, a.tried_prev, a.adopted, a.rate ?? "", a.days_per_user, a.minutes_per_user, ...r.apps.flatMap(b => b.actions.map(x => b.k === a.k ? x.n : ""))]), kind);
  const exportCohorts = kind => exportRows("Retention cohorts", ["Approved in week of", "Customers", ...Array.from({ length: 9 }, (_, k) => `Week ${k} %`)],
    r.cohorts.map(c => [c.week, c.n, ...c.cells]), kind);
  return (
    <div style={{ padding: "8px 22px 30px" }} id="ad-report">
      <SectionTitle icon="📈" title="Adoption report" sub="How customers take up the product: who starts, who finds value, which applications they adopt and who keeps coming back. Framework: Reach → Activate → Adopt → Retain (Google HEART + the AARRR funnel)."/>
      <div className="ad-tools">
        <Seg items={PERIODS} value={days} onChange={setDays} id="ad-period"/>
        <span className="am-mut">{fmtDay(r.from)} – {fmtDay(r.to)} · compared with the {r.days} days before</span>
        <span style={{ flex: 1 }}/>
        <button style={btn()} onClick={() => setN(x => x + 1)}>↻ Refresh</button>
      </div>
      {r.actions_since && <div className="ad-note">Key actions (built a portfolio, opened a stock card, …) are counted from {fmtDay(r.actions_since)}; visits and minutes go further back.</div>}

      <div className="ad-metrics" id="ad-headline">
        <Metric id="m-customers" label="Customers" value={num(h.customers.v)} sub={<Delta v={h.customers.v} prev={h.customers.prev}/>} help="Approved customer accounts."/>
        <Metric id="m-active" label={`Active (${r.days} days)`} value={num(h.active.v)} sub={<Delta v={h.active.v} prev={h.active.prev}/>} help="Customers who used the app at least once in the period."/>
        <Metric id="m-activated" label="Activated" value={pctTxt(h.activated.v)} sub={<Delta v={h.activated.v} prev={h.activated.prev} unit=" pts"/>} help={`Customers who did something valuable (a key action) within ${rules.activation_days} days of approval.`}/>
        <Metric id="m-wau" label="Weekly active" value={num(h.wau.v)} sub={<Delta v={h.wau.v} prev={h.wau.prev}/>} help="Customers active in the last 7 days."/>
        <Metric id="m-mau" label="Monthly active" value={num(h.mau.v)} sub={<Delta v={h.mau.v} prev={h.mau.prev}/>} help="Customers active in the last 30 days."/>
        <Metric id="m-stick" label="Stickiness" value={pctTxt(h.stickiness.v)} sub="daily ÷ monthly active" help="How many of the monthly active customers come on an average day. Above 20% is good for a research tool."/>
        <Metric id="m-ret" label="4-week retention" value={pctTxt(h.retention4.v)} sub="still active 4 weeks on" help="Of the customers active 5–8 weeks ago, how many were active in the last 4 weeks."/>
        <Metric id="m-ttfv" label="Time to first value" value={hours(h.ttfv_h.v)} sub="median, approval → first key action" help="How long a new customer takes to get value the first time."/>
      </div>

      <FocusCard icon="🪜" title="Adoption funnel" sub="Every customer's path, from sign-up to habit. The biggest drop is where to act first."
        right={<span className="ad-x"><button style={btn()} onClick={() => exportFunnel("copy")}>Copy</button><button style={btn()} onClick={() => exportFunnel("xlsx")}>Excel</button></span>}>
        <div className="ad-funnel" id="ad-funnel">
          {r.funnel.map((s, i) => {
            const top = r.funnel[0].n || 1, worst = r.worst_step === s.k && s.drop > 0;
            return (
              <div key={s.k} className={`ad-fr ${worst ? "worst" : ""}`} data-step={s.k}>
                <span className="ad-fl"><b>{s.label}</b><small>{{ signed_up: "created an account", approved: "account approved", visited: "opened any application",
                  activated: `a key action within ${rules.activation_days} days`, habitual: `active in ${rules.habit_weeks} of the last 4 weeks` }[s.k]}</small></span>
                <span className="ad-fb"><i style={{ width: `${Math.max(1.5, s.n / top * 100)}%` }}/></span>
                <span className="ad-fn"><b>{num(s.n)}</b>{i > 0 && <small>{pctTxt(s.of_prev)} of previous</small>}</span>
                <span className="ad-fd">{i > 0 && s.drop > 0 ? <>{worst && <Badge color="var(--short)">biggest drop</Badge>} −{num(s.drop)}</> : ""}</span>
              </div>); })}
        </div>
      </FocusCard>

      <FocusCard icon="🧩" title="Adoption by application" sub={`Adopted = used on ${rules.adopt_days}+ days of the last ${rules.adopt_window}, with at least one key action in it. Tried = opened in the period.`}
        right={<span className="ad-x"><button style={btn()} onClick={() => exportApps("copy")}>Copy</button><button style={btn()} onClick={() => exportApps("xlsx")}>Excel</button></span>}>
        <div className="am-tw"><table className="am-t ad-t" id="ad-apps">
          <thead><tr>{["Application", "Have access", "Tried", "Adopted", "Adoption rate", "Days / user", "Minutes / user", "Key actions in the period"].map(x => <th key={x} className="am-th">{x}</th>)}</tr></thead>
          <tbody>{r.apps.map(a => (
            <tr key={a.k} data-app={a.k}>
              <td><b>{a.name}</b></td><td className="num">{num(a.access)}</td>
              <td className="num">{num(a.tried)} <Delta v={a.tried} prev={a.tried_prev}/></td>
              <td className="num">{num(a.adopted)}</td>
              <td><span className="ad-rate"><i style={{ width: `${a.rate || 0}%` }}/></span> <b>{pctTxt(a.rate)}</b></td>
              <td className="num">{a.days_per_user}</td><td className="num">{a.minutes_per_user}</td>
              <td><div className="ad-acts">{a.actions.map(x => <span key={x.k} className={x.n ? "" : "zero"}>{x.label} <b>{num(x.n)}</b></span>)}</div></td>
            </tr>))}</tbody></table></div>
      </FocusCard>

      <FocusCard icon="🔁" title="Retention by approval week" sub="Of the customers approved in a week, the share active in each following week. Week 0 = the week they were approved."
        right={<span className="ad-x"><button style={btn()} onClick={() => exportCohorts("copy")}>Copy</button><button style={btn()} onClick={() => exportCohorts("xlsx")}>Excel</button></span>}>
        {r.cohorts.length ? <div className="am-tw"><table className="am-t ad-t ad-coh" id="ad-cohorts">
          <thead><tr><th className="am-th">Approved in week of</th><th className="am-th num">Customers</th>{Array.from({ length: 9 }, (_, k) => <th key={k} className="am-th num">Wk {k}</th>)}</tr></thead>
          <tbody>{r.cohorts.map(c => (
            <tr key={c.week} className={c.few ? "few" : ""}><td>{fmtDay(c.week)}{c.few && <span className="am-mut"> · too few to judge</span>}</td><td className="num">{c.n}</td>
              {Array.from({ length: 9 }, (_, k) => { const v = c.cells[k]; return <td key={k} className="num ad-heat" style={v != null ? { background: `color-mix(in srgb, var(--acc) ${Math.round(v * 0.55)}%, transparent)` } : {}}>{v == null ? "" : `${Math.round(v)}%`}</td>; })}
            </tr>))}</tbody></table></div> : <Empty>No customers approved in the last 12 weeks.</Empty>}
      </FocusCard>

      <FocusCard icon="🚩" title="Needs attention" sub="Customers to contact first. Click a name for their full activity.">
        <div className="ad-att" id="ad-attention">
          {[["not_started", "Not started", `Approved ${rules.not_started_after}+ days ago, never used the app`, p => `approved ${fmtDay(p.approved_at)}`],
            ["at_risk", "At risk", "Were active, but quiet for 15–29 days", p => `quiet for ${p.quiet} days`],
            ["renewal", "Renewal risk", `Access ends within ${rules.renewal_days} days and adoption is low`, p => `access ends ${fmtDay(p.expires_on)} · score ${p.score}`]].map(([k, t, sub, why]) => (
            <div key={k} className="ad-attc" data-att={k}>
              <div className="ad-atth"><b>{t}</b><span className="ad-attn">{r.attention[k].length}</span></div>
              <div className="am-mut">{sub}</div>
              <div className="ad-attl">{r.attention[k].slice(0, 8).map(p => (
                <button key={p.id} type="button" className="ad-person" onClick={() => setPerson(p.id)}><b>{p.name}</b><small>{why(p)}</small></button>))}
                {!r.attention[k].length && <span className="am-mut">Nobody — good.</span>}
                {r.attention[k].length > 8 && <span className="am-mut">+{r.attention[k].length - 8} more in Customers below</span>}</div>
            </div>))}
        </div>
      </FocusCard>

      <Customers api={api} notify={notify} segments={r.segments} onOpen={setPerson}/>

      <details className="ad-how" id="ad-how"><summary>How the numbers are worked out</summary>
        <ul>
          <li><b>Active day:</b> the customer opened or used any application that day.</li>
          <li><b>Key actions:</b> Research — opened a stock card, used a filter or search · AI Mode — looked up a stock · Analyser — saved the stock list, downloaded the report · Builder — built a portfolio, sent it to the Analyser, downloaded the plan.</li>
          <li><b>Activated:</b> a key action within {rules.activation_days} days of approval. <b>Time to first value:</b> approval → first key action (median).</li>
          <li><b>Adopted application:</b> used on {rules.adopt_days}+ days of the last {rules.adopt_window}, with a key action in it. <b>Habitual:</b> active in {rules.habit_weeks} of the last 4 weeks.</li>
          <li><b>Adoption score (0–100):</b> active days 40 · applications adopted 30 · key actions 20 · how recently 10.</li>
          <li><b>Segments:</b> {Object.entries(SEG_HELP).map(([k, v]) => `${r.segments.find(s => s.k === k).label} — ${v}`).join(" · ")}.</li>
          <li>Usage is kept for two years (longer than the audit log), so cohorts stay comparable.</li>
        </ul>
      </details>
      {person && <PersonDrawer api={api} notify={notify} cid={person} appName={appName} onClose={() => setPerson(null)} onChanged={() => setN(x => x + 1)}/>}
    </div>);
}

function Customers({ api, notify, segments, onOpen }) {
  const [seg, setSeg] = useState(""); const [q, setQ] = useState(""); const [sort, setSort] = useState("score"); const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const qs = (p, size = 50) => `/api/admin/adoption/customers?${new URLSearchParams({ ...(seg ? { segment: seg } : {}), q, sort, page: p, size })}`;
  useEffect(() => { setPage(1); }, [seg, q, sort]);
  useEffect(() => { const t = setTimeout(() => api(qs(page)).then(setD).catch(e => notify(e.message, "err")), 250); return () => clearTimeout(t); }, [seg, q, sort, page]);
  const exportAll = async kind => {
    const rows = []; let p = 1;
    for (;;) { const x = await api(qs(p, 200)); rows.push(...x.rows); if (rows.length >= x.total || !x.rows.length) break; p++; }
    return exportRows("Customer adoption", ["Customer", "Email", "Segment", "Score", "Active days (30)", "Minutes (30)", "Key actions (30)", "Applications adopted", "Last active", "Access ends", "Activated", "Hours to first value"],
      rows.map(c => [c.name, c.email, (segments.find(s => s.k === c.segment) || {}).label, c.score, c.d30, c.minutes30, c.actions30, c.adopted.join(", "), c.last_day || "never", c.expires_on || "", c.activated ? "yes" : "no", c.ttfv_h ?? ""]), kind);
  };
  const last = d ? Math.max(1, Math.ceil(d.total / d.size)) : 1;
  return (
    <FocusCard icon="👥" title="Customers by adoption" sub="Every approved customer with their adoption score and segment."
      right={<span className="ad-x"><button style={btn()} onClick={() => exportAll("copy")}>Copy</button><button style={btn()} onClick={() => exportAll("xlsx")} id="ad-cust-xlsx">Excel</button></span>}>
      <div className="ad-segs" id="ad-segs">
        <button type="button" className={!seg ? "on" : ""} onClick={() => setSeg("")}>All <b>{segments.reduce((t, s) => t + s.n, 0)}</b></button>
        {segments.map(s => <button key={s.k} type="button" className={seg === s.k ? "on" : ""} onClick={() => setSeg(s.k)} title={SEG_HELP[s.k]} data-seg={s.k}>
          <i style={{ background: SEG_TONE[s.k] }}/>{s.label} <b>{s.n}</b></button>)}
      </div>
      <div className="ad-tools">
        <input placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 240 }} id="ad-cust-q"/>
        <select value={sort} onChange={e => setSort(e.target.value)} style={input} aria-label="Sort" id="ad-cust-sort">
          <option value="score">Sort: adoption score</option><option value="days">Sort: active days</option><option value="last">Sort: last active</option><option value="name">Sort: name</option></select>
        <span className="am-mut">{d ? plural(d.total, "customer") : "…"}</span>
      </div>
      <div className="am-tw"><table className="am-t ad-t" id="ad-cust">
        <thead><tr>{["Customer", "Segment", "Score", "Active days (30)", "Key actions (30)", "Applications adopted", "Last active", "Access ends"].map(x => <th key={x} className="am-th">{x}</th>)}</tr></thead>
        <tbody>{d && d.rows.map(c => (
          <tr key={c.id} className="ad-row" onClick={() => onOpen(c.id)} data-cust={c.email}>
            <td><b>{c.name}</b><div className="am-mut">{c.email}</div></td>
            <td><span className="ad-seg" style={{ color: SEG_TONE[c.segment], borderColor: SEG_TONE[c.segment] }}>{(segments.find(s => s.k === c.segment) || {}).label}</span></td>
            <td><span className="ad-score"><i style={{ width: `${c.score}%` }}/></span> <b>{c.score}</b></td>
            <td className="num">{c.d30}</td><td className="num">{c.actions30}</td>
            <td>{c.adopted.length ? c.adopted.join(", ") : <span className="am-mut">none yet</span>}</td>
            <td>{c.last_day ? (c.quiet === 0 ? "today" : `${c.quiet} day${c.quiet === 1 ? "" : "s"} ago`) : <span className="am-mut">never</span>}</td>
            <td>{c.expires_on ? fmtDay(c.expires_on) : <span className="am-mut">no end</span>}</td>
          </tr>))}
          {d && !d.rows.length && <tr><td colSpan={8}><Empty>No customers here.</Empty></td></tr>}</tbody></table></div>
      {d && d.total > d.size && <div className="ad-pager"><button style={btn()} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
        <span className="am-mut">Page {page} of {last}</span><button style={btn()} disabled={page >= last} onClick={() => setPage(p => p + 1)}>›</button></div>}
    </FocusCard>);
}

const AD_CSS = `
.ad-sub{display:flex;gap:6px;border-bottom:1px solid var(--b1)}
.ad-sub button{border:0;background:none;padding:8px 14px;font-weight:700;font-size:12.5px;color:var(--t2);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.ad-sub button.on{color:var(--acc);border-bottom-color:var(--acc)}
.ad-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
.ad-note{font-size:12px;color:var(--t2);background:var(--s2);border-radius:8px;padding:7px 11px;margin-bottom:10px}
.ad-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-bottom:14px}
.ad-m{background:var(--s1);border:1px solid var(--b1);border-radius:11px;padding:11px 13px}
.ad-ml{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3);font-weight:700}
.ad-i{cursor:help;color:var(--t3);margin-left:2px}
.ad-mv{font:700 22px var(--mono);color:var(--t1);margin:3px 0}
.ad-ms{font-size:11px;color:var(--t3)}
.ad-delta{font-size:11px;color:var(--t3);white-space:nowrap}.ad-delta.up{color:var(--long)}.ad-delta.down{color:var(--short)}
.ad-x{display:inline-flex;gap:6px}
.ad-funnel{display:flex;flex-direction:column;gap:6px}
.ad-fr{display:grid;grid-template-columns:220px minmax(0,1fr) 140px 130px;gap:12px;align-items:center;padding:6px 8px;border-radius:9px}
.ad-fr.worst{background:color-mix(in srgb,var(--short) 7%,transparent)}
.ad-fl{display:flex;flex-direction:column}.ad-fl b{font-size:13px;color:var(--t1)}.ad-fl small{font-size:11px;color:var(--t3)}
.ad-fb{height:14px;border-radius:5px;background:var(--s2);overflow:hidden}.ad-fb i{display:block;height:100%;background:var(--acc);border-radius:5px}
.ad-fn{display:flex;flex-direction:column;text-align:right}.ad-fn b{font:700 15px var(--mono);color:var(--t1)}.ad-fn small{font-size:11px;color:var(--t3)}
.ad-fd{font:600 12px var(--mono);color:var(--short);text-align:right}
.ad-t td{vertical-align:middle}.ad-t .num{text-align:right;font-family:var(--mono)}
.ad-rate,.ad-score{display:inline-block;width:70px;height:7px;border-radius:4px;background:var(--s2);vertical-align:middle;overflow:hidden}
.ad-rate i,.ad-score i{display:block;height:100%;background:var(--acc)}
.ad-acts{display:flex;flex-wrap:wrap;gap:4px}.ad-acts span{font-size:11px;padding:2px 7px;border-radius:6px;border:1px solid var(--b1);color:var(--t2)}
.ad-acts span b{color:var(--t1)}.ad-acts span.zero{opacity:.55}
.ad-coh td.ad-heat{min-width:46px}.ad-coh tr.few td{opacity:.6}
.ad-att{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ad-attc{border:1px solid var(--b1);border-radius:11px;padding:10px 12px;background:var(--s1)}
.ad-atth{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--t1)}
.ad-attn{font:700 14px var(--mono);color:var(--t1)}
.ad-attl{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.ad-person{all:unset;cursor:pointer;display:flex;flex-direction:column;padding:6px 8px;border-radius:7px;background:var(--s2)}
.ad-person:hover{outline:1px solid var(--acc)}.ad-person b{font-size:12.5px;color:var(--t1)}.ad-person small{font-size:11px;color:var(--t3)}
.ad-segs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.ad-segs button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);border-radius:999px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer}
.ad-segs button.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.ad-segs i{width:8px;height:8px;border-radius:50%;display:inline-block}.ad-segs b{color:var(--t1)}
.ad-seg{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid}
.ad-row{cursor:pointer}.ad-row:hover td{background:var(--hover,rgba(127,127,127,.05))}
.ad-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px}
.ad-how{margin-top:14px;font-size:12.5px;color:var(--t1)}.ad-how summary{cursor:pointer;font-weight:700}.ad-how ul{line-height:1.6}
@media (max-width:900px){.ad-fr{grid-template-columns:1fr 90px}.ad-fb,.ad-fd{display:none}.ad-att{grid-template-columns:1fr}}
`;
