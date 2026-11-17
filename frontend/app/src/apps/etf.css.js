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
/* round 23 (owner 2026-11-15): the basket — + on every row, the bar at the bottom, the drawer, the basket analyser */
.ef-c1{display:flex;align-items:flex-start;gap:10px;min-width:0}.ef-c1>div{min-width:0}
.ef-add{flex:none;display:inline-grid;place-items:center;width:26px;height:26px;margin-top:1px;border-radius:50%;border:1px solid var(--b2);background:var(--s1);color:var(--t2);cursor:pointer;
  transition:background .15s,border-color .15s,color .15s,transform .15s}
.ef-add:hover{border-color:var(--acc);color:var(--acc);transform:scale(1.06)}.ef-add:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.ef-add.on{background:var(--acc);border-color:var(--acc);color:#fff;animation:efPop .28s ease-out}
@keyframes efPop{0%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.ef-phr{display:flex;align-items:flex-start;gap:8px;flex:none}
.ef-inb{border-color:color-mix(in srgb,var(--long) 50%,transparent);color:var(--long);background:color-mix(in srgb,var(--long) 8%,var(--s1))}
.ef-bbar{position:sticky;bottom:14px;z-index:30;align-self:center;display:flex;align-items:center;gap:10px;max-width:min(640px,100%);padding:8px 8px 8px 10px;border-radius:14px;
  border:1px solid var(--b2);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);box-shadow:0 12px 32px rgba(15,27,45,.22);animation:efUp .25s ease-out}
@keyframes efUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.ef-bbl{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;min-width:0;padding:2px 6px;border-radius:10px}.ef-bbl:hover{background:var(--s2)}.ef-bbl:focus-visible{box-shadow:var(--ds-focus)}
.ef-bbi{position:relative;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--adim);color:var(--acc);flex:none}
.ef-bbn{position:absolute;top:-6px;right:-7px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--acc);color:#fff;font:700 11px/18px var(--sans);font-style:normal;text-align:center;
  box-shadow:0 0 0 2px var(--bg);animation:efPop .3s ease-out}
.ef-bbt{display:flex;flex-direction:column;min-width:0}.ef-bbt b{font:700 13.5px/18px var(--sans);color:var(--t1)}
.ef-bbt small{font:600 11.5px/16px var(--mono,monospace);color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
.ef-bbar .px-btn{flex:none;white-space:nowrap}
.ef-bdov{z-index:110;justify-content:flex-end;align-items:stretch;padding:0}
.ef-bd{width:min(420px,100%);height:100%;display:flex;flex-direction:column;gap:12px;padding:18px 18px 16px;background:var(--bg);border-left:1px solid var(--b2);box-shadow:-20px 0 60px rgba(0,0,0,.25);
  animation:efIn .22s ease-out;overflow:hidden}
@keyframes efIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.ef-bd,.ef-bbar,.ef-add.on,.ef-bbn{animation:none}}
.ef-bdh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.ef-bdh h3{margin:4px 0 0;font:700 20px var(--sans);color:var(--t1)}.ef-bdh h3 small{font:500 13px var(--sans);color:var(--t3)}
.ef-bdh .x{position:static}
.ef-bdtypes{display:flex;flex-direction:column;gap:6px}.ef-bdbar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--s3)}.ef-bdbar i{flex-basis:0;min-width:0}
.ef-bdleg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--t2)}.ef-bdleg span{display:inline-flex;align-items:center;gap:5px}.ef-bdleg i{width:8px;height:8px;border-radius:2px}
.ef-bdleg b{color:var(--t1)}
.ef-bdwarn,.ef-bknote2{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border-radius:9px;background:color-mix(in srgb,var(--mixed) 11%,transparent);font-size:12.5px;line-height:18px;color:var(--t1)}
.ef-bdwarn .ic,.ef-bknote2 .ic{flex:none;margin-top:2px;color:var(--mixed)}
.ef-bknote2{background:var(--adim)}.ef-bknote2 .ic{color:var(--acc)}.ef-bknote2 .sp-tolink{display:inline;padding:0;margin:0}
.ef-bdl{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin:0 -4px;padding:0 4px}
.ef-bdi{display:grid;grid-template-columns:minmax(0,1fr) auto 28px;align-items:center;gap:10px;padding:9px 10px 9px 12px;border-radius:10px;border:1px solid var(--b1);background:var(--s1);
  box-shadow:inset 3px 0 0 var(--t,var(--b2))}
