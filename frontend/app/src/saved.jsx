// My portfolios (owner, 2026-11-06): portfolios saved from the AI Portfolio Analyser, the Portfolio Builder and the
// Momentum SIP (/app/api/saved, portal.py), each with a tag. Open one → its tracking since the day it was saved
// (tracking.py), laid out like a broker's holdings page (owner: "take the inspiration from Dhan, Zerodha, Groww"):
// summary tiles, a performance chart with periods, allocation + top movers, a holdings table (qty, avg cost, LTP,
// current value, P&L, net and day change) with Swap in a centre pop-up, the momentum check and the alerts switch
// (monitor.py → the 🔔 notification centre). Shared by apps/portfolio.jsx, builder.jsx and sip.jsx; the server does
// every calculation. Only the customer who saved a portfolio can see it (row-level security).
import React, { useEffect, useRef, useState } from "react";
import { APP_SLUG, AiSpark, GroupRow, Icon, Info, addCss, api, copyText, fmtDT, goPath, portfolioUrl, routeOf, signed, swapSections, useToast } from "./core.jsx";
import { Simulators } from "./sim.jsx";

addCss("saved", `
.svp{display:flex;flex-direction:column;gap:12px;--ch-pf:#0891b2;--ch-bn:#8b5cf6;--ch-in:#c2410c;--ch-etf:#8b5cf6}
:root[data-theme="dark"] .svp{--ch-in:#ea580c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .svp{--ch-in:#ea580c}}
.svp .up{color:var(--long)}.svp .dn{color:var(--short)}
.svp-empty{display:flex;align-items:center;gap:8px;padding:18px 22px;color:var(--t2);font-size:13px}
.svp-tags{display:flex;gap:6px;flex-wrap:wrap}
.svp-tags button{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);font:600 12px var(--sans);cursor:pointer}
.svp-tags button.on{border-color:var(--acc);background:var(--adim);color:var(--acc)}
.svp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.svp-card{display:flex;flex-direction:column;gap:8px;padding:14px 16px;text-align:left;cursor:pointer;font:inherit;color:inherit;border:1px solid var(--b1);border-radius:12px;background:var(--s1)}
.svp-card:hover{border-color:var(--acc)}
.svp-ch{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.svp-ch b{font:600 15px/20px var(--sans);color:var(--t1)}.svp-ch small{display:block;font-size:12px;color:var(--t3)}
.svp-tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--adim);color:var(--acc);font:600 10.5px var(--sans);white-space:nowrap;vertical-align:3px}
.svp-tag.sip{background:color-mix(in srgb,var(--ch-bn) 14%,var(--s1));color:var(--ch-bn)}.svp-tag.builder{background:var(--s2);color:var(--t1)}.svp-tag.msip{background:var(--shortd);color:var(--short)}
.svp-cv{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.svp-cv b{font:700 18px var(--sans);color:var(--t1);font-feature-settings:"tnum"}.svp-cv small{font-size:12px;color:var(--t2)}
.svp-cf{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:11.5px;color:var(--t3)}.svp-cf>span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.svp-cf .al{color:var(--acc)}
/* tracking page */
.tk-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.tk-id{display:flex;align-items:center;gap:12px;min-width:0}
.tk-back{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:none;border-radius:8px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);font:600 16px var(--sans);cursor:pointer}
.tk-back:hover{border-color:var(--acc);color:var(--acc)}
.tk-id h2{margin:0;font:700 19px/26px var(--sans);color:var(--t1)}
.tk-id small{display:block;font-size:12px;color:var(--t3)}
.tk-acts{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tk-acts .px-btn{display:inline-flex;align-items:center;gap:6px;height:34px}
.tk-acts select{width:auto;height:34px;padding:0 8px;font-size:12.5px;border-radius:8px}
.tk-sel{display:inline-flex;align-items:center;gap:6px;font:600 12.5px var(--sans);color:var(--t2)}
.tk-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.tk-k.pos{border-top-color:var(--long)}.tk-k.neg{border-top-color:var(--short)}.tk-k.acc{border-top-color:var(--acc)}
.tk-k .px-label{display:flex;align-items:center;gap:4px}
.tk-k b{white-space:nowrap}
.tk-card{padding:0;overflow:hidden}
.tk-ch{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--b1)}
.tk-ch h3{display:flex;align-items:center;gap:6px;margin:0;font:700 14px var(--sans);color:var(--t1)}.tk-ch small{font-size:12px;color:var(--t3);margin-left:4px;font-weight:400}
.tk-per{display:inline-flex;padding:2px;border-radius:8px;background:var(--s2)}
.tk-per button{height:26px;padding:0 10px;border:0;border-radius:6px;background:none;color:var(--t2);font:600 12px var(--sans);cursor:pointer}
.tk-per button.on{background:var(--s1);color:var(--acc);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.tk-cb{padding:10px 16px 14px;display:flex;flex-direction:column;gap:8px}
.tk-cbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.tk-cbar select{width:auto;min-width:190px;height:30px;padding:0 8px;font-size:12.5px;border-radius:8px}
.svp-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--t2)}.svp-leg i{display:inline-block;width:14px;height:2px;border-radius:2px;margin-right:6px;vertical-align:middle}
.svp-plot{position:relative;width:100%}
.svp-plot svg{display:block;width:100%;height:260px;overflow:visible}
.svp-plot svg:focus{outline:none}.svp-plot svg:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:4px}
.svp-tip{position:absolute;top:0;pointer-events:none;min-width:160px;padding:8px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--b2);box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:12px;color:var(--t2);z-index:3}
.svp-tip div{display:flex;align-items:center;gap:6px;white-space:nowrap}.svp-tip div i{width:12px;height:2px;border-radius:2px}
.svp-tip b{color:var(--t1);font-feature-settings:"tnum"}.svp-tip .d{color:var(--t3);margin-bottom:4px}
.svp-note{font-size:12px;color:var(--t3)}
.tk-row2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px;align-items:start}
.tk-stack{display:flex;gap:2px;height:12px;border-radius:4px;overflow:hidden;margin:14px 16px 6px}
.tk-stack i{display:block;min-width:2px}
.tk-t{width:100%;border-collapse:collapse;font-size:13px}
.tk-t th{padding:8px 16px;font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);text-align:right;border-bottom:1px solid var(--b1);white-space:nowrap;background:var(--s1)}
.tk-t td{padding:10px 16px;text-align:right;border-bottom:1px solid var(--b1);color:var(--t1);font-feature-settings:"tnum";white-space:nowrap;vertical-align:middle}
.tk-t th:first-child,.tk-t td:first-child{text-align:left}
.tk-t tr:last-child td{border-bottom:0}.tk-t tbody tr:hover td{background:var(--s2)}
.tk-t td b{font-weight:600}.tk-t td small{display:block;font-size:11.5px;color:var(--t3);font-weight:400}
.tk-t .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;vertical-align:-1px}
.tk-t tr.gone td{color:var(--t3)}
.tk-t .act{width:1%}
.tk-swap{height:28px;padding:0 12px;border-radius:6px;border:1px solid var(--b2);background:var(--s1);color:var(--acc);font:600 12px var(--sans);cursor:pointer}
.tk-swap:hover{border-color:var(--acc);background:var(--adim)}
.tk-wrap{overflow-x:auto}
.tk-mov{display:grid;grid-template-columns:1fr 1fr}
.tk-mov>div{padding:10px 16px 14px}.tk-mov>div+div{border-left:1px solid var(--b1)}
.tk-mov .px-label{margin-bottom:6px}
.tk-mi{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1);font-size:13px}
.tk-mi:last-child{border-bottom:0}.tk-mi b{color:var(--t1);font-weight:600}.tk-mi span{font-feature-settings:"tnum"}
.tk-ex summary{padding:10px 16px;cursor:pointer;font-size:12.5px;color:var(--acc);font-weight:600}
.tk-foot{padding:8px 16px 12px;font-size:12px;color:var(--t3);border-top:1px solid var(--b1)}
/* momentum check */
.svp-o{padding:12px 16px;display:flex;flex-direction:column;gap:10px}
.svp-sum{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--t2)}
.svp-sum>span{padding:4px 12px;border-radius:999px;background:var(--s2)}.svp-sum b{color:var(--t1)}
.svp-sum .ok b{color:var(--long)}.svp-sum .no b{color:var(--mixed)}.svp-sum .nw b{color:var(--acc)}
.svp-sum .px-btn{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:32px}
.svp-l{display:flex;flex-direction:column}
.svp-i{display:grid;grid-template-columns:minmax(0,150px) minmax(0,150px) minmax(0,1fr);gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--b1);font-size:13px}
.svp-i:last-child{border-bottom:0}.svp-i b{display:flex;align-items:center;gap:6px;color:var(--t1)}.svp-i small{color:var(--t3)}
.svp-l.chg .svp-i>span em{font-style:normal;color:var(--mixed)}
.svp-new{font:600 10px/16px var(--sans);padding:0 6px;border-radius:999px;background:var(--adim);color:var(--acc);text-transform:uppercase}
.svp-ok{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:var(--longd);color:var(--long);font-size:13px;font-weight:600}
.tk-x{border:0;background:none;color:var(--t3);cursor:pointer;padding:4px;display:inline-flex}.tk-x:hover{color:var(--t1)}
/* swap pop-up */
.tk-ov{z-index:110}
.tk-modal{width:min(560px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.tk-mh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.tk-mh h3{margin:4px 0 0;font:700 18px var(--sans);color:var(--t1)}
.tk-mh small{display:block;font-size:12.5px;color:var(--t2);margin-top:2px}
.tk-alt{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:12px 14px;border-radius:10px;border:1px solid var(--b1);background:var(--s1)}
.tk-alt b{display:block;font:700 14px var(--sans);color:var(--t1)}.tk-alt small{font-size:12px;color:var(--t3)}
.tk-alt .st{font:700 15px var(--sans);color:var(--long);font-feature-settings:"tnum"}
/* save */
.svp-save{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;align-self:flex-start;padding:8px 10px;margin:0 0 12px;max-width:100%}
.svp-save input{width:260px;height:32px;padding:0 10px;font-size:13px}
.svp-save .px-btn{display:inline-flex;align-items:center;gap:6px;height:32px}
.svp-msg{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;font-size:13px;border-color:var(--acc);background:var(--adim)}
.svp-msg>span{flex:1}.svp-msg .px-btn{height:30px}
@media (max-width:1200px){.tk-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.tk-row2{grid-template-columns:1fr}}
@media (max-width:640px){.tk-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.svp-i{grid-template-columns:1fr;gap:2px}.svp-save input{width:100%}
  .tk-mov{grid-template-columns:1fr}.tk-mov>div+div{border-left:0;border-top:1px solid var(--b1)}.tk-t .hm{display:none}.tk-t th,.tk-t td{padding:8px 10px}}

.svp-id{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 9px;border-radius:7px;border:1px solid var(--b2);background:var(--s2);color:var(--t1);cursor:pointer;font:500 12px var(--sans)}
.svp-id span{font:600 10px var(--sans);letter-spacing:.5px;color:var(--t3)}.svp-id b{font:600 12.5px var(--mono);letter-spacing:.04em}.svp-id:hover{border-color:var(--acc);color:var(--acc)}
.svp-idrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.svp-vis{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font:600 11.5px var(--sans);background:var(--s2);color:var(--t2)}
.svp-vis.public{background:var(--adim);color:var(--acc)}
.svp-cid{margin-left:auto;font:600 11px var(--mono);letter-spacing:.04em;color:var(--t3)}
.svp-card .svp-ch b{min-width:0}
.shr-id{display:flex;align-items:center;gap:10px;margin:4px 0 12px}
.shr-seg{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.shr-seg button{display:grid;grid-template-columns:auto 1fr;column-gap:10px;row-gap:2px;align-items:center;text-align:left;padding:12px 14px;border-radius:10px;border:1.5px solid var(--b2);background:var(--s1);color:var(--t1);font-family:var(--sans);cursor:pointer}
.shr-seg button .ic{grid-row:1/3;color:var(--t3)}.shr-seg button b{font:600 14px var(--sans)}.shr-seg button small{font-size:12px;color:var(--t2)}
.shr-seg button.on{border-color:var(--acc);background:var(--adim)}.shr-seg button.on .ic{color:var(--acc)}
.shr-seg button:disabled{opacity:.55;cursor:not-allowed}.shr-seg button:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.shr-note{display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:8px;background:var(--s2);font-size:12.5px;color:var(--t1);margin-bottom:10px}
.shr-open{display:flex;align-items:center;gap:8px;height:40px;padding:0 6px 0 12px;border-radius:10px;border:1px solid var(--b2);background:var(--s1);max-width:460px;color:var(--t3)}
.shr-open:focus-within{border-color:var(--acc);box-shadow:var(--ds-field-glow)}
.shr-open input{flex:1;min-width:0;border:0;outline:0;background:none;box-shadow:none;padding:0;font:500 13px var(--sans);color:var(--t1);text-transform:uppercase}
.shr-open input::placeholder{text-transform:none;color:var(--t3)}.shr-open .px-btn{height:30px}
.shr-tw{max-height:50vh;overflow:auto}
@media (max-width:640px){.shr-seg{grid-template-columns:1fr}}

.svp-url{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:7px;background:var(--s2);border:1px solid var(--b1);font:500 12px var(--mono);color:var(--t2);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svp-visw{display:inline-flex;align-items:center;gap:8px}
.svp-seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--s2);border:1px solid var(--b1)}
.svp-seg button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:7px;background:none;color:var(--t2);font:600 12.5px var(--sans);cursor:pointer}
.svp-seg button.on{background:var(--s1);color:var(--t1);box-shadow:0 1px 3px rgba(15,27,45,.12)}.svp-seg button.on.pub{color:var(--acc)}
.svp-seg button:disabled{cursor:not-allowed;opacity:.55}.svp-seg button:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.svp-viserr{font-size:12px;color:var(--short)}
.svp-link{height:36px}
.shr-page{padding:18px 20px}.shr-page .tk-x{display:none}
.shr-page .shr-tw{max-height:none;overflow:visible}

.pln .pln-k{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:12px 16px}
.pln .pln-k>div{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:10px;background:var(--s2);min-width:0}
.pln .pln-k b{font:700 20px/26px var(--sans);color:var(--t1)}.pln .pln-k small{font-size:12px;color:var(--t2);overflow:hidden;text-overflow:ellipsis}
@media (max-width:900px){.pln .pln-k{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* rename (round 15) */
.tk-ren{border:0;background:none;color:var(--t3);cursor:pointer;padding:4px;display:inline-flex;vertical-align:2px;border-radius:6px}.tk-ren:hover{color:var(--acc);background:var(--adim)}
.tk-rn{display:inline-flex;align-items:center;gap:6px}.tk-rn input{width:280px;height:34px;padding:0 10px;font:600 15px var(--sans)}
/* swap history: from when, what to what, and how both did since */
.sw-list{display:flex;flex-direction:column}
.sw-r{display:grid;grid-template-columns:110px minmax(0,1fr) 34px minmax(0,1fr) 150px;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--b1)}
.sw-r:last-child{border-bottom:0}
.sw-d{font:600 12.5px var(--sans);color:var(--t2)}.sw-d small{display:block;font-weight:500;color:var(--t3)}
.sw-s{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid var(--b1)}
.sw-s.out{background:var(--s2)}.sw-s.out .sym{color:var(--t2);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--short) 60%,transparent)}
.sw-s.in{background:color-mix(in srgb,var(--long) 6%,var(--s1));border-color:color-mix(in srgb,var(--long) 35%,var(--b1))}
.sw-s>div{min-width:0;flex:1}.sw-s .sym{font:700 13.5px var(--sans);color:var(--acc)}.sw-s small{display:block;font-size:11.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sw-s em{font-style:normal;font:700 13px var(--sans);white-space:nowrap}.sw-s em small{text-align:right;font-weight:500}
.sw-ar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--adim);color:var(--acc)}
.sw-e{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:11.5px;color:var(--t3)}
.sw-e b{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font:700 12px var(--sans);background:var(--s2);color:var(--t2)}
.sw-e b.up{background:var(--longd);color:var(--long)}.sw-e b.dn{background:var(--shortd);color:var(--short)}
@media (max-width:900px){.sw-r{grid-template-columns:1fr 30px 1fr}.sw-d{grid-column:1/-1}.sw-e{grid-column:1/-1;flex-direction:row;justify-content:space-between}}
.sw-wrap{border-bottom:1px solid var(--b1)}.sw-wrap:last-child{border-bottom:0}.sw-wrap .sw-r{border-bottom:0;cursor:pointer}.sw-wrap .sw-r:hover{background:var(--s2)}
.sw-wrap .sw-r:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--acc)}
.sw-e span .ic{display:inline-block;vertical-align:-1px;transition:transform .2s}.sw-wrap.open .sw-e span .ic{transform:rotate(90deg)}
.sw-am{color:var(--acc)!important;font-weight:600}
.sw-dd{margin:0 16px 12px;border:1px solid var(--b1);border-radius:12px;overflow:hidden;background:var(--bg);animation:awTick .28s both}
.sw-dh,.sw-dr{display:grid;grid-template-columns:170px minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding:0 14px}
.sw-dh{height:30px;background:var(--s2);border-bottom:1px solid var(--b1);font:600 11px var(--sans);letter-spacing:.4px;text-transform:uppercase;color:var(--t3)}.sw-dh b{color:var(--acc)}
.sw-dr{min-height:36px;border-bottom:1px solid var(--b1);font-size:12.5px}.sw-dr:last-child{border-bottom:0}
.sw-dr>span{color:var(--t2)}.sw-dr b{font:600 13px var(--sans);color:var(--t1);font-feature-settings:"tnum"}.sw-dr b small{display:block;font:500 11.5px var(--sans);color:var(--t3)}
.sw-dr.hl{background:var(--s2)}.sw-dr.amt b{font-size:14px}
@media (max-width:700px){.sw-dh,.sw-dr{grid-template-columns:110px 1fr 1fr;gap:8px;padding:0 10px}}
/* swap options: like for like + upgrades */
.tk-og{display:flex;flex-direction:column;gap:8px}
.tk-oh{display:flex;align-items:center;gap:8px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);margin-top:4px}
.tk-oh .ic{color:var(--acc)}.tk-oh.up{color:#7c3aed}.tk-oh.up .ic{color:#7c3aed}
.tk-alt.up{border-color:color-mix(in srgb,#8b5cf6 40%,var(--b1));background:color-mix(in srgb,#8b5cf6 5%,var(--s1))}
.tk-capup{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,#8b5cf6 14%,var(--s1));color:#7c3aed;font:700 10.5px var(--sans);margin-left:6px;vertical-align:1px}
/* AI watch on the overview tiles (round 15) */
.svp-card{position:relative}
.svp-card:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.svp-aiw{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--b1);background:var(--s2);cursor:pointer;font:inherit;color:var(--t1);text-align:left;transition:border-color .15s,background .15s}
.svp-aiw:hover{border-color:var(--acc)}
.svp-aiw .ai-spark{flex:none}
.svp-aiw b{font:700 12.5px var(--sans)}.svp-aiw small{display:block;font-size:11.5px;color:var(--t2)}
.svp-aiw>span{flex:1;min-width:0}
.svp-aiw i{font-style:normal;flex:none;display:inline-grid;place-items:center;min-width:26px;height:26px;padding:0 8px;border-radius:999px;font:800 12px var(--sans);background:var(--longd);color:var(--long)}
.svp-aiw.hot{border-color:color-mix(in srgb,var(--short) 40%,var(--b1));background:color-mix(in srgb,var(--short) 5%,var(--s1))}
.svp-aiw.hot i{background:var(--short);color:#fff;animation:hpPulse .5s both}
/* the AI watch pop-up: a short scan, then every suggested swap */
.tk-modal.wide{width:min(780px,100%)}.aw-modal{display:flex;flex-direction:column;gap:12px}
.aw-scan{display:flex;flex-direction:column;align-items:center;gap:16px;padding:26px 10px 30px;text-align:center}
.aw-orb{position:relative;width:86px;height:86px;border-radius:50%;display:grid;place-items:center;color:#fff;background:conic-gradient(from 0deg,var(--acc),#8b5cf6,var(--acc));animation:awSpin 1.4s linear infinite}
.aw-orb::before{content:"";position:absolute;inset:5px;border-radius:50%;background:var(--bg)}
.aw-orb>span{position:relative;z-index:1;color:var(--acc);display:grid;place-items:center}
.aw-orb::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid color-mix(in srgb,var(--acc) 40%,transparent);animation:awRing 1.4s ease-out infinite}
@keyframes awSpin{to{transform:rotate(360deg)}}@keyframes awRing{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.35);opacity:0}}
.aw-scan b{font:700 17px var(--sans);color:var(--t1)}.aw-scan b span{background:linear-gradient(90deg,var(--acc),#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
.aw-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:560px}
.aw-chips span{padding:3px 10px;border-radius:999px;border:1px solid var(--b2);background:var(--s1);font:600 11.5px var(--sans);color:var(--t3);animation:awTick .3s both}
.aw-chips span.bad{border-color:var(--short);color:var(--short);background:var(--shortd)}.aw-chips span.ok{color:var(--long);border-color:color-mix(in srgb,var(--long) 40%,var(--b1))}
@keyframes awTick{from{opacity:0;transform:translateY(4px) scale(.95)}to{opacity:1;transform:none}}
.aw-it{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:12px;border:1px solid var(--b1);background:var(--s1);animation:awTick .35s both}
.aw-ih{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.aw-ih .sym{font:800 15px var(--sans);color:var(--t1)}.aw-ih small{color:var(--t3);font-size:12px}
.aw-clear{display:flex;align-items:center;gap:10px;padding:16px;border-radius:12px;background:var(--longd);color:var(--long);font:600 14px var(--sans)}
@media (prefers-reduced-motion:reduce){.aw-orb,.aw-orb::after,.aw-chips span,.aw-it{animation:none}}
/* round 16: price + company size on both sides of a swap */
.tk-cur{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-radius:10px;background:var(--s2);border:1px dashed var(--b2);font-size:12.5px;color:var(--t2)}
.tk-cur b{font:700 13.5px var(--sans);color:var(--t1)}
.tk-sz{display:inline-flex;gap:6px;flex-wrap:wrap;margin-top:3px}
.tk-sz span{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--s2);font:600 11px var(--sans);color:var(--t2);white-space:nowrap}
.tk-amt{margin-left:auto;font:600 12px var(--sans);color:var(--acc)}.tk-buys{color:var(--acc)!important;font-weight:600}
.tk-why{margin:0;font-size:12.5px;line-height:19px;color:var(--t2)}
.tk-none{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:10px;background:var(--mixedd);color:var(--t1);font:600 12.5px/18px var(--sans)}.tk-none .ic{flex:none;margin-top:2px;color:var(--mixed)}
.tk-sec{display:flex;flex-direction:column;gap:8px}.tk-oh small{margin-left:8px;font:500 11.5px var(--sans);letter-spacing:0;text-transform:none;color:var(--t3)}
.tk-empty{padding:9px 12px;border-radius:10px;border:1px dashed var(--b2);font-size:12.5px;color:var(--t3)}
.tk-sz span.pr{background:var(--adim);color:var(--acc)}
/* round 16: the overall AI watch at the top of My portfolios */
.svp-aiall{display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px;border-radius:14px;border:1px solid var(--b1);cursor:pointer;font:inherit;text-align:left;color:var(--t1);
  background:linear-gradient(120deg,color-mix(in srgb,var(--acc) 10%,var(--s1)),color-mix(in srgb,#8b5cf6 10%,var(--s1)));transition:border-color .15s,transform .15s}
.svp-aiall:hover{border-color:var(--acc);transform:translateY(-1px)}
.svp-aiall .aw-mini{position:relative;flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(from 0deg,var(--acc),#8b5cf6,var(--acc));animation:awSpin 3s linear infinite}
.svp-aiall .aw-mini::before{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--s1)}.svp-aiall .aw-mini>*{position:relative}
.svp-aiall>span{flex:1;min-width:0}.svp-aiall b{display:block;font:700 15px var(--sans)}.svp-aiall small{display:block;font-size:12.5px;color:var(--t2)}
.svp-aiall i{font-style:normal;flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:999px;font:700 13px var(--sans);background:var(--longd);color:var(--long)}
.svp-aiall.hot i{background:var(--short);color:#fff}
.aw-pf{display:flex;flex-direction:column;gap:8px}.aw-pfh{display:flex;align-items:center;gap:8px;font:700 14px var(--sans);color:var(--t1);padding-top:6px;border-top:1px solid var(--b1)}
.aw-pfh small{font:500 12px var(--sans);color:var(--t3)}
/* round 16: section tabs on the portfolio page (like the AI Portfolio Builder) */
.tk-tabs{position:sticky;top:0;z-index:6;display:flex;gap:4px;overflow-x:auto;padding:0 6px;margin:0 -6px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--b1);scrollbar-width:none}
.tk-tabs::-webkit-scrollbar{display:none}
.tk-tabs button{all:unset;cursor:pointer;white-space:nowrap;padding:12px 2px 10px;margin:0 10px;font:400 13px/16px var(--sans);color:var(--t2);border-bottom:2px solid transparent}
.tk-tabs button:hover{color:var(--t1);border-bottom-color:var(--b2)}.tk-tabs button.on{color:var(--acc);border-bottom-color:var(--acc);font-weight:600}
.tk-tabs button:focus-visible{outline:none;box-shadow:var(--ds-focus)}
#saved-track [data-sec]{scroll-margin-top:56px}
.svp-bt{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font:600 11.5px var(--sans);background:color-mix(in srgb,#8b5cf6 12%,var(--s1));color:#7c3aed}
`);

