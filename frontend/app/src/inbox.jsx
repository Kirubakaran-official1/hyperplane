// Inbox — full page (owner 2026-11-08, round 19: "revamp the inbox — a unified inbox with multiple features, grouped by application,
// for inform or approval; keep the portfolio changes properly segregated instead of random messages"). Modelled on the owner's sample
// (an enterprise approvals inbox):
//   left    tabs Action · Updates · Done, search, application filter + group-by (always on screen), collapsible groups per application;
//           each row: title · age, then **who it is from** · summary, then #ref · app code · status · date (round 19d, like the Helpdesk list) (everything shows — round 19b:
//           "keep the name Inbox; Action = any portfolio swap or stock change from any application; Updates = when anyone tags you in the
//           chat (and announcements, helpdesk); Done = all completed; remove Today / 7d … — show all")
//   middle  the item: type chip, reference, title, status pill, a fact strip, Overview (what to change, with Swap) and Activity (timeline)
//   right   the status flow (Raised → Seen → Settled → Done) and help; for a helpdesk query, its conversation
// Data: /app/api/inbox (portal.py — notifications + the customer's helpdesk tickets). Items settle by themselves on the server (inbox.py):
// a swap here or anywhere else settles its stock; a recovered trend settles too.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AiSpark, Icon, addCss, api } from "./core.jsx";
import { SwapPanel } from "./swap-ui.jsx";
import { HD_CSS, HdThread } from "../../shared/helpdesk.jsx";

const META = {
  portfolio: { code: "PA", name: "AI Portfolio Analyser", c: "var(--acc)" },
  builder: { code: "PB", name: "AI Portfolio Builder", c: "#4c6ef5" },
  sip: { code: "ES", name: "AI ETF SIP Builder", c: "#7048e8" },
  msip: { code: "MS", name: "AI Momentum SIP Builder", c: "#ae3ec9" },
  helpdesk: { code: "HD", name: "Helpdesk", c: "#64748b" },
  hyperplane: { code: "HP", name: "Hyperplane updates", c: "#1c7ed6" },
  community: { code: "CM", name: "Community", c: "#c2255c" },
};
const ORDER = ["portfolio", "builder", "sip", "msip", "community", "hyperplane", "helpdesk"];
const TABS = [["action", "Action"], ["info", "Updates"], ["done", "Done"]];
const HOW = { swapped: "Swapped", removed: "Removed", recovered: "Trend recovered" };
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const tabOf = x => x.status === "done" ? "done" : x.type === "action" ? "action" : "info";
const kindOf = x => x.src === "helpdesk" ? "HELPDESK QUERY" : x.src === "announce" ? "ANNOUNCEMENT" : x.src === "mention" ? "MENTION" : x.body && x.body.order ? "SIP ORDER" : "PORTFOLIO CHANGE";
const pfName = x => x.src === "alert" ? (x.title.split(":")[0] || "").trim() : x.src === "helpdesk" ? "Helpdesk queries" : x.src === "mention" ? "Community" : "Announcements";
const age = iso => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : m < 43200 ? `${Math.round(m / 10080)}W` : `${Math.round(m / 43200)}M`;
};
const day = iso => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dt = iso => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const refOf = x => x.src === "helpdesk" ? `HD-${x.hid}` : `#${x.nid}`;
// who an item is from — shown in bold before the summary, like the Helpdesk list (round 19d: "bring the name outside")
const fromOf = x => x.src === "mention" ? (x.body || {}).by : x.src === "announce" ? "Hyperplane" : x.src === "helpdesk" ? "Helpdesk"
  : (x.body || {}).order ? "Hyperplane AI" : "Hyperplane AI watch";
const summary = x => {
  const b = x.body || {};
  if (x.src === "helpdesk") return b.snippet || `${b.messages || 0} message${b.messages === 1 ? "" : "s"}`;
  if (x.src === "announce") return (b.text || "").slice(0, 90);
  if (x.src === "mention") return (b.text || "").slice(0, 110);
  if (b.order) return `Order ready · ${inr(b.total)}`;
  const its = b.items || [], done = Object.keys(x.items_done || {}).length;
  return `${its.length} stock${its.length === 1 ? "" : "s"} to change${done ? ` · ${done} settled` : ""} · ${its.map(i => i.s).join(", ")}`;
};

