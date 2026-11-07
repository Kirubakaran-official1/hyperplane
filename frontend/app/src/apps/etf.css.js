// ETF Analyser "Explore" styles (design system tokens, ds.css.js). The page header is the shared .hp-band (shell.css.js).
export const CSS = `
.ef{--ef-ai:#8b5cf6;display:flex;flex-direction:column;gap:12px}
.ef .hp-band{margin-bottom:0}.ef .hp-band p{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:600;color:var(--t1)}
.ef-sub2{font-weight:400;color:var(--t2)}
.ef-empty{display:flex;align-items:center;gap:8px;padding:20px 24px;color:var(--t2);font-size:13px}
.ef-sh{display:flex;align-items:center;gap:6px;margin-bottom:8px}.ef-sh b{display:flex;align-items:center;gap:6px;font:700 15px var(--sans);color:var(--t1)}
.ef-list{padding:0;overflow:hidden}
.ef-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--b1)}
.ef-tools select{width:auto;height:32px;padding:0 8px;font-size:12px}
.ef-q{width:180px;height:32px;padding:0 10px;font-size:12px}
.ef-tog{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);font:600 12px var(--sans);cursor:pointer;white-space:nowrap}
.ef-tog.on{border-color:var(--acc);background:var(--adim);color:var(--acc)}.ef-tog:disabled{opacity:.6;cursor:default}
.ef-mk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--adim);font-size:13px;color:var(--t2)}.ef-mk b{color:var(--t1)}
.ef-clr{margin-left:auto;display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:var(--acc);font:600 12px var(--sans);cursor:pointer}
.ef-th,.ef-row{display:grid;grid-template-columns:36px minmax(0,1.6fr) minmax(0,1fr) 90px 90px;gap:14px;align-items:center}
.ef-th{padding:8px 14px;font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--b1)}
.ef-row{width:100%;padding:9px 14px;border:0;border-bottom:1px solid var(--b1);background:none;cursor:pointer;font:inherit;color:inherit;text-align:left}
.ef-row:hover{background:var(--s2)}.ef-row.rec{background:color-mix(in srgb,var(--acc) 4%,transparent)}.ef-row.rec:hover{background:var(--s2)}
.ef-rk{font:600 12px var(--sans);color:var(--t3);font-feature-settings:"tnum"}
.ef-n{display:flex;flex-direction:column;gap:2px;min-width:0}.ef-n b{display:flex;align-items:center;gap:6px;font:600 14px/20px var(--sans);color:var(--t1)}
.ef-n small{font-size:12px;line-height:16px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ef-arr{display:flex;gap:4px;font-style:normal}
.ef-arr i{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:6px;font:700 12.5px/1 var(--sans);font-style:normal;background:var(--s2);color:var(--t2)}
.ef-arr i small{font:700 9.5px var(--sans);letter-spacing:.03em;opacity:.75}
.ef .ef-arr i.c-good{background:var(--longd);color:var(--long)}.ef .ef-arr i.c-bad{background:var(--shortd);color:var(--short)}.ef .ef-arr i.c-side{background:var(--s3);color:var(--t1)}
.ef-ease{font-size:12px;color:var(--t2)}
.ef-none{padding:16px;color:var(--t3);font-size:13px}
.ef-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;font-size:12px;color:var(--t2)}
.ef-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;background:var(--acc);color:var(--on-acc,#fff);font:600 11px/18px var(--sans);white-space:nowrap}
.ef-badge.sm{padding:0 7px;font-size:10.5px;line-height:18px}
.ef-st{display:grid;grid-template-columns:80px auto;grid-template-rows:auto auto;column-gap:10px;align-items:center}
.ef-bar{grid-row:1/3;position:relative;height:8px;border-radius:999px;background:var(--s3)}
.ef-bar::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--b2)}
.ef-bar i{position:absolute;top:0;bottom:0;border-radius:999px;background:currentColor}
.ef-st b{font:700 14px/18px var(--sans);font-feature-settings:"tnum"}.ef-st small{font-size:11px;color:var(--t2)}
.ef-st.big{grid-template-columns:130px auto}.ef-st.big .ef-bar{height:10px}.ef-st.big b{font-size:24px;line-height:30px}
.ef-na{font-size:12px;color:var(--t3)}
.ef-ov{z-index:100}
.ef-panel{width:min(760px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:20px 22px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.ef-ph{display:flex;justify-content:space-between;gap:12px}.ef-ph h2{margin:6px 0 0;font:700 22px/28px var(--sans);color:var(--t1)}.ef-ph h2 small{font:500 13px var(--sans);color:var(--t2)}
.ef-ph .x{position:static;flex:none}
.ef-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ef-tags span{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;background:var(--s2);font-size:12px;color:var(--t2)}
.ef-tags .rec{background:var(--adim);color:var(--acc)}
.ef-take{display:flex;gap:8px;align-items:flex-start;margin:0;padding:10px 12px;border-radius:8px;font-size:13px;line-height:20px;color:var(--t1);
  background:linear-gradient(90deg,color-mix(in srgb,var(--ef-ai) 10%,var(--s1)),color-mix(in srgb,var(--acc) 6%,var(--s1)))}
.ef-verdict{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 14px;border-radius:8px;background:var(--s2)}
.ef-vt{display:flex;align-items:center;gap:6px;font:700 16px/22px var(--sans)}
.ef-verdict.t-good .ef-vt{color:var(--long)}.ef-verdict.t-bad .ef-vt{color:var(--short)}
.ef-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ef-fact{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:8px;border:1px solid var(--b1);min-width:0}
.ef-fact>b{font:700 15px/20px var(--sans);color:var(--t1)}.ef-fact>small{font-size:12px;color:var(--t2)}
.ef-tfs{display:flex;gap:12px;flex-wrap:wrap}.ef-tfs span{display:flex;flex-direction:column}.ef-tfs small{font-size:11px;color:var(--t3)}.ef-tfs b{font:700 13px/18px var(--sans)}
.ef-recbox{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:var(--adim);font-size:13px;line-height:20px;color:var(--t1)}
.ef-notrec{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:8px;background:var(--s2);color:var(--t2);font-size:13px;line-height:20px}
.ef-peers{display:flex;flex-direction:column;gap:6px}
.ef-peer{display:grid;grid-template-columns:minmax(0,1fr) 230px;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;border:1px solid var(--b1);background:var(--s1);cursor:pointer;font:inherit;color:inherit;text-align:left}
.ef-peer:hover{border-color:var(--acc)}.ef-peer>span:first-child{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.ef-peer small{font-size:12px;color:var(--t3)}
@media (max-width:640px){
  .ef-th{display:none}.ef-row{grid-template-columns:28px minmax(0,1fr) auto;row-gap:4px}.ef-row .ef-arr,.ef-row .ef-ease{display:none}
}
/* grouped sections (owner, 2026-11-06) */
.ef .c-side{color:var(--t2)}.ef .c-good{color:var(--long)}.ef .c-bad{color:var(--short)}
.ef-bar2{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px}
.ef-bar2 .ef-q{flex:1 1 260px;max-width:420px;height:36px}
.ef-seg{display:inline-flex;border:1px solid var(--b2);border-radius:8px;overflow:hidden}
.ef-seg button{height:34px;padding:0 12px;border:0;background:var(--s1);color:var(--t2);font:600 12.5px var(--sans);cursor:pointer}
.ef-seg button+button{border-left:1px solid var(--b2)}.ef-seg button.on{background:var(--adim);color:var(--acc)}
.ef-hint{display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:12px;color:var(--t3)}
.ef-sec{padding:0;overflow:hidden}
.ef-sech{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;border:0;border-bottom:1px solid var(--b1);background:none;cursor:pointer;font:inherit;color:inherit;text-align:left}
.ef-sech>b{display:flex;align-items:center;gap:8px;font:700 15px var(--sans);color:var(--t1)}
.ef-secn{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--t2)}.ef-secn i{font-style:normal;font-weight:600}
.ef-chev{margin-left:auto;font-size:12px;color:var(--acc);font-weight:600}
@media (max-width:640px){.ef-hint{margin-left:0}.ef-tcard .hp-t:not(.ef-all) th:nth-child(3),.ef-tcard .hp-t:not(.ef-all) td:nth-child(3),.ef-tcard .hp-t:not(.ef-all) th:nth-child(4),.ef-tcard .hp-t:not(.ef-all) td:nth-child(4),.ef-tcard .ef-all th:nth-child(2),.ef-tcard .ef-all td:nth-child(2),.ef-tcard .ef-all th:nth-child(4),.ef-tcard .ef-all td:nth-child(4),.ef-tcard .ef-all th:nth-child(5),.ef-tcard .ef-all td:nth-child(5){display:none}}
.ef-peer{min-height:58px}.ef-peer .ef-st{grid-template-columns:110px 1fr;justify-self:stretch}.ef-peer .ef-st b{text-align:left}
@media (max-width:640px){.ef-peer{grid-template-columns:1fr}}
.ef-tcard{padding:0;overflow:hidden}.ef-tcard .hp-tbar .ef-q{flex:1 1 240px;max-width:380px;height:34px}
.ef-tcard .hp-tbar .ef-hint{margin-left:auto}
.ef-tcard .ef-st{grid-template-columns:80px auto}
.ef-tcard tr.ef-mrow td:first-child{box-shadow:inset 3px 0 0 var(--b2)}.ef-tcard tr.ef-mrow.t-good td:first-child{box-shadow:inset 3px 0 0 var(--long)}
.ef-tcard tr.ef-mrow.t-mid td:first-child{box-shadow:inset 3px 0 0 var(--mixed)}.ef-tcard tr.ef-mrow.t-bad td:first-child{box-shadow:inset 3px 0 0 var(--short)}
.ef-tcard .sub .ic{vertical-align:-1px;color:var(--acc)}
.ef-buy{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;background:var(--adim);font-size:12.5px;line-height:18px;color:var(--t1)}
.ef-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 12px}
.ef-stat{display:flex;flex-direction:column;gap:3px;padding:14px 16px 12px;border-radius:10px;border:1px solid var(--b1);background:var(--s1);text-align:left;font-family:var(--sans);color:inherit;min-width:0;
  border-top:3px solid var(--c,var(--acc));transition:transform .15s,box-shadow .15s,border-color .15s}
button.ef-stat{cursor:pointer}button.ef-stat:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(15,27,45,.1)}button.ef-stat:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.ef-stat-all{--c:var(--t1);background:linear-gradient(160deg,var(--s1),var(--s2))}
.ef-stat .px-label{display:flex;align-items:center;gap:6px;margin:0}.ef-stat .px-label i{width:9px;height:9px;border-radius:3px;background:var(--c);flex:none}
.ef-stat b{font:700 28px/34px var(--sans);color:var(--t1);font-feature-settings:"tnum"}.ef-stat small{font-size:12px;color:var(--t2)}
.ef-sbar{display:flex;gap:2px;height:6px;border-radius:3px;overflow:hidden;margin-top:6px;background:var(--s3)}
.ef-sbar i{flex-basis:0;min-width:0}.ef-sbar i.up{background:var(--long)}.ef-sbar i.sd{background:var(--t3)}.ef-sbar i.dn{background:var(--short)}
.ef-stat em{display:flex;gap:10px;font:600 11.5px var(--sans);font-style:normal;color:var(--t2);margin-top:2px}.ef-stat em .up{color:var(--long)}.ef-stat em .dn{color:var(--short)}
/* round 8 (owner 2026-11-07): every ETF by default, "Best in segment" narrows it; the About block of the card */
.ef-bestbtn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--b2);background:var(--s1);color:var(--t1);font:600 12.5px var(--sans);cursor:pointer;
  transition:background .15s,border-color .15s,color .15s}
.ef-bestbtn:hover{background:var(--s2)}.ef-bestbtn:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.ef-bestbtn em{font-style:normal;font-size:11px;padding:0 7px;border-radius:999px;background:var(--s3);color:var(--t2)}
.ef-bestbtn.on{background:linear-gradient(135deg,var(--acc),#8b5cf6);border-color:transparent;color:#fff}.ef-bestbtn.on em{background:rgba(255,255,255,.25);color:#fff}
.ef-tk{display:flex;align-items:center;gap:5px}.ef-tk .ic{color:var(--mixed)}
.ef-erow td:nth-child(2){color:var(--t2)}
.ef-about{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:10px;border:1px solid var(--b1);background:var(--s2)}
.ef-about p{margin:0;font-size:13.5px;line-height:21px;color:var(--t1)}.ef-about .sym{color:var(--acc);font-weight:600}
.ef-about ul{margin:2px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:19px;color:var(--t2)}.ef-about li b{color:var(--t1)}
.ef-vol{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px}.ef-vol b{font:600 13px var(--sans);color:var(--t1);font-feature-settings:"tnum"}.ef-vol small{font-size:11.5px;color:var(--t2)}
.ef-mkt{max-width:380px}.ef-mkt b{font:600 13px/18px var(--sans);color:var(--t1)}
.ef-mkt .sub,.ef-what{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;font-size:12px;line-height:17px;color:var(--t2)}
.ef-what{margin-bottom:1px}
`;