const WORD = { month: "month", quarter: "quarter" };
const KIND_OF_APP = { sip: "sip", msip: "msip", builder: "builder", portfolio: "analyser" };
const TAGS = [["analyser", "AI Portfolio Analyser"], ["builder", "Portfolio Builder"], ["sip", "AI ETF SIP Builder"], ["msip", "AI Momentum SIP Builder"]];
const GROUP_NAME = { Large: "Large cap", Mid: "Mid cap", Small: "Small cap", ETF: "ETFs", Other: "Other" };
const GROUP_COL = { Large: "var(--mx-l)", Mid: "var(--mx-m)", Small: "var(--mx-s)", ETF: "var(--ch-etf)", Other: "var(--mx-c)" };
const PERIODS = [["1W", 7], ["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366], ["All", 0]];
const STEPS = [0, 5, 10, 15, 20];
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const inr2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrShort = v => v == null ? "—" : Math.abs(v) >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const money = v => v == null ? "—" : `${v >= 0 ? "+" : "−"}${inr(Math.abs(v))}`;
const pctTxt = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = v => v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : "";
const plus = v => v == null ? "" : `${v > 0 ? "+" : ""}${signed(v)}`;
const dShort = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const ALERTS = "We tell you in the 🔔 notifications when a stock in this portfolio needs to change, with a better one.";
export const buyText = (h, freq) => {
  if (!freq) return `${(h.qty || h.units || 0).toLocaleString("en-IN")} share${(h.qty || h.units) === 1 ? "" : "s"}`;
  const u = h.kind === "etf" ? "unit" : "share";
  return (h.every || 1) === 1 ? `${(h.units || 1).toLocaleString("en-IN")} ${u}${h.units === 1 ? "" : "s"} at today's price` : `1 ${u} every ${h.every} ${WORD[freq]}s`;
};
const dLong = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
// one swap: the old stock's money moves to the new one from today (the server sizes it; nothing can be added or resized)
const swapCall = (it, s, alt) => api(`/app/api/saved/${it.id}/holdings`, { method: "PUT",
  json: { holdings: it.holdings.map(h => h.s === s ? { kind: "stock", s: alt.s, n: alt.n, cap: alt.cap, sec: alt.sec, grp: `${alt.cap} cap`, replaces: s } : h) } });
// the swap choices of one stock: like for like, then upgrades (a bigger company in the same industry / sector — owner 2026-11-07)
const crore = v => v == null ? "—" : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
// price and company size of one stock (round 16: "mention the price and the size of both, the swap and the current one")
export const SizeTags = ({ x }) => <span className="tk-sz"><span className="pr" title="Last price">{inr2(x.p)}</span>
  <span title="Market value of the company">{crore(x.mcap)}</span>{x.cap && <span>{x.cap} cap</span>}</span>;
export function SwapOptions({ items, busy, onPick, from, cur, amount, per }) {
  const { intro, notice, sections } = swapSections(items, cur || {});
  // round 17: the money of the old stock, and what it buys of each choice (the server sizes the real swap the same way)
  const buys = a => { if (!amount || !a.p) return null; if (per) return `${inr(amount)} ${per}`; const n = Math.max(1, Math.floor(amount / a.p)); return `≈ ${n.toLocaleString("en-IN")} share${n === 1 ? "" : "s"} · ${inr(n * a.p)}`; };
  const row = a => <div key={a.s} className={`tk-alt ${a.up ? "up" : ""}`} data-alt={a.s} data-up={a.up ? 1 : 0}>
    <div><b>{a.s}{a.up && <span className="tk-capup">↑ {from ? `${from} → ` : ""}{a.cap} cap</span>}</b><small>{a.n} · {a.sec} · {a.why}</small><SizeTags x={a}/>{buys(a) && <small className="tk-buys">{buys(a)}</small>}</div>
    <span className="st" title="Long-term strength">{plus(a.st)}</span>
    <button type="button" className="px-btn primary tk-do" onClick={() => onPick(a)} disabled={!!busy}>{busy === a.s ? "Swapping…" : "Swap"}</button></div>;
  return (
    <div className="tk-og" data-swap-sections>
      <p className="tk-why" id="tk-why">{intro}</p>
      {notice && <div className="tk-none" id="tk-notice"><Icon name="info" size={14}/> {notice}</div>}
      {cur && <div className="tk-cur" id="tk-cur"><span>Now</span><b>{cur.s}</b><SizeTags x={cur}/>{amount ? <span className="tk-amt">{inr(amount)}{per ? ` ${per}` : ""} moves to the one you pick</span> : null}</div>}
      {sections.map(g => <div key={g.k} className={`tk-sec ${g.k}`} data-section={g.k}>
        <div className={`tk-oh ${g.k === "up" ? "up" : ""}`}><Icon name={g.k === "up" ? "trend" : "swap"} size={13}/> {g.title} · {g.items.length}<small>{g.sub}</small></div>
        {g.items.length ? g.items.map(row) : <div className="tk-empty" data-empty={g.k}>{g.empty}</div>}
      </div>)}
    </div>);
}

// one swap, opened (round 17): both sides with price then / now, quantity and the money in each
const swRow = (label, a, b, cls = "") => <div className={`sw-dr ${cls}`}><span>{label}</span><b>{a}</b><b>{b}</b></div>;
export function SwapDetail({ w, inr, inr2, pct, tone, isSip }) {
  const o = w.out, i = w.in, mv = (x, c) => x && x.ret != null ? <span className={tone(x.ret)}>{pct(x.ret)}</span> : "—";
  return (
    <div className="sw-dd" data-detail>
      <div className="sw-dh"><span/><span>{o ? <>Left · <b>{o.s}</b></> : "Left"}</span><span>{i ? <>Came in · <b>{i.s}</b></> : "Came in"}</span></div>
      {swRow("Company", o && o.n && o.n !== o.s ? `${o.n}${o.cap ? ` · ${o.cap} cap` : ""}` : o ? `${o.cap || ""} cap` : "—", i && i.n && i.n !== i.s ? `${i.n}${i.cap ? ` · ${i.cap} cap` : ""}` : i ? `${i.cap || ""} cap` : "—")}
      {swRow("Price at the swap", o ? inr2(o.then) : "—", i ? inr2(i.then) : "—")}
      {swRow("Price now", o ? inr2(o.now) : "—", i ? inr2(i.now) : "—")}
      {swRow("Move since the swap", mv(o), mv(i), "hl")}
      {swRow("Quantity", o && o.qty != null ? o.qty : "—", i && i.qty != null ? (+i.qty).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—")}
      {swRow(isSip ? "Money put in it" : "Amount", o && o.invested != null ? inr(o.invested) : "—", i && i.invested != null ? inr(i.invested) : "—", "amt")}
      {swRow("Sold for · worth now", o && o.sold_for != null ? <>{inr(o.sold_for)}<small> sold · {o.kept_value != null ? inr(o.kept_value) : "—"} now if kept</small></> : "—", i && i.value != null ? <>{inr(i.value)}<small> now{i.gain != null ? <> · <span className={tone(i.gain)}>{i.gain >= 0 ? "+" : "−"}{inr(Math.abs(i.gain))}</span></> : ""}</small></> : "—", "amt")}
    </div>);
}
// ── swap history: from when, what to what, and how both did after (round 15); each swap opens for its amounts (round 17) ──
export function SwapHistory({ swaps, id = "svp-swaps", isSip }) {
  const [open, setOpen] = useState(() => new Set());
  if (!swaps || !swaps.length) return null;
  const side = (x, cls) => !x ? <div className={`sw-s ${cls}`}><div><span className="sym">—</span><small>{cls === "out" ? "nothing left" : "nothing bought"}</small></div></div> : (
    <div className={`sw-s ${cls}`}><div><span className="sym">{x.s}</span><small>{x.n && x.n !== x.s ? x.n : ""}{x.cap ? ` · ${x.cap} cap` : ""}</small>
      {(x.invested != null || x.sold_for != null) && <small className="sw-am">{cls === "out" ? `${inr(x.sold_for != null ? x.sold_for : x.invested)} moved` : `${inr(x.invested)} in`}</small>}</div>
      <em className={tone(x.ret)}>{pctTxt(x.ret)}<small>{cls === "out" ? "if kept" : "since in"}</small></em></div>);
  return (
    <section className="px-card tk-card" id={id} data-sec>
      <div className="tk-ch"><h3><Icon name="swap" size={15}/> Swaps<small>{swaps.length} change{swaps.length === 1 ? "" : "s"} · the stock that left is still followed, so you see what the swap did</small></h3></div>
      <div className="sw-list">{swaps.map((w, i) => (
        <div key={i} className={`sw-wrap ${open.has(i) ? "open" : ""}`}>
          <div className="sw-r" data-out={w.out && w.out.s} data-in={w.in && w.in.s} role="button" tabIndex={0} aria-expanded={open.has(i)} data-swap-row={i}
            onClick={() => setOpen(o => { const x = new Set(o); x.has(i) ? x.delete(i) : x.add(i); return x; })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
            <div className="sw-d">{dLong(w.d)}<small>swapped</small></div>
            {side(w.out, "out")}<span className="sw-ar"><Icon name="chevron" size={15}/></span>{side(w.in, "in")}
            <div className="sw-e">{w.edge == null || (w.edge === 0 && w.in && w.in.then === w.in.now) ? <b>Starts next close</b> : <b className={tone(w.edge)}>{w.edge >= 0 ? "Swap ahead" : "Swap behind"} {Math.abs(w.edge).toFixed(2)}%</b>}
              <span>{open.has(i) ? "Hide details" : "Details"} <Icon name="chevron" size={11}/></span></div>
          </div>
          {open.has(i) && <SwapDetail w={w} inr={inr} inr2={inr2} pct={pctTxt} tone={tone} isSip={isSip}/>}
        </div>))}</div>
    </section>);
}
const tag = h => h.kind === "etf" ? (h.role === "core" ? "Core index" : h.role === "commodity" ? "Gold" : "ETF") : (h.grp || (h.cap ? `${h.cap} cap` : "Stock"));

// ── line chart: one axis, 2 px lines, crosshair + one tooltip for every series, keyboard too ──
export function LineChart({ dates, series, fmt, label, height = 260 }) {
  const box = useRef(null);
  const [w, setW] = useState(700), [at, setAt] = useState(null);
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(e => setW(Math.max(280, e[0].contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  const H = height, L = 64, R = 12, T = 10, B = 26, n = dates.length;
  const all = series.flatMap(s => s.vals).filter(v => v != null);
  if (!n || !all.length) return <div className="svp-note">No prices yet.</div>;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= Math.abs(lo) * 0.02 || 1; hi += Math.abs(hi) * 0.02 || 1; }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const nice = x => { const e = Math.pow(10, Math.floor(Math.log10(x))); const f = x / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };
  const step = nice((hi - lo) / 4), t0 = Math.ceil(lo / step) * step, ticks = [];
  for (let v = t0; v <= hi; v += step) ticks.push(v);
  const x = i => L + (n === 1 ? (w - L - R) / 2 : i * (w - L - R) / (n - 1));
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const path = vals => { let d = "", on = false; vals.forEach((v, i) => { if (v == null) { on = false; return; } d += `${on ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; on = true; }); return d; };
  const xt = n <= 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const move = e => { const r = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - r.left) * (w / r.width); setAt(Math.max(0, Math.min(n - 1, n === 1 ? 0 : Math.round((px - L) / ((w - L - R) / (n - 1)))))); };
  const key = e => { if (e.key === "ArrowLeft") setAt(a => Math.max(0, (a ?? n - 1) - 1)); if (e.key === "ArrowRight") setAt(a => Math.min(n - 1, (a ?? 0) + 1)); };
  const first = series[0];
  return (
    <div className="svp-plot" ref={box}>
      <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label} tabIndex={0} onPointerMove={move} onPointerLeave={() => setAt(null)} onKeyDown={key} onFocus={() => setAt(n - 1)} onBlur={() => setAt(null)}>
        {ticks.map(v => <g key={v}><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--b1)" strokeWidth="1"/>
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--t3)">{fmt(v, true)}</text></g>)}
        {xt.map(i => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--t3)">{dShort(dates[i])}</text>)}
        {first.area && n > 1 && <path d={`${path(first.vals)}L${x(n - 1)},${H - B}L${x(0)},${H - B}Z`} fill={first.color} opacity=".1"/>}
        {series.map(s => <path key={s.k} d={path(s.vals)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>)}
        {series.map(s => { const i = s.vals.length - 1 - [...s.vals].reverse().findIndex(v => v != null); return i < s.vals.length && s.vals[i] != null
          ? <circle key={s.k} cx={x(i)} cy={y(s.vals[i])} r="4" fill={s.color} stroke="var(--s1)" strokeWidth="2"/> : null; })}
        {at != null && <><line x1={x(at)} x2={x(at)} y1={T} y2={H - B} stroke="var(--t3)" strokeWidth="1"/>
          {series.map(s => s.vals[at] != null && <circle key={s.k} cx={x(at)} cy={y(s.vals[at])} r="4" fill={s.color} stroke="var(--s1)" strokeWidth="2"/>)}</>}
      </svg>
      {at != null && <div className="svp-tip" style={{ left: `${Math.min(x(at) / w * 100, 70)}%`, transform: "translateX(8px)" }}>
        <div className="d">{new Date(dates[at] + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
        {series.map(s => <div key={s.k}><i style={{ background: s.color }}/><b>{s.vals[at] == null ? "—" : fmt(s.vals[at])}</b> {s.label}</div>)}
      </div>}
    </div>);
}

function Spark({ vals }) {
  if (!vals || vals.length < 2) return <svg width="110" height="32" aria-hidden="true"><line x1="0" x2="110" y1="16" y2="16" stroke="var(--b2)" strokeWidth="2"/></svg>;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 108 + 1).toFixed(1)},${(30 - (v - lo) / r * 28).toFixed(1)}`).join(" ");
  return <svg width="110" height="32" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--ch-pf)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

function Modal({ children, onClose, label, wide }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return <div className="overlay tk-ov" onClick={onClose}><div className={`tk-modal ${wide ? "wide" : ""}`} role="dialog" aria-label={label} onClick={e => e.stopPropagation()}>{children}</div></div>;
}

// ── sharing (owner 2026-11-07): every saved portfolio has an ID; private (only you) or public (any customer with the ID reads it) ──
const NO_SHARE = "Sharing is not available for your access.";
// the address of a portfolio, copied in one click (owner: "I can share the URL to the user, that's it")
function CopyLink({ code, id = "svp-copylink" }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="px-btn svp-link" id={id} title={portfolioUrl(code)}
    onClick={async e => { e.stopPropagation(); if (await copyText(portfolioUrl(code))) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
    <Icon name={done ? "check" : "copy"} size={14}/> {done ? "Link copied" : "Copy link"}</button>;
}
function Visibility({ it, onSet }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const pub = it.visibility === "public";
  const set = v => { if (busy || it.visibility === v) return; setBusy(true); setErr(""); onSet(v).catch(e => setErr(e.message)).finally(() => setBusy(false)); };
  return (
    <span className="svp-visw">
      <span className="svp-seg" role="radiogroup" aria-label="Who can open it" id="svp-visseg">
        <button type="button" role="radio" aria-checked={!pub} className={!pub ? "on" : ""} id="shr-private" disabled={busy} onClick={() => set("private")}
          title="Only you can open it"><Icon name="lock" size={13}/> Private</button>
        <button type="button" role="radio" aria-checked={pub} className={pub ? "on pub" : ""} id="shr-public" disabled={busy || (!it.can_share && !pub)}
          title={it.can_share ? "Anyone with the link can read it — no sign-in needed" : NO_SHARE} onClick={() => set("public")}>
          <Icon name={it.can_share || pub ? "globe" : "lock"} size={13}/> Public</button>
      </span>
      {err && <span className="svp-viserr" role="alert">{err}</span>}
    </span>);
}
// a public portfolio opened by its ID
export function SharedView({ code, onClose, page = false }) {
  const [d, setD] = useState(null), [err, setErr] = useState("");
  useEffect(() => { setD(null); setErr(""); api(`/app/api/public/portfolio/${encodeURIComponent(code)}`).then(setD).catch(e => setErr(e.status === 404 ? "This portfolio is private, or the ID is not right." : e.message)); }, [code]);
  const Box = page ? SharedPageBox : Modal;
  return (
    <Box onClose={onClose} label="Shared portfolio">
      <div className="tk-mh"><div><div className="px-eyebrow"><Icon name="globe" size={12}/> Public portfolio · read only</div><h3>{d ? d.name : code}</h3>
        {d && <small>{d.tag} · saved {d.saved_on ? dShort(d.saved_on) : ""} · {d.holdings.length} holdings{d.changes ? ` · changed ${d.changes} time${d.changes === 1 ? "" : "s"}` : ""}</small>}</div>
        <button type="button" className="tk-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      {err ? <div className="pf-miss" role="alert" id="shr-err">{err}</div> : !d ? <div className="svp-empty">Opening…</div> : <>
        <div className="shr-id"><span className="svp-url">{portfolioUrl(d.code).replace(/^https?:\/\//, "")}</span><CopyLink code={d.code} id="shr-copylink"/></div>
        <div className="hp-tw shr-tw"><table className="hp-t" id="shr-table"><thead><tr><th>Instrument</th><th>Group</th><th className="num">Share</th></tr></thead>
          <tbody>{d.holdings.map(h => <tr key={h.s} className="hp-row"><td><span className="sym">{h.s}</span><span className="sub">{h.n && h.n !== h.s ? h.n : ""}{h.sec ? ` · ${h.sec}` : ""}</span></td>
            <td>{h.kind === "etf" ? (h.role === "commodity" ? "Gold / silver" : h.grp || "ETF") : (h.cap ? `${h.cap} cap` : "")}</td><td className="num">{h.w}%</td></tr>)}</tbody></table></div>
        <p className="svp-note">Shared read only. The owner, the rupee amounts and the results are not shown.</p></>}
    </Box>);
}
// a shared portfolio opened from its address: the same content on the page
function SharedPageBox({ children, onClose, label }) {
  return <section className="px-card shr-page" role="region" aria-label={label} id="shr-page">{children}</section>;
}
// "Open by ID" on My portfolios
function OpenById({ onOpen }) {
  const [v, setV] = useState("");
  const go = () => { const c = v.trim().toUpperCase().replace(/^.*\/PORTFOLIO\//, ""); if (c) onOpen(c); };   // a pasted link works too
  return (
    <div className="shr-open" id="shr-open">
      <Icon name="search" size={14}/><input value={v} onChange={e => setV(e.target.value)} placeholder="Have a portfolio ID? e.g. 7KQ2-M9XP-4TZB" aria-label="Portfolio ID" maxLength={40}
        onKeyDown={e => e.key === "Enter" && go()} id="shr-open-input"/>
      <button type="button" className="px-btn" onClick={go} disabled={!v.trim()} id="shr-open-go">Open</button>
    </div>);
}

// the plan of a shared portfolio: the money every instalment (and with the step-up, year by year), and what it buys
const STYLE_NAME = { focus: "Focus", standard: "Standard", diverse: "More diversified" };
function PlanCard({ it, step }) {
  const i = it.inputs || {}, isSip = it.kind === "sip" || it.kind === "msip", w = WORD[i.freq] || "month";
  const hs = it.holdings || [];
  const total = hs.reduce((a, h) => a + (isSip ? (h.amt || 0) : (h.qty || 0) * (h.p || 0)), 0);
  const years = Math.min(i.years || 10, 25), per = i.freq === "quarter" ? 4 : 12;
  const ladder = isSip ? Array.from({ length: Math.min(years, 5) }, (_, y) => [y + 1, total * Math.pow(1 + (step || 0) / 100, y)]) : [];
  const putIn = isSip ? Array.from({ length: years }, (_, y) => total * per * Math.pow(1 + (step || 0) / 100, y)).reduce((a, b) => a + b, 0) : 0;
  return (
    <section className="px-card tk-card pln" id="svp-plan">
      <div className="tk-ch"><h3>The plan<small>{isSip ? `what is bought every ${w}` : "the shares bought"}</small></h3></div>
      <div className="pln-k">
        <div><span className="px-label">{isSip ? `Every ${w}` : "Amount"}</span><b>{inr(isSip ? total : i.amount || total)}</b><small>{isSip ? (i.freq === "quarter" ? "quarterly SIP" : "monthly SIP") : `${hs.length} stocks`}</small></div>
        <div><span className="px-label">Holdings</span><b>{hs.length}</b><small>{it.tag}{i.opts && i.opts.style ? ` · ${STYLE_NAME[i.opts.style] || ""}` : ""}</small></div>
        {isSip && <div><span className="px-label">Plan</span><b>{years} years</b><small>{inrShort(putIn)} put in{step ? ` with +${step}% a year` : ""}</small></div>}
        {isSip && <div><span className="px-label">Step-up</span><b>{step ? `+${step}% a year` : "None"}</b><small>{ladder.length > 1 ? ladder.slice(1, 4).map(([y, v]) => `year ${y}: ${inrShort(v)}`).join(" · ") : "same amount each time"}</small></div>}
      </div>
      <div className="hp-tw"><table className="hp-t" id="svp-plan-table"><thead><tr><th>Instrument</th><th>Group</th>
        <th className="num">{isSip ? `Each ${w}` : "Shares"}</th><th className="num">{isSip ? `₹ per ${w}` : "Amount"}</th><th className="num">Share</th></tr></thead>
        <tbody>{hs.map(h => <tr key={h.s}><td><span className="sym">{h.s}</span><span className="sub">{h.n && h.n !== h.s ? h.n : ""}</span></td>
          <td>{h.kind === "etf" ? (h.role === "commodity" ? "Gold / silver" : h.role === "core" ? "Core index" : h.grp || "ETF") : h.cap ? `${h.cap} cap` : ""}</td>
          <td className="num">{isSip ? buyText(h, i.freq || "month") : (h.qty || 0).toLocaleString("en-IN")}</td>
          <td className="num"><b>{inr(isSip ? h.amt : (h.qty || 0) * (h.p || 0))}</b></td><td className="num">{h.w}%</td></tr>)}</tbody></table></div>
    </section>);
}

// the result of one momentum check: what to change (with the better alternative), then the order now (SIP)
function CheckResult({ ck, kind, freq, onApply, busy }) {
  if (ck.busy) return <div className="svp-o"><span className="svp-empty">Hyperplane AI is checking every holding…</span></div>;
  if (ck.err) return <div className="svp-o"><div className="pf-miss">{ck.err}</div></div>;
  const ex = ck.exit || [], nw = ck.new || [];
  return (
    <div className="svp-o" data-check={ck.id}>
      <div className="svp-sum"><span className="ok"><b>{ck.keep.length}</b> keep</span><span className="no"><b>{ex.length}</b> to change</span><span className="nw"><b>{nw.length}</b> new</span>
        {kind === "sip" && <span>This {WORD[freq]}: <b>{inr(ck.total)}</b></span>}
        {ex.length > 0 && <button type="button" className="px-btn primary svp-apply" onClick={onApply} disabled={busy}><AiSpark/> {busy ? "Adjusting…" : "Apply changes"}</button>}</div>
      {!ex.length && <div className="svp-ok"><Icon name="check" size={14}/> Every holding still passes the momentum checks.</div>}
      {ex.length > 0 && <div className="svp-l chg"><span className="px-label">What to change</span>
        {ex.map(h => { const n = nw.find(x => x.replaces === h.s); return (
          <div key={h.s} className="svp-i" data-exit={h.s}><b>{h.s}</b><small>{tag(h)}</small>
            <span><em>{h.kind === "etf" ? "Consider removing" : "Exit"}:</em> {h.why}{n ? <> → <b style={{ color: "var(--long)", display: "inline" }}>{n.s}</b> {plus(n.st)}</> : h.kind === "stock" ? " · no replacement today" : ""}</span></div>); })}</div>}
      {kind === "sip" && <div className="svp-l"><span className="px-label">This {WORD[freq]}'s order</span>
        {[...ck.keep, ...nw].map(h => <div key={h.s} className="svp-i"><b>{h.s}{h.replaces ? <em className="svp-new">new</em> : ""}</b>
          <small>{tag(h)}</small><span>{inr(h.amt)} · {buyText(h, freq)}</span></div>)}</div>}
    </div>);
}

// ── one portfolio: a broker-style holdings page since the day it was saved ──
// pub = the ID of a PUBLIC portfolio: the same page, read only, from the open /app/api/public/portfolio/<ID>/track (public.jsx)
export function Tracker({ item, onBack, onOut, onChanged, pub = null }) {
  const isSip = item.kind === "sip" || item.kind === "msip";
  const [step, setStep] = useState(isSip ? (item.inputs.stepup || 0) : 0), [sym, setSym] = useState(""), [per, setPer] = useState("All");
  const [t, setT] = useState(null), [err, setErr] = useState("");
  const [it, setIt] = useState(item), [ck, setCk] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const [swap, setSwap] = useState(null), [confirmDel, setConfirmDel] = useState(false);
  const [shut, setShut] = useState(() => new Set()), [anim, setAnim] = useState({}), [toast, showToast] = useToast();
  const [ren, setRen] = useState(null);
  const load = () => {
    const q = new URLSearchParams(); if (sym) q.set("sym", sym); if (isSip) q.set("stepup", step);
    if (pub) {
      fetch(`/app/api/public/portfolio/${encodeURIComponent(pub)}/track?${q}`, { credentials: "omit", headers: { Accept: "application/json" } })
        .then(async r => { if (!r.ok) throw new Error(r.status === 429 ? "Too many requests — please try again in a minute." : "This portfolio is not available."); return r.json(); })
        .then(r => { setT(r); setErr(""); }).catch(e => setErr(e.message));
      return;
    }
    api(`/app/api/saved/${it.id}/track?${q}`).then(r => { setT(r); setErr(""); }).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); });
  };
  useEffect(load, [sym, step, it.id, it.changes]);
  const check = () => { setCk({ busy: true }); api(`/app/api/saved/${it.id}/check`).then(setCk).catch(e => setCk({ err: e.message })); };
  const patch = j => api(`/app/api/saved/${it.id}`, { method: "PATCH", json: j }).then(r => { setIt(r); onChanged(); }).catch(e => setMsg(e.message));
  const apply = () => { setBusy(true); api(`/app/api/saved/${it.id}/apply`, { method: "POST" })
    .then(r => { setIt(r); setMsg(`${r.changed} change${r.changed === 1 ? "" : "s"} applied. Tracking continues with the new holdings from today.`); check(); onChanged(); })
    .catch(e => setMsg(e.message)).finally(() => setBusy(false)); };
  const openSwap = h => { setSwap({ h, items: null }); api(`/app/api/alternatives?s=${encodeURIComponent(h.s)}&exclude=${encodeURIComponent(it.holdings.map(x => x.s).join(","))}`)
    .then(r => setSwap(o => o && o.h.s === h.s ? { ...o, items: r.items, cur: r.cur && { s: h.s, ...r.cur } } : o)).catch(e => setSwap(o => o && { ...o, err: e.message })); };
  // swap with an animation: the old row slides out, the new one slides in with a green glow, a toast confirms
  const doSwap = (s, alt) => {
    setSwap(o => ({ ...o, busy: alt.s }));
    swapCall(it, s, alt)
      .then(r => { setSwap(null); setAnim({ out: s }); setSym("");
        setTimeout(() => { setIt(r); setAnim({ in: alt.s }); showToast(`${s} → ${alt.s} swapped`); onChanged(); setTimeout(() => setAnim({}), 2000); }, 380); })
      .catch(e => setSwap(o => ({ ...o, busy: null, err: e.message })));
  };
  const del = () => api(`/app/api/saved/${it.id}`, { method: "DELETE" }).then(() => { onChanged(); onBack(); }).catch(e => setMsg(e.message));
  const m = t && t.metrics;
  let from = 0;                                                   // the chart's period
  const pd = PERIODS.find(p => p[0] === per);
  if (t && pd && pd[1] && t.dates.length) { const lim = new Date(new Date(t.dates[t.dates.length - 1]).getTime() - pd[1] * 864e5).toISOString().slice(0, 10); from = Math.max(0, t.dates.findIndex(d => d >= lim)); }
  const cut = a => (a || []).slice(from);
  const series = !t ? [] : t.sym
    ? [{ k: "sym", label: `${t.sym.s} return`, color: "var(--ch-pf)", vals: cut(t.sym.ret) }]
    : [{ k: "pf", label: "Portfolio value", color: "var(--ch-pf)", vals: cut(t.value), area: true },
       { k: "in", label: "Amount invested", color: "var(--ch-in)", vals: cut(t.put_in) },
       { k: "bn", label: "Same money in Nifty 50", color: "var(--ch-bn)", vals: cut(t.bench) }];
  const fmt = t && t.sym ? (v => pctTxt(v)) : ((v, axis) => axis ? inrShort(v).replace(".00", "") : inr(v));
  const held = t ? t.holdings.filter(h => h.held).sort((a, b) => b.value - a.value) : [];
  const gone = t ? t.holdings.filter(h => !h.held) : [];
  const flagged = held.filter(h => h.flag && h.kind === "stock");
  const groupsOf = ["Large", "Mid", "Small", "ETF", "Other"].map(k => {
    const rows = held.filter(h => (h.grp || "Other") === k);
    return { k, rows, cost: rows.reduce((a, h) => a + h.cost, 0), value: rows.reduce((a, h) => a + h.value, 0), gain: rows.reduce((a, h) => a + h.gain, 0) };
  }).filter(g => g.rows.length);
  const gTot = t ? t.groups.reduce((s, g) => s + g.value, 0) || 1 : 1;
  const ranked = held.filter(h => h.ret != null).slice().sort((a, b) => b.ret - a.ret);
  const ups = held.filter(h => (h.day ?? 0) > 0).length, downs = held.filter(h => (h.day ?? 0) < 0).length;
  const secs = [["svp-kpis", "Overview"], ["svp-chart", "Performance"], ["svp-groups", "Allocation"], ["svp-holdings", "Holdings"],
    ...(t && t.swaps && t.swaps.length ? [["svp-swaps", `Swaps · ${t.swaps.length}`]] : []), ["svp-sim", "Simulators"]];
  const amount0 = isSip ? (it.inputs.amount || it.holdings.reduce((a, h) => a + (h.amt || 0), 0)) : (m && m.invested) || it.holdings.reduce((a, h) => a + (h.qty || 0) * (h.p || 0), 0);
  return (
    <div className="svp" id="saved-track" data-saved={it.id}>
      <div className="tk-top">
        <div className="tk-id">{!pub && <button type="button" className="tk-back" onClick={onBack} id="svp-back" aria-label="All portfolios" title="All portfolios">←</button>}
          <div style={{ minWidth: 0 }}>{ren != null ? <span className="tk-rn"><input value={ren} onChange={e => setRen(e.target.value)} maxLength={60} autoFocus id="svp-rename-in" aria-label="Portfolio name"
              onKeyDown={e => { if (e.key === "Enter" && ren.trim()) { patch({ name: ren }); setRen(null); } if (e.key === "Escape") setRen(null); }}/>
              <button type="button" className="px-btn primary" disabled={!ren.trim()} onClick={() => { patch({ name: ren }); setRen(null); }} id="svp-rename-ok">Save</button>
              <button type="button" className="px-btn" onClick={() => setRen(null)}>Cancel</button></span>
            : <h2>{it.name}{!pub && <button type="button" className="tk-ren" onClick={() => setRen(it.name)} title="Rename" aria-label="Rename this portfolio" id="svp-rename"><Icon name="edit" size={14}/></button>} <span className={`svp-tag ${it.kind}`}>{it.tag}</span></h2>}
            <small>Saved {it.saved_on ? dShort(it.saved_on) : fmtDT(it.created_at)} · {it.holdings.length} holdings{it.changes ? ` · changed ${it.changes} time${it.changes === 1 ? "" : "s"}` : ""}{m && m.last ? ` · prices of ${dShort(m.last)}` : ""}</small>
            <div className="svp-idrow"><span className="svp-url" id="svp-url" title="The address of this portfolio">{portfolioUrl(it.code).replace(/^https?:\/\//, "")}</span>
              {it.inputs && it.inputs.as_of && <span className="svp-bt" id="svp-bt" title="Built on a past day's data: tracked from that day to today"><Icon name="clock" size={12}/> Back-tested from {dShort(it.saved_on)}</span>}
              {pub ? <span className="svp-vis public"><Icon name="globe" size={12}/> Public · read only</span>
                : <span className={`svp-vis ${it.visibility}`} id="svp-vis"><Icon name={it.visibility === "public" ? "globe" : "lock"} size={12}/> {it.visibility === "public" ? "Public" : "Private"}</span>}</div></div></div>
        <div className="tk-acts">
          {isSip && <label className="tk-sel">Step-up <select value={step} onChange={e => setStep(+e.target.value)} id="svp-stepup" aria-label="Yearly step-up">
            {STEPS.map(v => <option key={v} value={v}>{v ? `+${v}% a year` : "Off"}</option>)}</select><Info text="Raise the instalment every year by this %. The tracking replays your SIP with it."/></label>}
          {pub ? <CopyLink code={it.code}/> : <>
          <label className={`hp-switch ${it.alerts ? "on" : ""}`}><input type="checkbox" checked={it.alerts} onChange={e => patch({ alerts: e.target.checked })} id="svp-alerts"/>
            Alerts <Info text={ALERTS}/></label>
          <Visibility it={it} onSet={v => api(`/app/api/saved/${it.id}`, { method: "PATCH", json: { visibility: v } }).then(r => { setIt(r); onChanged(); })}/>
          <CopyLink code={it.code}/>
          <button type="button" className="px-btn primary" onClick={check} id="svp-check"><AiSpark/> Momentum check</button>
          {confirmDel ? <><button type="button" className="px-btn danger" onClick={del} id="svp-del-yes">Delete</button><button type="button" className="px-btn" onClick={() => setConfirmDel(false)}>Keep</button></>
            : <button type="button" className="px-btn" onClick={() => setConfirmDel(true)} aria-label="Delete this portfolio" title="Delete" id="svp-del"><Icon name="x" size={14}/></button>}</>}
        </div>
      </div>
      {msg && <div className="px-card svp-msg" role="status"><Icon name="check" size={14}/><span>{msg}</span><button type="button" className="tk-x" onClick={() => setMsg("")} aria-label="Close"><Icon name="x" size={14}/></button></div>}
      {ck && <section className="px-card tk-card" id="svp-checkbox"><div className="tk-ch"><h3><AiSpark/> Momentum check</h3><button type="button" className="tk-x" onClick={() => setCk(null)} aria-label="Close"><Icon name="x" size={14}/></button></div>
        <CheckResult ck={ck} kind={it.kind} freq={it.inputs.freq} onApply={apply} busy={busy}/></section>}
      {pub && <PlanCard it={it} step={step}/>}
      {err ? <div className="pf-miss">{err}</div> : !t ? <div className="card svp-empty">Loading the tracking…</div> : <>
        {!pub && <SectionTabs tabs={secs}/>}
        <section className="tk-kpis" id="svp-kpis" data-sec>
          <div className="px-card tk-k acc"><span className="px-label">Current value</span><b>{inr(m && m.value)}</b>
            <small className={tone(m && m.day_gain)}>{m && m.day_gain != null ? `${money(m.day_gain)} (${pctTxt(m.day_ret)}) since ${dShort(m.prev)}` : "the first day"}</small></div>
          <div className="px-card tk-k"><span className="px-label">Amount invested</span><b>{inr(m && m.invested)}</b><small>since {dShort(t.start)}{m && m.cash > 1 ? ` · ${inr(m.cash)} waiting` : ""}</small></div>
          <div className={`px-card tk-k ${m && m.gain >= 0 ? "pos" : "neg"}`}><span className="px-label">Total returns</span><b className={tone(m && m.gain)}>{money(m && m.gain)}</b><small className={tone(m && m.ret)}>{pctTxt(m && m.ret)}</small></div>
          <div className="px-card tk-k"><span className="px-label">Nifty 50, same money <Info text="What the same money, put in on the same days, would be in a Nifty 50 ETF."/></span><b className={tone(m && m.bench_ret)}>{pctTxt(m && m.bench_ret)}</b>
            <small>{m && m.ret != null && m.bench_ret != null ? (m.ret >= m.bench_ret ? `you are ${(m.ret - m.bench_ret).toFixed(2)}% ahead` : `you are ${(m.bench_ret - m.ret).toFixed(2)}% behind`) : ""}</small></div>
          <div className="px-card tk-k"><span className="px-label">Biggest fall <Info text="The largest drop from a high point since it was saved."/></span><b className={m && m.drawdown < 0 ? "dn" : ""}>{m ? `${m.drawdown.toFixed(2)}%` : "—"}</b><small>{m ? `${m.days} trading day${m.days === 1 ? "" : "s"} tracked` : ""}</small></div>
          <div className="px-card tk-k"><span className="px-label">Holdings</span><b>{held.length}</b><small><span className="up">{ups} up</span> · <span className="dn">{downs} down</span> today</small></div>
        </section>

        <section className="px-card tk-card" id="svp-chart" data-sec>
          <div className="tk-ch"><h3>Performance<small>{t.sym ? `${t.sym.s}, return since it joined` : "value of the portfolio"}</small></h3>
            <div className="tk-per" role="group" aria-label="Period">{PERIODS.map(([k]) => <button key={k} type="button" className={per === k ? "on" : ""} onClick={() => setPer(k)} id={`svp-p-${k}`}>{k}</button>)}</div></div>
          <div className="tk-cb">
            <div className="tk-cbar"><div className="svp-leg">{series.map(s => <span key={s.k}><i style={{ background: s.color }}/>{s.label}</span>)}</div>
              <select value={sym} onChange={e => setSym(e.target.value)} aria-label="Show" id="svp-sym">
                <option value="">Whole portfolio</option>{held.map(h => <option key={h.s} value={h.s}>{h.s}</option>)}</select></div>
            <LineChart dates={cut(t.dates)} series={series} fmt={fmt} label={t.sym ? `${t.sym.s}: return since it joined` : "Portfolio value since it was saved"}/>
            {t.dates.length <= 1 && <div className="svp-note" id="svp-first">{t.dates.length ? `Priced at the close of ${dShort(t.dates[0])} — the price you saw when you saved. The line starts with the next trading day.` : "The first prices arrive with the next update."}</div>}
            {t.splits.length > 0 && <div className="svp-note">{t.splits.map(s => `${s.s}: adjusted for a ${s.factor >= 1 ? `1:${+s.factor.toFixed(2)} split / bonus` : "share consolidation"} on ${dShort(s.d)}`).join(" · ")}</div>}
          </div>
        </section>

        <section className="tk-row2">
          <div className="px-card tk-card" id="svp-groups" data-sec>
            <div className="tk-ch"><h3>Allocation<small>by market cap and ETFs</small></h3></div>
            <div className="tk-stack" aria-hidden="true">{t.groups.map(g => <i key={g.k} style={{ flexGrow: Math.max(0.5, g.value / gTot * 100), background: GROUP_COL[g.k] }}/>)}</div>
            <table className="tk-t"><thead><tr><th>Segment</th><th>Holdings</th><th>Current value</th><th>Weight</th><th>Returns</th></tr></thead>
              <tbody>{t.groups.map(g => <tr key={g.k} data-grp={g.k}><td><i className="sw" style={{ background: GROUP_COL[g.k] }}/>{GROUP_NAME[g.k] || g.k}</td><td>{g.n}</td>
                <td>{inr(g.value)}</td><td>{g.share}%</td><td className={tone(g.gain)}>{money(g.gain)}</td></tr>)}</tbody></table>
          </div>
          <div className="px-card tk-card" id="svp-movers">
            <div className="tk-ch"><h3>Top movers<small>since saved</small></h3></div>
            <div className="tk-mov">
              <div><span className="px-label">Gainers</span>{ranked.filter(h => h.ret > 0).slice(0, 4).map(h => <div key={h.s} className="tk-mi"><b>{h.s}</b><span className="up">{pctTxt(h.ret)}</span></div>)}
                {!ranked.some(h => h.ret > 0) && <div className="svp-note">None yet</div>}</div>
              <div><span className="px-label">Losers</span>{ranked.filter(h => h.ret < 0).slice(-4).reverse().map(h => <div key={h.s} className="tk-mi"><b>{h.s}</b><span className="dn">{pctTxt(h.ret)}</span></div>)}
                {!ranked.some(h => h.ret < 0) && <div className="svp-note">None</div>}</div>
            </div>
          </div>
        </section>

        <section className="px-card tk-card" id="svp-holdings" data-sec>
          <div className="hp-tbar"><h3>Holdings<small>{held.length} · by market cap and ETFs{flagged.length ? ` · ${flagged.length} need a swap` : ""}</small></h3>
            <button type="button" className="hp-gall" onClick={() => setShut(o => o.size ? new Set() : new Set(groupsOf.map(g => g.k)))} id="svp-gall">{shut.size ? "Show all groups" : "Collapse all groups"}</button></div>
          <div className="hp-tw"><table className="hp-t" id="svp-table">
            <thead><tr><th>Instrument</th><th className="num">Qty.</th><th className="num hm">Avg. cost</th><th className="num">LTP</th><th className="num hm">Invested</th>
              <th className="num">Cur. value</th><th className="num">P&amp;L</th><th className="num">Net chg.</th><th className="num hm" title="Change since the previous stored day">Day chg.</th><th className="num"/></tr></thead>
            <tbody>{groupsOf.map(g => <React.Fragment key={g.k}>
              <GroupRow cols={10} open={!shut.has(g.k)} onToggle={() => setShut(o => { const x = new Set(o); x.has(g.k) ? x.delete(g.k) : x.add(g.k); return x; })}
                color={GROUP_COL[g.k]} label={GROUP_NAME[g.k] || g.k} id={`svp-grp-${g.k}`}
                meta={<><span>{g.rows.length} holding{g.rows.length === 1 ? "" : "s"}</span><span>Invested <b>{inr(g.cost)}</b></span><span>Value <b>{inr(g.value)}</b></span>
                  <span className={tone(g.gain)}>{money(g.gain)} ({pctTxt(g.cost ? g.gain / g.cost * 100 : null)})</span></>}/>
              {!shut.has(g.k) && g.rows.map(h => <tr key={h.s} data-h={h.s} className={anim.out === h.s ? "hp-leaving" : anim.in === h.s ? "hp-swapped" : ""}>
                <td><span className="sym">{h.s}</span>{h.flag && <span className="hp-flag" title={h.flag}>{h.kind === "stock" ? "Regime down" : "Consider removing"}</span>}
                  <span className="sub">{h.n && h.n !== h.s ? h.n : GROUP_NAME[h.grp] || h.grp}{h.from && h.from !== t.start ? ` · since ${dShort(h.from)}` : ""}</span></td>
                <td className="num">{(+h.qty).toLocaleString("en-IN", { maximumFractionDigits: 2 })}{h.waiting > 1 && <span className="sub" title="Money set aside for the next unit">+ {inr(h.waiting)} waiting</span>}</td><td className="num hm">{inr2(h.avg)}</td><td className="num">{inr2(h.ltp)}</td>
                <td className="num hm">{h.qty ? inr(h.cost) : "—"}</td><td className="num">{h.qty ? inr(h.value) : "—"}</td><td className={`num ${tone(h.gain)}`}>{h.qty ? money(h.gain) : "—"}</td>
                <td className={`num ${tone(h.ret)}`}>{pctTxt(h.ret)}</td><td className={`num hm ${tone(h.day)}`}>{pctTxt(h.day)}</td>
                <td className="num">{h.flag && h.kind === "stock" ? <button type="button" className="hp-swapbtn tk-swap" onClick={() => openSwap(h)} data-swap={h.s} title={h.flag}>⇄ Swap</button>
                  : anim.in === h.s ? <span className="hp-done"><Icon name="check" size={14}/>Swapped</span> : null}</td></tr>)}
            </React.Fragment>)}</tbody>
          </table></div>
          {gone.length > 0 && <details className="tk-ex"><summary>Exited · {gone.length}</summary><div className="hp-tw"><table className="hp-t">
            <thead><tr><th>Instrument</th><th className="num">Invested</th><th className="num">Realised P&amp;L</th><th className="num">Net chg.</th></tr></thead>
            <tbody>{gone.map(h => <tr key={h.s}><td><span className="sym">{h.s}</span><span className="sub">{GROUP_NAME[h.grp] || h.grp}</span></td><td className="num">{inr(h.cost)}</td><td className={`num ${tone(h.gain)}`}>{money(h.gain)}</td><td className={`num ${tone(h.ret)}`}>{pctTxt(h.ret)}</td></tr>)}</tbody>
          </table></div></details>}
          <div className="tk-foot">{pub ? "" : flagged.length ? "Swap shows only when a stock's long-term regime turns down — not for ordinary pullbacks. " : "No stock needs a swap: every long-term regime is still up. "}
            {it.kind === "analyser" ? "Tracked as 1 share of each stock." : isSip ? `The same money every ${WORD[it.inputs.freq]}; whole units at that day's price, the rest waits for the next instalment.` : "Your saved quantities."} Prices: last close of each day.</div>
        </section>
        <SwapHistory swaps={t.swaps} isSip={isSip}/>
        {!pub && <div id="svp-sim-wrap"><Simulators isSip={isSip} amount0={amount0} years0={it.inputs.years} idp="svp" title="Simulators · this portfolio"/></div>}
      </>}
      {toast}
      {swap && <Modal onClose={() => setSwap(null)} label={`Swap ${swap.h.s}`}>
        <div className="tk-mh"><div><div className="px-eyebrow"><AiSpark/> Better alternative</div><h3>Swap {swap.h.s} <span className="hp-arrow">→</span></h3>
          <small>{swap.h.flag ? `${swap.h.s}: ${swap.h.flag}. ` : ""}The money of {swap.h.s} moves to the one you pick, from today; {swap.h.s} stays in the Swaps list so you can see how it does.</small></div>
          <button type="button" className="tk-x" onClick={() => setSwap(null)} aria-label="Close"><Icon name="x" size={16}/></button></div>
        {swap.err && <div className="pf-miss">{swap.err}</div>}
        {!swap.items ? !swap.err && <div className="svp-note">Finding the best alternatives…</div>
          : !swap.items.length ? <div className="svp-note">No better stock in its sector or market cap today.</div>
          : <SwapOptions items={swap.items} cur={swap.cur} amount={isSip ? (it.holdings.find(x => x.s === swap.h.s) || {}).amt : swap.h.value} per={isSip ? `a ${WORD[it.inputs.freq] || "month"}` : ""} busy={swap.busy} from={(GROUP_NAME[swap.h.grp] || "").replace(" cap", "")} onPick={a => doSwap(swap.h.s, a)}/>}
      </Modal>}
    </div>);
}

// ── My portfolios: every saved portfolio the customer's apps allow, tagged; opened from a notification too ──
export function MyPortfolios({ app, onOut, onCount }) {
  const here = KIND_OF_APP[app];
  const [list, setList] = useState(null), [msg, setMsg] = useState(""), [tagSel, setTagSel] = useState(here), [open, setOpen] = useState(null), [shared, setShared] = useState(null);
  const [watch, setWatch] = useState(null);
  const load = () => api("/app/api/saved?kind=all&spark=1").then(r => { setList(r); onCount && onCount(r.filter(x => x.kind === here).length); return r; })
    .catch(e => { if (e.status === 401) onOut(e.message); else setMsg(e.message); });
  useEffect(() => {
    const take = () => { try { const r = JSON.parse(sessionStorage.getItem(`hp_open_${app}`) || "null"); sessionStorage.removeItem(`hp_open_${app}`); return r; } catch { return null; } };
    const go = req => load().then(r => { if (req && req.ref && r) { const x = r.find(i => i.id === req.ref); if (x) setOpen(x); } });
    go(take());
    const on = e => { if (e.detail && e.detail.app === app) go(take()); };
    window.addEventListener("hp-open", on);
    return () => window.removeEventListener("hp-open", on);
  }, []);
  // the open portfolio follows the address: /app/portfolio/<ID> while it is open, the application's address when closed
  useEffect(() => { if (open) goPath(`/app/${APP_SLUG[app] || ""}/portfolio/${open.code}`); }, [open && open.code]);
  useEffect(() => {
    const f = () => { const r = routeOf(); if (!r.code) setOpen(null); };
    window.addEventListener("hp-route", f); window.addEventListener("popstate", f);
    return () => { window.removeEventListener("hp-route", f); window.removeEventListener("popstate", f); };
  }, []);
  if (open) return <Tracker item={open} onBack={() => { setOpen(null); load(); goPath(`/app/${APP_SLUG[app] || ""}`); }} onOut={onOut} onChanged={load}/>;
  if (!list) return <div className="card svp-empty">{msg || "Loading…"}</div>;
  const kinds = TAGS.filter(([k]) => list.some(x => x.kind === k) || k === here);
  const shown = tagSel === "all" ? list : list.filter(x => x.kind === tagSel);
  return (
    <div className="svp" id={`saved-${here}`}>
      {msg && <div className="px-card svp-msg" role="status"><span>{msg}</span></div>}
      {shared && <SharedView code={shared} onClose={() => setShared(null)}/>}
      {watch && <AiWatch list={watch} onClose={() => setWatch(null)} onChanged={load} onOpen={p => { setWatch(null); setOpen(p); }}/>}
      {(() => { const w = list.filter(x => x.kind !== "sip"), n = w.reduce((a, x) => a + (x.watch || 0), 0), np = w.filter(x => x.watch).length;
        return w.length > 0 && <button type="button" className={`svp-aiall ${n ? "hot" : ""}`} onClick={() => setWatch(w)} id="svp-aiall" data-watch={n}>
          <span className="aw-mini"><AiSpark/></span>
          <span><b>Hyperplane AI watch · all portfolios</b><small>{w.length} portfolio{w.length === 1 ? "" : "s"} · {w.reduce((a, x) => a + x.holdings.filter(h => (h.kind || "stock") === "stock").length, 0)} stocks checked after every update</small></span>
          <i>{n ? <>{n} stock{n === 1 ? "" : "s"} to change{np > 1 ? ` · ${np} portfolios` : ""}</> : <><Icon name="check" size={14}/> All clear</>}</i></button>; })()}
      <OpenById onOpen={setShared}/>
      <div className="svp-tags" role="group" aria-label="Show">
        <button type="button" className={tagSel === "all" ? "on" : ""} onClick={() => setTagSel("all")}>All · {list.length}</button>
        {kinds.map(([k, l]) => <button key={k} type="button" className={tagSel === k ? "on" : ""} onClick={() => setTagSel(k)} data-tag={k}>{l} · {list.filter(x => x.kind === k).length}</button>)}
      </div>
      {!shown.length ? <div className="card svp-empty"><Icon name="info" size={16}/>No saved portfolio here yet. Build or analyse one and press <b>&nbsp;Save</b>.</div> : (
        <div className="svp-grid">{shown.map(s => { const tr = s.track || {}; return (
          <div key={s.id} role="button" tabIndex={0} className="svp-card" onClick={() => setOpen(s)} onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) setOpen(s); }} data-saved={s.id}>
            <div className="svp-ch"><div><b>{s.name}</b><small>Saved {s.saved_on ? dShort(s.saved_on) : fmtDT(s.created_at)} · {s.holdings.length} holdings</small></div><span className={`svp-tag ${s.kind}`}>{s.tag}</span></div>
            <div className="svp-cv"><div><b>{inr(tr.value)}</b><small className={tone(tr.ret)}> {pctTxt(tr.ret)}</small></div><Spark vals={tr.spark}/></div>
            <div className="svp-cf"><span className={s.alerts ? "al" : ""}><Icon name="bell" size={12}/> Alerts {s.alerts ? "on" : "off"}</span>{s.changes ? <span>{s.changes} change{s.changes === 1 ? "" : "s"}</span> : null}
              <span className={`svp-vis ${s.visibility}`}><Icon name={s.visibility === "public" ? "globe" : "lock"} size={12}/> {s.visibility === "public" ? "Public" : "Private"}</span>
              <span className="svp-cid" title="Portfolio ID">{s.code}</span></div>
            {s.kind !== "sip" && <button type="button" className={`svp-aiw ${s.watch ? "hot" : ""}`} onClick={e => { e.stopPropagation(); setWatch([s]); }} data-watch={s.watch} id={`svp-aiw-${s.id}`}>
              <AiSpark/><span><b>Hyperplane AI watch</b><small>{s.watch ? `${s.watch} stock${s.watch === 1 ? "" : "s"} to change — see the swaps` : "Every long-term regime is still up"}</small></span>
              <i>{s.watch || <Icon name="check" size={13}/>}</i></button>}
          </div>); })}</div>)}
    </div>);
}

// sticky section tabs (the same as the AI Portfolio Builder's result page): a click scrolls to the section; the one in view is lit
function SectionTabs({ tabs }) {
  const [on, setOn] = useState(tabs[0][0]);
  useEffect(() => {
    const els = tabs.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(es => {
      const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis.length) setOn(vis[0].target.id);
    }, { rootMargin: "-80px 0px -55% 0px", threshold: 0 });
    els.forEach(e => io.observe(e));
    const top = () => { if (window.scrollY < 80) setOn(tabs[0][0]); };          // back at the top: the first tab
    window.addEventListener("scroll", top, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", top); };
  }, [tabs.map(t => t[0]).join()]);
  const go = id => { const el = document.getElementById(id); if (el) { setOn(id); el.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  return (
    <nav className="tk-tabs" aria-label="Sections" id="svp-tabs">
      {tabs.map(([id, label]) => <button key={id} type="button" className={on === id ? "on" : ""} aria-current={on === id ? "true" : undefined} onClick={() => go(id)} data-tab={id}>{label}</button>)}
    </nav>);
}

// ── Hyperplane AI watch of one saved portfolio (owner 2026-11-07, round 15: "the AI watch button under the portfolio overview … a few
// moments of AI animation … a click shows all the swaps; the tile shows how many stocks to change"): a short scan over the holdings,
// then each flagged stock with its same-size options and upgrades; a swap is made right here.
// the money in one holding of a saved portfolio (a lump: shares × price; a SIP: the instalment; the Analyser: 1 share)
const amountOf = (p, x) => {
  const h = p.holdings.find(y => y.s === x.s) || {};
  return p.kind === "sip" || p.kind === "msip" ? { amount: h.amt, per: `a ${WORD[p.inputs.freq] || "month"}` } : p.kind === "analyser" ? { amount: x.p } : { amount: (h.qty || 0) * (h.p || x.p || 0) };
};
function AiWatch({ list, onClose, onChanged, onOpen }) {
  const all = list.length > 1;
  const [res, setRes] = useState(null), [err, setErr] = useState(""), [scan, setScan] = useState(true), [busy, setBusy] = useState(null), [done, setDone] = useState({});
  const [cur, setCur] = useState(() => Object.fromEntries(list.map(p => [p.id, p])));
  useEffect(() => {
    const t0 = Date.now();
    Promise.all(list.map(p => api(`/app/api/saved/${p.id}/watch`).then(x => [p.id, x])))
      .then(r => setTimeout(() => { setRes(Object.fromEntries(r)); setScan(false); }, Math.max(0, (all ? 2200 : 1600) - (Date.now() - t0))))
      .catch(e => { setErr(e.message); setScan(false); });
  }, []);
  const stocksOf = p => p.holdings.filter(h => (h.kind || "stock") === "stock");
  const allStocks = list.flatMap(stocksOf);
  const pick = (pid, s, a) => { setBusy(a.s); swapCall(cur[pid], s, a).then(n => { setCur(c => ({ ...c, [pid]: n })); setDone(d => ({ ...d, [`${pid}:${s}`]: a.s })); onChanged(); })
    .catch(e => setErr(e.message)).finally(() => setBusy(null)); };
  const flagged = res ? list.reduce((n, p) => n + res[p.id].items.length, 0) : 0;
  const body = p => {
    const r = res[p.id], bad = new Set(r.items.map(x => x.s));
    return <div key={p.id} className="aw-pf" data-pf={p.id}>
      {all && <div className="aw-pfh">{p.name}<small>{p.tag} · {r.items.length ? `${r.items.length} to change` : "all clear"}</small></div>}
      <div className="aw-chips" style={{ justifyContent: "flex-start", maxWidth: "none" }}>{stocksOf(cur[p.id]).map(h => <span key={h.s} className={bad.has(h.s) && !done[`${p.id}:${h.s}`] ? "bad" : "ok"}>{h.s}</span>)}</div>
      {!r.items.length ? (!all && <div className="aw-clear" id="aw-clear"><Icon name="check" size={16}/> All clear — every stock's long-term regime is still up. Nothing to change.</div>)
        : r.items.map((x, i) => <div key={x.s} className="aw-it" style={{ animationDelay: `${i * 80}ms` }} data-flag={x.s}>
          <div className="aw-ih"><span className="sym">{x.s}</span><span className="hp-flag">Regime down</span><small>{x.n} · {x.sec}</small></div>
          {done[`${p.id}:${x.s}`] ? <div className="svp-ok"><Icon name="check" size={14}/> Swapped to {done[`${p.id}:${x.s}`]} — tracking continues with it from today.</div>
            : !x.alts.length ? <div className="svp-note">No better stock in its industry, sector or market cap today.</div>
            : <SwapOptions items={x.alts} busy={busy} from={x.cap} cur={x} onPick={a => pick(p.id, x.s, a)} {...amountOf(cur[p.id], x)}/>}
        </div>)}
      {!all && <div><button type="button" className="px-btn" onClick={() => onOpen(p)} id="aw-open">Open the portfolio</button></div>}
    </div>;
  };
  return (
    <Modal onClose={onClose} label="Hyperplane AI watch" wide>
      <div className="aw-modal" id="ai-watch">
        <div className="tk-mh"><div><div className="px-eyebrow"><AiSpark/> Hyperplane AI watch{all ? " · all portfolios" : ""}</div><h3>{all ? `${list.length} portfolios` : list[0].name}</h3>
          <small>{allStocks.length} stocks checked against today's long-term regime. A swap is suggested only when a regime turns down — not for ordinary pullbacks.</small></div>
          <button type="button" className="tk-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
        {scan ? <div className="aw-scan" id="aw-scan" role="status" aria-live="polite">
            <div className="aw-orb"><span><AiSpark/></span></div>
            <b><span>Hyperplane AI</span> is reading {allStocks.length} stocks{all ? ` in ${list.length} portfolios` : ""}…</b>
            <div className="aw-chips">{allStocks.slice(0, 30).map((h, i) => <span key={`${h.s}${i}`} style={{ animationDelay: `${i * 50}ms` }}>{h.s}</span>)}</div>
          </div>
          : err ? <div className="pf-miss">{err}</div>
          : <div className="tk-og" id="aw-list">
            {all && <div className={flagged ? "svp-note" : "aw-clear"} id={flagged ? "aw-sum" : "aw-clear"}>{flagged ? <><b>{flagged}</b>&nbsp;stock{flagged === 1 ? "" : "s"} to change across {list.filter(p => res[p.id].items.length).length} portfolio{list.filter(p => res[p.id].items.length).length === 1 ? "" : "s"}.</> : <><Icon name="check" size={16}/> All clear — nothing to change in any portfolio.</>}</div>}
            {(all ? list.filter(p => res[p.id].items.length) : list).map(body)}
          </div>}
      </div>
    </Modal>);
}

// "Save" on a result: a small name box + Save (alerts are switched on inside My portfolios)
export function SaveBar({ kind, defName, inputs, holdings, onDone, onCancel }) {
  const [name, setName] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const save = () => {
    const n = name.trim() || defName;
    setBusy(true); setErr("");
    api("/app/api/saved", { method: "POST", json: { kind, name: n, inputs, holdings } })
      .then(() => onDone(`Saved as “${n}”. Tracking starts today.`)).catch(e => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <div className="px-card svp-save" id={`save-${kind}`}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={defName} maxLength={60} aria-label="Portfolio name" autoFocus onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}/>
      <button type="button" className="px-btn primary" onClick={save} disabled={busy} id={`save-${kind}-ok`}><Icon name="check" size={14}/> Save</button>
      <button type="button" className="tk-x" onClick={onCancel} aria-label="Cancel" title="Cancel"><Icon name="x" size={14}/></button>
      {err && <div className="pf-miss" role="alert" style={{ flexBasis: "100%" }}>{err}</div>}
    </div>);
}

// the "Saved as …" strip after Save, with a close ✕
export function SavedNote({ msg, onOpen, onClose, id }) {
  return (
    <div className="px-card svp-msg" role="status" id={id} style={{ marginBottom: 12 }}><Icon name="check" size={14}/><span>{msg}</span>
      {onOpen && <button type="button" className="px-btn" onClick={onOpen}>Open My portfolios</button>}
      <button type="button" className="tk-x" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" size={14}/></button></div>);
}