addCss("inbox", `
.ib{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr) minmax(260px,320px);min-height:calc(100vh - 150px);border:1px solid var(--b1);border-radius:12px;background:var(--s1);overflow:hidden}
.ib-wrap{container-type:inline-size;min-width:0}
.ib-l{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--b1)}
.ib-tabs{display:flex;border-bottom:1px solid var(--b1)}
.ib-tabs button{flex:1;height:44px;white-space:nowrap;padding:0 6px;border:0;border-bottom:2px solid transparent;background:none;color:var(--t2);font:600 13px var(--sans);cursor:pointer}
.ib-tabs button.on{color:var(--acc);border-bottom-color:var(--acc)}.ib-tabs button em{font-style:normal;margin-left:4px;font-weight:700}
.ib-tools{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid var(--b1)}
.ib-srch{display:flex;gap:8px;align-items:center}
.ib-sel{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:8px}
.ib-sel select{width:100%;height:34px;padding:0 8px;border:1px solid var(--b2);border-radius:8px;background:var(--bg);color:var(--t1);font:500 12.5px var(--sans);cursor:pointer}
.ib-srch label{flex:1;display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:1px solid var(--b2);border-radius:8px;background:var(--bg);color:var(--t3)}
.ib-srch input{flex:1;min-width:0;border:0;background:none;outline:0;color:var(--t1);font:400 13px var(--sans)}
.ib-list{flex:1;overflow-y:auto}
.ib-gh{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--b1);background:var(--s2);cursor:pointer;color:var(--t1);text-align:left}
.ib-gh .chev{color:var(--t3);transform:rotate(90deg);transition:transform .2s}.ib-gh.shut .chev{transform:none}
.ib-badge{flex:none;display:inline-grid;place-items:center;min-width:30px;height:22px;padding:0 6px;border-radius:6px;background:var(--c);color:#fff;font:700 11px var(--sans);letter-spacing:.03em}
.ib-gh b{flex:1;min-width:0;font:600 12.5px var(--sans);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ib-gh em{font-style:normal;color:var(--t3);font-weight:600}
.ib-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;width:100%;padding:10px 12px 10px 14px;border:0;border-bottom:1px solid var(--b1);border-left:3px solid transparent;background:none;text-align:left;cursor:pointer;color:inherit;font:inherit}
.ib-row:hover{background:color-mix(in srgb,var(--acc) 4%,transparent)}.ib-row.on{background:var(--adim);border-left-color:var(--acc)}
.ib-row .rf{font:500 11.5px var(--sans);color:var(--t3);font-feature-settings:"tnum"}.ib-row .ag{display:inline-flex;align-items:center;gap:4px;font:500 11.5px var(--sans);color:var(--t3);justify-self:end}
.ib-row .tt{grid-column:1;display:flex;align-items:center;gap:6px;font:500 13.5px/19px var(--sans);color:var(--t1);min-width:0}.ib-row .tt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ib-row.un .tt{font-weight:700}.ib-row.un .tt::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:var(--acc)}
.ib-row .sm{grid-column:1/-1;font-size:12.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ib-row .sm b{font-weight:600;color:var(--t2)}
.ib-row .mt{grid-column:1/-1;display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--t3)}.ib-row .mt .ib-ap{font-weight:600}.ib-row .mt .dd{margin-left:auto}.ib-row .dd{font-size:11.5px;color:var(--t3);justify-self:end;white-space:nowrap}
.ib-none{padding:28px 16px;text-align:center;font-size:13px;color:var(--t3)}
.ib-m{min-width:0;display:flex;flex-direction:column;overflow-y:auto}
.ib-mh{display:flex;flex-direction:column;gap:6px;padding:16px 20px;border-bottom:1px solid var(--b1)}
.ib-mh .l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--t3)}
.ib-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:5px;background:var(--adim);color:var(--acc);font:700 10.5px var(--sans);letter-spacing:.05em}
.ib-mh h2{margin:0;font:700 19px/26px var(--sans);color:var(--t1)}
.ib-mh .l3{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--t2)}.ib-mh .l3 .sp{flex:1}
.ib-st{display:inline-flex;align-items:center;gap:6px;font:600 12.5px var(--sans)}.ib-st i{width:8px;height:8px;border-radius:50%;background:currentColor}
.ib-st.s-action{color:var(--mixed)}.ib-st.s-info{color:var(--acc)}.ib-st.s-done{color:var(--long)}
.ib-facts{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--b1)}
.ib-facts div{padding:10px 20px;border-right:1px solid var(--b1);min-width:0}.ib-facts div:last-child{border-right:0}
.ib-facts span{display:block;font:600 10.5px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}.ib-facts b{display:block;margin-top:2px;font:600 13.5px var(--sans);color:var(--t1);font-feature-settings:"tnum"}
.ib-dt{display:flex;gap:4px;padding:0 20px;border-bottom:1px solid var(--b1)}
.ib-dt button{height:42px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:none;color:var(--t2);font:600 13.5px var(--sans);cursor:pointer}.ib-dt button.on{color:var(--acc);border-bottom-color:var(--acc)}
.ib-body{padding:16px 20px;display:flex;flex-direction:column;gap:14px}
.ib-t td .sub{max-width:260px}.ib-t .stl{display:inline-flex;align-items:center;gap:5px;color:var(--long);font-weight:600}.ib-t .stl.rc{color:var(--acc)}
.ib-t .wait{color:var(--mixed);font-weight:600}
.ib-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ib-act input{flex:1;min-width:180px;height:36px;border:1px solid var(--b2);border-radius:6px;background:var(--bg);color:var(--t1);padding:0 10px;font:13px var(--sans)}
.ib-msg{white-space:pre-wrap;font-size:14px;line-height:22px;color:var(--t1);padding:14px 16px;border:1px solid var(--b1);border-radius:10px;background:var(--bg)}
.ib-order{padding:14px 16px;border-radius:10px;background:var(--adim);font-size:14px;color:var(--t1)}.ib-order b{font-size:18px}
.ib-note{font-size:12px;color:var(--t3)}
.ib-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.ib-tl li{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding-bottom:16px}
.ib-tl li::before{content:"";position:absolute;left:10px;top:20px;bottom:0;width:2px;background:var(--b1)}.ib-tl li:last-child::before{display:none}
.ib-tl li i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--s3);color:var(--t2)}.ib-tl li.g i{background:var(--longd);color:var(--long)}.ib-tl li.a i{background:var(--adim);color:var(--acc)}
.ib-tl b{display:block;font:600 13px var(--sans);color:var(--t1)}.ib-tl small{display:block;font-size:12px;color:var(--t3)}
.ib-r{min-width:0;border-left:1px solid var(--b1);display:flex;flex-direction:column;overflow-y:auto;background:var(--s1)}
.ib-rh{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--b1);font:700 12px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t2)}
.ib-flow{padding:14px 16px;display:flex;flex-direction:column;gap:0}
.ib-step{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;position:relative;padding-bottom:14px}
.ib-step::before{content:"";position:absolute;left:11px;top:24px;bottom:0;width:2px;background:var(--b1)}.ib-step:last-child::before{display:none}.ib-step.fin::before{background:var(--long)}
.ib-step i{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--b2);background:var(--s1);color:var(--t3)}
.ib-step.fin i{border-color:var(--long);background:var(--long);color:#fff}.ib-step.now i{border-color:var(--mixed);color:var(--mixed)}
.ib-step b{display:block;font:600 13px var(--sans);color:var(--t1)}.ib-step small{display:block;font-size:12px;color:var(--t3)}
.ib-help{margin:4px 16px 16px;padding:12px;border-radius:10px;background:var(--s2);font-size:12.5px;color:var(--t2);display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.ib-hd{flex:1;min-height:0;display:flex}.ib-hd .hd-thread{flex:1;min-height:0;border:0;border-radius:0}.ib-hd .hd-back{display:none}
.ib-empty{flex:1;display:grid;place-items:center;padding:40px 20px;text-align:center;color:var(--t3);font-size:13px}.ib-empty b{display:block;font:600 15px var(--sans);color:var(--t1);margin-bottom:4px}
.ib-back{display:none}
.ib-ov{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.55)}
.ib-mod{width:min(1120px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.ib-mod .hdx{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ib-mod h3{margin:4px 0 0;font:700 18px var(--sans);color:var(--t1)}
.ib-x{flex:none;width:32px;height:32px;border-radius:8px;border:1px solid var(--b1);background:var(--s1);color:var(--t2);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
@container (max-width:1180px){.ib{grid-template-columns:minmax(280px,330px) minmax(0,1fr)}.ib-r{grid-column:2;border-left:0;border-top:1px solid var(--b1)}.ib-m{grid-row:1}}
@container (max-width:760px){
  .ib{grid-template-columns:minmax(0,1fr)}.ib-l{border-right:0}.ib-r{grid-column:1}
  .ib.sel .ib-l{display:none}.ib:not(.sel) .ib-m,.ib:not(.sel) .ib-r{display:none}
  .ib-back{display:inline-flex;align-self:flex-start;align-items:center;gap:4px;height:30px;padding:0 10px;margin-bottom:4px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t2);font:600 12px var(--sans);cursor:pointer}
  .ib-facts{display:grid;grid-template-columns:1fr 1fr}.ib-facts div{border-right:0;border-bottom:1px solid var(--b1);padding:8px 16px}
  .ib-hm{display:none}.ib-mh,.ib-body{padding-left:16px;padding-right:16px}.ib-dt{padding:0 12px}
}
`);

