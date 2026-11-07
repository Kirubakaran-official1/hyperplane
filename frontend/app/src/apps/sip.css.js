// Momentum SIP styles (design system tokens, ds.css.js). The page header is the shared .hp-band (shell.css.js).
export const CSS = `
.sp{--sp-ai:#8b5cf6;display:flex;flex-direction:column;gap:12px}
.sp .hp-band{margin-bottom:0}
.sp-empty{display:flex;align-items:center;gap:8px;padding:18px 22px;color:var(--t2);font-size:13px}
.sp-form{padding:4px 20px 18px}
.sp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}
.sp-step{display:flex;flex-direction:column;gap:8px;padding:14px 0;border-bottom:1px solid var(--b1);min-width:0}
.sp-l{display:flex;align-items:center;gap:8px;font:600 13px/20px var(--sans);color:var(--t1)}
.sp-l i{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--acc);color:var(--on-acc,#fff);font:700 11px var(--sans);font-style:normal}
.sp-amt{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sp-amt>span{font:600 18px var(--sans);color:var(--t2)}
.sp-amt input{width:170px;height:40px;padding:0 12px;font:700 18px var(--sans);font-feature-settings:"tnum"}
.sp-seg{display:inline-flex;border:1px solid var(--b2);border-radius:8px;overflow:hidden;flex-wrap:wrap}
.sp-seg button{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border:0;background:var(--s1);color:var(--t2);font:600 13px var(--sans);cursor:pointer}
.sp-seg button+button{border-left:1px solid var(--b2)}.sp-seg button.on{background:var(--adim);color:var(--acc)}
.sp-seg button.off{color:var(--t3);cursor:not-allowed}.sp-seg.wide button{height:36px}
.sp-chips{display:flex;gap:6px;flex-wrap:wrap}
.sp-chips button{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--b2);background:var(--s1);color:var(--t2);font:600 12px var(--sans);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.sp-chips button:hover{border-color:var(--acc);color:var(--t1)}.sp-chips button.on{border-color:var(--acc);background:var(--adim);color:var(--acc)}
.sp-chips button.rec{border-style:dashed}.sp-chips button.rec.on{border-style:solid}
.sp-err{margin:0}
.sp-sliders{display:flex;flex-direction:column;gap:6px}
.sp-stack{display:flex;gap:2px;height:22px;border-radius:6px;overflow:hidden;background:var(--s3)}
.sp-stack i{display:flex;align-items:center;justify-content:center;min-width:0;font:700 11px var(--sans);font-style:normal;color:#fff;transition:flex-grow .2s}
.sp-sr{display:grid;grid-template-columns:minmax(0,250px) minmax(0,1fr) 44px;gap:10px;align-items:center;font-size:13px;color:var(--t1)}
.sp-sr>span{display:flex;align-items:center;gap:8px;min-width:0;font-weight:600;white-space:nowrap}.sp-sr>span i{flex:none;width:10px;height:10px;border-radius:3px}
.sp-sr>span small{font-weight:400;font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-sr input[type=range]{width:100%;accent-color:var(--acc)}.sp-sr b{text-align:right;font-feature-settings:"tnum"}
.sp-years{width:80px!important;text-align:center}.sp-yl{font:600 14px var(--sans)!important;color:var(--t2)}
.sp-hint{font-size:12px;color:var(--t2)}
.sp-go{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding-top:16px}
.sp-build{height:44px;padding:0 24px;font-size:15px;display:inline-flex;align-items:center;gap:8px}
.sp-actbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sp-actbar .px-btn{display:inline-flex;align-items:center;gap:6px;height:34px}
.sp-confirm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;font-size:13px}
.sp-confirm>span{flex:1 1 260px}.sp-confirm.ok{border-color:var(--acc);background:var(--adim)}
.sp-confirm input{flex:1 1 220px;height:34px;padding:0 10px;font-size:13px}
.sp-over{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;border:1px solid color-mix(in srgb,var(--sp-ai) 40%,var(--b1));
  background:color-mix(in srgb,var(--sp-ai) 8%,var(--s1));font-size:13px;color:var(--t1)}
.sp-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sp-kpi b.sp-kpi-sm{font-size:17px}
.sp-row2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px}
.sp-ai{padding:16px 18px;border-left:3px solid var(--sp-ai)}
.sp-ins{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.sp-bars{display:flex;flex-direction:column;gap:5px}
.sp-bl{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 44px;gap:8px;align-items:center;font-size:12px;color:var(--t2);width:100%;border:0;background:none;padding:4px 6px;margin:0 -6px;border-radius:6px;cursor:pointer;text-align:left;font-family:inherit;transition:background .15s,opacity .2s}
.sp-bl span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-bl i{height:8px;border-radius:999px;background:var(--s3);overflow:hidden}
.sp-bl i b{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--acc),var(--sp-ai))}
.sp-bl em{font-style:normal;text-align:right;font-weight:600;color:var(--t1);font-feature-settings:"tnum"}
.sp-spread{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.sp-spread .px-label{width:100%}
.sp-sp{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--s2);font-size:12px;color:var(--t2)}
.sp-sp b{color:var(--t1)}.sp-sp.Strong b{color:var(--long)}
.sp-hold{padding:0;overflow:hidden}
.sp-hh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--b1)}
.sp-hh b{display:flex;align-items:center;gap:8px;font:600 14px var(--sans);color:var(--t1)}.sp-hh small{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--t2)}
.sp-th,.sp-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,.6fr);gap:16px;align-items:center}
.sp-th{padding:8px 16px;font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--b1)}
.sp-row{width:100%;padding:10px 16px;border:0;border-bottom:1px solid var(--b1);background:none;cursor:pointer;font:inherit;color:inherit;text-align:left}
.sp-row:last-child{border-bottom:0}.sp-row:hover{background:var(--s2)}
.sp-n,.sp-u,.sp-money{display:flex;flex-direction:column;gap:2px;min-width:0}
.sp-n b,.sp-u b{display:flex;align-items:center;gap:6px;font:600 14px/20px var(--sans);color:var(--t1)}
.sp-n small,.sp-u small,.sp-money small{font-size:12px;line-height:16px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-n em.rs{font:700 10.5px/16px var(--sans);font-style:normal;padding:0 6px;border-radius:999px;background:var(--longd);color:var(--long)}
.sp-n em.rs.M{background:var(--mixedd);color:var(--mixed)}.sp-n em.rs.W{background:var(--shortd,var(--s3));color:var(--short,var(--t2))}
.sp-n em.role{font:600 10px/16px var(--sans);font-style:normal;padding:0 6px;border-radius:999px;background:var(--adim);color:var(--acc);text-transform:uppercase;letter-spacing:.04em}
.sp-n em.role.th{background:color-mix(in srgb,var(--sp-ai) 14%,var(--s1));color:var(--sp-ai)}
.sp-hold .num{text-align:right;align-items:flex-end}.sp-money b{font:600 14px/20px var(--sans);font-feature-settings:"tnum"}
.sp-st{display:grid;grid-template-columns:80px auto;grid-template-rows:auto auto;column-gap:10px;align-items:center}
.sp-bar{grid-row:1/3;position:relative;height:8px;border-radius:999px;background:var(--s3)}
.sp-bar::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--b2)}
.sp-bar i{position:absolute;top:0;bottom:0;border-radius:999px;background:currentColor}
.sp-st b{font:700 14px/18px var(--sans);font-feature-settings:"tnum"}.sp-st small{font-size:11px;color:var(--t2)}
.sp-st.big{grid-template-columns:130px auto}.sp-st.big .sp-bar{height:10px}.sp-st.big b{font-size:24px;line-height:30px}
.sp-na{color:var(--t3)}
.sp-sim{padding:0;overflow:hidden}
.sp-simb{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px;padding:12px 16px 14px}
.sp-simc{display:flex;flex-direction:column;gap:10px}
.sp-rate{position:relative;padding-top:30px}
.sp-bub{position:absolute;top:0;left:clamp(46px,calc(9px + (100% - 18px) * var(--f)),calc(100% - 46px));transform:translateX(-50%);padding:3px 9px;border-radius:999px;background:var(--sp-ai);color:#fff;font:700 12px/18px var(--sans);white-space:nowrap;font-feature-settings:"tnum"}
.sp-bub::after{content:"";position:absolute;left:50%;bottom:-4px;width:8px;height:8px;background:inherit;transform:translateX(-50%) rotate(45deg)}
.sp-rticks{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--t3)}
.sp-simk{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sp-simk div{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:10px;background:var(--s2)}
.sp-simk div.hl{background:color-mix(in srgb,var(--sp-ai) 12%,var(--s1));border:1px solid color-mix(in srgb,var(--sp-ai) 35%,var(--b1))}
.sp-simk small{font-size:12px;color:var(--t2)}.sp-simk b{font:700 22px/28px var(--sans);color:var(--t1);font-feature-settings:"tnum"}
.sp-stt{max-height:260px;overflow-y:auto}
.sp-stt>div{display:grid;grid-template-columns:50px repeat(3,minmax(0,1fr));gap:8px;padding:6px 0;border-bottom:1px solid var(--b1);font-size:12.5px;color:var(--t1);font-feature-settings:"tnum"}
.sp-stt>div.h{font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3)}.sp-stt .num{text-align:right}
.sp-ov{z-index:100}
.sp-panel{width:min(760px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:20px 22px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.sp-ph{display:flex;justify-content:space-between;gap:12px}.sp-ph h2{margin:6px 0 0;font:700 22px/28px var(--sans);color:var(--t1)}.sp-ph h2 small{font:500 13px var(--sans);color:var(--t2)}
.sp-ph .x{position:static;flex:none}
.sp-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.sp-tags span{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;background:var(--s2);font-size:12px;color:var(--t2)}
.sp-tags .rel.S{background:var(--longd);color:var(--long)}.sp-tags .rel.M{background:var(--mixedd);color:var(--mixed)}.sp-tags .rel.W{background:var(--shortd,var(--s3));color:var(--short,var(--t2))}
.sp-verdict{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:8px;background:var(--s2)}
.sp-verdict>b{display:flex;align-items:center;gap:6px;font:700 16px var(--sans)}
.sp-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sp-facts>div{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:8px;border:1px solid var(--b1);min-width:0}
.sp-facts>div>b{font:700 15px/20px var(--sans);color:var(--t1)}.sp-facts>div>b small{font-weight:500;color:var(--t3)}.sp-facts>div>small{font-size:12px;color:var(--t2)}
.sp-tfs{display:flex;gap:12px}.sp-tfs span{display:flex;flex-direction:column}.sp-tfs small{font-size:11px;color:var(--t3)}.sp-tfs b{font:700 13px var(--sans)}
.sp-meter{display:block;height:6px;border-radius:999px;background:var(--s3);overflow:hidden}.sp-meter b{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--sp-ai))}
.sp-safe{display:flex;flex-direction:column;gap:6px}
.sp-checks2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.sp-checks2 span{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;background:var(--s2);font-size:12px;color:var(--t2)}
.sp-checks2 span b{margin-left:auto;color:var(--t1);font-feature-settings:"tnum"}.sp-checks2 .ok .ic{color:var(--long)}.sp-checks2 .no .ic{color:var(--mixed)}
.sp-zone{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:var(--adim);font-size:13px;color:var(--t1)}
.sp-whyp ul{margin:6px 0 0;padding-left:18px;font-size:13px;line-height:20px;color:var(--t1)}
.sp-buy{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sp-buy div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:8px;background:color-mix(in srgb,var(--sp-ai) 8%,var(--s1))}
.sp-buy small{font-size:11px;color:var(--t3)}.sp-buy b{font:700 13px var(--sans);color:var(--t1)}
.sp-peers{display:flex;flex-direction:column;gap:6px}.sp-peers>div{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--b1)}
.sp-peers>div small{flex:1;font-size:12px;color:var(--t3)}
/* two apps (owner 2026-11-06): the Reliable / Risk chip, the RISK banner, the Helpdesk note, ETF choices, How to buy */
.sp-mode{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;font:700 11.5px var(--sans);letter-spacing:.03em;text-transform:uppercase}
.sp-mode.safe{background:var(--longd);color:var(--long)}.sp-mode.risk{background:var(--shortd);color:var(--short)}
.sp-risk{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--short) 45%,var(--b1));
  background:color-mix(in srgb,var(--short) 9%,var(--s1));font-size:13px;line-height:19px;color:var(--t1)}.sp-risk>svg,.sp-risk .ic{color:var(--short);flex:none;margin-top:2px}
.sp-risk b{color:var(--short)}
.sp-help{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--t2)}.sp-help b{color:var(--t1)}
.sp-helpb{border:0;background:none;color:var(--acc);font:600 12px var(--sans);cursor:pointer;padding:0;text-decoration:underline}
.sp-sws{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.sp-tcard{padding:0;overflow:hidden}.sp-tcard .sp-st{grid-template-columns:70px auto}
.sp-howm{width:min(680px,100%)}
.sp-howl{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:13.5px;line-height:20px;color:var(--t1)}
.sp-howf{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--t2)}
@media (max-width:980px){.sp-grid{grid-template-columns:1fr}.sp-row2{grid-template-columns:1fr}.sp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sp-simb{grid-template-columns:1fr}}
@media (max-width:640px){.sp-sws{grid-template-columns:1fr}
  .sp-form{padding:4px 14px 14px}.sp-amt input{width:100%}
  .sp-th{display:none}.sp-row{grid-template-columns:minmax(0,1fr) auto;row-gap:6px}.sp-row .sp-st{grid-column:1/-1}
  .sp-sr{grid-template-columns:minmax(0,1fr) 44px}.sp-sr input[type=range]{grid-column:1/-1;grid-row:2}.sp-facts,.sp-checks2{grid-template-columns:1fr}
}
/* round 5 (owner 2026-11-06): the Builder form layout, the ETF count, the safest-ETF note, bars that filter the table */
.sp-start .pf-sl{gap:22px}.sp-start .pf-go{margin-top:4px;display:flex;align-items:center;justify-content:center;gap:8px}
.pf-go .ai-spark{color:#fff;opacity:1;filter:drop-shadow(0 0 4px rgba(255,255,255,.45))}
.sp-amtrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sp-amtrow .bd-amt{flex:1 1 260px}
.sp-amtrow .sp-seg button{height:38px}
.sp-yrs{flex:0 0 130px!important;max-width:130px}.sp-yrs input{text-align:right}.sp-yrs em{color:var(--t2)!important}
.bd-chips button.sp-capd:not(.on){color:var(--t3);border-style:dashed}
.bd-chips button.sp-rec{border-style:dashed;display:inline-flex;align-items:center;gap:6px}.bd-chips button.sp-rec.on{border-style:solid}
.sp-al .al-top .sp-stack{flex:1;height:12px;border-radius:4px}.sp-al .al-top .sp-stack i{font-size:0}
.sp-safen{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:8px;border:1px solid color-mix(in srgb,var(--long) 40%,var(--b1));background:var(--longd)}
.sp-safen>svg,.sp-safen .ic{color:var(--long);flex:none;margin-top:2px}
.sp-safen>div{display:flex;flex-direction:column;gap:4px;font-size:12.5px;line-height:18px;color:var(--t2)}.sp-safen b{font:600 13px var(--sans);color:var(--t1)}
.sp-safen.alt{border-color:var(--accb);background:var(--adim)}.sp-safen.alt>svg,.sp-safen.alt .ic{color:var(--acc)}.sp-safen .px-btn{align-self:flex-start;margin-top:4px}
.sp-kpin b small{font:500 12px var(--sans);color:var(--t2);margin-left:4px}
.sp-pick{display:flex;gap:2px;height:6px;border-radius:3px;overflow:hidden;margin:6px 0 4px}.sp-pick i{flex-basis:0;min-width:0}
.sp-bars .px-label{display:flex;align-items:baseline;gap:8px}.sp-bars .px-label small{font:400 11px var(--sans);letter-spacing:0;text-transform:none;color:var(--t3)}
.sp-bll{display:flex;flex-direction:column;gap:1px;max-height:250px;overflow-y:auto;padding:0 6px;scrollbar-width:thin;scrollbar-color:var(--b2) transparent}
.sp-bl:hover{background:var(--s2)}.sp-bl.on{background:var(--adim);box-shadow:inset 3px 0 0 var(--acc)}.sp-bl.on span{color:var(--acc);font-weight:600}
.sp-bl.dim{opacity:.45}.sp-bl.dim:hover{opacity:.85}.sp-bl:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.sp-fchip{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 4px 0 12px;border-radius:999px;background:var(--adim);border:1px solid var(--accb);color:var(--acc);font:600 12px var(--sans);animation:spIn .25s ease-out}
.sp-fchip button{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 9px;border:0;border-radius:999px;background:var(--s1);color:var(--t1);font:600 11.5px var(--sans);cursor:pointer}
.sp-fchip button:hover{background:var(--s2)}
.hp-row.sp-in{animation:spIn .28s ease-out}
@keyframes spIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.hp-row.sp-in,.sp-fchip{animation:none}}
.sp .c-good{color:var(--long)}.sp .c-bad{color:var(--short)}.sp .c-side{color:var(--t2)}
.sp-bll{max-height:206px}
.sp-rate input.al-range{height:6px;padding:0;border:0;border-radius:3px;box-shadow:none;min-width:0;width:100%}
@media (max-width:640px){.sp-risk{flex-wrap:wrap}.sp-yrs{flex-basis:110px!important}.sp-aik{grid-template-columns:1fr}.sp-nbox{width:100%}}
/* round 6 (owner 2026-11-06): the green "Prefer lower risk?" call to action, "Sleep peacefully with ETFs", the stock
   count box, Hyperplane AI numbers under the summary */
.sp-risk{align-items:center}.sp-risk>div{flex:1}
.sp-sleep::before{content:"";width:14px;height:14px;flex:none;background:currentColor;
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/%3E%3C/svg%3E") center/contain no-repeat}
.sp-togo b{font-size:14px}
.sp-gobtn span{transition:transform .2s}.sp-gobtn:hover span{transform:translateX(3px)}
.sp-nbox{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 4px 0 12px;border:1px dashed var(--b2);border-radius:999px;background:var(--s1);font-size:12px;color:var(--t2)}
.sp-nbox:focus-within{border-style:solid;border-color:var(--acc);box-shadow:var(--ds-field-glow)}
.sp-nbox input{width:64px;height:24px;border:0;outline:0;box-shadow:none;padding:0 4px;background:none;font:700 13px var(--sans);color:var(--t1);text-align:right;-moz-appearance:textfield}
.sp-nbox input::-webkit-outer-spin-button,.sp-nbox input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.sp-nbox em{font-style:normal;padding-right:8px}
.sp-ai{display:flex;flex-direction:column}
.sp-aix{margin-top:auto;padding-top:14px;border-top:1px dashed var(--b1);display:flex;flex-direction:column;gap:12px}
.sp-aisp{display:flex;flex-direction:column;gap:6px}
.sp-aibar{display:flex;gap:2px;height:10px;border-radius:5px;overflow:hidden;background:var(--s3)}.sp-aibar i{flex-basis:0;min-width:3px}
.sp-aileg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--t2)}.sp-aileg span{display:inline-flex;align-items:center;gap:5px}
.sp-aileg i{width:9px;height:9px;border-radius:2px}.sp-aileg b{color:var(--t1)}.sp-aileg small{color:var(--t3)}
.sp-aik{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sp-aik>div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:8px;background:var(--s2);min-width:0}
.sp-aik small{font:600 10px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t3)}
.sp-aik b{font:700 15px/20px var(--sans);color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-aik b.sym{color:var(--acc)}
.sp-aik em{font-style:normal;font-size:12px;color:var(--t2)}
.sp .bd-cards2 button{border-radius:10px}
/* the green switch button (owner round 6: "I don't like the button colour and type") — solid green, white text, no icon tile */
.sp-tosafe:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.sp-tost{display:flex;flex-direction:column;line-height:1.3}.sp-tost b{font:600 14px/20px var(--sans);color:#fff}.sp-tost small{font:400 11.5px/16px var(--sans);color:rgba(255,255,255,.85)}
.sp-toar{font:600 18px var(--sans);color:#fff;transition:transform .2s}.sp-tosafe:hover .sp-toar{transform:translateX(3px)}
@media (max-width:640px){.sp-tosafe{width:100%;justify-content:space-between}}
/* round 7 (owner 2026-11-07): the gradient button (not green), the style cards, the sleep line */
.sp-tosafe{flex:none;display:inline-flex;align-items:center;gap:14px;min-height:44px;padding:6px 16px 6px 18px;border:0;border-radius:8px;cursor:pointer;text-align:left;
  background:linear-gradient(135deg,var(--acc) 0%,#6366f1 55%,#8b5cf6 100%);background-size:140% 140%;color:#fff;font-family:var(--sans);
  box-shadow:0 2px 10px color-mix(in srgb,#6366f1 35%,transparent);transition:background-position .4s,transform .15s,box-shadow .15s}
.sp-tosafe:hover{background-position:100% 50%;transform:translateY(-1px);box-shadow:0 6px 18px color-mix(in srgb,#6366f1 42%,transparent)}
.sp-togo{padding:14px 16px;background:linear-gradient(160deg,var(--adim),color-mix(in srgb,#8b5cf6 7%,var(--s1)));border-color:var(--accb)}
.sp-togo>svg,.sp-togo .ic{color:var(--acc)}.sp-togo b{font-size:14px}
.sp-gobtn{align-self:stretch;margin-top:6px;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;border:0;border-radius:8px;cursor:pointer;
  background:linear-gradient(135deg,var(--acc) 0%,#6366f1 55%,#8b5cf6 100%);background-size:140% 140%;color:#fff;font:600 13.5px var(--sans);
  box-shadow:0 2px 10px color-mix(in srgb,#6366f1 30%,transparent);transition:background-position .4s,transform .15s}
.sp-gobtn:hover{background-position:100% 50%;transform:translateY(-1px)}.sp-gobtn:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.sp-gobtn span{transition:transform .2s}.sp-gobtn:hover span{transform:translateX(3px)}
.sp-sleep{font:600 12.5px var(--sans);font-style:normal;color:var(--long);display:inline-flex;align-items:center;gap:6px}
.sp-togo .sp-sleep{color:var(--acc)}
.sp-styles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.sp-style{position:relative;display:flex;flex-direction:column;gap:4px;padding:14px 14px 12px;text-align:left;border-radius:12px;border:1.5px solid var(--b2);background:var(--s1);cursor:pointer;font-family:var(--sans);
  transition:border-color .15s,background .15s,box-shadow .15s,transform .15s}
.sp-style:hover{border-color:var(--t3);transform:translateY(-1px)}
.sp-style:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.sp-style.on{border-color:var(--acc);background:linear-gradient(160deg,var(--adim),color-mix(in srgb,#8b5cf6 7%,var(--s1)));box-shadow:0 4px 16px color-mix(in srgb,var(--acc) 16%,transparent)}
.sp-style.on::after{content:"✓";position:absolute;right:10px;top:10px;width:20px;height:20px;border-radius:50%;background:var(--acc);color:#fff;font:700 12px/20px var(--sans);text-align:center}
.sp-sttop{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding-right:26px}.sp-sttop b{font:700 15px var(--sans);color:var(--t1)}
.sp-sttop em{font:600 11px var(--sans);font-style:normal;color:var(--acc);background:var(--adim);padding:1px 8px;border-radius:999px}
.sp-stsub{font:600 12.5px var(--sans);color:var(--t1)}.sp-style small{font-size:12px;line-height:17px;color:var(--t2)}
.sp-stbar{display:flex;gap:2px;height:6px;margin-top:6px;border-radius:3px;overflow:hidden}.sp-stbar u{flex-basis:0;min-width:0;text-decoration:none}
@media (max-width:900px){.sp-styles{grid-template-columns:1fr}}
/* the switch buttons are normal buttons (owner 2026-11-07: "keep it normal, it looks too contrast") */
.sp-tosafe,.sp-gobtn{background:var(--ds-action-bg);background-size:auto;color:var(--on-acc);box-shadow:none;border-radius:6px}
.sp-tosafe:hover,.sp-gobtn:hover{background:var(--ds-action-hover);background-position:0 0;transform:none;box-shadow:none;filter:none}
.sp-tosafe{min-height:40px;padding:6px 14px 6px 16px}.sp-tost b,.sp-toar,.sp-gobtn{color:var(--on-acc)}.sp-tost small{color:var(--on-acc);opacity:.85}
.sp-gobtn{height:38px}
/* round 17 (owner: "make that button a light background like the one below"): the same light accent look as "Send to AI Portfolio Analyser" */
.sp-tosafe,.sp-gobtn{background:color-mix(in srgb,var(--acc) 10%,var(--s1));color:var(--acc);box-shadow:0 0 0 1px var(--accb);border-radius:8px;transition:background .15s,color .15s}
.sp-tosafe:hover,.sp-gobtn:hover{background:var(--ds-action-bg);color:var(--on-acc);box-shadow:none}
.sp-tosafe{min-height:38px;padding:5px 14px 5px 16px}
.sp-tost b,.sp-toar,.sp-gobtn{color:var(--acc)}.sp-tost small{color:var(--t2);opacity:1}
.sp-tosafe:hover .sp-tost b,.sp-tosafe:hover .sp-toar,.sp-gobtn:hover{color:var(--on-acc)}.sp-tosafe:hover .sp-tost small{color:var(--on-acc);opacity:.85}
.sp-gobtn{height:36px}
/* round 17: the switch to ETFs is a quiet inline link at the end of the risk note, not a big button */
.sp-tolink{display:inline;margin-left:8px;padding:0;border:0;background:none;cursor:pointer;font:600 inherit var(--sans);color:var(--acc);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--acc) 40%,transparent);text-underline-offset:3px;white-space:nowrap}
.sp-tolink span{display:inline-block;transition:transform .2s}.sp-tolink:hover{text-decoration-color:var(--acc)}.sp-tolink:hover span{transform:translateX(3px)}
.sp-tolink:focus-visible{outline:none;box-shadow:var(--ds-focus);border-radius:4px}
`;