.ef-bdn{display:flex;flex-direction:column;min-width:0}.ef-bdn b{display:flex;align-items:center;gap:4px;font:700 13px var(--mono,monospace);color:var(--t1)}.ef-bdn b .ic{color:var(--mixed)}
.ef-bdn small{font-size:12px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ef-bdst{font:600 12px var(--sans);white-space:nowrap}
.ef-bdx{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:0;background:none;color:var(--t3);cursor:pointer}.ef-bdx:hover{background:var(--s2);color:var(--short)}
.ef-bdempty{padding:24px 6px;text-align:center;color:var(--t3);font-size:13px}
.ef-bdf{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid var(--b1)}
.ef-bks{position:relative;display:flex;align-items:center;gap:8px;width:100%}.ef-bks>.ic{position:absolute;left:11px;color:var(--t3);pointer-events:none}
.ef-bks input{width:100%;height:36px;padding-left:32px}
.ef-bkl{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;display:flex;flex-direction:column;padding:4px;border-radius:10px;border:1px solid var(--b2);background:var(--bg);box-shadow:0 14px 34px rgba(15,27,45,.2);max-height:320px;overflow-y:auto}
.ef-bkl button{all:unset;cursor:pointer;display:grid;grid-template-columns:110px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 9px;border-radius:7px}
.ef-bkl button.on,.ef-bkl button:hover{background:var(--s2)}.ef-bkl button:disabled{cursor:default;opacity:.55}
.ef-bkl b{display:flex;align-items:center;gap:4px;font:700 12.5px var(--mono,monospace);color:var(--t1)}.ef-bkl b .ic{color:var(--mixed)}
.ef-bkl span{font-size:12.5px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ef-bkl span small{margin-left:6px;color:var(--t3)}
.ef-bkl em{font:600 11.5px var(--sans);font-style:normal;color:var(--acc)}
.ef-bkbar .px-search{flex:1 1 280px;min-width:220px}
.ef-bkname{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px}.ef-bkname:hover b{color:var(--acc)}.ef-bkname:focus-visible{box-shadow:var(--ds-focus);border-radius:4px}
.ef-bkname em{font-style:normal}
.ef-bkabout{font-size:12px;line-height:17px;color:var(--t3)}
.px-nodata{font-size:12px;color:var(--t3)}
.ef-bkacts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:auto}
.ef-bknote{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--t2)}
.ef-bkchk{display:flex;flex-direction:column;gap:10px;border-left:3px solid var(--long)}.ef-bkchk.warn{border-left-color:var(--mixed)}
.ef-bkchh{display:flex;align-items:center;gap:12px}.ef-bkchh .pf-wic{flex:none}.ef-bkchh>span:last-child{display:flex;flex-direction:column;gap:2px}
.ef-bkchh b{display:flex;align-items:center;gap:6px;font:700 15px var(--sans);color:var(--t1)}.ef-bkchh small{font-size:12.5px;color:var(--t2)}
.ef-bkchk.clear .pf-wic{color:var(--long)}.ef-bkchk.warn .pf-wic{color:var(--mixed)}
.ef-bkchl{display:flex;flex-direction:column;gap:6px}
.ef-bkchr{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:9px 12px;border-radius:10px;border:1px solid var(--b1);background:var(--s1)}
.ef-bkchr.twice{grid-template-columns:1fr}
.ef-bkchf{display:flex;flex-direction:column;gap:2px;min-width:0}.ef-bkchf b{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--t1)}.ef-bkchf b .ic{color:var(--mixed)}
.ef-bkchf small{font-size:12px;color:var(--t2)}
.ef-bkbuy{display:flex;flex-direction:column;gap:12px;padding:16px 18px}
.ef-bkbrow{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.ef-bkbrow .bd-amt{max-width:260px}
tr.ef-bkoff td{opacity:.6}
.ef-bkbf{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--t2)}.ef-bkbf b{color:var(--t1)}
.ef-bkw{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.ef-bkwr{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 84px 80px;align-items:center;gap:12px}
.ef-bkwr>span:first-child{display:flex;flex-direction:column;min-width:0}.ef-bkwr>span:first-child b{font:700 12.5px var(--mono,monospace);color:var(--t1)}
.ef-bkwr>span:first-child small{font-size:11.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ef-bkwn{display:inline-flex;align-items:center;gap:4px}.ef-bkwn input{width:58px;height:30px;padding:0 6px;text-align:right}.ef-bkwn em{font-style:normal;color:var(--t3)}
.ef-bkwa{font:600 12.5px var(--sans);color:var(--t2);text-align:right;font-feature-settings:"tnum"}
.ef-bkwt{display:flex;align-items:center;gap:8px;font:600 12.5px var(--sans)}.ef-bkwt.ef-wok{color:var(--long)}.ef-bkwt.ef-wno{color:var(--short)}.ef-bkwt .px-btn{margin-left:auto}
.ef-bkgo{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ef-bkgo .pf-go{flex:1;margin:0}
.ef-bkmini{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.ef-bkmini span{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:12px;border:1px solid var(--b1);font:600 11.5px var(--mono,monospace);color:var(--t1)}
.ef-bkmini i{width:7px;height:7px;border-radius:50%;background:var(--t3)}.ef-bkmini .good i{background:var(--long)}.ef-bkmini .mid i{background:var(--mixed)}.ef-bkmini .bad i{background:var(--short)}
.ef-bkback{display:flex}.ef-bkback .px-btn .ic{transform:rotate(180deg)}
@media (max-width:640px){
  .ef-bbar{width:100%;max-width:none}.ef-bbt small{max-width:150px}.ef-bbar .px-btn{padding:0 10px}
  .ef-bkchr{grid-template-columns:1fr auto;row-gap:6px}.ef-bkchr .hp-arrow{display:none}
  .ef-bkwr{grid-template-columns:minmax(0,1fr) 76px 64px}.ef-bkwr .al-range{grid-column:1/-1;grid-row:2}
  .ef-bkl button{grid-template-columns:90px minmax(0,1fr) auto}
  .ef-phr .px-btn{padding:0 10px}
}
`;