function Flow({ x }) {
  const its = (x.body && x.body.items) || [], done = Object.keys(x.items_done || {}).length;
  const steps = x.src === "helpdesk"
    ? [["Raised", day(x.created), true], ["Our reply", x.body.unread ? `${x.body.unread} new` : x.status === "done" ? "Answered" : "Waiting for us", x.status === "done" || x.body.unread > 0], ["Closed", x.done_at ? day(x.done_at) : "Open", x.status === "done"]]
    : x.src === "announce"
    ? [["Sent by Hyperplane", dt(x.at), true], ["Seen", x.read_at ? dt(x.read_at) : "Not yet", !!x.read_at]]
    : x.src === "mention"
    ? [[`Mentioned by ${x.body.by}`, dt(x.at), true], ["Seen", x.read_at ? dt(x.read_at) : "Not yet", !!x.read_at], ["Done", x.done_at ? dt(x.done_at) : "Open", x.status === "done"]]
    : [["Raised by Hyperplane AI", dt(x.at), true], ["Seen", x.read_at ? dt(x.read_at) : "Not yet", !!x.read_at],
       ...(its.length ? [["Stocks settled", `${done} of ${its.length}`, done === its.length]] : []),
       ["Done", x.done_at ? `${dt(x.done_at)}${x.done_note ? ` · ${x.done_note}` : ""}` : "Open", x.status === "done"]];
  const firstOpen = steps.findIndex(s => !s[2]);
  return <div className="ib-flow" id="ib-flow">{steps.map(([t, s, ok], i) => (
    <div key={t} className={`ib-step ${ok ? "fin" : i === firstOpen ? "now" : ""}`}><i>{ok ? <Icon name="check" size={13}/> : i + 1}</i><div><b>{t}</b><small>{s}</small></div></div>))}</div>;
}

