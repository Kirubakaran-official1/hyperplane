// Admin → 📂 Shared portfolios (owner 2026-11-07, round 15: "the list of every saved portfolio by the user name, with the ID, public or
// private, value and category — to track the engagement; a separate sub-app in the admin console"). Read only, from
// GET /api/admin/portfolios (main.py): who saved what, in which application, public or private, its tracked value and how often its
// public link was opened. Holdings are never sent here. Exports to Excel / copies like the other admin tables.
import React, { useEffect, useMemo, useState } from "react";
import { exportRows } from "./access.jsx";
import { btn, fmtDay, input } from "./access/shared.jsx";

const APPS = [["all", "All applications"], ["builder", "AI Portfolio Builder"], ["sip", "AI ETF SIP Builder"], ["msip", "AI Momentum SIP Builder"], ["analyser", "AI Portfolio Analyser"]];
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const short = v => v == null ? "—" : Math.abs(v) >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const pct = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const SORTS = { created: r => r.created || "", views: r => r.views, value: r => r.value || 0, ret: r => r.ret ?? -1e9, customer: r => (r.customer || "").toLowerCase(), name: r => r.name.toLowerCase() };

const CSS = `
.sp-adm{padding:18px 22px 40px;display:flex;flex-direction:column;gap:14px}
.sp-adm h2{margin:0;font-size:20px;color:var(--t1)}.sp-adm .sub{font-size:12.5px;color:var(--t2);margin-top:3px}
.sp-k{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.sp-k>div{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px 14px}
.sp-k span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.sp-k b{display:block;margin-top:4px;font-size:22px;color:var(--t1)}.sp-k small{font-size:11.5px;color:var(--t2)}
.sp-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sp-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.sp-chips button{border:1px solid var(--b2);background:var(--s1);color:var(--t2);font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer}
.sp-chips button.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.sp-tw{background:var(--s1);border:1px solid var(--b1);border-radius:12px;overflow:auto}
.sp-t{width:100%;border-collapse:collapse;font-size:12.5px}
.sp-t th{padding:9px 12px;text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--b1);white-space:nowrap;background:var(--s2);cursor:pointer;user-select:none}
.sp-t th.num,.sp-t td.num{text-align:right}
.sp-t td{padding:10px 12px;border-bottom:1px solid var(--b1);color:var(--t1);vertical-align:middle;white-space:nowrap}
.sp-t tr:hover td{background:var(--s2)}.sp-t tr:last-child td{border-bottom:0}
.sp-t td small{display:block;font-size:11.5px;color:var(--t3)}
.sp-code{font-family:var(--mono);font-size:11.5px;color:var(--t2)}
.sp-vis{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700}
.sp-vis.public{background:var(--adim);color:var(--acc)}.sp-vis.private{background:var(--s2);color:var(--t2)}
.sp-app{display:inline-flex;height:22px;align-items:center;padding:0 9px;border-radius:999px;background:var(--s2);font-size:11.5px;font-weight:600;color:var(--t1)}
.up{color:var(--long)}.dn{color:var(--short)}
.sp-open{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 11px;border-radius:7px;border:1px solid var(--accborder);background:var(--adim);color:var(--acc);font-size:12px;font-weight:700;text-decoration:none}
.sp-open:hover{background:var(--acc);color:#fff}.sp-closed{font-size:11.5px;color:var(--t3)}
.sp-empty{padding:30px;text-align:center;color:var(--t2)}
@media (max-width:1100px){.sp-k{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

export function PortfoliosTab({ api, notify }) {
  const [rows, setRows] = useState(null), [q, setQ] = useState(""), [vis, setVis] = useState("all"), [app, setApp] = useState("all");
  const [sort, setSort] = useState(["created", -1]);
  const load = () => api("/api/admin/portfolios").then(setRows).catch(e => notify(e.message, "err"));
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => {
    if (!rows) return [];
    const ql = q.trim().toLowerCase();
    const f = rows.filter(r => (vis === "all" || r.visibility === vis) && (app === "all" || r.kind === app)
      && (!ql || `${r.customer} ${r.email} ${r.name} ${r.code}`.toLowerCase().includes(ql)));
    const k = SORTS[sort[0]];
    return f.slice().sort((a, b) => (k(a) > k(b) ? 1 : k(a) < k(b) ? -1 : 0) * sort[1]);
  }, [rows, q, vis, app, sort]);
  if (!rows) return <div className="sp-adm"><style>{CSS}</style>Loading…</div>;
  const pub = rows.filter(r => r.visibility === "public");
  const people = new Set(rows.map(r => r.email)).size;
  const views = rows.reduce((a, r) => a + r.views, 0);
  const value = rows.reduce((a, r) => a + (r.value || 0), 0);
  const th = (k, l, num) => <th className={num ? "num" : ""} onClick={() => setSort(([s, d]) => [k, s === k ? -d : -1])}>{l}{sort[0] === k ? (sort[1] < 0 ? " ▾" : " ▴") : ""}</th>;
  const header = ["Customer", "Email", "Portfolio", "ID", "Link", "Application", "Visibility", "Holdings", "Changes", "Monthly", "Invested", "Value", "Return %", "Link opens", "Last opened", "Saved"];
  const table = shown.map(r => [r.customer, r.email, r.name, r.code, r.visibility === "public" ? `${window.location.origin}/app/portfolio/${r.code}` : "", r.app, r.visibility, r.holdings, r.changes, r.monthly ?? "", r.invested ?? "", r.value ?? "", r.ret ?? "", r.views, r.last_view ? fmtDay(r.last_view) : "", r.saved_on || ""]);
  return (
    <div className="sp-adm" id="adm-portfolios">
      <style>{CSS}</style>
      <div><h2>📂 Shared portfolios</h2><div className="sub">Every portfolio customers saved, by customer — public or private, its tracked value and how often its public link was opened. Holdings are not shown here.</div></div>
      <div className="sp-k" id="sp-kpis">
        <div><span>Saved portfolios</span><b>{rows.length}</b><small>by {people} customer{people === 1 ? "" : "s"}</small></div>
        <div><span>Public</span><b>{pub.length}</b><small>{rows.length ? Math.round(pub.length / rows.length * 100) : 0}% of all</small></div>
        <div><span>Private</span><b>{rows.length - pub.length}</b><small>only the owner sees them</small></div>
        <div><span>Public link opens</span><b>{views.toLocaleString("en-IN")}</b><small>{pub.filter(r => r.views).length} links opened at least once</small></div>
        <div><span>Value tracked</span><b>{short(value)}</b><small>today, all portfolios</small></div>
        <div><span>With alerts on</span><b>{rows.filter(r => r.alerts).length}</b><small>get a note when a stock should change</small></div>
      </div>
      <div className="sp-tools">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer, email, portfolio or ID" style={{ ...input, minWidth: 280 }} id="sp-search"/>
        <div className="sp-chips" id="sp-vis">{[["all", "All"], ["public", "Public"], ["private", "Private"]].map(([k, l]) =>
          <button key={k} type="button" className={vis === k ? "on" : ""} onClick={() => setVis(k)}>{l}</button>)}</div>
        <select value={app} onChange={e => setApp(e.target.value)} style={input} id="sp-app">{APPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 12, color: "var(--t2)" }}>{shown.length} shown</span>
        <button type="button" style={btn()} onClick={() => exportRows("shared-portfolios", header, table, "copy").then(() => notify("Copied"))}>Copy</button>
        <button type="button" style={btn()} onClick={() => exportRows("shared-portfolios", header, table, "xlsx")}>Excel</button>
        <button type="button" style={btn()} onClick={load}>↻ Refresh</button>
      </div>
      <div className="sp-tw"><table className="sp-t" id="sp-table">
        <thead><tr>{th("customer", "Customer")}{th("name", "Portfolio")}<th>Link</th><th>Application</th><th>Visibility</th>
          <th className="num">Holdings</th>{th("value", "Value", true)}{th("ret", "Return", true)}{th("views", "Link opens", true)}{th("created", "Saved", true)}</tr></thead>
        <tbody>{shown.map(r => <tr key={r.code} data-code={r.code}>
          <td><b>{r.customer}</b><small>{r.email}</small></td>
          <td><b>{r.name}</b><small className="sp-code">{r.code}</small></td>
          <td>{r.visibility === "public"
            ? <a className="sp-open" href={`/app/portfolio/${r.code}`} target="_blank" rel="noopener noreferrer" title="Open the public page in a new tab" data-open={r.code}>Open ↗</a>
            : <span className="sp-closed" title="Private: only its owner can open it">Private</span>}</td>
          <td><span className="sp-app">{r.app}</span></td>
          <td><span className={`sp-vis ${r.visibility}`}>{r.visibility === "public" ? "Public" : "Private"}</span></td>
          <td className="num">{r.holdings}{r.changes ? <small>{r.changes} change{r.changes === 1 ? "" : "s"}</small> : null}</td>
          <td className="num"><b>{inr(r.value)}</b><small>{[r.monthly ? `${inr(r.monthly)} a month` : "", r.invested ? `${inr(r.invested)} invested` : "tracking starts next close"].filter(Boolean).join(" · ")}</small></td>
          <td className={`num ${r.ret > 0 ? "up" : r.ret < 0 ? "dn" : ""}`}>{pct(r.ret)}</td>
          <td className="num">{r.visibility === "public" ? <><b>{r.views}</b><small>{r.last_view ? `last ${fmtDay(r.last_view)}` : "not opened yet"}</small></> : <small>—</small>}</td>
          <td className="num">{r.saved_on ? fmtDay(r.saved_on) : "—"}</td>
        </tr>)}</tbody>
      </table>{!shown.length && <div className="sp-empty">No saved portfolio matches.</div>}</div>
    </div>);
}
