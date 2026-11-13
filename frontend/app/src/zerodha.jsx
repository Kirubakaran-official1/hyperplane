// Buy on Zerodha (round 20, owner 2026-11-13; backend app/zerodha.py, app/vault.py): Connect Zerodha (each customer's own Kite Publisher
// API key, saved once, encrypted on the server), the preview of a Kite basket and the hand-off.
// Every line is checked on the server against Zerodha's own instrument list (✓ same symbol · ⚠ different symbol on Zerodha, e.g. -BE ·
// ✗ not on Zerodha). "Open Kite" asks the server to record ONE basket (≤ 10 orders) and posts it from this tab to Kite, where the customer
// signs in if needed and confirms. Kite opens in a NEW TAB, always (round 21: never this tab). Round 21: Hyperplane never assumes an order
// was placed — after every basket the customer CHECKS IN (placed as planned / what they placed / not placed) before the next one; a swap is
// two steps (sell the old stock → check in → buy the new one → check in) and is never sent twice. Coming back (#zerodha=… in Kite's tab)
// says what Kite said and offers the check-in there too; the Hyperplane tab hears it (localStorage events) and moves on.
import React, { useEffect, useState } from "react";
import { Icon, KiteLogo, addCss, api } from "./core.jsx";
// round 20d: the owner's own Kite developer-console screenshots — every personal detail and the key painted over, the fields outlined
// and numbered (made by the scratchpad script zr_guide_imgs.py); imported here, so only the Zerodha chunk downloads them
import SHOT_SIGNUP from "./zr-guide/zr-guide-signup.png";
import SHOT_NEWAPP from "./zr-guide/zr-guide-newapp.png";
import SHOT_KEY from "./zr-guide/zr-guide-key.png";

const KITE = "https://kite.zerodha.com/connect/basket";       // the only place a basket is posted (fixed here, never taken from an answer)
const KEY = "hp_zerodha";                                      // localStorage (shared with Kite's tab): the page to come back to, the basket's tag
const RET = "hp_zerodha_ret", CKD = "hp_zerodha_ck";           // localStorage events: Kite's tab came back · a check-in was saved in another tab
const TAB = "hp_kite";                                         // the name of the tab Kite opens in
const inr = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";
const ST = {
  verified: ["ok", "Same symbol on Zerodha"], manual: ["ok", "Matched by the admin"], series: ["warn", "Different symbol on Zerodha"],
  missing: ["no", "Not on Zerodha"], blocked: ["no", "Not sent to Zerodha"], nolist: ["no", "Zerodha's list not loaded"],
};
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

