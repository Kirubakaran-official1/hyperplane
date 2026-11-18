// Hyperplane Planner (round 22 / 22b) — every class starts with "pl-" so nothing leaks into the other applications (and nothing leaks in).
// The main area reads the width it is given (container queries), so the dashboard works beside the notebook list, alone and on a phone.
export const CSS = `
.pl .pl-ic{flex:none;display:block}
.pl .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pl-sp{flex:1 1 auto}
.pl-grow{flex:1 1 auto;min-width:0}
.pl-muted{margin:0;color:var(--t2);font-size:12.5px;line-height:18px}
.pl-pad{padding:10px 4px}
.pl-wait{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:48px 16px;color:var(--t2);font-size:13.5px}
.pl-link{border:0;background:none;color:var(--acc);font:600 12.5px var(--sans);padding:4px 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.pl-link:hover{background:var(--adim)}
.pl-ib{width:32px;height:32px;display:inline-grid;place-items:center;flex:none;padding:0;border:0;border-radius:8px;background:none;color:var(--t2);cursor:pointer;transition:background .15s,color .15s,opacity .15s}
.pl-ib:hover:not(:disabled){background:var(--s2);color:var(--t1)}
.pl-ib.on{background:var(--adim);color:var(--acc)}
.pl-ib:disabled{opacity:.35;cursor:default}
.pl-ib:focus-visible,.pl-rr:focus-visible,.pl-tabs button:focus-visible,.pl-seg button:focus-visible,.pl-dc:focus-within{outline:none;box-shadow:var(--ds-focus)}
.pl-pin{color:var(--acc)}
.px-btn.on{box-shadow:inset 0 0 0 1px var(--acc);color:var(--acc)}

/* the band: search + New */
.pl-bandr{display:flex;align-items:center;gap:8px}
.pl-search{position:relative;display:flex;align-items:center;gap:6px;width:320px;height:36px;padding:0 6px 0 10px;border-radius:8px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--b2);color:var(--t3);transition:box-shadow .15s}
.pl-search:focus-within{box-shadow:inset 0 0 0 1px var(--acc)}
.pl-search input{flex:1;min-width:0;height:34px;padding:0;border:0;background:none;box-shadow:none;color:var(--t1);font:500 13px var(--sans)}
.pl-search input:focus,.pl-search input:hover{border:0;box-shadow:none}
.pl-search kbd{flex:none;font:600 10.5px var(--sans);color:var(--t3);padding:2px 6px;border-radius:4px;box-shadow:inset 0 0 0 1px var(--b2)}
.pl-x{display:inline-grid;place-items:center;flex:none;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:var(--s2);color:var(--t2);cursor:pointer}
.pl-x:hover{background:var(--s3);color:var(--t1)}
.pl-qpop{position:absolute;top:calc(100% + 6px);right:0;width:min(460px,calc(100vw - 32px));max-height:min(60vh,480px);overflow:auto;z-index:35;padding:6px;border-radius:12px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.28);animation:plPop .16s ease}
.pl-qpop button{display:flex;align-items:flex-start;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:none;color:var(--t1);text-align:left;cursor:pointer}
.pl-qpop button .pl-ic{margin-top:2px;color:var(--t3)}
.pl-qpop button:hover{background:var(--s2)}
.pl-qpop span{display:flex;flex-direction:column;min-width:0}
.pl-qpop b{font:600 13px/18px var(--sans);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-qpop small{font-size:12px;line-height:17px;color:var(--t2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pl-new>.px-btn{background:var(--ds-action-bg);color:var(--on-acc);box-shadow:none;font-weight:600}
.pl-new>.px-btn:hover{background:var(--ds-action-hover)}

/* menus */
.pl-menu{position:relative;display:inline-flex}
.pl-mpop{position:absolute;top:calc(100% + 6px);left:0;z-index:36;min-width:230px;max-height:min(70vh,520px);overflow:auto;padding:4px;border-radius:10px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.28);animation:plPop .16s ease}
.pl-mpop.r{left:auto;right:0}
/* round 23: floating panels live in a portal at the end of <body> (.pl-float) — one layer above every Planner layer (a maximised widget 43, a pop-up 60, the toast 90) */
.pl-float{position:relative;z-index:100}
.pl-mpop button{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;border:0;border-radius:6px;background:none;color:var(--t1);font:500 13px var(--sans);text-align:left;cursor:pointer;white-space:nowrap}
.pl-mpop button .pl-ic{color:var(--t2)}
.pl-mpop button:hover:not(:disabled){background:var(--s2)}
.pl-mpop button.danger,.pl-mpop button.danger .pl-ic{color:var(--short)}
.pl-mpop button:disabled{opacity:.45;cursor:default}
.pl-mpop button small{margin-left:auto;color:var(--t3)}
.pl-mpop .pl-mon{margin-left:auto;color:var(--acc)!important}
.pl-swi{flex:none;width:12px;height:12px;border-radius:50%;background:var(--nb)}
.pl-swi.none{background:none}
.pl-msep{height:1px;background:var(--b1);margin:4px 2px}
.pl-mhead{padding:8px 10px 4px;font:700 10.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}

/* the screen: notebooks on the left, the main area beside them */
.pl-shell{display:grid;grid-template-columns:208px minmax(0,1fr);gap:10px;align-items:start}
.pl-shell.min{grid-template-columns:52px minmax(0,1fr)}
.pl-shell.wide,.pl-shell:not(:has(.pl-side)){grid-template-columns:minmax(0,1fr)}
.pl-shell.wide .pl-side{display:none}
.pl-side{position:sticky;z-index:6;top:12px;max-height:calc(100vh - 150px);overflow:auto;scrollbar-width:thin}
.pl-body{container:plv/inline-size;min-width:0}
.pl-rail{display:flex;flex-direction:column;gap:6px;padding:10px 8px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;box-shadow:var(--ds-shadow-card)}
.pl-rh{display:flex;align-items:center;gap:2px;padding:0 0 0 6px}
.pl-rail.min{align-items:center;gap:6px;padding:8px 6px}
.pl-ri{display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--nb,var(--t3)) 16%,var(--s1));color:var(--nb,var(--t2));cursor:pointer;transition:box-shadow .12s}
.pl-ri b{font:700 13px var(--sans)}
.pl-ri:hover{box-shadow:0 0 0 2px var(--b2)}
.pl-ri.on{box-shadow:0 0 0 2px var(--nb,var(--acc))}
.pl-rh b{font:700 11px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.pl-rh .pl-ib{width:28px;height:28px}
.pl-rh #pl-nb-add{color:var(--acc)}
.pl-rq{height:30px;padding:0 10px;font-size:12.5px}
.pl-rl{display:flex;flex-direction:column;gap:1px}
.pl-rr{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:34px;padding:0 2px 0 9px;border:0;border-radius:8px;background:none;color:var(--t2);font:500 13px var(--sans);text-align:left;cursor:pointer;transition:background .12s,color .12s}
.pl-rr>i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--nb)}
.pl-rr>.pl-ic{color:var(--t3)}
.pl-rr>span:not(.pl-rm){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-rr small{color:var(--t3);font-size:11.5px;font-feature-settings:"tnum";padding-right:6px}
.pl-rr:hover{background:var(--s2);color:var(--t1)}
.pl-rr.on{background:color-mix(in srgb,var(--nb,var(--acc)) 12%,var(--s1));color:var(--t1);font-weight:600;box-shadow:inset 3px 0 0 var(--nb,var(--acc))}
.pl-rm{display:inline-flex}
.pl-rm>.pl-menu>.pl-ib{opacity:0;transition:opacity .12s}
.pl-rm>.pl-menu>.pl-ib[aria-expanded="true"]{opacity:1}
.pl-rm .pl-ib{width:26px;height:26px}
.pl-rr:hover .pl-rm>.pl-menu>.pl-ib,.pl-rr:focus-within .pl-rm>.pl-menu>.pl-ib{opacity:1}
.pl-rr:hover small,.pl-rr:focus-within small{display:none}
.pl-rr.edit{cursor:default;padding-right:4px}
.pl-rr.edit input{height:28px;padding:0 6px;font-size:13px}
.pl-dig{margin-top:6px;padding:10px 4px 2px;border-top:1px solid var(--b1);font-size:12px!important;line-height:16px}
.pl-warn.sm{flex-direction:column;align-items:stretch;gap:8px;margin:6px 0;padding:8px 10px;font-size:12.5px}
.pl-warn.sm>div{display:flex;gap:6px}
.pl-warn.sm .px-btn{height:30px;padding:0 10px;font-size:12px}
.pl-nbpick{position:relative}
.pl-nbpop{position:absolute;top:calc(100% + 6px);left:0;z-index:36;width:min(300px,calc(100vw - 32px));max-height:70vh;overflow:auto;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.3);animation:plPop .16s ease}
.pl-dot{width:9px;height:9px;border-radius:50%;background:var(--nb)}

/* the bar: Dashboard · Calendar, filters, download */
.pl-bar{margin:0 0 8px}
.pl-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--s2);box-shadow:inset 0 0 0 1px var(--b1)}
.pl-tabs button{flex:none;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;border:0;border-radius:8px;background:none;color:var(--t2);font:600 13px var(--sans);cursor:pointer;transition:background .15s,color .15s}
.pl-tabs button:hover{color:var(--t1)}
.pl-tabs button.on{background:var(--s1);color:var(--t1);box-shadow:0 1px 2px rgba(15,27,45,.12),0 0 0 1px var(--b1)}
.pl-tabs button.on .pl-ic{color:var(--acc)}
.pl-filt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
.pl-filt .ms-btn{height:34px}
.pl-fbtn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:0;border-radius:8px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--b2);color:var(--t1);font:500 13px var(--sans);cursor:pointer;white-space:nowrap}
.pl-fbtn .pl-ic{color:var(--t2)}
.pl-fbtn.on{box-shadow:inset 0 0 0 1px var(--accb);color:var(--acc);background:var(--adim)}
.pl-fbtn.on .pl-ic{color:var(--acc)}
.pl-dr{position:relative}
.pl-drpop{position:absolute;top:calc(100% + 6px);right:0;z-index:36;width:310px;padding:12px;border-radius:12px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:10px;animation:plPop .16s ease}
.pl-drq{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pl-drq button{height:30px;border:0;border-radius:6px;background:var(--s2);color:var(--t1);font:500 12.5px var(--sans);cursor:pointer}
.pl-drq button:hover{background:var(--s3)}
.pl-drq button.on{background:var(--adim);color:var(--acc);box-shadow:inset 0 0 0 1px var(--accb)}
.pl-drc{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pl-drc label{display:flex;flex-direction:column;gap:4px;font:600 11.5px var(--sans);color:var(--t2)}
.pl-drc input{height:34px;padding:0 8px;font-size:12.5px}
.pl-drf{display:flex;justify-content:flex-end;gap:8px}

/* the dashboard */
.pl-dash{display:grid;grid-template-columns:minmax(340px,1fr) minmax(0,1.75fr);grid-template-rows:minmax(0,1.35fr) minmax(0,1fr);gap:8px;height:max(620px,calc(100vh - 214px))}
.pl-dash>#pl-notes{grid-column:1 / -1}
.pl-wid{display:flex;flex-direction:column;min-width:0;min-height:0;padding:8px 10px 0;overflow:hidden}
.pl-wid>.pl-ch{flex:none;padding-bottom:6px}
.pl-wid>.pl-qa,.pl-wid>.pl-rate,.pl-wid>.pl-selbar{flex:none;margin-bottom:6px}
.pl-wbody{flex:1;min-height:0;overflow:auto;margin:0 -10px;padding:0 10px 8px;scrollbar-width:thin;scrollbar-gutter:stable}
.pl-maxb{margin-left:2px}
.pl-wid.pl-full{position:fixed;inset:16px;z-index:43;height:auto;padding:12px 18px 0;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.45);animation:plPop .18s ease}
.pl-wid.pl-full .pl-wbody{margin:0 -18px;padding:0 18px 14px}
.pl-card2{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px}
.pl-ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:34px}
.pl-ch h3{display:flex;align-items:center;gap:8px;margin:0;font:700 15px/22px var(--sans);color:var(--t1)}
.pl-ch h3 .pl-ic{color:var(--acc)}
.pl-ch>small{color:var(--t3);font-size:12px}
.pl-ch .px-btn{height:32px;padding:0 10px;font-size:12.5px}
.pl-gl{display:flex;align-items:center;gap:6px;padding:10px 4px 2px;font:700 10.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.pl-gl small{font-weight:600;color:var(--t3)}
.pl-gl button{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:none;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
.pl-grp.late .pl-gl{color:var(--short)}
.pl-grp.now .pl-gl{color:var(--acc)}
.pl-flash{animation:plFlash 1.6s ease}
.pl-pill{height:20px;padding:0 8px;border-radius:999px;font:600 11px/20px var(--sans);font-style:normal;white-space:nowrap}
.pl-pill.now{background:var(--adim);color:var(--acc)}.pl-pill.late{background:var(--shortd);color:var(--short)}
.pl-chk.sm{gap:6px;font-size:12.5px;color:var(--t2);white-space:nowrap}.pl-chk.sm input{width:15px;height:15px}
.pl-more{align-self:flex-start;margin:2px 0 4px 30px;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--acc);font:600 12px var(--sans);cursor:pointer}
.pl-more:hover{background:var(--adim)}
.pl-grp{display:flex;flex-direction:column}
.pl-grp.done .pl-gl{color:var(--long)}
.pl-tcw{position:relative;display:inline-flex}
.pl-tpop{position:absolute;top:calc(100% + 6px);right:0;z-index:36;display:flex;flex-direction:column;gap:8px;width:220px;padding:10px;border-radius:10px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.28);animation:plPop .14s ease}
.pl-tpop label{display:flex;align-items:center;gap:8px;font:600 12px var(--sans);color:var(--t2)}
.pl-tpop label span{width:36px}.pl-tpop input{height:32px;padding:0 8px;font-size:12.5px}
.pl-tpf{display:flex;justify-content:flex-end;gap:6px}.pl-tpf .px-btn{height:30px;padding:0 10px;font-size:12px}
.pl-dcx{display:grid;place-items:center;width:16px;height:16px;margin-right:-4px;border-radius:50%;color:var(--t3)}
.pl-dcx:hover{background:var(--s3);color:var(--t1)}
/* progress */
.pl-trk{position:relative;display:block;flex:1;min-width:40px;height:6px;border-radius:999px;background:var(--s3);overflow:hidden}
.pl-trk i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:var(--long);transition:width .3s ease}
.pl-prg{display:flex;align-items:center;gap:6px;width:100%;min-width:0}
.pl-prg b{flex:none;width:34px;text-align:right;font:600 11.5px var(--sans);color:var(--t2);font-feature-settings:"tnum"}
.pl-prg.ro b{color:var(--t1)}
.pl-prg input[type=range]{flex:1;min-width:40px;height:18px;margin:0;padding:0;border:0;background:none;box-shadow:none;-webkit-appearance:none;appearance:none;cursor:pointer}
.pl-prg input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(to right,var(--long) var(--p),var(--s3) var(--p))}
.pl-prg input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-4px;border-radius:50%;background:var(--s1);box-shadow:0 0 0 2px var(--long)}
.pl-prg input[type=range]::-moz-range-track{height:6px;border-radius:999px;background:var(--s3)}
.pl-prg input[type=range]::-moz-range-progress{height:6px;border-radius:999px;background:var(--long)}
.pl-prg input[type=range]::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:var(--s1);box-shadow:0 0 0 2px var(--long)}
.pl-prg input[type=range]:focus-visible{outline:none}
.pl-prg input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--long),var(--ds-focus)}
.pl-ovr{display:inline-flex;align-items:center;gap:8px;margin-left:4px;font-size:12px;color:var(--t2)}
.pl-ovr .pl-trk{width:110px;flex:none}.pl-ovr b{font:700 12px var(--sans);color:var(--t1)}.pl-ovr small{color:var(--t3)}
/* the planner, full screen */
.pl-fullback{position:fixed;inset:0;z-index:42;background:rgba(6,11,20,.5);animation:plFade .15s ease}
.pl-cdays{display:none!important}
.pl-full .pl-cdays{display:flex!important;color:var(--t2);font-size:12px}
.pl-full .pl-tr.head .pl-cdays{color:var(--t3)}
/* notes */
.pl-kinds{display:inline-flex;align-items:center;gap:12px;margin-left:6px}
.pl-new2>.px-btn{background:var(--ds-action-bg);color:var(--on-acc);box-shadow:none;font-weight:600;height:32px;padding:0 12px;font-size:12.5px}
.pl-new2>.px-btn .pl-ic{color:var(--on-acc)}
.pl-new2>.px-btn:hover{background:var(--ds-action-hover)}
.pl-ch .pl-seg button{height:28px;padding:0 9px}
.pl-nlist{display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.pl-nrow{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 8px;border-bottom:1px solid var(--b1);font-size:13px;color:var(--t1);cursor:pointer;min-width:0}
.pl-nrow:hover{background:var(--hover)}.pl-nrow:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.pl-nrow.sel{background:var(--adim)}
.pl-nrow>.pl-ic{color:var(--t3)}
.pl-nrow b.pl-rt{flex:0 1 auto;max-width:38%;font-weight:600}
.pl-nsnip{flex:1;min-width:0;color:var(--t2);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-nrow small{flex:none;color:var(--t3);font-size:12px}
.pl-nrow .pl-cpick{position:static;width:16px;height:16px}
.pl-nrow .pl-nbd{max-width:140px}
.pl-nrow em.pl-dc,.pl-cm em.pl-dc{height:20px;padding:0 7px;font-style:normal;font-size:11px;cursor:default}

/* a date as a chip (the browser's own picker opens on a click) */
.pl-dc{position:relative;flex:none;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:999px;background:var(--s2);color:var(--t2);font:500 12px var(--sans);white-space:nowrap;cursor:pointer;transition:background .12s,color .12s,opacity .12s}
.pl-dc:hover{background:var(--s3);color:var(--t1)}
.pl-dc input{position:absolute;left:0;bottom:0;width:100%;height:100%;opacity:0;pointer-events:none;border:0;padding:0;margin:0}
button.pl-dc{border:0;font:500 12px var(--sans)}
.pl-calday .pl-trow{flex-wrap:wrap;row-gap:2px;padding-bottom:4px}
.pl-calday .pl-tinw{flex:1 1 calc(100% - 64px)}
.pl-calday .pl-trow .pl-nbd{margin-left:26px}
.pl-dc.none{background:none;color:var(--t3);box-shadow:inset 0 0 0 1px var(--b1)}
.pl-dc.late{background:var(--shortd);color:var(--short)}
.pl-dc.now{background:var(--adim);color:var(--acc)}

/* a to-do */
.pl-qa{display:flex;align-items:center;gap:8px;min-width:0;height:40px;padding:0 4px 0 12px;border-radius:10px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--b2);color:var(--t3);transition:box-shadow .15s}
.pl-qa:focus-within{box-shadow:inset 0 0 0 1px var(--acc)}
.pl-qa input{flex:1;min-width:0;height:36px;padding:0;border:0;background:none;box-shadow:none!important;font:500 13.5px var(--sans)}
.pl-trow .pl-nbd{flex:0 1 auto;max-width:120px;font-size:11.5px;color:var(--t3)}
.pl-qa .pl-qn{flex:none;width:auto;max-width:130px;height:28px;padding:0 6px;border-radius:6px;font-size:12px}
.pl-qa .px-btn{height:32px;padding:0 12px}
.pl-ck{flex:none;width:18px;height:18px;padding:0;display:grid;place-items:center;border:1.5px solid var(--t3);border-radius:50%;background:none;color:transparent;cursor:pointer;transition:background .15s,border-color .15s}
.pl-ck:hover{border-color:var(--long)}
.pl-ck.on{background:var(--long);border-color:var(--long);color:#fff;animation:plTick .25s ease}
.pl-trow{display:flex;align-items:center;gap:6px;min-height:34px;padding:2px 2px 2px 6px;border-radius:8px;transition:background .12s}
.pl-trow:hover,.pl-trow:focus-within{background:var(--hover)}
.pl-tin{flex:1;min-width:0;height:30px;padding:0 6px;border:0!important;border-radius:6px;background:none;box-shadow:none!important;font:500 13.5px var(--sans);color:var(--t1)}
.pl-tin:focus{background:var(--s2)}
.pl-trow.done .pl-tin{color:var(--t3);text-decoration:line-through}
.pl-trow[draggable="true"]{cursor:grab}
.pl-rep{display:inline-flex;color:var(--t3)}
.pl-trow .pl-menu .pl-ib{width:28px;height:28px;opacity:0}
.pl-trow:hover .pl-menu .pl-ib,.pl-trow:focus-within .pl-menu .pl-ib,.pl-trow .pl-menu .pl-ib[aria-expanded="true"]{opacity:1}
.pl-trow .pl-dc.none{opacity:0}
.pl-trow:hover .pl-dc.none,.pl-trow:focus-within .pl-dc.none{opacity:1}

/* the planner table */
.pl-plan{container:plt/inline-size}
.pl-keys{margin-left:auto;font-size:11.5px!important}
.pl-tbl{display:flex;flex-direction:column;min-width:0}
.pl-tr{display:grid;grid-template-columns:28px minmax(0,1fr) 84px 84px 116px 108px 30px;align-items:center;gap:6px;min-height:38px;padding:0 2px 0 4px;border-bottom:1px solid var(--b1);transition:background .12s}
.pl-tr.head{min-height:30px;border-bottom-color:var(--b2)}
.pl-tr.head span{font:700 10.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.pl-tr:not(.head):not(.nbh):hover{background:var(--hover)}
.pl-tr:not(.head):focus-within{background:color-mix(in srgb,var(--acc) 6%,transparent)}
.pl-full .pl-tr{grid-template-columns:34px minmax(0,1fr) 100px 100px 70px 170px 130px 30px}
.pl-tbl{outline:none}
.pl-tr.head{position:sticky;top:0;z-index:2;background:var(--s1)}
.pl-rn{display:grid;place-items:center;height:100%;min-height:30px;padding:0;border:0;background:none;color:var(--t3);font:600 10.5px var(--sans);font-feature-settings:"tnum";cursor:pointer;user-select:none}
.pl-rn:hover{color:var(--acc);background:var(--adim)}
.pl-tcell{position:relative;align-self:stretch;user-select:none}
.pl-tcell.t{user-select:auto}
.pl-tcell.dt,.pl-tcell.pg,.pl-tcell.stc{padding:0 6px;cursor:cell;border-radius:4px}
.pl-tcell.sel{background:color-mix(in srgb,var(--acc) 12%,transparent)}
.pl-tcell.cur{box-shadow:inset 0 0 0 2px var(--acc)}
.pl-tcell.fill{background:color-mix(in srgb,var(--acc) 6%,transparent);box-shadow:inset 0 0 0 1px dashed var(--accb)}
.pl-fillh{position:absolute;right:-4px;bottom:-4px;z-index:3;width:9px;height:9px;border:2px solid var(--s1);border-radius:2px;background:var(--acc);cursor:crosshair}
.pl-cv{font:500 12.5px var(--sans);color:var(--t1);white-space:nowrap}
.pl-cv.nil{color:var(--t3);font-weight:400}
.pl-cv.late{color:var(--short);font-weight:600}
.pl-tcell.dt input[type=date]{position:absolute;left:0;bottom:0;width:100%;height:100%;opacity:0;pointer-events:none;border:0;padding:0}
.pl-cedit{width:100%;height:28px;padding:0 6px;font-size:12.5px}
.pl-tcell .pl-stp{cursor:cell}
.pl-tcell .pl-st{height:26px}
.pl-gridhint{flex:none;margin:6px 0 0;font-size:11.5px;color:var(--t3)}
.pl-tbl:focus-visible{box-shadow:inset 0 0 0 1px var(--accb);border-radius:6px}
.pl-tr.draft{display:flex}
.pl-tr.draft .pl-tcell.t{flex:1}
.pl-tr.nbh{display:flex;min-height:30px;padding-top:10px;border-bottom:0}
.pl-tcell{min-width:0;display:flex;align-items:center}
.pl-tcell.t{gap:2px;padding-left:calc(var(--lv,0) * 22px)}
.pl-tw2{flex:none;width:22px;height:22px;display:grid;place-items:center;padding:0;border:0;border-radius:4px;background:none;color:var(--t3);cursor:pointer}
.pl-tw2:hover{background:var(--s2);color:var(--t1)}
.pl-rowin{flex:1;min-width:0;height:30px;padding:0 6px;border:0!important;border-radius:6px;background:none;box-shadow:none!important;font:500 13.5px var(--sans);color:var(--t1)}
.pl-rowin:focus{background:var(--s2)}
.pl-tr[data-lv="0"] .pl-rowin{font-weight:600}
.pl-tr.done .pl-rowin{color:var(--t3);text-decoration:line-through}
.pl-tr.draft .pl-rowin{background:var(--s2);box-shadow:inset 0 0 0 1px var(--accb)!important}
.pl-roll{flex:none;padding:0 6px;font:600 11px var(--sans);color:var(--t3);font-feature-settings:"tnum"}
.pl-tr .pl-dc{width:100%;justify-content:flex-start}
.pl-st{width:100%;height:26px;padding:0 6px;border:0!important;border-radius:999px;font:600 12px var(--sans);cursor:pointer;box-shadow:none!important}
.pl-st.s-todo{background:var(--s2);color:var(--t2)}
.pl-st.s-doing{background:var(--adim);color:var(--acc)}
.pl-st.s-hold{background:var(--mixedd);color:var(--mixed)}
.pl-st.s-done{background:var(--longd);color:var(--long)}
.pl-tcell.a .pl-ib{width:28px;height:28px;opacity:0}
.pl-tr:hover .pl-tcell.a .pl-ib,.pl-tr:focus-within .pl-tcell.a .pl-ib,.pl-tcell.a .pl-ib[aria-expanded="true"]{opacity:1}
.pl-addc{display:flex;align-items:center;gap:6px;width:100%;height:34px;padding:0 10px;border:0;border-radius:8px;background:none;color:var(--t2);font:600 12.5px var(--sans);cursor:pointer}
.pl-addc:hover{background:var(--s2);color:var(--acc)}
@container plt (max-width:540px){
  .pl-tr.head{display:none}
  .pl-tr,.pl-full .pl-tr{grid-template-columns:24px repeat(3,minmax(0,1fr)) minmax(0,1.1fr);row-gap:4px;padding-top:4px;padding-bottom:6px}
  .pl-tr>.pl-rn{grid-row:1 / 3}
  .pl-tr>.pl-tcell.a{grid-row:1;grid-column:5;justify-self:end}
  .pl-ovr .pl-trk{width:70px}
  .pl-tr>.pl-tcell.t{grid-column:2 / 5;grid-row:1}
  .pl-tr>.pl-tcell.dt:nth-of-type(2){padding-left:calc(var(--lv,0) * 22px + 6px)}
  .pl-tr.draft{padding-bottom:4px}
  .pl-keys{display:none}
}

/* notes */
.pl-sel select{height:32px;width:auto;padding:0 10px;border-radius:8px;font-size:12.5px}
.pl-selbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:10px;background:var(--adim);box-shadow:inset 0 0 0 1px var(--accb);animation:plPop .16s ease}
.pl-selbar b{font:700 13px var(--sans)}
.pl-selbar .px-btn{height:32px;padding:0 10px;font-size:12.5px}
.pl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.pl-card{position:relative;display:flex;flex-direction:column;min-width:0;background:var(--s1);border:1px solid var(--b1);border-top:3px solid var(--nb,var(--b2));border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s}
.pl-card:hover{transform:translateY(-1px);box-shadow:0 10px 24px -14px rgba(15,27,45,.35);border-color:var(--b2);border-top-color:var(--nb,var(--b2))}
.pl-card:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.pl-card.sel{box-shadow:0 0 0 2px var(--acc)}
.pl-cpick{position:absolute;top:10px;right:10px;z-index:1;width:18px;height:18px}
.pl-thumb{height:110px;background:var(--s2);overflow:hidden}
.pl-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.pl-card .pl-cb{display:flex;flex-direction:column;gap:6px;flex:1;padding:12px 14px}
.pl-cm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.pl-card h4{margin:0;font:700 14.5px/20px var(--sans);color:var(--t1);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.pl-card p{margin:0;font-size:12.5px;line-height:18px;color:var(--t2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.pl-cf{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:4px;min-width:0}
.pl-cf small{color:var(--t3);font-size:11.5px;white-space:nowrap}
.pl-ht{font:500 11.5px var(--sans);font-style:normal;color:var(--t3);white-space:nowrap}
.pl-cact{display:flex;gap:8px;flex-wrap:wrap;padding-top:6px}
.pl-cact .px-btn{height:30px;padding:0 10px;font-size:12px}
.pl-nbd{display:inline-flex;align-items:center;gap:5px;min-width:0;font:500 12px var(--sans);font-style:normal;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-nbd i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--nb)}
.pl-nbd i.ring{background:none;box-shadow:inset 0 0 0 2px var(--t3)}

/* the calendar */
.pl-cal{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start}
.pl-calg{padding:10px;min-width:0}
.pl-calh{display:flex;align-items:center;gap:4px;margin:0 0 8px;flex-wrap:wrap}
.pl-calh h3{margin:0;min-width:150px;text-align:center;font:700 15px var(--sans);color:var(--t1)}
.pl-calh .px-btn{height:32px;padding:0 12px}
.pl-legend{display:inline-flex;align-items:center;gap:6px;margin-right:8px;font-size:12px;color:var(--t2)}
.pl-legend i.bar{width:16px;height:6px;border-radius:3px;background:var(--acc)}
.pl-legend i.dot{width:8px;height:8px;margin-left:6px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--t3)}
.pl-legend i.nt{width:8px;height:9px;margin-left:6px;border-radius:2px;box-shadow:inset 0 0 0 1.5px var(--t3)}
.pl-calh .pl-seg button{height:28px}
.pl-calw{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:0 0 4px}
.pl-calw span{font:700 10.5px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3);text-align:center}
.pl-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));row-gap:2px;min-height:104px;border-top:1px solid var(--b1)}
.pl-wbg{grid-row:1 / -1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:4px;border:0;border-right:1px solid var(--b1);background:none;text-align:left;cursor:pointer;transition:background .12s}
.pl-wbg:nth-child(7){border-right:0}
.pl-wbg:hover{background:var(--hover)}
.pl-wbg.out{background:color-mix(in srgb,var(--s2) 55%,transparent)}
.pl-wbg.out .pl-cd{opacity:.45}
.pl-wbg.sel{box-shadow:inset 0 0 0 2px var(--acc);border-radius:6px}
.pl-cd{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;font:600 12px var(--sans);color:var(--t2);font-feature-settings:"tnum"}
.pl-wbg.today .pl-cd{background:var(--acc);color:var(--on-acc)}
.pl-cdots{display:none;gap:3px;align-items:center;flex-wrap:wrap}
.pl-cdots i.bar{width:10px;height:4px;border-radius:2px;background:var(--nb,var(--acc))}
.pl-cdots i.dot{width:5px;height:5px;border-radius:50%;background:var(--nb,var(--t3))}
.pl-bar3{z-index:1;min-width:0;height:20px;margin:0 3px;padding:0 6px;border:0;border-left:3px solid var(--nb,var(--acc));border-radius:6px;background:color-mix(in srgb,var(--nb,var(--acc)) 20%,var(--s1));color:var(--t1);font:600 11px/20px var(--sans);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.pl-bar3:hover{background:color-mix(in srgb,var(--nb,var(--acc)) 32%,var(--s1))}
.pl-bar3.l{margin-left:0;border-left:0;border-top-left-radius:0;border-bottom-left-radius:0}
.pl-bar3.r{margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0}
.pl-bar3.s-done{opacity:.55;text-decoration:line-through}
.pl-wtd{z-index:1;display:flex;flex-direction:column;gap:2px;min-width:0;padding:0 3px 4px;pointer-events:none}
.pl-wtd>*{pointer-events:auto}
.pl-cit{display:flex;align-items:center;gap:4px;min-width:0;padding:1px 5px;border-radius:4px;background:var(--s2);font:500 11px/16px var(--sans);color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.pl-cit i{flex:none;width:8px;height:8px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--nb,var(--t3))}
.pl-cit.done{color:var(--t3);text-decoration:line-through}
.pl-cit b{font-weight:700;color:var(--t2);margin-right:2px}
.pl-cit.nt{background:color-mix(in srgb,var(--nb,var(--acc)) 10%,var(--s1));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--nb,var(--acc)) 30%,transparent)}
.pl-cit.nt .pl-ic{color:var(--t3)}
.pl-cdots i.nt{width:5px;height:6px;border-radius:1px;box-shadow:inset 0 0 0 1.5px var(--nb,var(--t3))}
/* the week: an hour grid */
.pl-wv{display:flex;flex-direction:column;min-width:0}
.pl-wvh{display:grid;padding-bottom:4px;border-bottom:1px solid var(--b1)}
.pl-wvd{display:flex;flex-direction:column;align-items:center;padding:2px 0 4px;border:0;border-radius:8px;background:none;color:var(--t2);cursor:pointer}
.pl-wvd:hover{background:var(--hover)}
.pl-wvd small{font:700 10.5px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.pl-wvd b{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;font:700 17px var(--sans);color:var(--t1)}
.pl-wvd.today b{background:var(--acc);color:var(--on-acc)}
.pl-wvd.sel{background:var(--adim)}
.pl-wvall{display:grid;row-gap:2px;min-height:34px;padding:4px 0;border-bottom:1px solid var(--b2)}
.pl-wvlab{grid-column:1;align-self:start;padding:4px 8px 0 0;text-align:right;font:600 10.5px var(--sans);color:var(--t3)}
.pl-wvall .pl-wtd{padding:0 2px}
.pl-wvs{position:relative;height:min(62vh,620px);overflow:auto;scrollbar-width:thin}
.pl-wgrid{position:relative;display:grid;grid-template-rows:100%;background-image:repeating-linear-gradient(to bottom,var(--b1) 0 1px,transparent 1px var(--h));user-select:none;-webkit-user-select:none;touch-action:pan-y}
.pl-wgut{grid-column:1;grid-row:1;position:relative}
.pl-wgut span{position:absolute;right:8px;transform:translateY(-50%);font:600 10.5px var(--sans);color:var(--t3);font-feature-settings:"tnum"}
.pl-wcol{grid-row:1;position:relative;min-width:0;border-left:1px solid var(--b1);cursor:crosshair}
.pl-wcol.today{background:color-mix(in srgb,var(--acc) 4%,transparent)}
.pl-ev{position:absolute;z-index:1;display:flex;flex-direction:column;min-width:0;padding:2px 6px;border-radius:6px;border-left:3px solid var(--nb,var(--acc));background:color-mix(in srgb,var(--nb,var(--acc)) 22%,var(--s1));color:var(--t1);overflow:hidden;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.12);touch-action:none}
.pl-ev b{font:600 12px/16px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ev small{font:500 11px/14px var(--sans);color:var(--t2);font-feature-settings:"tnum"}
.pl-ev.done b{color:var(--t3);text-decoration:line-through}
.pl-ev.drag{z-index:3;opacity:.9;box-shadow:0 10px 22px rgba(0,0,0,.28);cursor:grabbing}
.pl-ev.ghost{left:2px;right:2px;border:1px dashed var(--acc);background:var(--adim);pointer-events:none}
.pl-evh{position:absolute;left:0;right:0;bottom:0;height:8px;cursor:ns-resize}
.pl-evnew{left:2px;right:2px;z-index:4;gap:2px;background:var(--s1);border:1px solid var(--acc);border-left:3px solid var(--acc);cursor:default}
.pl-evnew input{height:26px;padding:0 2px;border:0!important;background:none;box-shadow:none!important;font:600 12.5px var(--sans)}
.pl-evedit{position:absolute;left:calc(100% + 6px);z-index:6;display:flex;flex-direction:column;gap:8px;width:260px;padding:10px;border-radius:10px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.3);cursor:default;animation:plPop .14s ease}
.pl-evedit.l{left:auto;right:calc(100% + 6px)}
.pl-evedit.in{left:8px;right:8px;width:auto;margin-top:36px}
.pl-evt{height:34px;font-weight:600}
.pl-evr{display:flex;align-items:center;gap:6px}
.pl-evr input{height:32px;padding:0 6px;font-size:12.5px}
.pl-evr .px-btn{height:30px;padding:0 10px;font-size:12px}
.pl-evr .pl-ib{margin-left:auto;color:var(--short)}
.pl-now{position:absolute;left:0;right:0;z-index:2;height:2px;background:var(--short);pointer-events:none}
.pl-now::before{content:"";position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--short)}
.pl-whint{padding:8px 4px 0;font-size:11.5px}
.pl-cit.done i{background:var(--long);box-shadow:none}
.pl-cit.late{color:var(--short)}
.pl-cit[draggable="true"]{cursor:grab}
.pl-cmore{font-size:10.5px;color:var(--t3);padding-left:4px;cursor:pointer}
.pl-calday{display:flex;flex-direction:column;gap:6px;padding:12px 14px;min-width:0}
.pl-calday .pl-gl{padding-top:6px}
.pl-prow2{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;column-gap:8px;row-gap:2px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:none;color:var(--t1);text-align:left;cursor:pointer}
.pl-prow2:hover{background:var(--s2)}
.pl-prow2>i{width:9px;height:9px;border-radius:50%;background:var(--nb,var(--acc))}
.pl-prow2 .pl-rt{font:600 13px var(--sans)}
.pl-prow2 small{grid-column:2 / -1;color:var(--t2);font-size:12px}
.pl-rt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-stp{height:20px;padding:0 8px;border-radius:999px;font:600 11px/20px var(--sans);font-style:normal;white-space:nowrap}
.pl-stp.s-todo{background:var(--s2);color:var(--t2)}.pl-stp.s-doing{background:var(--adim);color:var(--acc)}
.pl-stp.s-hold{background:var(--mixedd);color:var(--mixed)}.pl-stp.s-done{background:var(--longd);color:var(--long)}
.pl-calday .pl-qa{margin:2px 0 4px}

/* the graph */
.pl-crumb{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.pl-crumb b{font:700 15px var(--sans);color:var(--t1)}
.pl-crumb small{color:var(--t2);font-size:12.5px}
.pl-crumb .px-btn{height:34px;padding:0 12px}
.pl-vbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.pl-gbox{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:12px;align-items:start}
.pl-gcv{position:relative;height:max(380px,calc(100vh - 300px));padding:0;overflow:hidden}
.pl-gcv canvas{display:block;touch-action:none;cursor:grab}
.pl-gzoom{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:4px}
.pl-gzoom .pl-ib{background:var(--s1);box-shadow:0 0 0 1px var(--b2)}
.pl-glegend{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:4px 12px;max-width:calc(100% - 20px);padding:6px 10px;border-radius:8px;background:var(--glass);box-shadow:0 0 0 1px var(--b1)}
.pl-gtip{position:absolute;z-index:2;display:flex;flex-direction:column;gap:2px;max-width:220px;padding:6px 10px;border-radius:8px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 10px 24px rgba(0,0,0,.25);pointer-events:none}
.pl-gtip b{font:600 12.5px var(--sans);color:var(--t1);overflow-wrap:anywhere}
.pl-gtip small{font-size:11.5px;color:var(--t2)}
.pl-ghint{position:absolute;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100% - 90px);padding:6px 12px;border-radius:999px;background:var(--glass);box-shadow:0 0 0 1px var(--b1);font-size:12.5px;color:var(--t2);text-align:center;pointer-events:none}
.pl-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:30px 12px;text-align:center;color:var(--t2);font-size:13px}
.pl-empty b{color:var(--t1);font:600 14px var(--sans)}
.pl-gempty{position:absolute;inset:0;justify-content:center}
.pl-gside{max-height:max(380px,calc(100vh - 300px));overflow:auto}
.pl-sec{padding:12px 14px;min-width:0}
.pl-sh{display:flex;align-items:center;gap:8px;margin:0 0 6px}
.pl-sh h3{flex:1;margin:0;font:700 14px/22px var(--sans);color:var(--t1)}
.pl-row{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:none;color:var(--t1);font:500 13px var(--sans);text-align:left;cursor:pointer}
.pl-row:hover{background:var(--s2)}
.pl-row .pl-ic{color:var(--t3)}
.pl-row small{color:var(--t3);font-size:12px;white-space:nowrap}
.pl-row .pl-rt{flex:1}

/* the open note */
.pl-edp{container:pled/inline-size;min-width:0;height:max(520px,calc(100vh - 172px));background:var(--s1);border:1px solid var(--b1);border-radius:12px;box-shadow:var(--ds-shadow-card);overflow:hidden}
.pl-ed{display:flex;flex-direction:column;height:100%;min-height:0}
.pl-edh{flex:none;display:flex;align-items:center;gap:6px;min-height:50px;padding:6px 8px;border-bottom:1px solid var(--b1);background:var(--s1)}
.pl-edh .pl-back{height:34px;padding:0 12px}
.pl-edcrumb{display:flex;align-items:center;gap:12px;min-width:0;margin-left:6px}
.pl-sv{font:500 12px var(--sans);font-style:normal;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-sv.s-saving,.pl-sv.s-dirty{color:var(--t2)}
.pl-sv.s-error,.pl-sv.s-conflict{color:var(--short)}
.pl-edb{flex:1;min-height:0;overflow:auto;padding:0 32px 32px;scrollbar-width:thin}
.pl-edb>*{max-width:820px;margin-left:auto;margin-right:auto}
.pl-ed.ro .pl-prose{opacity:.8}
.pl-title{display:block;width:100%;margin-top:14px;padding:6px 0;border:0;background:none;resize:none;overflow:hidden;font:800 30px/1.25 var(--sans);letter-spacing:-.015em;color:var(--t1);outline:none}
.pl-title::placeholder{color:var(--t3)}
.pl-props{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:6px 0 12px;margin-bottom:6px;border-bottom:1px solid var(--b1)}
.pl-prop{display:flex;align-items:center;gap:8px;min-width:0;font-size:12.5px;color:var(--t2)}
.pl-prop>span:first-child{font:700 10.5px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.pl-prop select{width:auto;height:30px;padding:0 8px;border-radius:6px;font-size:12.5px}
.pl-prop.wide{flex:1 1 260px}
.pl-tags{display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:1;min-width:0;min-height:30px;padding:2px 6px;border-radius:6px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--b2)}
.pl-tags:focus-within{box-shadow:inset 0 0 0 1px var(--acc)}
.pl-tag{display:inline-flex;align-items:center;gap:2px;height:22px;padding:0 3px 0 8px;border-radius:999px;background:var(--adim);color:var(--acc);font:600 11.5px var(--sans)}
.pl-tag button{display:grid;place-items:center;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer}
.pl-tag button:hover{background:var(--accb)}
.pl-tagin{position:relative;flex:1;min-width:90px}
.pl-tagin input{height:24px;padding:0 4px;border:0;background:none;box-shadow:none!important;font-size:12.5px}
.pl-tagsug{position:absolute;top:calc(100% + 4px);left:0;z-index:36;display:flex;flex-direction:column;min-width:190px;max-height:220px;overflow:auto;padding:4px;border-radius:8px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 14px 30px rgba(0,0,0,.25)}
.pl-tagsug button{padding:6px 8px;border:0;border-radius:6px;background:none;color:var(--t1);font:500 12.5px var(--sans);text-align:left;cursor:pointer}
.pl-tagsug button:hover{background:var(--s2)}
.pl-toolbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;flex-wrap:nowrap;gap:2px;padding:6px 0;background:var(--s1);border-bottom:1px solid var(--b1);overflow-x:auto;scrollbar-width:none}
.pl-toolbar::-webkit-scrollbar{display:none}
.pl-tb{flex:none;width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;background:none;color:var(--t2);cursor:pointer;transition:background .12s,color .12s}
.pl-tb b{font:800 12px var(--sans)}
.pl-tb:hover:not(:disabled){background:var(--s2);color:var(--t1)}
.pl-tb.on{background:var(--adim);color:var(--acc)}
.pl-tb:disabled{opacity:.35;cursor:default}
.pl-tsep{flex:none;width:1px;height:20px;margin:0 4px;background:var(--b1)}
.pl-tblbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 0}
.pl-tblbar button,.pl-tblbar a{height:28px;display:inline-flex;align-items:center;padding:0 10px;border:0;border-radius:6px;background:var(--s2);color:var(--t1);font:600 12px var(--sans);cursor:pointer;text-decoration:none}
.pl-tblbar button:hover,.pl-tblbar a:hover{background:var(--s3)}
.pl-tblbar .danger{color:var(--short)}
.pl-lnk{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2);font-size:12.5px;padding:0 4px}
.pl-linkbox{display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--t3)}
.pl-linkbox input{flex:1;height:34px}
.pl-linkbox .px-btn{height:34px}
.pl-ec{padding:6px 0 20px}
.pl-up{display:flex;align-items:center;gap:8px;padding:6px 0;color:var(--t2);font-size:12.5px}
.pl-spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--b2);border-top-color:var(--acc);animation:plSpin .8s linear infinite}
.pl-back2{padding-top:12px;margin-top:6px;border-top:1px solid var(--b1)}
.pl-back2 h4{display:flex;align-items:center;gap:6px;margin:0 0 8px;font:700 11px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.pl-back2>div{display:flex;flex-wrap:wrap;gap:6px}
.pl-chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border:0;border-radius:999px;background:var(--s2);color:var(--t2);font:600 11px var(--sans);font-style:normal;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.pl-chip.lnk{height:28px;padding:0 12px;font-size:12.5px;cursor:pointer;color:var(--t1);box-shadow:inset 0 0 0 1px var(--b2);background:var(--s1)}
.pl-chip.lnk:hover{color:var(--acc);box-shadow:inset 0 0 0 1px var(--accb)}
.pl-edf{display:flex;flex-wrap:wrap;gap:6px 16px;padding:14px 0 4px;color:var(--t3);font-size:12px}
.pl-warn{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin:10px 0;border-radius:10px;background:var(--mixedd);color:var(--t1);font-size:13px;line-height:19px}
.pl-warn>.pl-ic{color:var(--mixed)}

/* the writing */
.pl-prose{outline:none;min-height:38vh;font:400 15px/1.7 var(--sans);color:var(--t1);overflow-wrap:anywhere;caret-color:var(--acc)}
.pl-prose>*+*{margin-top:.55em}
.pl-prose p{margin:0}
.pl-prose h1,.pl-prose h2,.pl-prose h3{margin:1.1em 0 .25em;color:var(--t1);letter-spacing:-.01em;line-height:1.3}
.pl-prose h1{font:800 26px/1.3 var(--sans)}
.pl-prose h2{font:750 20px/1.35 var(--sans)}
.pl-prose h3{font:700 16.5px/1.4 var(--sans)}
.pl-prose>:first-child{margin-top:.4em}
.pl-prose ul,.pl-prose ol{margin:.3em 0;padding-left:1.5em}
.pl-prose li{margin:.1em 0}
.pl-prose li>p{margin:0}
.pl-prose ul[data-type="taskList"]{list-style:none;padding-left:.15em}
.pl-prose ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:8px}
.pl-prose ul[data-type="taskList"] li>label{flex:none;margin-top:4px;user-select:none}
.pl-prose ul[data-type="taskList"] li>label input{width:16px;height:16px;cursor:pointer}
.pl-prose ul[data-type="taskList"] li>div{flex:1;min-width:0}
.pl-prose ul[data-type="taskList"] li[data-checked="true"]>div{color:var(--t3);text-decoration:line-through}
.pl-prose blockquote{margin:.6em 0;padding:2px 0 2px 14px;border-left:3px solid var(--b2);color:var(--t2)}
.pl-prose pre{margin:.6em 0;padding:12px 14px;border-radius:8px;background:var(--s2);box-shadow:inset 0 0 0 1px var(--b1);overflow-x:auto;font:500 13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--t1)}
.pl-prose pre code{background:none;padding:0;font:inherit}
.pl-prose code{padding:1px 5px;border-radius:4px;background:var(--s2);font:500 .88em ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--t1)}
.pl-prose mark{background:color-mix(in srgb,#fcc419 42%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.pl-prose a{color:var(--acc);text-decoration:underline;text-underline-offset:2px}
.pl-prose hr{margin:1.2em 0;border:0;border-top:1px solid var(--b2)}
.pl-prose hr.ProseMirror-selectednode{border-top-color:var(--acc)}
.pl-prose img{display:block;max-width:100%;height:auto;margin:.6em 0;border-radius:8px;box-shadow:0 0 0 1px var(--b1)}
.pl-prose img.ProseMirror-selectednode{outline:2px solid var(--acc);outline-offset:2px}
.pl-prose table{width:100%;margin:.7em 0;border-collapse:collapse;table-layout:fixed;font-size:14px}
.pl-prose .tableWrapper{overflow-x:auto}
.pl-prose td,.pl-prose th{position:relative;min-width:60px;padding:6px 9px;border:1px solid var(--b2);vertical-align:top;text-align:left}
.pl-prose th{background:var(--s2);font-weight:700}
.pl-prose td>p,.pl-prose th>p{margin:0}
.pl-prose .selectedCell::after{content:"";position:absolute;inset:0;background:var(--adim);pointer-events:none}
.pl-prose .pl-plink{display:inline-flex;align-items:center;padding:0 6px;border-radius:5px;background:var(--adim);color:var(--acc);font-weight:600;text-decoration:none;cursor:pointer;box-shadow:inset 0 0 0 1px var(--accb)}
.pl-prose .pl-plink:hover{background:var(--accb)}
.pl-prose .pl-plink.ProseMirror-selectednode{outline:2px solid var(--acc)}
.pl-prose [data-type="inline-math"],.pl-prose .tiptap-mathematics-render{cursor:pointer;border-radius:4px}
.pl-prose [data-type="inline-math"]{padding:0 2px}
.pl-prose .tiptap-mathematics-render:hover,.pl-prose [data-type="inline-math"]:hover{background:var(--adim)}
.pl-prose div[data-type="block-math"]{margin:.6em 0;padding:8px 10px;text-align:center;overflow-x:auto}
.pl-prose .ProseMirror-selectednode[data-type$="math"]{outline:2px solid var(--acc);outline-offset:1px}
.pl-prose .inline-math-error,.pl-prose .block-math-error{color:var(--short);font-family:ui-monospace,Consolas,monospace;font-size:.9em}
.pl-prose .katex{font-size:1.08em}
.pl-math{position:fixed;z-index:72;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 22px 50px rgba(0,0,0,.32);animation:plPop .14s ease}
.pl-mathh{display:flex;align-items:center;gap:8px;color:var(--acc)}
.pl-mathh b{font:700 13.5px var(--sans);color:var(--t1)}.pl-mathh small{font-size:11.5px;color:var(--t3)}
.pl-math textarea{width:100%;min-height:64px;padding:8px 10px;border:1px solid var(--b2);border-radius:8px;background:var(--s1);color:var(--t1);font:500 13px/1.5 ui-monospace,Consolas,monospace;resize:vertical}
.pl-math textarea:focus{outline:none;border-color:var(--acc)}
.pl-mathx{display:flex;flex-wrap:wrap;gap:4px}
.pl-mathx button{min-width:30px;height:26px;padding:0 8px;border:0;border-radius:6px;background:var(--s2);color:var(--t1);font:600 12.5px var(--sans);cursor:pointer}
.pl-mathx button:hover{background:var(--s3)}
.pl-mathp{min-height:40px;max-height:160px;overflow:auto;padding:8px 10px;border-radius:8px;background:var(--s2);color:var(--t1)}
.pl-mathp.blk{text-align:center}
.pl-mathf{display:flex;align-items:center;gap:6px}.pl-mathf .px-btn{height:32px;padding:0 12px;font-size:12.5px}
.pl-prose .is-empty::before{content:attr(data-placeholder);float:left;height:0;color:var(--t3);pointer-events:none}

/* the "/" and "[[" menus */
.pl-sug{position:fixed;z-index:70;max-height:330px;overflow:auto;padding:4px;border-radius:10px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.3);animation:plPop .14s ease}
.pl-sug button{display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:6px;background:none;color:var(--t1);text-align:left;cursor:pointer}
.pl-sug button.on{background:var(--adim)}
.pl-sug button>span:last-child{display:flex;flex-direction:column;min-width:0}
.pl-sug button b{font:600 13px/18px var(--sans);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-sug button small{font-size:11.5px;line-height:15px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-sgi{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:6px;background:var(--s2);color:var(--t2)}
.pl-sgi b{font:800 11px var(--sans)!important}
.pl-sug button.on .pl-sgi{color:var(--acc);background:var(--s1)}
.pl-sug .pl-mhead{padding:6px 8px 4px}

/* pop-ups (always centred; only for decisions — delete, merge, download, split) */
.pl-ov{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,11,20,.55);animation:plFade .15s ease}
.pl-modal{display:flex;flex-direction:column;width:min(560px,100%);max-height:min(88vh,780px);background:var(--s1);border:1px solid var(--b1);border-radius:12px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);animation:plPop .18s ease}
.pl-modal.wide{width:min(660px,100%)}
.pl-mh{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 8px}
.pl-mh>div{flex:1;min-width:0}
.pl-mh h3{margin:0;font:700 17px/24px var(--sans);color:var(--t1)}
.pl-mh p{margin:4px 0 0;font-size:13px;line-height:19px;color:var(--t2)}
.pl-mb{padding:8px 18px 16px;overflow:auto}
.pl-mf{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid var(--b1)}
.pl-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pl-form .full{grid-column:1/-1}
.pl-f{display:flex;flex-direction:column;gap:5px;min-width:0}
.pl-f>span{font:600 12px var(--sans);color:var(--t2)}
.pl-f input,.pl-f select{height:38px}
.pl-in{height:38px}
.pl-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:8px;background:var(--s2);box-shadow:inset 0 0 0 1px var(--b1)}
.pl-seg button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:6px;background:none;color:var(--t2);font:600 12.5px var(--sans);cursor:pointer;white-space:nowrap}
.pl-seg button:hover{color:var(--t1)}
.pl-seg button.on{background:var(--s1);color:var(--t1);box-shadow:0 1px 2px rgba(15,27,45,.12),0 0 0 1px var(--b1)}
.pl-chk{display:flex;align-items:center;gap:8px;font-size:13px;line-height:19px;color:var(--t1);cursor:pointer}
.pl-chk input{width:16px;height:16px;flex:none}
.pl-radios{display:flex;flex-wrap:wrap;gap:8px}
.pl-radios.col{flex-direction:column;margin-bottom:12px}
.pl-radio{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:8px;box-shadow:inset 0 0 0 1px var(--b2);font:500 13px/19px var(--sans);color:var(--t1);cursor:pointer;transition:box-shadow .12s,background .12s}
.pl-radio input{margin-top:3px;flex:none}
.pl-radio.on{background:var(--adim);box-shadow:inset 0 0 0 1px var(--accb)}
.pl-radio.off{opacity:.6}
.pl-radio span{display:flex;flex-direction:column}
.pl-radio small{color:var(--t2);font-size:12px}
.pl-order{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto}
.pl-order li{display:flex;align-items:center;gap:8px;padding:4px 6px 4px 8px;border-radius:8px;background:var(--s2);font-size:13px}
.pl-on{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--s1);color:var(--t2);font:700 11px var(--sans)}
.pl-picks{display:flex;flex-direction:column;gap:2px;max-height:340px;overflow:auto;margin-top:8px}
.pl-pickr{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;font-size:13px;cursor:pointer}
.pl-pickr:hover{background:var(--s2)}
.pl-pickr input{width:16px;height:16px;flex:none}
.pl-toast{position:fixed;left:50%;bottom:24px;z-index:90;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:10px;background:var(--t1);color:var(--bg);font:600 13px/18px var(--sans);box-shadow:0 12px 30px rgba(0,0,0,.3);animation:plUp .25s ease}
.pl-toast.bad{background:var(--short);color:#fff}

/* the width the main area is given */
@container plv (max-width:1000px){ .pl-dash{grid-template-columns:minmax(0,1fr);grid-template-rows:none;height:auto} .pl-dash>.pl-wid{height:460px} .pl-dash>#pl-notes{grid-column:auto;height:480px} }
@container plv (max-width:860px){ .pl-cal{grid-template-columns:minmax(0,1fr)} .pl-gbox{grid-template-columns:minmax(0,1fr)} }
@container plv (max-width:560px){
  .pl-wk{grid-template-rows:auto!important;min-height:54px}
  .pl-bar3,.pl-wtd{display:none}
  .pl-wbg{align-items:center}
  .pl-cdots{display:flex;justify-content:center}
  .pl-legend{display:none}
  .pl-calh h3{min-width:0;flex:1}
  .pl-cards{grid-template-columns:minmax(0,1fr)}
}
@container pled (max-width:560px){
  .pl-edb{padding:0 16px 28px}
  .pl-title{font-size:24px}
}
/* touch screens: what shows on hover elsewhere is always there */
@media (hover:none){
  .pl-rm>.pl-menu>.pl-ib,.pl-trow .pl-menu .pl-ib,.pl-tcell.a .pl-ib,.pl-trow .pl-dc.none{opacity:1}
  .pl-rr small{display:none}
}
@media (max-width:640px){
  .pl-plan.pl-full{inset:0;border-radius:0}
}
@media (max-width:900px){
  .pl-edp{position:fixed;inset:0;z-index:43;height:auto;border:0;border-radius:0;animation:plSheet .2s ease}
  .pl-dk{display:none}
}
@media (max-width:640px){
  .pl .pl-bandr{width:100%}
  .pl-search{flex:1;width:auto}
  .pl-search kbd{display:none}
  .pl-bar{gap:8px}
  .pl-filt{margin-left:0;width:100%}
  .pl-hm{display:none}
  .pl-drpop{position:fixed;top:96px;left:16px;right:16px;width:auto}
  .pl-qpop{position:fixed;top:120px;left:16px;right:16px;width:auto}
  .pl-form{grid-template-columns:minmax(0,1fr)}
  .pl-ov{align-items:flex-end;padding:12px}
  .pl-modal{max-height:calc(100vh - 24px)}
  .pl-mb{padding:8px 14px 14px}.pl-mh{padding:14px 14px 6px}.pl-mf{padding:10px 14px}
  .pl-card2{padding:10px 10px}
  .pl-qa{flex-wrap:wrap;height:auto;padding:4px 4px 6px 12px;row-gap:4px}
  .pl-qa input:not([type=date]){flex:1 1 calc(100% - 30px)}
  .pl-qa .pl-qn{max-width:none;flex:1}
}
@keyframes plPop{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}
@keyframes plFade{from{opacity:0}to{opacity:1}}
@keyframes plUp{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes plSheet{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes plTick{0%{transform:scale(.8)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes plSpin{to{transform:rotate(360deg)}}
@keyframes plFlash{0%,30%{background:var(--accb)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){
  .pl *,.pl-ov,.pl-modal,.pl-toast,.pl-sug{animation:none!important;transition:none!important}
  .pl-card:hover{transform:none}
}
/* to-dos: open · done · missed (round 22e) */
.pl-sb{flex:none;display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:50%;cursor:pointer;transition:background .15s,box-shadow .15s,transform .12s}
.pl-sb.open{background:none;box-shadow:inset 0 0 0 1.6px var(--t3);color:transparent}
.pl-sb.open:hover{box-shadow:inset 0 0 0 1.6px var(--long);color:var(--long)}
.pl-sb.done{background:var(--long);color:#fff;animation:plTick .25s ease}
.pl-sb.missed{background:var(--shortd);color:var(--short);box-shadow:inset 0 0 0 1.4px color-mix(in srgb,var(--short) 55%,transparent)}
.pl-sb:active{transform:scale(.92)}
.pl-miss{flex:none;display:grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:none;color:var(--t3);cursor:pointer;opacity:0;transition:opacity .12s,color .12s,background .12s}
.pl-miss:hover{color:var(--short);background:var(--shortd)}
/* round 27g (owner: "for the planner zoom bring the minimise to the right corner"): maximised, the button sits in the header's right corner */
.pl-full>.pl-ch>.pl-maxb{margin-left:auto}
.pl-trow:hover .pl-miss,.pl-trow:focus-within .pl-miss,.pl-trow.late .pl-miss{opacity:1}
.pl-trow.missed .pl-tin{color:var(--t2);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--short) 60%,transparent)}
.pl-trow{flex-wrap:nowrap}
.pl-nbi{flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:color-mix(in srgb,var(--nb) 18%,var(--s1));color:var(--nb);font:700 10.5px var(--sans)}
.pl-tsel{position:relative;flex:none;display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 4px 0 7px;border-radius:999px;background:var(--s2);color:var(--t2)}
.pl-tsel.none{background:none;color:var(--t3);box-shadow:inset 0 0 0 1px var(--b1)}
.pl-tsel:hover{background:var(--s3);color:var(--t1)}
.pl-tsel select{width:auto;height:24px;padding:0 2px;border:0!important;background:none;box-shadow:none!important;color:inherit;font:500 12px var(--sans);font-feature-settings:"tnum";cursor:pointer;appearance:none;-webkit-appearance:none}
.pl-trow .pl-dc{height:26px}
.pl-ib.sm{width:26px;height:26px}
.pl-grp.late .pl-ib.sm{color:var(--short)}
.pl-tabs2{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--s2);box-shadow:inset 0 0 0 1px var(--b1)}
.pl-tabs2 button{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--t2);font:600 12px var(--sans);cursor:pointer}
.pl-tabs2 button small{color:var(--t3);font-weight:600;font-feature-settings:"tnum"}
.pl-tabs2 button.on{background:var(--s1);color:var(--t1);box-shadow:0 1px 2px rgba(15,27,45,.12),0 0 0 1px var(--b1)}
.pl-tabs2 button.t-done.on .pl-ic{color:var(--long)}.pl-tabs2 button.t-missed.on .pl-ic{color:var(--short)}.pl-tabs2 button.t-open.on .pl-ic{color:var(--acc)}
.pl-rate{display:flex;align-items:center;gap:8px;min-height:30px;font-size:12px;color:var(--t2)}
.pl-rate .pl-trk{width:120px;flex:none}.pl-rate b{font:700 13px var(--sans);color:var(--t1)}
.pl-grp.done .pl-gl{color:var(--long)}.pl-grp.missed .pl-gl{color:var(--short)}
.pl-cit.missed{color:var(--t2);text-decoration:line-through}
.pl-cit.missed i{background:var(--shortd);box-shadow:inset 0 0 0 1.5px var(--short)}
.pl-ev.missed{opacity:.6}.pl-ev.missed b{text-decoration:line-through}
@container plv (max-width:560px){ .pl-tabs2 button span{display:none} }
@media (hover:none){ .pl-miss{opacity:1} }
/* round 22f — tabs under the notebooks, the full to-do view, pickers, several planners */
.pl-rtabs{display:flex;flex-direction:column;gap:1px;margin-top:6px;padding-top:8px;border-top:1px solid var(--b1)}
.pl-rtabs.min{align-items:center;gap:4px;margin-top:4px;padding-top:6px}
.pl-rtabs.min .pl-rr{width:36px;min-height:34px;justify-content:center;padding:0}
.pl-rr.tab .pl-ic{color:var(--t3)}
.pl-rr.tab.on{background:var(--adim);box-shadow:inset 3px 0 0 var(--acc);color:var(--t1)}
.pl-rr.tab.on .pl-ic{color:var(--acc)}
.pl-rtabs.min .pl-rr.tab.on{box-shadow:inset 0 0 0 1.5px var(--acc)}
.pl-tabh{display:flex;align-items:center;gap:8px;margin:0;font:700 16px var(--sans);color:var(--t1)}
.pl-tabh .pl-ic{color:var(--acc)}.pl-tabh small{font:500 12.5px var(--sans);color:var(--t2)}
.pl-tabsn button{padding:0 10px}
.px-btn.sm{height:28px;padding:0 10px;font-size:12px}
.pl-wid.page{height:auto;min-height:calc(100vh - 230px);overflow:visible}
.pl-wid.page>.pl-wbody{overflow:visible}
.pl-wbody.fv{padding-top:0}
/* the pickers */
.pl-dpop,.pl-tpop2{z-index:80;display:flex;padding:10px;border-radius:12px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 18px 44px rgba(0,0,0,.3);animation:plPop .14s ease;overflow:auto}
.pl-dpop{flex-direction:column;gap:8px}
.pl-dpq{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.pl-dpq button{height:28px;border:0;border-radius:6px;background:var(--s2);color:var(--t1);font:600 12px var(--sans);cursor:pointer}
.pl-dpq button:hover{background:var(--adim);color:var(--acc)}
.pl-dph{display:flex;align-items:center;justify-content:space-between}.pl-dph b{font:700 13px var(--sans);color:var(--t1)}.pl-dph .pl-ib{width:26px;height:26px}
.pl-dpg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.pl-dpg span{text-align:center;font:700 10px var(--sans);color:var(--t3);padding:2px 0}
.pl-dpg button{height:30px;border:0;border-radius:6px;background:none;color:var(--t1);font:500 12.5px var(--sans);font-feature-settings:"tnum";cursor:pointer}
.pl-dpg button:hover{background:var(--s2)}
.pl-dpg button.out{color:var(--t3)}
.pl-dpg button.today{box-shadow:inset 0 0 0 1.5px var(--acc);color:var(--acc);font-weight:700}
.pl-dpg button.on{background:var(--acc);color:var(--on-acc);font-weight:700}
button.pl-dc:disabled{opacity:.6;cursor:default}
button.pl-tsel{border:0;font:500 12px var(--sans);font-feature-settings:"tnum";cursor:pointer}
.pl-tsel span{white-space:nowrap}
.pl-tpop2{gap:10px}
.pl-tpc{display:flex;flex-direction:column;gap:6px;min-width:0}
.pl-tpc small{font:700 10.5px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.pl-tpl{width:84px;max-height:250px;overflow:auto;display:flex;flex-direction:column;gap:1px;scrollbar-width:thin}
.pl-tpl button{flex:none;height:28px;border:0;border-radius:6px;background:none;color:var(--t1);font:500 12.5px var(--sans);font-feature-settings:"tnum";cursor:pointer}
.pl-tpl button:hover{background:var(--s2)}.pl-tpl button.on{background:var(--acc);color:var(--on-acc);font-weight:700}
.pl-tplen{display:grid;grid-template-columns:1fr 1fr;gap:4px;width:130px}
.pl-tplen button{height:28px;border:0;border-radius:6px;background:var(--s2);color:var(--t1);font:600 12px var(--sans);cursor:pointer}
.pl-tplen button.on{background:var(--adim);color:var(--acc);box-shadow:inset 0 0 0 1px var(--accb)}
.pl-tplen button:disabled{opacity:.45;cursor:default}
.pl-tpsum{font:700 13px var(--sans);color:var(--t1);font-feature-settings:"tnum";padding:4px 0}
.pl-tip{position:fixed;z-index:85;max-width:360px;padding:8px 12px;border-radius:10px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 14px 34px rgba(0,0,0,.28);font:500 13px/19px var(--sans);color:var(--t1);overflow-wrap:anywhere;pointer-events:none;animation:plPop .12s ease}
.pl-tinw{flex:1;min-width:0;display:flex}
.pl-rep{display:inline-flex;align-items:center;gap:3px;flex:none;height:20px;padding:0 6px;border-radius:999px;background:var(--s2);color:var(--t2)!important;font:600 10.5px var(--sans)}
/* the full to-do view (Asana-like): sections · a list with columns */
.pl-tdb{display:grid;grid-template-columns:200px minmax(0,1fr);gap:0;min-height:100%}
.pl-tbnav{display:flex;flex-direction:column;gap:2px;padding:8px 10px 8px 0;border-right:1px solid var(--b1)}
.pl-tbs{display:flex;align-items:center;gap:9px;width:100%;min-height:34px;padding:0 10px;border:0;border-radius:8px;background:none;color:var(--t2);font:600 13px var(--sans);text-align:left;cursor:pointer}
.pl-tbs span{flex:1}.pl-tbs small{color:var(--t3);font-weight:600;font-feature-settings:"tnum"}
.pl-tbs:hover{background:var(--s2);color:var(--t1)}
.pl-tbs.on{background:var(--adim);color:var(--t1)}.pl-tbs.on .pl-ic{color:var(--acc)}
.pl-tbs.s-late .pl-ic{color:var(--short)}.pl-tbs.s-done .pl-ic{color:var(--long)}.pl-tbs.s-missed .pl-ic{color:var(--short)}
.pl-tbsep{display:block;height:1px;margin:6px 4px;background:var(--b1)}
.pl-tbrate{display:flex;flex-direction:column;gap:4px;margin-top:auto;padding:10px;border-radius:10px;background:var(--s2)}
.pl-tbrate b{font:800 20px var(--sans);color:var(--t1)}.pl-tbrate small{font-size:11.5px;color:var(--t2)}
.pl-tbmain{display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px 0 8px 14px}
.pl-tbh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pl-tbh h2{margin:0;font:800 19px var(--sans);color:var(--t1)}.pl-tbh>small{color:var(--t3);font-size:12.5px}
.pl-tbq{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;box-shadow:inset 0 0 0 1px var(--b2);color:var(--t3)}
.pl-tbq input{width:140px;height:30px;padding:0;border:0!important;background:none;box-shadow:none!important;font-size:12.5px}
.pl-tbt{display:flex;flex-direction:column}
.pl-trow.wide{display:grid;grid-template-columns:24px minmax(0,1fr) 150px 112px 112px 126px 64px;gap:8px;min-height:40px;padding:2px 6px;border-radius:0;border-bottom:1px solid var(--b1)}
.pl-trow.wide.head{min-height:30px;border-bottom-color:var(--b2)}
.pl-trow.wide.head span{font:700 10.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.pl-trow.wide:not(.head):hover{background:var(--hover)}
.pl-tcol{display:flex;align-items:center;min-width:0}
.pl-tcol.act{justify-content:flex-end;gap:2px}
.pl-tcol .pl-nbd{max-width:100%}
.pl-rsel{width:100%;height:26px;padding:0 6px;border:0!important;border-radius:999px;background:var(--s2);color:var(--t2);font:500 12px var(--sans);box-shadow:none!important;cursor:pointer}
.pl-rsel.on{background:var(--adim);color:var(--acc);font-weight:600}
.pl-tbg .pl-gl{padding:12px 6px 4px}
.pl-tdb.inw{height:100%}
.pl-todopage{padding:6px 12px}
/* several planners: chips on the dashboard, tiles in the Planner tab */
.pl-pchips{flex:none;display:flex;align-items:center;gap:6px;overflow-x:auto;padding:0 0 8px;scrollbar-width:thin}
.pl-pchip{flex:none;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:999px;background:var(--s2);color:var(--t2);font:600 12.5px var(--sans);cursor:pointer;white-space:nowrap}
.pl-pchip i{width:8px;height:8px;border-radius:50%;background:var(--nb)}
.pl-pchip em{font:700 11px var(--sans);font-style:normal;color:var(--t3);font-feature-settings:"tnum"}
.pl-pchip:hover{color:var(--t1)}
.pl-pchip.on{background:var(--adim);color:var(--t1);box-shadow:inset 0 0 0 1.5px var(--accb)}.pl-pchip.on em{color:var(--acc)}
.pl-pchip.add{background:none;color:var(--acc);box-shadow:inset 0 0 0 1px var(--accb)}
.pl-pchip.edit{padding:0 4px 0 10px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--acc)}
.pl-pchip.edit input{width:170px;height:26px;padding:0;border:0!important;background:none;box-shadow:none!important;font-size:12.5px}
.pl-pchip.edit select{width:auto;height:24px;padding:0 4px;font-size:12px}
.pl-ptool{display:flex;align-items:center;gap:6px;min-height:30px;padding-bottom:4px}
.pl-ptiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;align-content:start}
.pl-ptile{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border-top:3px solid var(--nb,var(--b2));cursor:pointer;transition:transform .15s,box-shadow .15s}
.pl-ptile:hover{transform:translateY(-1px);box-shadow:0 10px 24px -14px rgba(15,27,45,.35)}
.pl-ptile:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.pl-pth{display:flex;align-items:flex-start;gap:6px}.pl-pth h4{flex:1;margin:0;font:700 15px/21px var(--sans);color:var(--t1);overflow-wrap:anywhere}
.pl-ptp{display:flex;align-items:center;gap:8px}.pl-ptp b{font:800 15px var(--sans);color:var(--t1)}
.pl-ptm{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--t2)}.pl-ptm .late{color:var(--short);font-weight:600}
.pl-ptd{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t3)}
.pl-ptile.add{cursor:default;border-top-color:var(--acc);justify-content:center;align-items:flex-start}
.pl-pdetail>.pl-ch{gap:10px}
/* the calendar: repeats */
.pl-cit.ghost{opacity:.5;background:none;box-shadow:inset 0 0 0 1px dashed var(--b2);font-style:italic}
.pl-ev.ghost2{opacity:.45;cursor:default;border-left-style:dashed}
.pl-legend i.dot.ghost{opacity:.45}
.pl-ghostrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;color:var(--t3);font-size:12.5px;font-style:italic}
.pl-ghostrow small{font-style:normal;font-size:11px}
@container plv (max-width:820px){
  .pl-tdb{grid-template-columns:minmax(0,1fr)}
  .pl-tbnav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--b1);padding:0 0 8px}
  .pl-tbs{width:auto}.pl-tbsep,.pl-tbrate{display:none}
  .pl-tbmain{padding-left:0}
  .pl-trow.wide{grid-template-columns:24px minmax(0,1fr) auto auto 64px}
  .pl-trow.wide>.pl-tcol.nb,.pl-trow.wide>.pl-tcol:nth-child(6),.pl-trow.wide.head>span:nth-child(3),.pl-trow.wide.head>span:nth-child(6){display:none}
}
.pl-trow:not(.wide) .pl-tsel.none{padding:0 6px;box-shadow:none;background:none}
.pl-trow:not(.wide) .pl-tsel.none span{display:none}
.pl-trow:not(.wide) .pl-tsel.none:hover{background:var(--s2)}
.pl-trow:not(.wide) .pl-rep span{display:none}
.pl-trow:not(.wide) .pl-rep{padding:0 5px}
`;