function Activity({ x }) {
  const ev = [];
  if (x.src === "helpdesk") {
    ev.push([x.created, "Query raised", x.title, "a"]);
    if (x.at && x.at !== x.created) ev.push([x.at, "Last message", `${x.body.messages || 0} messages so far`, ""]);
  } else {
    ev.push([x.at, x.src === "announce" ? "Sent by Hyperplane" : x.src === "mention" ? `Mentioned by ${x.body.by}` : "Raised by Hyperplane AI", x.title, "a"]);
    if (x.read_at) ev.push([x.read_at, "Seen by you", "", ""]);
    Object.entries(x.items_done || {}).forEach(([s, v]) => ev.push([v.d, `${s} · ${HOW[v.how] || v.how}`, v.in ? `Replaced by ${v.in}` : v.how === "recovered" ? "Its long-term trend turned up again — nothing to change" : "", "g"]));
  }
  if (x.done_at) ev.push([x.done_at, "Closed", x.done_note || "", "g"]);
  ev.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return <ol className="ib-tl" id="ib-activity">{ev.map(([at, t, s, k], i) => (
    <li key={i} className={k}><i><Icon name={k === "g" ? "check" : k === "a" ? "bell" : "list"} size={12}/></i><div><b>{t}</b><small>{at && at.length > 10 ? dt(at) : day(at)}{s ? ` · ${s}` : ""}</small></div></li>))}</ol>;
}

