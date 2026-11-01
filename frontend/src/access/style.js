// Access manager v2 styles (the shared am-* look comes from AM_CSS in shared.jsx)
export const AX_CSS = `
.ax .num{text-align:right}
.ax-tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 14px}
.ax-tabs>button{display:flex;gap:10px;align-items:center;text-align:left;padding:10px 14px;border-radius:12px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);cursor:pointer;min-width:220px;font-family:inherit}
.ax-tabs>button svg{flex-shrink:0;color:var(--t3)}
.ax-tabs>button b{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--t1)}
.ax-tabs>button b i{font-style:normal;font-size:10.5px;font-weight:700;padding:0 7px;border-radius:999px;background:var(--s2);color:var(--t2)}
.ax-tabs>button small{display:block;font-size:11px;color:var(--t3);margin-top:1px}
.ax-tabs>button:hover{border-color:var(--accborder)}
.ax-tabs>button.on{border-color:var(--acc);background:var(--adim)}.ax-tabs>button.on svg{color:var(--acc)}
.ax-pane{position:relative;padding-bottom:70px}
.ax-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.ax-tools.sm{margin:8px 0}
.ax-search{display:flex;align-items:center;gap:6px;background:var(--s2);border:1px solid var(--b2);border-radius:8px;padding:0 8px;min-width:220px}
.ax-search svg{color:var(--t3);flex-shrink:0}
.ax-search input{border:0;background:none;color:var(--t1);font-size:12.5px;padding:7px 0;outline:none;flex:1;min-width:0}
.ax-search button{border:0;background:none;color:var(--t3);cursor:pointer;font-size:12px}
.ax-search:focus-within{border-color:var(--acc)}
.ax-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.ax-chips button{border:1px solid var(--b2);background:var(--s1);color:var(--t2);font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.ax-chips button span{font-size:10.5px;padding:0 6px;border-radius:999px;background:var(--s2);color:var(--t3)}
.ax-chips button.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.ax-tw{max-height:none}
.ax-t td{vertical-align:middle}
.ax-row{cursor:pointer}.ax-row:hover td{background:var(--hover,rgba(127,127,127,.05))}
.ax-row.dim{opacity:.55}
.ax-grp td{background:var(--s2);padding:8px 10px!important}
.ax-fold{border:0;background:none;color:var(--t2);cursor:pointer;width:20px;font-size:12px}
.ax-apph{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.ax-appi{display:inline-flex;width:24px;height:24px;border-radius:7px;align-items:center;justify-content:center;background:var(--adim);color:var(--acc)}
.ax-appd{margin-left:6px}
.ax-edit{font-size:11.5px;margin-left:6px}
.ax-appedit{display:inline-flex;gap:6px;align-items:center;flex:1;min-width:0;width:calc(100% - 30px)}
.ax-pn{display:inline-flex;flex-direction:column;gap:1px;min-width:0}
.ax-pnl{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.ax-key{font-family:var(--mono);font-size:10.5px;color:var(--t3)}
.ax-desc{max-width:520px;margin-top:2px}
.ax-grpchip{margin-left:6px}
.ax-count{border:1px solid var(--b2);background:var(--s1);color:var(--t1);border-radius:7px;font-family:var(--mono);font-weight:700;font-size:12px;padding:2px 10px;cursor:pointer;min-width:38px}
.ax-count:hover{border-color:var(--acc);color:var(--acc)}
.ax-count.own{border-color:var(--mixed);color:var(--mixed)}
.ax-pending{position:sticky;bottom:10px;z-index:5;display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px 14px;border-radius:12px;border:1px solid var(--mixed);background:color-mix(in srgb,var(--mixed) 12%,var(--s1));box-shadow:0 10px 30px -12px rgba(0,0,0,.35)}
.ax-pdot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--mixed);flex-shrink:0}
.ax-ov{position:fixed;inset:0;z-index:1000;background:rgba(3,8,16,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.ax-ov.side{justify-content:flex-end;align-items:stretch;padding:0}
.ax-dlg{width:min(620px,100%);max-height:88vh;overflow:auto;background:var(--s1);border:1px solid var(--b2);border-radius:14px;padding:18px 20px;outline:none}
.ax-dlg h3{margin:0 0 12px;font-size:16px;color:var(--t1)}
.ax-dlgf{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ax-lines{margin:0 0 10px;padding-left:18px;font-size:12.5px;color:var(--t1);line-height:1.55}
.ax-rsec{border-top:1px solid var(--b1);padding:9px 0;font-size:12.5px;color:var(--t1)}
.ax-rh{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3);font-weight:700;margin-bottom:6px}
.ax-rrow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:4px}
.ax-tag{font-family:var(--mono);font-size:10.5px;padding:1px 7px;border-radius:6px}
.ax-tag.add,.ax-gl.add{color:var(--long)}.ax-tag.add{background:var(--longd)}
.ax-tag.rem,.ax-gl.rem{color:var(--short)}.ax-tag.rem{background:var(--shortd)}
.ax-gl{display:flex;gap:6px;align-items:center;padding:3px 0;font-weight:600}
.ax-n{margin-left:auto;color:var(--t1);font-weight:700;font-family:var(--mono);font-size:12px}
.ax-eff{margin-bottom:4px}
.ax-ownerbox{margin-top:10px;display:flex;align-items:center;flex-wrap:wrap}
.ax-drawer{width:min(620px,100vw);height:100%;overflow:auto;background:var(--bg);border-left:1px solid var(--b2);box-shadow:-30px 0 60px -30px rgba(0,0,0,.5)}
.ax-drawer.wide{width:min(760px,100vw)}
.ax-drawer header{position:sticky;top:0;z-index:2;display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:16px 18px 12px;background:var(--bg);border-bottom:1px solid var(--b1)}
.ax-drawer h3{margin:0 0 3px;font-size:16px;color:var(--t1)}
.ax-x{border:1px solid var(--b2);background:none;color:var(--t2);border-radius:8px;width:32px;height:32px;cursor:pointer;flex-shrink:0}
.ax-dbody{padding:4px 18px 30px}
.ax-sec{padding:14px 0;border-bottom:1px solid var(--b1)}
.ax-sec h4{display:flex;gap:8px;align-items:center;margin:0 0 10px;font-size:13.5px;color:var(--t1)}
.ax-form{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.ax-form .am-fl{flex:1;min-width:160px}
.ax-wide{flex-basis:100%!important}.ax-wide2{flex:2!important}
.ax-swrow{display:flex;gap:10px;align-items:flex-start;flex-basis:100%;font-size:12.5px;color:var(--t1)}
.ax-meta{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--t2);margin-bottom:10px}
.ax-meta code{font-family:var(--mono);font-size:11px;color:var(--t1)}
.ax-checks{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto;margin-top:8px;padding-right:4px}
.ax-check{display:flex;gap:9px;align-items:flex-start;padding:7px 10px;border:1px solid var(--b1);border-radius:9px;background:var(--s1);cursor:pointer;font-size:12.5px;color:var(--t1)}
.ax-check.sm{padding:4px 6px;border:0;background:none}
.ax-check input{margin-top:3px;accent-color:var(--acc)}
.ax-check.chg{border-color:var(--mixed);background:color-mix(in srgb,var(--mixed) 10%,var(--s1))}
.ax-check.dis{opacity:.55;cursor:not-allowed}
.ax-check.row{align-items:center}
.ax-row-actions{display:flex;gap:8px;align-items:center;margin-top:10px}
.ax-row-actions.wrap{flex-wrap:wrap}
.ax-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.ax-li{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--b1);border-radius:9px;background:var(--s1);font-size:12.5px;color:var(--t1)}
.ax-li.dim{opacity:.55}
.ax-why,.ax-chipw{display:flex;gap:4px;flex-wrap:wrap}
.ax-direct{border-color:color-mix(in srgb,var(--mixed) 55%,transparent)!important;background:color-mix(in srgb,var(--mixed) 10%,transparent)!important}
.ax-pager{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-top:10px}
.ax-pg{font-size:12px;color:var(--t2);padding:0 4px}
.ax-roles{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;align-items:start}
.ax-roles>.ax-pending{grid-column:1/-1}
.ax-rlist{position:sticky;top:8px;display:flex;flex-direction:column;gap:8px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:10px}
.ax-rlh{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--t1)}
.ax-rlist .ax-search{min-width:0}
.ax-rcards{display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow:auto}
.ax-rcard{display:flex;flex-direction:column;gap:2px;text-align:left;padding:8px 10px;border-radius:9px;border:1px solid transparent;background:none;color:var(--t1);cursor:pointer;font-family:inherit;font-size:12.5px}
.ax-rcard:hover{background:var(--s2)}.ax-rcard.on{border-color:var(--acc);background:var(--adim)}
.ax-rct{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.ax-rmain{min-width:0}
.ax-rv{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px 14px}
.ax-rvh{border-bottom:1px solid var(--b1);padding-bottom:10px}
.ax-rvmeta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--t2)}
.ax-chg{font-size:11.5px;font-weight:700;color:var(--mixed)}
.ax-only{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--t2);cursor:pointer}
.ax-pgroups{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
.ax-pg{display:flex;flex-direction:column;gap:4px;border:1px solid var(--b1);border-radius:11px;padding:8px;background:var(--bg)}
.ax-pgh{display:flex;align-items:center;gap:6px;padding:2px 2px 6px;font-size:12.5px;color:var(--t1)}
.ax-needs{display:block;font-size:10.5px}
.ax-chgtag{margin-left:auto;font-size:10.5px;font-weight:700;color:var(--mixed);white-space:nowrap}
.ax-mtw{overflow:auto;max-height:70vh}
.ax-mx{border-collapse:separate;border-spacing:0}
.ax-mx th,.ax-mx td{border-bottom:1px solid var(--b1)}
.ax-sticky{position:sticky;left:0;z-index:1;background:var(--s1);min-width:260px;max-width:340px}
.ax-mx thead th{position:sticky;top:0;z-index:2;background:var(--s1)}
.ax-mx thead th.ax-sticky{z-index:3}
.ax-grp .ax-sticky{background:var(--s2)}
.ax-mc{text-align:center;min-width:92px}
.ax-cell{width:26px;height:26px;border-radius:7px;border:1.5px solid var(--b2);background:var(--s1);color:#fff;font-weight:800;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.ax-cell:hover{border-color:var(--acc)}
.ax-cell.on{background:var(--acc);border-color:var(--acc)}
.ax-cell.on.own{background:var(--mixed);border-color:var(--mixed)}
.ax-cell.chg{box-shadow:0 0 0 3px color-mix(in srgb,var(--mixed) 55%,transparent)}
.ax-cell:not(.on).chg{border-color:var(--mixed);background:color-mix(in srgb,var(--mixed) 18%,var(--s1))}
.ax-cell:disabled{opacity:.35;cursor:not-allowed}
.ax-rowall{display:block;font-size:10.5px;margin-top:2px}
.ax-diff td{background:color-mix(in srgb,var(--mixed) 8%,transparent)}
.ax-colpick{position:relative}
.ax-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:280px;background:var(--s1);border:1px solid var(--b2);border-radius:11px;padding:8px;box-shadow:0 16px 40px -16px rgba(0,0,0,.45)}
.ax-pop .ax-search{min-width:0}
.ax-poplist{max-height:260px;overflow:auto;margin-top:6px}
.ax-bulk{position:sticky;top:6px;z-index:4;flex-wrap:wrap}
.ax-until{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--t2)}
.ax-selall{padding:8px 12px;margin-bottom:8px;border-radius:9px;background:var(--s2);font-size:12.5px;color:var(--t1)}
.ax-selall.on{background:var(--adim);border:1px solid var(--accborder)}
.ax-can{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--t2)}
.ax-rchip{display:inline-flex;gap:5px;align-items:center}
.ax-rchip button{border:0;background:none;color:var(--t2);cursor:pointer;font-size:11px;padding:0 2px}
.ax-rchip button:disabled{opacity:.3;cursor:not-allowed}
.ax-effg{margin-bottom:10px}
.ax-effh{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--t1);margin-bottom:4px}
.ax-effr{display:grid;grid-template-columns:22px minmax(0,1fr) minmax(0,auto);gap:8px;align-items:center;padding:6px 8px;border-radius:8px;font-size:12.5px;color:var(--t1)}
.ax-effr:nth-child(odd){background:var(--s1)}
.ax-mk{display:inline-flex;width:20px;height:20px;border-radius:6px;align-items:center;justify-content:center;font-weight:800;font-size:12px}
.ax-effr.ok .ax-mk{background:var(--longd);color:var(--long)}.ax-effr.no .ax-mk{background:var(--shortd);color:var(--short)}
.ax-whytext{font-size:11.5px;color:var(--t2);text-align:right}
@media (max-width:900px){.ax-roles{grid-template-columns:1fr}.ax-rlist{position:static}.ax-tabs>button{min-width:0;flex:1}}
`;