const CSS = `
.zr-ov{z-index:120}
.zr-box{width:min(880px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:18px 20px 20px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.zr-x{flex:none;border:0;background:none;color:var(--t3);cursor:pointer;padding:4px;display:inline-flex}.zr-x:hover{color:var(--t1)}
.zr-note{font-size:12.5px;color:var(--t3)}
.zr{display:flex;flex-direction:column;gap:12px;min-width:0}
.zr.zr-in{flex-basis:100%;width:100%;margin-top:10px;padding:14px;border:1px solid var(--b1);border-radius:12px;background:var(--bg)}
.zr-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.zr-h h3{margin:2px 0 0;font:700 18px var(--sans);color:var(--t1)}.zr-h small{display:block;margin-top:2px;color:var(--t3);font-size:12.5px}
.zr-eb{display:inline-flex;align-items:center;gap:6px;color:var(--acc);font:700 11px var(--sans);letter-spacing:.06em;text-transform:uppercase}
.zr-warn{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--mixed) 12%,transparent);color:var(--t1);font-size:13px}
.zr-warn .ic{flex:none;margin-top:2px;color:var(--mixed)}
.zr-t td,.zr-t th{vertical-align:middle}.zr-t td.zr-ck,.zr-t th.zr-ck{width:34px;text-align:center}
.zr-t input[type=checkbox]{width:16px;height:16px;accent-color:var(--acc);cursor:pointer}
.zr-t .sub{display:block}.zr-st{display:flex}.zr-t tr.zr-off td{opacity:.55}
.zr-k{display:inline-block;margin-left:6px;padding:0 6px;border-radius:5px;background:var(--s2);color:var(--t2);font:600 11px var(--mono,monospace)}
.zr-st{display:inline-flex;align-items:center;gap:4px;margin-top:2px;font:600 11.5px var(--sans)}
.zr-st.zr-ok{color:var(--long)}.zr-st.zr-wn{color:var(--mixed)}.zr-st.zr-no{color:var(--short)}
.zr-side{display:inline-block;min-width:38px;padding:1px 7px;border-radius:5px;text-align:center;font:700 11px var(--sans)}
.zr-side.BUY{background:color-mix(in srgb,var(--long) 14%,transparent);color:var(--long)}.zr-side.SELL{background:color-mix(in srgb,var(--short) 14%,transparent);color:var(--short)}
.zr-q{width:92px;height:30px;padding:0 8px;border:1px solid var(--b2);border-radius:7px;background:var(--bg);color:var(--t1);font:600 13px var(--sans);text-align:right}
.zr-q.zr-bad{border-color:var(--short)}.zr-why{display:block;color:var(--short);font-size:11.5px;margin-top:2px}
.zr-sum{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;font-size:13px;color:var(--t2)}.zr-sum b{color:var(--t1)}
.zr-notes{margin:0;padding:0 0 0 18px;display:grid;gap:4px;color:var(--t2);font-size:12.5px;line-height:18px}
.zr-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center}.zr-acts .zr-gap{flex:1}
.zr-acts small{color:var(--t3);font-size:12px}
.zr-back{display:flex;flex-direction:column;gap:12px;text-align:left}
.zr-badge{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--adim);color:var(--acc)}
.zr-tag{font:700 13px var(--mono,monospace);letter-spacing:.06em;padding:1px 6px;border-radius:5px;background:var(--s2);color:var(--t1)}
.zr-side-in{display:none;margin-left:6px}
.zr-box.zr-narrow{width:min(620px,100%)}
.zr-ok{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:8px 6px 2px}
.zr-okb{position:relative;display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:color-mix(in srgb,var(--long) 14%,transparent);color:var(--long);
  animation:zrPop .45s cubic-bezier(.2,1.4,.4,1) both}
.zr-okb::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid color-mix(in srgb,var(--long) 35%,transparent);animation:zrRing 1.2s ease-out .2s both}
.zr-okb .zr-km{position:absolute;right:-4px;bottom:-4px;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#fff;
  box-shadow:0 0 0 2px var(--bg),0 2px 8px rgba(0,0,0,.15)}
@keyframes zrPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes zrRing{from{transform:scale(.8);opacity:1}to{transform:scale(1.25);opacity:0}}
@media (prefers-reduced-motion:reduce){.zr-okb,.zr-okb::after{animation:none}}
.zr-ok h3{margin:4px 0 0;font:800 21px var(--sans);color:var(--t1)}.zr-ok > p{margin:0;max-width:440px;color:var(--t2);font-size:14px;line-height:21px}
.zr-next{width:100%;display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px;border-radius:12px;border:1px solid color-mix(in srgb,#e8603c 40%,transparent);
  background:color-mix(in srgb,#e8603c 7%,transparent)}
.zr-next .zr-km2{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,#F6461A 30%,transparent)}
.zr-next b{display:block;font-size:14.5px;color:var(--t1)}.zr-next span{display:block;margin-top:3px;font-size:13px;line-height:19px;color:var(--t2)}
.zr-ok .zr-acts{width:100%;justify-content:center}
.zr-run{display:flex;gap:6px;flex-wrap:wrap}.zr-run span{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--b2);color:var(--t3);font:700 12px var(--sans)}
.zr-run span.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}.zr-run span.ok{border-color:color-mix(in srgb,var(--long) 50%,transparent);color:var(--long)}
.zr-run span.part{border-color:color-mix(in srgb,var(--mixed) 50%,transparent);color:var(--mixed)}.zr-run span.no{border-color:color-mix(in srgb,var(--short) 45%,transparent);color:var(--short)}
.zr-cki{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--acc);border-radius:12px;background:var(--adim)}
.zr-cki h4{margin:0;font:700 15px var(--sans);color:var(--t1)}.zr-cki p{margin:0;font-size:13px;line-height:19px;color:var(--t2)}
.zr-cki .zr-q{width:84px}.zr-swapbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--t2)}
.zr-swapbar b.on{color:var(--acc)}.zr-swapbar b.ok{color:var(--long)}
.zr-heard{display:flex;gap:8px;align-items:center;font:700 12.5px var(--sans);color:var(--long)}
.zr-box.zr-guidebox{width:min(980px,100%)}
.zr-wsteps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:2px 0}
.zr-wsteps span{display:flex;flex-direction:column;gap:6px;color:var(--t3);font:700 11.5px var(--sans)}
.zr-wsteps span::before{content:"";height:4px;border-radius:2px;background:var(--b2)}
.zr-wsteps span.on{color:var(--acc)}.zr-wsteps span.on::before{background:var(--acc)}.zr-wsteps span.done{color:var(--long)}.zr-wsteps span.done::before{background:var(--long)}
.zr-wbody{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:18px;align-items:start}
.zr-wbody.zr-stack{grid-template-columns:1fr}
.zr-wbody h4{margin:0 0 6px;font:700 17px var(--sans);color:var(--t1)}.zr-wbody p{margin:0 0 10px;color:var(--t2);font-size:13.5px;line-height:21px}
.zr-shot{display:block;border:1px solid var(--b1);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in}
.zr-shot img{display:block;width:100%;height:auto}
.zr-shotcap{display:block;margin-top:6px;color:var(--t3);font-size:11.5px;text-align:center}
.zr-fields{margin:0 0 10px;padding:0;list-style:none;display:grid;gap:8px}
.zr-fields li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:9px;align-items:start;font-size:13px;line-height:19px;color:var(--t1)}
.zr-fields li > i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--acc);color:#fff;font:800 12px var(--sans);font-style:normal}
.zr-fields li.no > i{background:var(--short)}.zr-fields li small{display:block;color:var(--t3);font-size:12px}
.zr-must{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--adim);color:var(--t1);font-size:13px;line-height:19px;margin-bottom:10px}
.zr-must .ic{flex:none;margin-top:2px;color:var(--acc)}
.zr-keyid{font:700 13px var(--mono,monospace);letter-spacing:.06em;color:var(--t1);padding:1px 7px;border-radius:5px;background:var(--s2)}
@media (max-width:760px){.zr-wbody{grid-template-columns:1fr}.zr-wsteps span{font-size:10.5px}}
.zr-url{display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0}.zr-url code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid var(--b2);border-radius:7px;background:var(--s2);font:600 12px var(--mono,monospace);color:var(--t1)}
.zr-field{display:flex;flex-direction:column;gap:6px;padding:14px;border:1px solid var(--b1);border-radius:12px;background:var(--s1)}
.zr-field label{font:700 13px var(--sans);color:var(--t1)}
.zr-in-row{display:flex;gap:6px}.zr-in-row input{flex:1;min-width:0;height:40px;padding:0 12px;border:1px solid var(--b2);border-radius:8px;background:var(--bg);color:var(--t1);font:600 14px var(--mono,monospace);letter-spacing:.04em}
.zr-in-row input:focus{outline:2px solid color-mix(in srgb,var(--acc) 45%,transparent);border-color:var(--acc)}
.zr-lock{display:flex;gap:7px;align-items:flex-start;color:var(--t3);font-size:12px;line-height:17px}.zr-lock .ic{flex:none;margin-top:1px;color:var(--long)}
.zr-live{display:inline-flex;align-items:center;gap:8px;font:700 15px var(--sans);color:var(--long)}.zr-live i{width:10px;height:10px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px color-mix(in srgb,var(--long) 22%,transparent)}
.zr-keyline{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;color:var(--t2)}.zr-keyline code{font:700 13px var(--mono,monospace);color:var(--t1)}
.zr-link{display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.zr-risk{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--mixed) 40%,transparent);border-radius:10px;background:color-mix(in srgb,var(--mixed) 7%,transparent);font-size:12.5px;line-height:18px;color:var(--t1)}
.zr-risk b{font-size:13px}.zr-risk label{display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer}.zr-risk input{width:16px;height:16px;accent-color:var(--acc)}
.zr-sent{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:12px;background:color-mix(in srgb,var(--long) 9%,transparent);border:1px solid color-mix(in srgb,var(--long) 35%,transparent);font-size:13.5px;line-height:20px;color:var(--t1)}
@media (max-width:640px){.zr-t .zr-hm,.zr-t .zr-ord{display:none}.zr-side-in{display:inline-block}.zr-q{width:64px}.zr-box{padding:14px}.zr-t td,.zr-t th{padding-left:6px;padding-right:6px}}
`;

// the tab for Kite, opened during the click itself (so no pop-up blocker stops it). Round 21: never this tab — if the browser blocks it,
// the window shows a real form with target="_blank" for one more click (a direct click always opens a new tab).
function kiteTab() {
  try {
    const w = window.open("", TAB);
    if (w && w.document && w.document.body && !w.document.body.childElementCount) { w.document.title = "Opening Kite…"; w.document.body.textContent = "Opening Kite by Zerodha…"; }
    return w || null;
  } catch { return null; }
}

function post(r) {                                           // a plain form into Kite's tab: the customer's own browser goes to Kite
  const f = document.createElement("form");
  f.method = "POST"; f.action = KITE; f.target = TAB; f.style.display = "none";
  for (const [k, v] of [["api_key", r.api_key], ["data", r.data]]) {
    const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i);
  }
  document.body.appendChild(f); f.submit(); f.remove();
}

// one basket: recorded on the server (checked again there), remembered for the way back
async function prepare(req, lines, part, parts, again, here) {
  const r = await api("/app/api/zerodha/prepare", { method: "POST", json: {
    source: req.source, sid: req.sid || null, swap_out: req.swap_out || null, swap_in: req.swap_in || null, step: req.step || null, swaps: req.swaps || [], again: !!again, part, parts,
    lines: lines.map(x => ({ s: x.s, qty: x.qty, side: x.side })) } });
  try { localStorage.setItem(KEY, JSON.stringify({ here, tag: r.tag, id: r.id, at: Date.now() })); } catch { /* ignore */ }
  return r;
}