// a Swap from the inbox: the saved portfolio's own swap (PUT …/holdings with "replaces") — the server settles the item
function SwapModal({ x, sym, onClose, onDone }) {
  const [st, setSt] = useState({});
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = (await api("/app/api/saved?kind=all")).find(p => p.id === x.ref);
        if (!saved) throw new Error("This portfolio is no longer saved");
        if (!saved.holdings.some(h => h.s === sym)) throw new Error(`${sym} is no longer in this portfolio`);
        const r = await api(`/app/api/alternatives?s=${encodeURIComponent(sym)}&exclude=${encodeURIComponent(saved.holdings.map(h => h.s).join(","))}`);
        if (live) setSt({ saved, items: r.items, cur: r.cur && { s: sym, ...r.cur } });
      } catch (e) { if (live) setSt({ err: e.message }); }
    })();
    const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k);
    return () => { live = false; window.removeEventListener("keydown", k); };
  }, []);
  const pick = async a => {
    setSt(o => ({ ...o, busy: a.s, err: "" }));
    try {
      await api(`/app/api/saved/${x.ref}/holdings`, { method: "PUT", json: { holdings: st.saved.holdings.map(h => h.s === sym ? { kind: "stock", s: a.s, n: a.n, cap: a.cap, sec: a.sec, grp: `${a.cap} cap`, replaces: sym } : h) } });
      onDone(sym, a.s);
    } catch (e) { setSt(o => ({ ...o, busy: null, err: e.message })); }
  };
  return (
    <div className="ib-ov" onClick={onClose}><div className="ib-mod" role="dialog" aria-label={`Swap ${sym}`} id="ib-swap" onClick={e => e.stopPropagation()}>
      <div className="hdx"><div><div className="px-eyebrow"><AiSpark/> {pfName(x)}</div><h3>Swap {sym} <span className="hp-arrow">→</span></h3></div>
        <button type="button" className="ib-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      {st.err && <div className="pf-miss">{st.err}</div>}
      {!st.items ? !st.err && <div className="svp-note">Finding the best alternatives…</div>
        : !st.items.length ? <div className="svp-note">No better stock in its industry, sector or size today.</div>
        : <SwapPanel items={st.items} cur={st.cur || { s: sym }} onPick={pick} busy={st.busy} idp="ib" app={st.saved.kind === "builder" ? "builder" : "portfolio"}/>}
    </div></div>);
}

