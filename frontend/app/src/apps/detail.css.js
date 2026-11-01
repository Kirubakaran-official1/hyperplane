// styles of the stock detail view (customer admin) — loaded with the module, only when it is opened
export const CSS = `
body.dt-lock{overflow:hidden}
.dt-overlay{position:fixed;inset:0;z-index:80;background:rgba(3,8,16,.55);display:flex;justify-content:flex-end;animation:dt-in .15s ease-out}
@keyframes dt-in{from{opacity:0}to{opacity:1}}
.dt-panel{width:min(1080px,100vw);height:100%;overflow-y:auto;background:var(--bg);border-left:1px solid var(--b2);padding:0 22px 30px;outline:none;box-shadow:-30px 0 60px -30px rgba(0,0,0,.5)}
.dt-head{position:sticky;top:0;z-index:2;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:16px 0 12px;background:var(--bg);border-bottom:1px solid var(--b1)}
.dt-head h2{margin:4px 0 3px;font:700 21px/1.25 var(--sans);color:var(--t1)}
.dt-sym{font:650 13px var(--mono);color:var(--acc);margin-left:6px}
.dt-badge{display:inline-flex;gap:5px;align-items:center;padding:2px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--mixed) 55%,transparent);color:var(--mixed);font-size:11px;font-weight:700}
.dt-x{all:unset;cursor:pointer;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--t2);border:1px solid var(--b2);flex-shrink:0}
.dt-x:hover{color:var(--t1);border-color:var(--acc)}
.dt-mut{color:var(--t2);font-size:12px}
.dt-empty{padding:30px;text-align:center;color:var(--t2)}
.dt-note{font-size:11.5px;color:var(--t2);padding:4px 2px}
.dt-h{margin:22px 0 8px;font:700 14px var(--sans);color:var(--t1)}
.dt-hrow{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dt-replay{all:unset;cursor:pointer;margin-top:14px;padding:4px 11px;border-radius:999px;border:1px solid var(--b2);font-size:12px;color:var(--t2)}
.dt-replay:hover{color:var(--t1);border-color:var(--acc)}
.up{color:var(--long)}.down{color:var(--short)}.side{color:var(--t2)}
.dt-chip{display:inline-flex;padding:2px 9px;border-radius:999px;border:1px solid var(--b2);font-size:11.5px;font-weight:650;color:var(--t2)}
.dt-chip.up{border-color:color-mix(in srgb,var(--long) 50%,transparent);color:var(--long)}
.dt-chip.down{border-color:color-mix(in srgb,var(--short) 50%,transparent);color:var(--short)}
.dt-tw{overflow-x:auto;border:1px solid var(--b1);border-radius:12px;background:var(--s1)}

/* verdict */
.dt-verdict{display:flex;gap:16px;align-items:center;margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid var(--b1);background:var(--s1);border-left:5px solid var(--t3)}
.dt-verdict.up{border-left-color:var(--long)}.dt-verdict.down{border-left-color:var(--short)}
.dv-score{display:flex;flex-direction:column;align-items:center;min-width:86px}
.dv-score span{font:800 30px/1 var(--sans);color:var(--t1)}
.dt-verdict.up .dv-score span{color:var(--long)}.dt-verdict.down .dv-score span{color:var(--short)}
.dv-score small{font-size:10.5px;color:var(--t2);margin-top:4px;text-align:center}
.dv-w{font:700 17px var(--sans);color:var(--t1);margin-bottom:5px}
.dv-l{font-size:12.5px;line-height:1.5;color:var(--t1)}
.dv-l.ok::first-letter{color:var(--long)}.dv-l.no::first-letter{color:var(--short)}

/* checklist tables */
.dt-ck{width:100%;border-collapse:collapse;font-size:12.5px;color:var(--t1)}
.dt-ck thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);padding:9px 12px;border-bottom:1px solid var(--b1);white-space:nowrap}
.dt-ck{table-layout:fixed}
.dt-ck tbody th{white-space:normal;text-align:left;font:650 12.5px/1.4 var(--sans);text-transform:none;letter-spacing:0;color:var(--t1);padding:10px 12px;border-bottom:1px solid var(--b1);width:34%;vertical-align:top}
.dt-ck tbody th small{display:block;font-weight:400;font-size:11px;text-transform:none;letter-spacing:0;color:var(--t2);margin-top:2px}
.dt-ck thead th:first-child{width:34%}
.dt-tech thead th:first-child,.dt-tech tbody th{width:22%}
.dt-ck td{padding:9px 12px;border-bottom:1px solid var(--b1);vertical-align:top}
.dt-ck tbody tr:last-child th,.dt-ck tbody tr:last-child td{border-bottom:0}
.ck{white-space:normal}
.ck-m{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;font-size:12px;font-weight:800;margin-right:8px;vertical-align:top}
.ck-ok .ck-m{background:var(--longd);color:var(--long)}
.ck-no .ck-m{background:var(--shortd);color:var(--short)}
.ck-mid .ck-m{background:var(--s2);color:var(--t3)}
.ck-t{display:inline-flex;flex-direction:column;white-space:normal;max-width:calc(100% - 30px)}
.ck-t small{font-size:10.5px;color:var(--t2)}
.ck-res th,.ck-res td{background:var(--s2)}
.ck-v b{font-size:13px}.ck-v small{display:block;font-size:11px;color:var(--t2)}
.ck-v.up b{color:var(--long)}.ck-v.down b{color:var(--short)}.ck-v.side b{color:var(--t2)}
.dt-tech .ck{white-space:normal}

/* score build-up */
.dt-build{border:1px solid var(--b1);border-radius:12px;background:var(--s1);padding:6px 14px}
.db-row{display:grid;grid-template-columns:170px 1fr 120px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--b1);font-size:12.5px}
.db-l{display:flex;flex-direction:column;font-weight:650;color:var(--t1)}.db-l small{font-weight:400;color:var(--t2);font-size:11px}
.db-bar{position:relative;height:10px;border-radius:6px;background:var(--s2)}
.db-bar::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--t3)}
.db-bar i{position:absolute;top:0;bottom:0;border-radius:6px;animation:db-grow .7s cubic-bezier(.2,.8,.2,1) both}
.db-bar i.pos{background:var(--long);transform-origin:left}.db-bar i.neg{background:var(--short);transform-origin:right}
@keyframes db-grow{from{transform:scaleX(0)}}
.db-row b{text-align:right;font-size:12.5px}
.db-total{display:flex;gap:12px;align-items:baseline;padding:10px 0 6px;font-weight:650;color:var(--t1)}
.db-total b{font-size:20px}

/* zone pictures */
.zp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.zp{margin:0;background:var(--s1);border:1px solid var(--b1);border-radius:13px;padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.zp-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.zp-h b{font:700 14px var(--sans);color:var(--t1)}
.zp svg{width:100%;height:auto;display:block}
.zp figcaption{font-size:12px;line-height:1.5;color:var(--t1)}
.zp-empty{justify-content:flex-start}
.zb rect{stroke:none}
.zb-above rect,.l-above{fill:color-mix(in srgb,var(--long) 12%,transparent);background:color-mix(in srgb,var(--long) 12%,transparent)}
.zb-top rect,.l-top{fill:color-mix(in srgb,var(--long) 36%,transparent);background:color-mix(in srgb,var(--long) 36%,transparent)}
.zb-upper rect{fill:color-mix(in srgb,var(--t3) 11%,transparent)}
.zb-lower rect,.l-in{fill:color-mix(in srgb,var(--t3) 17%,transparent);background:color-mix(in srgb,var(--t3) 14%,transparent)}
.zb-bottom rect,.l-bottom{fill:color-mix(in srgb,var(--short) 34%,transparent);background:color-mix(in srgb,var(--short) 34%,transparent)}
.zb-below rect,.l-below{fill:color-mix(in srgb,var(--short) 12%,transparent);background:color-mix(in srgb,var(--short) 12%,transparent)}
.zb text{fill:var(--t2);font:600 10.5px var(--sans)}
.zb.here rect{stroke:var(--t1);stroke-width:1.5;stroke-dasharray:4 3}
.zb.here text{fill:var(--t1);font-weight:800}
.zb{animation:zp-fade .5s ease-out both}
.zp-mid{stroke:var(--t3);stroke-dasharray:2 4;stroke-width:1}
.zp-px{fill:var(--t2);font:10.5px var(--mono)}
.zp-mbox{fill:color-mix(in srgb,var(--ret) 10%,transparent);stroke:var(--ret);stroke-width:1.6;stroke-dasharray:6 4;animation:zp-fade .4s ease-out both,zp-march 1s linear 3}
.zp-mbox.soft{fill:none;stroke-dasharray:2 4}
.zp-mlabel{fill:var(--ret);font:700 10.5px var(--sans);animation:zp-fade .4s ease-out both}
.zc{transform-box:fill-box;transform-origin:center;animation:zp-grow .45s cubic-bezier(.2,.8,.2,1) both}
.zc line{stroke-width:1.5}
.zc rect{stroke:var(--s1);stroke-width:1.5}
.zc.past line,.zc.child line{stroke:var(--t3)}.zc.past rect,.zc.child rect{fill:var(--t3)}
.zc.mother line{stroke:var(--ret)}.zc.mother rect{fill:var(--ret)}
.zc.now.up line{stroke:var(--long)}.zc.now.up rect{fill:var(--long)}
.zc.now.down line{stroke:var(--short)}.zc.now.down rect{fill:var(--short)}
.zp-arrow{font-size:15px;animation:zp-pop .35s ease-out both,zp-bob 1s ease-in-out 3}
.zp-arrow.up{fill:var(--long)}.zp-arrow.down{fill:var(--short)}
.zp-now{animation:zp-slide .8s cubic-bezier(.2,.8,.2,1) both}
.zp-now line{stroke:var(--t1);stroke-width:1.2;stroke-dasharray:4 3}
.zp-now circle{fill:var(--t1);stroke:var(--s1);stroke-width:2}
.zp-now rect{fill:var(--t1)}
.zp-now text{fill:var(--bg);font:700 11px var(--mono)}
.zp-steps{display:flex;align-items:center;gap:8px}
.zp-steps svg{width:150px;flex-shrink:0}
.zp-steps rect{fill:color-mix(in srgb,var(--t3) 35%,transparent);transform-box:fill-box;transform-origin:bottom;animation:zp-grow .4s ease-out both}
.zp-steps rect.now{fill:var(--acc)}
.zp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:11.5px;color:var(--t2)}
.zp-legend .lg{display:inline-block;width:14px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.l-mother{background:var(--ret)}.l-child{background:var(--t3)}
.l-now{background:linear-gradient(90deg,var(--long) 50%,var(--short) 50%)}
.l-price{height:0!important;border-top:2px dashed var(--t1);border-radius:0!important}
.zp-note{margin:4px 0 0}
@keyframes zp-fade{from{opacity:0}}
@keyframes zp-grow{from{transform:scaleY(0);opacity:0}}
@keyframes zp-pop{from{opacity:0;transform:scale(.4)}}
@keyframes zp-bob{50%{transform:translateY(-3px)}}
@keyframes zp-march{to{stroke-dashoffset:-20}}
@keyframes zp-slide{from{transform:translateY(var(--from));opacity:0}}
.zp-arrow{transform-box:fill-box;transform-origin:center}

/* raw numbers (closed) */
.dt-raw{margin-top:22px;border:1px solid var(--b1);border-radius:12px;background:var(--s1);padding:10px 14px}
.dt-raw summary{cursor:pointer;font-weight:650;font-size:13px;color:var(--t1)}
.dt-raw[open] summary{margin-bottom:10px}
.dt-raw .dt-tw{margin-bottom:10px}
.dt-t{width:100%;border-collapse:collapse;font-size:12.5px;color:var(--t1)}
.dt-t th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);padding:8px 10px;border-bottom:1px solid var(--b1);white-space:nowrap}
.dt-t td{padding:7px 10px;border-bottom:1px solid var(--b1);white-space:nowrap;font-variant-numeric:tabular-nums}
.dt-t tbody tr:last-child td{border-bottom:0}
.dt-foot{margin-top:18px;font-size:11px;color:var(--t3)}

@media (prefers-reduced-motion:reduce){.dt-panel *{animation:none!important}}
@media (max-width:900px){.zp-grid{grid-template-columns:1fr}}
@media (max-width:700px){.dt-panel{padding:0 14px 24px}.dt-head h2{font-size:17px}.db-row{grid-template-columns:110px 1fr 90px}.dt-verdict{flex-direction:column;align-items:flex-start}}
`;