const qOk = (x, q, caps) => /^\d{1,8}$/.test(q) && +q > 0 && +q % (x.lot || 1) === 0 && !(x.side === "SELL" && caps[x.s] != null && +q > caps[x.s]);
const whyQ = (x, q, caps) => !/^\d{1,8}$/.test(q) || +q <= 0 ? "Whole shares only" : +q % (x.lot || 1) ? `In lots of ${x.lot}` : x.side === "SELL" && caps[x.s] != null && +q > caps[x.s] ? `At most ${caps[x.s].toLocaleString("en-IN")}` : "";
const CK_WORD = { placed: ["ok", "Placed"], partly: ["part", "Partly placed"], not_placed: ["no", "Not placed"], skipped: ["ok", "Sell skipped"] };

// ── the check-in (round 21, owner: "track the real order … the system doesn't know whether the previous order is done"): after a basket,
// the customer says what happened on Kite — one click "placed as planned", or their own quantities / prices, or "not placed" ──
export function CheckIn({ h, onDone, compact = false }) {
  addCss("zerodha", CSS);
  const [mode, setMode] = useState("ask"), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [rows, setRows] = useState(() => (h.lines || []).map(x => ({ s: x.s, k: x.k, side: x.side, plan: x.qty, q: String(x.qty ?? ""), p: String(x.price ?? "") })));
  const send = async (status, lines) => {
    setBusy(true); setErr("");
    try {
      const r = await api(`/app/api/zerodha/handoffs/${h.id}/checkin`, { method: "POST", json: { status, lines } });
      try { localStorage.setItem(CKD, JSON.stringify({ id: h.id, status, at: Date.now() })); } catch { /* ignore */ }
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const saveEdit = () => {
    const lines = rows.map(x => ({ s: x.s, qty: /^\d{1,8}$/.test(x.q) ? +x.q : -1, price: +x.p }));
    if (lines.some(x => x.qty < 0 || !(x.price > 0))) { setErr("Enter whole shares (0 if not bought) and the price for each stock"); return; }
    const status = lines.every((x, i) => x.qty === rows[i].plan) ? "placed" : lines.every(x => x.qty === 0) ? "not_placed" : "partly";
    send(status, lines);
  };
  const what = h.step === "sell" ? "the sell" : h.step === "buy" ? "the buy" : h.parts > 1 ? `basket ${h.part} of ${h.parts}` : "this basket";
  return (
    <div className="zr-cki" id="zr-checkin" data-handoff={h.id}>
      <h4>Did you place {what} on Kite?</h4>
      {!compact && <p>Hyperplane cannot see your Zerodha account, so tell us what happened (tag <span className="zr-tag">{h.tag}</span>).
        It keeps your real orders beside the plan, and the next step waits for this.</p>}
      {err && <div className="pf-miss" role="alert">{err}</div>}
      {mode === "ask" ? <div className="zr-acts" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="px-btn primary" disabled={busy} onClick={() => send("placed", [])} id="zr-ck-placed"><Icon name="check" size={14}/> Yes — placed as planned</button>
          <button type="button" className="px-btn" disabled={busy} onClick={() => setMode("edit")} id="zr-ck-edit">Edit what I placed</button>
          <button type="button" className="px-btn" disabled={busy} onClick={() => send("not_placed", [])} id="zr-ck-no">Not placed</button></div>
        : <><div className="hp-tw"><table className="hp-t zr-t"><thead><tr><th>Stock</th><th className="num">Planned</th><th className="num">You {rows.some(x => x.side === "SELL") ? "sold / bought" : "bought"}</th><th className="num">Price you got</th></tr></thead>
            <tbody>{rows.map((x, i) => <tr key={x.s} data-ck-line={x.s}><td><span className="sym">{x.k || x.s}</span><span className={`zr-side zr-side-in ${x.side}`} style={{ display: "inline-block" }}>{x.side === "SELL" ? "Sell" : "Buy"}</span></td>
              <td className="num">{x.plan}</td>
              <td className="num"><input className="zr-q" inputMode="numeric" value={x.q} aria-label={`Quantity of ${x.s}`} data-ck-q={x.s}
                onChange={e => setRows(o => o.map((y, j) => j === i ? { ...y, q: e.target.value.replace(/[^\d]/g, "").slice(0, 8) } : y))}/></td>
              <td className="num"><input className="zr-q" inputMode="decimal" value={x.p} aria-label={`Price of ${x.s}`} data-ck-p={x.s}
                onChange={e => setRows(o => o.map((y, j) => j === i ? { ...y, p: e.target.value.replace(/[^\d.]/g, "").slice(0, 10) } : y))}/></td></tr>)}</tbody></table></div>
          <div className="zr-acts" style={{ justifyContent: "flex-start" }}><button type="button" className="px-btn primary" disabled={busy} onClick={saveEdit} id="zr-ck-save">Save what I placed</button>
            <button type="button" className="px-btn" disabled={busy} onClick={() => setMode("ask")}>Back</button></div></>}
    </div>);
}

// a check-in on its own (the tracker's "On Zerodha" list, the Inbox): one window
export function ZrCheckInBox({ h, onDone, onClose }) {
  addCss("zerodha", CSS);
  return <Box narrow onClose={onClose} label="Check in"><div className="zr"><div className="zr-h"><div><span className="zr-eb"><KiteLogo size={15}/> Zerodha</span>
    <h3>Check in your orders</h3><small>Sent to Kite on {dayLong(h.at)}</small></div>
    <button type="button" className="zr-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
    <CheckIn h={h} onDone={r => { onDone(r); onClose(); }}/></div></Box>;
}

function Orders({ req, inline = false, here, onClose }) {
  addCss("zerodha", CSS);
  const [d, setD] = useState(null), [err, setErr] = useState(""), [rows, setRows] = useState([]), [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false), [again, setAgain] = useState(false);
  const [bulkStep, setBulkStep] = useState(req.step || "sell");                   // round 21b: several swaps — all the sells, then all the buys
  // run = the baskets of this send: { items: [[lines]], k: the one open now, sent: the hand-off waiting for its check-in, log: [statuses], heard }
  const [run, setRun] = useState(null);
  const step = d && d.step;
  const load = (st = null) => {
    setErr("");
    return api("/app/api/zerodha/check", { method: "POST", json: { source: req.source, sid: req.sid || null, swap_out: req.swap_out || null, swap_in: req.swap_in || null,
      step: st || (req.source === "swaps" ? bulkStep : null), swaps: req.swaps || [], lines: (req.lines || []).map(x => ({ s: x.s, qty: x.qty, side: x.side || "BUY", every: x.every || 1 })) } })
      .then(r => {
        setD(r); setRows(r.lines.map(x => ({ ...x, on: x.k != null && x.price != null && (x.every || 1) === 1, q: x.qty ? String(x.qty) : "" })));
        if (r.pending) setRun({ items: null, k: 0, sent: r.pending, log: [] });          // a basket sent earlier waits for its check-in first
        return r;
      }).catch(e => setErr(e.message));
  };
  useEffect(() => {
    load();
    // Kite's tab came back, or a check-in was saved there: this tab hears it at once
    const onStore = e => {
      if (e.key === RET && e.newValue) { try { const v = JSON.parse(e.newValue); setRun(o => o && o.sent && o.sent.tag === v.tag ? { ...o, heard: v.word } : o); } catch { /* ignore */ } }
      if (e.key === CKD && e.newValue) { try { const v = JSON.parse(e.newValue); setRun(o => o && o.sent && o.sent.id === v.id && !o.done ? { ...o, done: v.status, remote: true } : o); } catch { /* ignore */ } }
    };
    window.addEventListener("storage", onStore);
    if (inline) return () => window.removeEventListener("storage", onStore);
    const k = e => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("storage", onStore); window.removeEventListener("keydown", k); };
  }, []);
  const caps = (d && d.caps) || {};
  const sendable = x => x.k != null && x.price != null;
  const picked = rows.filter(x => x.on && sendable(x) && qOk(x, x.q, caps));
  const blocked = rows.filter(x => x.on && sendable(x) && !qOk(x, x.q, caps));
  const parts = d ? chunk(picked, d.max || 10) : [];
  const buy = picked.filter(x => x.side === "BUY").reduce((a, x) => a + x.price * +x.q, 0);
  const sell = picked.filter(x => x.side === "SELL").reduce((a, x) => a + x.price * +x.q, 0);
  const set = (s, side, p) => setRows(o => o.map(x => x.s === s && x.side === side ? { ...x, ...p } : x));
  // open basket k of items in Kite's tab (opened inside this click); blocked → a form for one more click
  const open = async (items, k, log = []) => {
    const w = kiteTab();
    setBusy(true); setErr("");
    try {
      const r = await prepare({ ...req, step }, items[k], k + 1, items.length, again, here);
      const sent = { id: r.id, tag: r.tag, part: k + 1, parts: items.length, step, lines: r.lines, at: new Date().toISOString() };
      if (w) post(r); else sent.form = r;
      setRun({ items, k, sent, log });
    } catch (e) { if (w) try { w.close(); } catch { /* ignore */ } setErr(e.message); }
    setBusy(false);
  };
  const go = () => { if (!busy && parts.length && ack) open(parts.map(b => b.map(x => ({ s: x.s, qty: +x.q, side: x.side }))), 0); };
  const checked = res => {
    const log = [...(run.log || []), res.status];
    if (req.source === "swap") { setRun(null); setAck(false); load(); return; }          // the swap moves to its next step (or is done)
    if (!run.items) { setRun(null); load(); return; }                                     // a check-in of an earlier basket
    setRun({ ...run, sent: null, done: null, log });
  };
  useEffect(() => { if (run && run.done && run.remote) checked({ status: run.done }); }, [run && run.done]);   // checked in from Kite's tab
  const skipSell = async () => {
    setBusy(true); setErr("");
    try { await api("/app/api/zerodha/swap/skip-sell", { method: "POST", json: { sid: req.sid, swap_out: req.swap_out, swap_in: req.swap_in } }); setAck(false); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const series = rows.filter(x => x.st === "series");
  const isBulk = req.source === "swaps";
  const toBuy = () => { setBulkStep("buy"); setRun(null); setAck(false); load("buy"); };
  const isSwap = req.source === "swap" || isBulk;
  const swapDone = req.source === "swap" && d && d.state === "done";
  const placedBefore = d && d.placed && !again;
  const runBar = run && run.items && run.items.length > 1 && <div className="zr-run" id="zr-run" aria-label="Baskets">{run.items.map((_, i) => {
    const st = run.log[i]; const [tone, w] = CK_WORD[st] || [];
    return <span key={i} className={st ? tone : i === run.k ? "on" : ""}>{st ? <Icon name={st === "placed" ? "check" : st === "not_placed" ? "x" : "alert"} size={11}/> : null}Basket {i + 1}{st ? ` · ${w}` : i === run.k ? " · open" : ""}</span>; })}</div>;
  const body = (
    <div className={`zr ${inline ? "zr-in" : ""}`} id="zr-panel" data-source={req.source} data-step={step || ""}>
      <div className="zr-h"><div><span className="zr-eb"><KiteLogo size={15}/> Buy on Zerodha</span><h3>{req.title || "Your orders"}</h3>
        <small>{d ? (isBulk ? (step === "sell" ? `Step 1 of 2 — sell the stocks that left, then buy the new ones` : `Step 2 of 2 — buy the new stocks of the swaps you sold`)
          : isSwap ? (swapDone ? "This swap is done on Zerodha" : step === "sell" ? `Step 1 of 2 — sell ${req.swap_out}, then buy ${req.swap_in}` : `Step 2 of 2 — buy ${req.swap_in}`)
          : `${rows.length} order${rows.length === 1 ? "" : "s"} · checked against Zerodha's list of ${day(d.list)}`) : "Checking every stock on Zerodha's list…"}</small></div>
        <button type="button" className="zr-x" onClick={onClose} aria-label="Close" disabled={busy}><Icon name="x" size={16}/></button></div>
      {isBulk && d && <div className="zr-swapbar" id="zr-swapbar"><b className={step === "sell" ? "on" : "ok"}>1 · Sell all</b><Icon name="chevron" size={12}/><b className={step === "buy" ? "on" : ""}>2 · Buy all</b>
        {d.swaps && d.swaps.some(x => !x.ok) && <span>· {d.swaps.filter(x => !x.ok).length} not at this step (left out)</span>}</div>}
      {!isBulk && isSwap && d && <div className="zr-swapbar" id="zr-swapbar"><b className={step === "sell" && !swapDone ? "on" : "ok"}>1 · Sell {req.swap_out}</b><Icon name="chevron" size={12}/>
        <b className={swapDone ? "ok" : step === "buy" ? "on" : ""}>2 · Buy {req.swap_in}</b>{swapDone && <span className="zr-heard"><Icon name="check" size={13}/> Done on Zerodha</span>}</div>}
      {err && <div className="pf-miss" role="alert" id="zr-err">{err}</div>}
      {swapDone ? <div className="zr-sent" id="zr-swap-done"><span><b>This swap is done on Zerodha.</b> You checked in the sell of {req.swap_out} and the buy of {req.swap_in} — nothing more to send.</span>
          <div className="zr-acts"><span className="zr-gap"/><button type="button" className="px-btn" onClick={onClose}>Close</button></div></div>
      : run && run.sent ? <>
          {runBar}
          <div className="zr-sent" id="zr-sent" role="status">
            <span><b>{run.items ? `Basket ${run.sent.part} of ${run.sent.parts}` : "A basket you sent"}{run.sent.form ? " is ready" : " opened in a new tab"}.</b>{" "}
              {run.sent.form ? "Your browser stopped the new tab — open it with this button:" : "Review and confirm it on Kite, then come back here."}</span>
            {run.sent.form && <form method="post" action={KITE} target="_blank" id="zr-open-form" onSubmit={() => setRun(o => ({ ...o, sent: { ...o.sent, form: null } }))}>
              <input type="hidden" name="api_key" value={run.sent.form.api_key}/><input type="hidden" name="data" value={run.sent.form.data}/>
              <button type="submit" className="px-btn primary">Open Kite in a new tab <Icon name="out" size={13}/></button></form>}
            {run.heard && <span className="zr-heard" id="zr-heard"><Icon name="check" size={13}/> Back from Kite — Kite says {run.heard === "success" ? "it was sent" : run.heard === "cancelled" ? "it was cancelled" : "you returned"}. Now check in below.</span>}
          </div>
          <CheckIn key={run.sent.id} h={run.sent} onDone={checked}/>
        </>
      : run && run.items && run.k + 1 < run.items.length ? <>
          {runBar}
          <div className="zr-sent" id="zr-between"><span><b>Basket {run.k + 1} checked in ({(CK_WORD[run.log[run.k]] || [])[1] || "—"}).</b> Next: basket {run.k + 2} of {run.items.length} — it opens Kite in a new tab again.</span>
            <div className="zr-acts"><span className="zr-gap"/><button type="button" className="px-btn" onClick={onClose}>Stop here</button>
              <button type="button" className="px-btn primary" disabled={busy} onClick={() => open(run.items, run.k + 1, run.log)} id="zr-next-here">
                {busy ? "Opening Kite…" : `Open basket ${run.k + 2} of ${run.items.length}`} <Icon name="out" size={13}/></button></div></div></>
      : run && run.items ? <>
          {runBar}
          <div className="zr-sent" id="zr-finished"><span><b>All {run.items.length > 1 ? `${run.items.length} baskets` : "done"} — checked in.</b> {isBulk && step === "sell"
              ? "Next: buy the new stocks of the swaps you sold." : <>Your orders are kept beside the plan in the portfolio's <b>On Zerodha</b> section.</>}</span>
            <div className="zr-acts"><span className="zr-gap"/>
              {isBulk && step === "sell" ? <><button type="button" className="px-btn" onClick={onClose} id="zr-sent-done">Later</button>
                <button type="button" className="px-btn primary" onClick={toBuy} id="zr-bulk-buy">Next: buy the new stocks <Icon name="chevron" size={14}/></button></>
              : <button type="button" className="px-btn primary" onClick={onClose} id="zr-sent-done">Done</button>}</div></div></>
      : <>
      {placedBefore && <div className="zr-warn" id="zr-placed"><Icon name="check" size={15}/><span>This instalment was already placed on Zerodha (you checked it in on {dayLong(d.placed)}).
        <button type="button" className="px-btn hp-link" onClick={() => setAgain(true)} id="zr-again">Send it again anyway</button></span></div>}
      {d && d.stale && <div className="zr-warn"><Icon name="alert" size={15}/><span>Zerodha's symbol list is out of date, so nothing can be sent right now. Please try again later.</span></div>}
      {series.length > 0 && <div className="zr-warn" id="zr-series"><Icon name="alert" size={15}/><span>{series.length === 1 ? `${series[0].s} trades` : `${series.length} stocks trade`} under a different symbol on Zerodha
        ({series.slice(0, 3).map(x => x.k).join(", ")}{series.length > 3 ? "…" : ""}) — trade-to-trade: delivery only, intraday is not allowed. Every order here is for delivery, so it works. It is the same company, checked on Zerodha's list.</span></div>}
      {d && <div className="hp-tw"><table className="hp-t zr-t" id="zr-table">
        <thead><tr><th className="zr-ck"><input type="checkbox" aria-label="All" checked={rows.some(sendable) && rows.filter(sendable).every(x => x.on)}
          onChange={e => setRows(o => o.map(x => sendable(x) ? { ...x, on: e.target.checked } : x))}/></th>
          <th>Stock</th><th className="zr-ord">Order</th><th className="num">Qty</th><th className="num">Limit price</th><th className="num zr-hm">Value</th></tr></thead>
        <tbody>{rows.map(x => { const [tone, label] = ST[x.st] || ST.missing; const ok = sendable(x), qok = qOk(x, x.q, caps); return (
          <tr key={`${x.side}${x.s}`} className={!ok || !x.on ? "zr-off" : ""} data-zr-line={x.s} data-st={x.st}>
            <td className="zr-ck"><input type="checkbox" checked={x.on && ok} disabled={!ok || busy} onChange={e => set(x.s, x.side, { on: e.target.checked })} aria-label={`Send ${x.s}`}/></td>
            <td><span className="sym">{x.s}</span><span className={`zr-side zr-side-in ${x.side}`}>{x.side === "SELL" ? "Sell" : "Buy"}</span>{x.k && x.k !== x.s && <span className="zr-k" title="The symbol on Zerodha">NSE:{x.k}</span>}
              <span className="sub">{x.n || x.kn || ""}{x.kind === "etf" ? " · ETF" : ""}</span>
              <span className={`zr-st zr-${tone === "warn" ? "wn" : tone}`}><Icon name={tone === "ok" ? "check" : tone === "warn" ? "alert" : "x"} size={11}/>{label}</span>
              {(x.st !== "verified" || (x.every || 1) > 1) && <span className="sub">{(x.every || 1) > 1 ? `Bought 1 every ${x.every} instalments — tick it when it is due` : x.note}</span>}</td>
            <td className="zr-ord"><span className={`zr-side ${x.side}`}>{x.side === "SELL" ? "Sell" : "Buy"}</span></td>
            <td className="num">{ok ? <><input className={`zr-q ${x.on && !qok ? "zr-bad" : ""}`} inputMode="numeric" value={x.q} disabled={busy} aria-label={`Quantity of ${x.s}`} data-zr-q={x.s}
                onChange={e => set(x.s, x.side, { q: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })}/>{x.on && !qok && <span className="zr-why">{whyQ(x, x.q, caps)}</span>}</> : "—"}</td>
            <td className="num">{ok ? inr(x.price) : "—"}{ok && <span className="sub">ours {inr(x.p)}</span>}</td>
            <td className="num zr-hm"><b>{ok && qok ? inr(x.price * +x.q) : "—"}</b></td></tr>); })}</tbody></table></div>}
      {d && <div className="zr-sum" id="zr-sum"><span><b>{picked.length}</b> order{picked.length === 1 ? "" : "s"}</span>
        {buy > 0 && <span>Buy up to <b>{inr(buy)}</b></span>}{sell > 0 && <span>Sell for at least <b>{inr(sell)}</b></span>}
        {parts.length > 1 && <span id="zr-parts">Kite takes {d.max} orders at a time: <b>{parts.length} baskets</b> — one after another, each checked in before the next</span>}
        {blocked.length > 0 && <span className="zr-why">{blocked.length} ticked line{blocked.length === 1 ? "" : "s"} need{blocked.length === 1 ? "s" : ""} a valid quantity</span>}</div>}
      {d && <ul className="zr-notes">
        <li>Kite opens in a new tab. Log in there if it asks — Hyperplane never sees your Zerodha login.</li>
        <li>Review every order on Kite and confirm there. Nothing is placed until you do. Then come back here and check in.</li>
        <li>Each order is a <b>limit</b> order: {isSwap ? (step === "sell" ? "the least you accept to sell is our last price −1%" : "the most you pay is our last price +1%") : "the most you pay is our last price +1%"}, on Zerodha's price steps. You can change the price or quantity on Kite.</li>
        {isSwap && step === "sell" && <li>Sell first, then buy: once you check in the sell, the buy of {isBulk ? "the new stocks" : req.swap_in} comes next. To sell, Kite may ask for your CDSL TPIN (or uses your DDPI).{d.app === "portfolio" ? " Your Analyser list has no quantities — enter what you hold." : ""}</li>}
        <li>Prices move. Hyperplane cannot see whether an order was placed or filled — that is why you check in.</li></ul>}
      {d && <div className="zr-risk" id="zr-risk">
        <b>Investments in the securities market are subject to market risks. Read all the related documents carefully before investing.</b>
        <span>Hyperplane gives research for education — not investment advice or a recommendation to buy or sell. Past performance does not
          guarantee future returns. You decide, and you confirm every order yourself on Zerodha.</span>
        <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} id="zr-ack"/> I have read and understood this</label></div>}
      <div className="zr-acts"><small>Delivery (CNC) · NSE · LIMIT · Day</small><span className="zr-gap"/>
        {req.source === "swap" && step === "sell" && <button type="button" className="px-btn hp-link" disabled={busy} onClick={skipSell} id="zr-skip-sell">I don't hold {req.swap_out} / sold it already</button>}
        <button type="button" className="px-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="px-btn primary" id="zr-go" onClick={go} disabled={!d || d.stale || !parts.length || blocked.length > 0 || busy || !ack || placedBefore}
          title={!ack ? "Tick “I have read and understood this” first" : undefined}>
          {busy ? "Opening Kite…" : isBulk ? (parts.length > 1 ? `${step === "sell" ? "Sell" : "Buy"} on Kite · basket 1 of ${parts.length}` : `${step === "sell" ? "Sell" : "Buy"} ${picked.length} on Kite`)
            : isSwap ? (step === "sell" ? `Sell ${req.swap_out} on Kite` : `Buy ${req.swap_in} on Kite`) : parts.length > 1 ? `Open Kite · basket 1 of ${parts.length}` : `Open Kite with ${picked.length} order${picked.length === 1 ? "" : "s"}`} <Icon name="out" size={13}/></button></div>
      </>}
    </div>);
  if (inline) return body;
  return <div className="overlay zr-ov" onClick={() => !busy && onClose()}><div className="zr-box" role="dialog" aria-label="Buy on Zerodha" onClick={e => e.stopPropagation()}>{body}</div></div>;
}

// ── Connect Zerodha (round 20c, owner: "the API key comes from the customer, in the customer app … the step-by-step guide in ONE pop-up …
// stored against the user, encrypted … next time just ask them to log in to Kite in the next tab") ──
const KITE_HOME = "https://kite.zerodha.com/";
const dayLong = iso => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const KEY_RE = /^[A-Za-z0-9]{8,40}$/;

function Box({ inline, narrow = false, wide = false, onClose, children, label, id }) {
  useEffect(() => {
    if (inline) return undefined;
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  if (inline) return children;
  return <div className="overlay zr-ov" onClick={onClose}><div className={`zr-box ${narrow ? "zr-narrow" : wide ? "zr-guidebox" : ""}`} role="dialog" aria-label={label} id={id} onClick={e => e.stopPropagation()}>{children}</div></div>;
}

// the one window (round 20d, owner: "improve the onboarding — ask them to create a developer account, the screenshots in the website itself,
// every field explained, don't fill the IP, use only the email and phone of the Zerodha account … then log in"): 3 steps in ONE pop-up —
// (1) the free Kite developer account, (2) a Publisher app, (3) its API key → saved, encrypted on the server; then "Log in to Kite".
const SIGNUP = "https://developers.kite.trade/signup";
const DEV_LOGIN = "https://developers.kite.trade/login";
const NEW_APP = "https://developers.kite.trade/apps/new";
const Shot = ({ src, alt, id }) => <a className="zr-shot" href={src} target="_blank" rel="noopener noreferrer" id={id} title="Open the full picture">
  <img src={src} alt={alt} loading="lazy"/></a>;

function KeyForm({ onSaved, onClose, inline = false, then = false, replacing = false, onCancel }) {
  const [step, setStep] = useState(replacing ? 3 : 1);
  const [st, setSt] = useState(null), [val, setVal] = useState(""), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => { api("/app/api/zerodha/status").then(setSt).catch(e => setErr(e.message)); }, []);
  const clean = val.trim(), ok = KEY_RE.test(clean);
  const save = async e => {
    e.preventDefault();
    if (step !== 3 || !ok || busy) return;
    setBusy(true); setErr("");
    try { const r = await api("/app/api/zerodha/key", { method: "PUT", json: { key: clean } }); setVal(""); onSaved(r); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(st.redirect); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const steps = ["Developer account", "Publisher app", "Your API key", "Log in to Kite"];
  return (
    <form className={`zr ${inline ? "zr-in" : ""}`} id="zr-connect" data-step={step} onSubmit={save} autoComplete="off">
      <div className="zr-h"><div><span className="zr-eb"><KiteLogo size={15}/> Zerodha</span>
        <h3>{replacing ? "Change your Zerodha key" : "Connect Zerodha"}</h3>
        <small>{replacing ? "Paste the API key of your Publisher app. The key saved now stays until the new one is saved." : "Free, once, about 5 minutes. After this you only log in to Kite."}</small></div>
        <button type="button" className="zr-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      <div className="zr-wsteps" aria-hidden="true">{steps.map((t, i) => <span key={t} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""}>{i + 1}. {t}</span>)}</div>
      {err && <div className="pf-miss" role="alert" id="zr-key-err">{err}</div>}
      {st && !st.available && <div className="zr-warn"><Icon name="info" size={15}/><span>Connecting Zerodha is not available yet. Please try again later.</span></div>}

      {step === 1 && <div className="zr-wbody" id="zr-step-1"><div>
        <h4>Create your free Kite developer account</h4>
        <p>Zerodha lets you send orders from Hyperplane to Kite through a small free “Publisher” app on its developer site. You create it once — first, an account there.</p>
        <div className="zr-must" id="zr-must"><Icon name="alert" size={15}/><span>Use <b>only the email and mobile number of your Zerodha trading account</b> — the ones you gave when you opened it.</span></div>
        <ul className="zr-fields">
          <li><i>1</i><span><b>E-mail</b> — the email of your Zerodha account</span></li>
          <li><i>2</i><span><b>Your name</b> — as on your Zerodha account</span></li>
          <li><i>3</i><span><b>Password</b> — a new password for the developer site<small>You use it to log in there. It is not your Kite password.</small></span></li>
          <li><i>4</i><span><b>Phone</b> — the mobile number of your Zerodha account</span></li>
          <li><i>5</i><span><b>State of residence</b></span></li>
          <li className="no"><i>!</i><span><b>IP Whitelist — leave it empty</b><small>It is only for programs that send orders from a server. Hyperplane does not, so no IP address is needed.</small></span></li>
        </ul>
        <p>Then open the email from Zerodha to verify the account, and log in at the developer site.</p>
        <div className="zr-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="px-btn primary zr-link" href={SIGNUP} target="_blank" rel="noopener noreferrer" id="zr-signup">Create developer account <Icon name="out" size={13}/></a>
          <a className="px-btn zr-link" href={DEV_LOGIN} target="_blank" rel="noopener noreferrer" id="zr-devlogin">I have one — log in <Icon name="out" size={13}/></a></div>
      </div><div><Shot src={SHOT_SIGNUP} alt="The Kite developer sign-up form with each field numbered and the IP whitelist marked leave empty" id="zr-shot-1"/>
        <span className="zr-shotcap">Kite Connect sign-up — your details go in the numbered fields</span></div></div>}

      {step === 2 && <div className="zr-wbody zr-stack" id="zr-step-2"><div>
        <h4>Create a free Publisher app</h4>
        <p>Logged in at the developer site, open <b>Create new app</b> and fill it in like this:</p>
        <ul className="zr-fields">
          <li><i>1</i><span><b>Type: Publisher</b> — it says Free<small>Not Connect (paid) and not Personal.</small></span></li>
          <li><i>2</i><span><b>App name</b> — anything, for example “Hyperplane”</span></li>
          <li><i>3</i><span><b>Redirect URL</b> — paste this address exactly:
            <div className="zr-url"><code id="zr-redirect" title={st ? st.redirect : ""}>{st ? st.redirect : "…"}</code>
              <button type="button" className="px-btn zr-btn sm" onClick={copy} disabled={!st} id="zr-copy"><Icon name={copied ? "check" : "copy"} size={13}/> {copied ? "Copied" : "Copy"}</button></div></span></li>
          <li><i>4</i><span><b>Description</b> — anything, for example “Orders from Hyperplane”<small>App icon and Postback URL: leave them empty.</small></span></li>
          <li><i>5</i><span><b>Create</b></span></li>
        </ul>
        <div className="zr-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="px-btn primary zr-link" href={NEW_APP} target="_blank" rel="noopener noreferrer" id="zr-newapp">Open Create new app <Icon name="out" size={13}/></a></div>
      </div><div><Shot src={SHOT_NEWAPP} alt="Create a new app: Publisher selected, app name, redirect URL and description numbered" id="zr-shot-2"/>
        <span className="zr-shotcap">Create a new app — choose Publisher and paste the Redirect URL</span></div></div>}

      {step === 3 && <div className="zr-wbody zr-stack" id="zr-step-3"><div>
        <h4>Copy your API key and paste it here</h4>
        <p>In <b>My apps</b>, your Publisher app shows an <b>API key</b> (16 letters and digits). Copy it and paste it below.</p>
        <div className="zr-must"><Icon name="lock" size={15}/><span>Only the API key. Never paste an API secret, your Zerodha password or your 2FA code — Hyperplane never asks for them.</span></div>
        <div className="zr-field">
          <label htmlFor="zr-key-in">Your Publisher API key</label>
          <div className="zr-in-row">
            <input id="zr-key-in" type={show ? "text" : "password"} value={val} onChange={e => setVal(e.target.value.replace(/\s/g, "").slice(0, 40))}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="text" placeholder="Paste the API key" aria-describedby="zr-lock"/>
            <button type="button" className="px-btn" onClick={() => setShow(v => !v)} aria-pressed={show} id="zr-show">{show ? "Hide" : "Show"}</button></div>
          {clean && !ok && <span className="zr-why">A Kite API key is letters and digits only (8 to 40).</span>}
          <span className="zr-lock" id="zr-lock"><Icon name="lock" size={13}/>Encrypted with AES-256 the moment it reaches our server and stored only against your Hyperplane
            account. It is never shown again, not even in part — you see only an encrypted key ID. You can change or remove it any time.</span>
        </div>
      </div><div><Shot src={SHOT_KEY} alt="My apps: the API key of the Publisher app" id="zr-shot-3"/>
        <span className="zr-shotcap">My apps — the API key of your Publisher app</span></div></div>}

      <div className="zr-acts">
        {step > 1 && !(replacing && step === 3) && <button type="button" className="px-btn" onClick={() => setStep(step - 1)} id="zr-back">Back</button>}
        {replacing && step === 3 && <button type="button" className="px-btn hp-link" onClick={() => setStep(1)} id="zr-see-steps">See all the steps</button>}
        <span className="zr-gap"/>
        <button type="button" className="px-btn" onClick={onCancel || onClose} disabled={busy}>{onCancel ? "Keep the current key" : "Cancel"}</button>
        {step < 3 ? <button type="button" className="px-btn primary" onClick={() => setStep(step + 1)} id="zr-next-step">
            {step === 1 ? "I have a developer account" : "I created the app"} <Icon name="chevron" size={14}/></button>
          : <button type="submit" className="px-btn primary" disabled={!ok || busy || !st || !st.available} id="zr-key-save">
            {busy ? "Saving…" : replacing ? "Save the new key" : then ? "Save and continue to my orders" : "Save and connect"} <Icon name="chevron" size={14}/></button>}</div>
    </form>);
}

// the moment the key is saved: "your Zerodha API key is connected" — and the one thing to do before an order: log in to Kite (a new tab)
function JustConnected({ k, then = false, replaced = false, onContinue, onClose }) {
  return (
    <div className="zr zr-ok" id="zr-just" role="status">
      <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "flex-end" }}><button type="button" className="zr-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      <span className="zr-okb"><Icon name="check" size={38}/><span className="zr-km"><KiteLogo size={17}/></span></span>
      <h3>{replaced ? "Your new Zerodha API key is connected" : "Your Zerodha API key is connected"}</h3>
      <p>It is encrypted and saved against your Hyperplane account (key ID <span className="zr-keyid">{k.id}</span>). You won't need to enter it again.</p>
      <div className="zr-next" id="zr-just-next"><span className="zr-km2"><KiteLogo size={20}/></span>
        <div><b>Log in to Zerodha before you place an order</b>
          <span>Kite opens in a new tab — log in with your Zerodha user ID, password and app code (Zerodha asks once a day). Then come back here and use Buy on Zerodha.</span></div></div>
      <div className="zr-acts">
        <a className="px-btn primary zr-link" href={KITE_HOME} target="_blank" rel="noopener noreferrer" id="zr-just-login">Log in to Kite <Icon name="out" size={13}/></a>
        <button type="button" className="px-btn" onClick={onContinue} id="zr-just-go">{then ? "I'm logged in — show my orders" : "Done"}{then && <> <Icon name="chevron" size={14}/></>}</button></div>
    </div>);
}

// a key is saved: the next time, just log in to Kite (a new tab)
function Connected({ k, onKey, onClose }) {
  const [mode, setMode] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (mode === "replace") return <KeyForm replacing onSaved={r => { onKey(r); setMode("replaced"); }} onClose={onClose} onCancel={() => setMode("")}/>;
  if (mode === "replaced") return <JustConnected k={k} replaced onContinue={() => setMode("")} onClose={onClose}/>;
  const remove = async () => {
    setBusy(true); setErr("");
    try { await api("/app/api/zerodha/key", { method: "DELETE" }); onKey(null); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="zr" id="zr-connected">
      <div className="zr-h"><div><span className="zr-eb"><KiteLogo size={15}/> Zerodha</span><h3>Zerodha is connected</h3>
        <small>Step 4: log in to Kite, then use Buy on Zerodha on any plan.</small></div>
        <button type="button" className="zr-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      {err && <div className="pf-miss" role="alert">{err}</div>}
      <div className="zr-live" id="zr-live"><i aria-hidden="true"/> Zerodha · connected</div>
      <div className="zr-keyline"><span>Encrypted key ID <span className="zr-keyid" id="zr-keyid" title="A fingerprint of your key — it reveals nothing of the key">{k.id}</span></span>
        <span>Saved {dayLong(k.saved)}</span><span className="zr-lock"><Icon name="lock" size={13}/>AES-256</span></div>
      <div className="zr-field">
        <b style={{ fontSize: 14 }}>Log in to Kite</b>
        <span style={{ fontSize: 13, color: "var(--t2)", lineHeight: "19px" }}>Kite opens in a new tab — log in there with your Zerodha user ID, password and app code (Zerodha asks
          once a day). Then come back here: Buy on Zerodha opens Kite with your orders ready to confirm.</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="px-btn primary zr-link" href={KITE_HOME} target="_blank" rel="noopener noreferrer" id="zr-login">Log in to Kite <Icon name="out" size={13}/></a></div></div>
      <div className="zr-acts">
        {mode === "remove" ? <><span style={{ fontSize: 13 }}>Remove your key from Hyperplane? You can connect again any time.</span>
            <button type="button" className="px-btn danger" onClick={remove} disabled={busy} id="zr-remove-yes">{busy ? "Removing…" : "Remove"}</button>
            <button type="button" className="px-btn" onClick={() => setMode("")}>Keep</button></>
          : <><button type="button" className="px-btn" onClick={() => setMode("remove")} id="zr-remove">Remove key</button>
            <button type="button" className="px-btn" onClick={() => setMode("replace")} id="zr-replace">Change key</button></>}
        <span className="zr-gap"/><button type="button" className="px-btn" onClick={onClose}>Close</button></div>
    </div>);
}

// the top bar's window: no key → the steps + the key; a key → Zerodha is connected · Log in to Kite
export function ZrConnect({ zkey, onKey, onClose }) {
  addCss("zerodha", CSS);
  const [fresh, setFresh] = useState(false);                     // the key was saved just now → the "connected" moment first
  return <Box onClose={onClose} label="Connect Zerodha" id="zr-connect-box" wide={!zkey} narrow={!!zkey}>
    {zkey ? (fresh ? <JustConnected k={zkey} onContinue={onClose} onClose={onClose}/> : <Connected k={zkey} onKey={onKey} onClose={onClose}/>)
      : <KeyForm onSaved={r => { setFresh(true); onKey(r); }} onClose={onClose}/>}</Box>;
}

// Buy on Zerodha: no key yet → the key window first, in the same place (the same pop-up, or inline), then the orders
export default function ZrPanel({ req, inline = false, here, onClose, zkey, onKey = () => {} }) {
  addCss("zerodha", CSS);
  const [fresh, setFresh] = useState(false);
  if (!zkey) return <Box inline={inline} wide onClose={onClose} label="Connect Zerodha"><KeyForm inline={inline} then onSaved={r => { setFresh(true); onKey(r); }} onClose={onClose}/></Box>;
  if (fresh) return <Box inline={inline} narrow onClose={onClose} label="Zerodha connected"><JustConnected k={zkey} then onContinue={() => setFresh(false)} onClose={onClose}/></Box>;
  return <Orders req={req} inline={inline} here={here} onClose={onClose}/>;
}

// back from Kite (/app/#zerodha=success|cancelled|other) — this is Kite's tab (round 21): what Kite said (not proof), the check-in (here,
// or in the Hyperplane tab, which hears this one), and "close this tab"
export function ZrReturn({ word, onClose }) {
  addCss("zerodha", CSS);
  const [r, setR] = useState(null), [err, setErr] = useState(""), [done, setDone] = useState(null);
  useEffect(() => {
    api("/app/api/zerodha/returned", { method: "POST", json: { status: word } }).then(x => {
      setR(x);
      if (x.found) try { localStorage.setItem(RET, JSON.stringify({ tag: x.tag, word: x.said, at: Date.now() })); } catch { /* ignore */ }
    }).catch(e => setErr(e.message));
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const said = r ? r.said : word;
  const closeTab = () => { try { window.close(); } catch { /* ignore */ } onClose(); };
  return (
    <div className="overlay zr-ov"><div className="zr-box zr-narrow" role="dialog" aria-label="Back from Zerodha" id="zr-return">
      <div className="zr zr-back">
        <div className="zr-h"><div style={{ display: "flex", gap: 12, alignItems: "center" }}><span className="zr-badge"><Icon name="out" size={20}/></span>
          <div><span className="zr-eb">Buy on Zerodha</span><h3>Back from Kite</h3></div></div>
          <button type="button" className="zr-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
        {!r && !err && <div className="zr-note">One moment…</div>}
        {err && <div className="pf-miss" role="alert">{err}</div>}
        {r && <p style={{ margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--t1)" }} id="zr-said">
          {!r.found ? <>We could not match this to a basket opened in the last 2 hours. Nothing has changed in Hyperplane.</>
            : said === "success" ? <>Kite says {r.parts > 1 ? `basket ${r.part} of ${r.parts}` : "the basket"} was sent — tag <span className="zr-tag">{r.tag}</span>.</>
            : said === "cancelled" ? <>Kite says {r.parts > 1 ? `basket ${r.part} of ${r.parts}` : "the basket"} was cancelled — tag <span className="zr-tag">{r.tag}</span>.</>
            : <>You are back from Kite — tag <span className="zr-tag">{r.tag}</span>.</>}
          {" "}Only you can tell what was placed: check in here, or in your Hyperplane tab.</p>}
        {r && r.found && !done && <CheckIn compact h={{ id: r.id, tag: r.tag, part: r.part, parts: r.parts, lines: r.lines }} onDone={x => setDone(x.status)}/>}
        {done && <div className="zr-sent" id="zr-ret-done"><span><b>Checked in: {(CK_WORD[done] || [])[1]}.</b> Your Hyperplane tab has it too — you can close this tab.</span></div>}
        <div className="zr-acts"><span className="zr-gap"/>
          <button type="button" className="px-btn" onClick={onClose} id="zr-done">Stay here</button>
          <button type="button" className="px-btn primary" onClick={closeTab} id="zr-close-tab">Close this tab</button></div>
      </div>
    </div></div>);
}