function Detail({ x, apps, onOpen, onHelpdesk, onCommunity, onChange, onBack }) {
  const [tab, setTab] = useState("overview"); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [swap, setSwap] = useState(null);
  useEffect(() => { setTab("overview"); setNote(""); setErr(""); }, [x.id]);
  const b = x.body || {}, its = b.items || [], m = META[x.app] || META.hyperplane, has = apps.some(a => a.key === x.app);
  const set = async path => {
    setBusy(true); setErr("");
    try { onChange(await api(`/app/api/inbox/${x.nid}/${path}`, { method: "POST", json: path === "done" ? { note } : undefined })); setNote(""); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const t = tabOf(x);
  const facts = x.src === "helpdesk"
    ? [["Ticket", `HD-${x.hid}`], ["Severity", (b.severity || "").replace(/^./, c => c.toUpperCase())], ["Status", x.status === "done" ? "Closed" : "Open"], ["Messages", b.messages || 0], ["Raised on", day(x.created)]]
    : x.src === "announce" ? [["From", "Hyperplane"], ["Sent on", day(x.at)], ["Type", "Information"]]
    : x.src === "mention" ? [["From", b.by], ["Where", b.thread ? "A thread in the Community" : "Community chat"], ["Sent on", day(x.at)]]
    : b.order ? [["Application", m.name], ["Plan", pfName(x)], ["This instalment", inr(b.total)], ["Raised on", day(x.at)]]
    : [["Application", m.name], ["Portfolio", pfName(x)], ["Stocks affected", its.length], ["Settled", `${Object.keys(x.items_done || {}).length} of ${its.length}`], ["Raised on", day(x.at)]];
  return (<>
    <div className="ib-m" id="ib-detail" data-item={x.id}>
      <div className="ib-mh">
        <button type="button" className="ib-back" onClick={onBack}><span aria-hidden="true">‹</span> All items</button>
        <div className="l1"><span className="ib-chip" style={{ background: `color-mix(in srgb,${m.c} 14%,transparent)`, color: m.c }}>{kindOf(x)}</span><span>{refOf(x)}</span></div>
        <h2>{x.title}</h2>
        <div className="l3"><span>{m.name}</span><span>·</span><span>{x.src === "helpdesk" ? `Raised ${day(x.created)}` : `Raised ${day(x.at)}`}</span><span className="sp"/>
          <span title="Age">{age(x.at)}</span><span className={`ib-st s-${t}`} id="ib-status"><i/>{t === "done" ? "Done" : t === "action" ? "Action" : "Update"}</span></div>
      </div>
      <div className="ib-facts">{facts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <div className="ib-dt" role="tablist">{[["overview", "Overview"], ["activity", "Activity"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} id={`ib-tab-${k}`}>{l}</button>)}</div>
      <div className="ib-body">
        {tab === "activity" ? <Activity x={x}/> : <>
          {x.src === "announce" && <div className="ib-msg" id="ib-text">{b.text}</div>}
          {x.src === "mention" && <><div className="ib-msg" id="ib-text"><b>{b.by}</b>{b.admin ? " · Hyperplane" : ""}<br/>{b.text}</div>
            <div className="ib-act"><button type="button" className="px-btn primary" id="ib-community" onClick={() => { if (x.status !== "done") set("done"); onCommunity(b.mid, b.thread); }}>Open in the Community</button>
              {x.status !== "done" ? <button type="button" className="px-btn" onClick={() => set("done")} disabled={busy} id="ib-done"><Icon name="check" size={14}/> Mark done</button>
                : <button type="button" className="px-btn" onClick={() => set("reopen")} disabled={busy} id="ib-reopen">Reopen</button>}</div></>}
          {x.src === "helpdesk" && <><div className="ib-msg">{b.snippet || "Open the conversation to read the messages."}</div>
            <div className="ib-act"><button type="button" className="px-btn" onClick={() => onHelpdesk(x.hid)}>Open in Helpdesk</button></div></>}
          {b.order && <div className="ib-order">This instalment's order is ready: <b>{inr(b.total)}</b>. Open the plan to see what to buy.</div>}
          {its.length > 0 && <table className="hp-t ib-t" id="ib-items">
            <thead><tr><th>Stock</th><th className="ib-hm">Why</th><th className="ib-hm">Suggested</th><th>Status</th><th/></tr></thead>
            <tbody>{its.map(i => { const d = (x.items_done || {})[i.s]; return (
              <tr key={i.s} data-stock={i.s}>
                <td><b className="sym">{i.s}</b>{i.n && <span className="sub">{i.n}</span>}</td>
                <td className="wrap ib-hm">{(i.why || "").replace(/^./, c => c.toUpperCase())}</td>
                <td className="ib-hm">{i.alt ? <><b className="sym">{i.alt.s}</b>{i.alt.n && <span className="sub">{i.alt.n}</span>}</> : <span className="sub">Choose on Swap</span>}</td>
                <td>{d ? <span className={`stl ${d.how === "recovered" ? "rc" : ""}`}><Icon name="check" size={13}/>{HOW[d.how] || d.how}{d.in ? ` → ${d.in}` : ""}</span> : x.status === "done" ? <span className="sub">Closed</span> : <span className="wait">To change</span>}</td>
                <td className="num">{!d && x.status !== "done" && x.ref && has && <button type="button" className="px-btn primary" data-ibswap={i.s} onClick={() => setSwap(i.s)}><Icon name="swap" size={14}/> Swap</button>}</td>
              </tr>); })}</tbody></table>}
          {x.src === "alert" && <div className="ib-act">
            {has && <button type="button" className="px-btn" onClick={() => onOpen(x.app, x.ref)} id="ib-open">{x.ref ? "Open the portfolio" : "Open the AI Portfolio Analyser"}</button>}
            {x.status === "done"
              ? <button type="button" className="px-btn" onClick={() => set("reopen")} disabled={busy} id="ib-reopen">Reopen</button>
              : <><input value={note} onChange={e => setNote(e.target.value.slice(0, 200))} placeholder="Add a note (optional)" aria-label="Note" maxLength={200}/>
                <button type="button" className="px-btn" onClick={() => set("done")} disabled={busy} id="ib-done"><Icon name="check" size={14}/> Mark done</button></>}
          </div>}
          {x.src === "announce" && x.status !== "done" && <div className="ib-act"><button type="button" className="px-btn" onClick={() => set("done")} disabled={busy} id="ib-done"><Icon name="check" size={14}/> Mark done</button></div>}
          {err && <div className="pf-miss">{err}</div>}
          {x.src === "alert" && <p className="ib-note">Checked by fixed rules on our latest data. For education only, not investment advice.</p>}
        </>}
      </div>
    </div>
    <aside className="ib-r" aria-label="Status">
      {x.src === "helpdesk" ? <><div className="ib-rh">Conversation</div>
        <div className="ib-hd"><style>{HD_CSS}</style><HdThread api={api} base="/app/api/helpdesk" id={x.hid} onChanged={() => {}} onBack={() => {}} onNew={() => onHelpdesk(null)}/></div></>
        : <><div className="ib-rh">Status flow</div><Flow x={x}/>
          <div className="ib-help">Need help with this?<button type="button" className="px-btn" onClick={() => onHelpdesk(null)}>Ask the Helpdesk</button></div></>}
    </aside>
    {swap && <SwapModal x={x} sym={swap} onClose={() => setSwap(null)} onDone={() => { setSwap(null); onChange(null); }}/>}
  </>);
}

export default function Inbox({ apps = [], openReq, onOpen, onHelpdesk, onCommunity = () => {}, onChanged = () => {}, onOut = () => {} }) {
  const [items, setItems] = useState(null); const [err, setErr] = useState("");
  const [tab, setTab] = useState("action"); const [q, setQ] = useState("");
  const [group, setGroup] = useState("app"); const [only, setOnly] = useState(null);
  const [shut, setShut] = useState(() => new Set()); const [sel, setSel] = useState(null);
  const load = useCallback(() => api("/app/api/inbox").then(r => { setItems(r.items); setErr(""); }).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); }), []);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === "visible" && load(), 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => {                                                    // opened from the bell: that item, on its tab
    if (!openReq || !items) return;
    const x = items.find(i => i.id === openReq.id); if (x) { setTab(tabOf(x)); pick(x); }
  }, [openReq && openReq.n, !!items]);
  const pick = x => {
    setSel(x.id);
    if (x.nid && !x.read) { setItems(o => o.map(i => i.id === x.id ? { ...i, read: true, read_at: new Date().toISOString() } : i)); api("/app/api/notifications/read", { method: "POST", json: { ids: [x.nid] } }).then(onChanged).catch(() => {}); }
  };
  const ql = q.trim().toLowerCase();
  const base = useMemo(() => (items || []).filter(x => (!only || x.app === only) && (!ql || `${x.title} ${summary(x)} ${refOf(x)}`.toLowerCase().includes(ql))),
    [items, only, ql]);
  const counts = Object.fromEntries(TABS.map(([k]) => [k, base.filter(x => tabOf(x) === k).length]));
  const shown = base.filter(x => tabOf(x) === tab);
  const groups = useMemo(() => {
    if (group === "none") return [{ k: "all", label: "All items", code: "ALL", c: "var(--t3)", list: shown }];
    const m = new Map();
    shown.forEach(x => { const k = group === "app" ? x.app : `${x.app}:${pfName(x)}`; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.entries()].map(([k, list]) => { const a = list[0].app, me = META[a] || META.hyperplane;
      return { k, label: group === "app" ? (apps.find(z => z.key === a) || {}).name || me.name : pfName(list[0]), code: me.code, c: me.c, list, o: ORDER.indexOf(a) }; })
      .sort((a, b) => a.o - b.o || a.label.localeCompare(b.label));
  }, [shown, group]);
  const cur = (items || []).find(x => x.id === sel);
  const changed = r => { if (r) setItems(o => o.map(i => i.id === `n${r.nid}` ? r : i)); load(); onChanged(); };
  const appsIn = ORDER.filter(a => (items || []).some(x => x.app === a));
  return (
    <div className="ib-wrap"><div className={`ib ${cur ? "sel" : ""}`} id="inbox">
      <div className="ib-l">
        <div className="ib-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} id={`ib-t-${k}`}>{l}{counts[k] > 0 && <em>({counts[k]})</em>}</button>)}</div>
        <div className="ib-tools">
          <div className="ib-srch"><label><Icon name="search" size={15}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, name, #id" aria-label="Search inbox" id="ib-q"/></label></div>
          {/* round 19d: the filters stay on screen — which application a change belongs to, and how the list is grouped */}
          <div className="ib-sel">
            <select value={only || ""} onChange={e => setOnly(e.target.value || null)} aria-label="Application" id="ib-app">
              <option value="">All applications</option>
              {appsIn.map(a => <option key={a} value={a}>{(apps.find(z => z.key === a) || {}).name || META[a].name} ({(items || []).filter(x => x.app === a && tabOf(x) === tab).length})</option>)}
            </select>
            <select value={group} onChange={e => setGroup(e.target.value)} aria-label="Group by" id="ib-group">
              <option value="app">By application</option><option value="portfolio">By portfolio</option><option value="none">No grouping</option>
            </select>
          </div>
        </div>
        <div className="ib-list" id="ib-list">
          {!items ? <div className="ib-none">{err || "Loading…"}</div>
            : !shown.length ? <div className="ib-none">{tab === "action" ? "Nothing needs your action — no portfolio change is waiting." : tab === "info" ? "No updates. Mentions in the Community, announcements and helpdesk replies show here." : "Nothing completed yet."}</div>
            : groups.map(g => { const off = shut.has(g.k); return (
              <div key={g.k} data-group-of={g.k}>
                <button type="button" className={`ib-gh ${off ? "shut" : ""}`} onClick={() => setShut(s => { const n = new Set(s); n.has(g.k) ? n.delete(g.k) : n.add(g.k); return n; })} aria-expanded={!off}>
                  <Icon name="chevron" size={13} className="chev"/><span className="ib-badge" style={{ "--c": g.c }}>{g.code}</span><b>{g.label}</b><em>({g.list.length})</em></button>
                {!off && g.list.map(x => (
                  <button key={x.id} type="button" className={`ib-row ${sel === x.id ? "on" : ""} ${x.read ? "" : "un"}`} onClick={() => pick(x)} data-ib={x.id}>
                    <span className="tt"><span>{x.title}</span></span><span className="ag" title="Age">{age(x.at)}</span>
                    <span className="sm"><b>{fromOf(x)}</b> · {summary(x)}</span>
                    <span className="mt"><span>{refOf(x)}</span><span className="ib-ap" style={{ color: (META[x.app] || META.hyperplane).c }}>{(META[x.app] || META.hyperplane).code}</span>
                      <span>{tabOf(x) === "done" ? "Done" : tabOf(x) === "action" ? "Action" : "Update"}</span><span className="dd">{dt(x.at)}</span></span>
                  </button>))}
              </div>); })}
        </div>
      </div>
      {cur ? <Detail x={cur} apps={apps} onOpen={onOpen} onHelpdesk={onHelpdesk} onCommunity={onCommunity} onChange={changed} onBack={() => setSel(null)}/>
        : <><div className="ib-m"><div className="ib-empty"><div><b>Select an item</b>Pick anything on the left to see the details, what to change and its history.</div></div></div>
          <aside className="ib-r"><div className="ib-rh">Status flow</div><div className="ib-empty">The steps of the item you pick show here.</div></aside></>}
    </div></div>);
}
