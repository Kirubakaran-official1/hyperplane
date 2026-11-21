// Copied from Hyperplane (frontend/app/src/shell.css.js · ds.css.js, 2026-11-21) so Lens's sign-in looks the same. Lens owns this copy.
// ─── Hyperplane design system for the customer app (owner, 2026-11-02) ─────────────────────────────────────────────
// Built from the K4K design system (frontend/Design System.html): its type scale, spacing, sizes, radius, shadows and
// component rules — but with OUR colours. K4K's maroon primary (#EE4961) is NOT used: every K4K colour role points at
// the app's own theme variables (shell.css.js), so light and dark themes keep working with no extra code.
//
//   K4K role                        → Hyperplane
//   primary / action / focus        → --acc (teal #0891b2 light · cyan #00e5ff dark), text on it --on-acc
//   neutral ramp 0 / 50 / 100       → --s1 / --s2 / --bg        borders 200 / 300 → --b1 / --b2
//   text headings·default / label / light / disabled → --t1 / --t2 / --t2 / --t3   (t3 is never body text)
//   status success / warning / critical / information → --long / --mixed / --short / --acc (+ their …d surfaces)
//   AI                              → --ret (purple)
//
// Rules taken over from K4K (see CLAUDE.md "Customer app design system"):
//   · sizes are a contract: controls 24 / 28 / 32 / 36 / 40 (xs–xl); padding-x = (h − 8) ÷ 2; radius 4 buttons,
//     6 fields and chips (square in tables), 8 cards and popovers, 12 large cards, pill elsewhere
//   · type by role, not by size: headings 32…14 semibold, body 14 / 13 / 12 / 11, caption 10 (10 px is the minimum),
//     caps only for table headers and overlines; tabular figures for every number
//   · one bottom divider per table row, no zebra; header 40, rows 40 / 48 / 56
//   · status never by colour alone (a dot is always next to a word); one primary action per view
// Class names all start with "ds-" (the app has global .ok / .up classes — never reuse bare tone names).

const DS_CSS = `
:root{
  /* type */
  --ds-font:var(--sans);
  --ds-h1:600 32px/40px var(--ds-font);--ds-h2:600 24px/32px var(--ds-font);--ds-h3:600 20px/28px var(--ds-font);
  --ds-h4:600 18px/24px var(--ds-font);--ds-h5:600 16px/24px var(--ds-font);--ds-h6:600 14px/20px var(--ds-font);
  --ds-title-panel:700 18px/24px var(--ds-font);--ds-title-modal:600 16px/24px var(--ds-font);
  --ds-body-xl:400 14px/20px var(--ds-font);--ds-body-l:400 13px/20px var(--ds-font);--ds-body:400 12px/16px var(--ds-font);
  --ds-body-med:500 12px/16px var(--ds-font);--ds-body-s:400 11px/16px var(--ds-font);--ds-caption:400 10px/12px var(--ds-font);
  --ds-label:600 11px/16px var(--ds-font);--ds-chip-font:500 11px/16px var(--ds-font);--ds-overline:600 10px/16px var(--ds-font);
  --ds-th:700 12px/16px var(--ds-font);--ds-td:500 12px/16px var(--ds-font);--ds-td-strong:600 12px/16px var(--ds-font);
  --ds-track-tight:-.01em;--ds-track-caps:.4px;--ds-track-overline:.6px;
  /* spacing (8pt grid, 4pt half steps) */
  --ds-2:2px;--ds-4:4px;--ds-6:6px;--ds-8:8px;--ds-12:12px;--ds-16:16px;--ds-20:20px;--ds-24:24px;--ds-32:32px;--ds-40:40px;--ds-48:48px;
  /* radius */
  --ds-r-button:4px;--ds-r-field:6px;--ds-r-card:8px;--ds-r-card-l:12px;--ds-r-panel:16px;--ds-r-pill:1000px;
  /* control heights */
  --ds-h-xs:24px;--ds-h-s:28px;--ds-h-m:32px;--ds-h-l:36px;--ds-h-xl:40px;
  /* colour roles → our theme (light and dark follow shell.css.js) */
  --ds-text-heading:var(--t1);--ds-text:var(--t1);--ds-text-label:var(--t2);--ds-text-light:var(--t2);--ds-text-disabled:var(--t3);
  --ds-surface-page:var(--bg);--ds-surface:var(--s1);--ds-surface-2:var(--s2);--ds-surface-3:var(--s3);
  --ds-surface-selected:var(--adim);--ds-hover:var(--hover);
  --ds-border-light:var(--b1);--ds-border:var(--b2);
  /* filled buttons: dark theme = our cyan with dark text; light theme = our deeper teal, so white 12–16 px text passes
     4.5:1 (#0891b2 with white is 3.7:1 — K4K's own rule: the next shade down for small-text buttons) */
  --ds-action:var(--acc);--ds-action-bg:var(--acc);--ds-action-hover:color-mix(in srgb,var(--acc) 82%,#fff);--ds-action-press:color-mix(in srgb,var(--acc) 70%,#fff);
  --ds-on-action:var(--on-acc);--ds-action-tint:var(--adim);--ds-action-line:var(--accb);
  --ds-success:var(--long);--ds-success-bg:var(--longd);--ds-warning:var(--mixed);--ds-warning-bg:var(--mixedd);
  --ds-critical:var(--short);--ds-critical-bg:var(--shortd);--ds-info:var(--acc);--ds-info-bg:var(--adim);
  --ds-neutral:var(--t2);--ds-neutral-bg:var(--s2);--ds-ai:var(--ret);--ds-ai-bg:var(--retd);
  /* effects */
  --ds-focus:0 0 0 2px var(--s1),0 0 0 4px var(--acc);
  --ds-field-glow:0 0 0 3px color-mix(in srgb,var(--acc) 16%,transparent);
  --ds-shadow-popover:0 8px 24px -4px rgba(17,24,39,.16),0 2px 6px rgba(17,24,39,.08);
  --ds-shadow-modal:0 24px 60px 0 rgba(16,24,40,.22);
  --ds-shadow-toast:0 2px 6px -2px rgba(16,24,40,.06),0 12px 24px -4px rgba(16,24,40,.12);
  --ds-shadow-card:0 1px 2px 0 rgba(17,24,39,.04);
  --ds-ease:cubic-bezier(.2,0,0,1);
}
:root[data-theme="light"]{--ds-action-bg:#0e7490;--ds-action-hover:#155e75;--ds-action-press:#164e63}

/* type roles */
.ds-h1{font:var(--ds-h1);letter-spacing:-.02em;color:var(--ds-text-heading)}.ds-h2{font:var(--ds-h2);letter-spacing:-.02em;color:var(--ds-text-heading)}
.ds-h3{font:var(--ds-h3);letter-spacing:var(--ds-track-tight);color:var(--ds-text-heading)}.ds-h4{font:var(--ds-h4);letter-spacing:var(--ds-track-tight);color:var(--ds-text-heading)}
.ds-h5{font:var(--ds-h5);letter-spacing:var(--ds-track-tight);color:var(--ds-text-heading)}.ds-h6{font:var(--ds-h6);letter-spacing:var(--ds-track-tight);color:var(--ds-text-heading)}
.ds-body-xl{font:var(--ds-body-xl)}.ds-body-l{font:var(--ds-body-l)}.ds-body{font:var(--ds-body)}.ds-body-s{font:var(--ds-body-s)}
.ds-caption{font:var(--ds-caption);color:var(--ds-text-light)}
.ds-overline{font:var(--ds-overline);letter-spacing:var(--ds-track-overline);text-transform:uppercase;color:var(--ds-text-label)}
.ds-num,.ds-tabular{font-feature-settings:"tnum"}
.ds-muted{color:var(--ds-text-light)}

/* buttons — primary (one per view) · secondary · subtle · link · ai; sizes xs–xl; radius 4; flat */
.ds-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;white-space:nowrap;
  height:var(--ds-h-m);padding:0 12px;border-radius:var(--ds-r-button);font:500 13px/16px var(--ds-font);color:var(--ds-text);
  transition:background .15s var(--ds-ease),border-color .15s var(--ds-ease),color .15s var(--ds-ease)}
.ds-btn svg{width:16px;height:16px;flex:none}
.ds-btn:focus-visible{box-shadow:var(--ds-focus)}
.ds-btn--xs{height:var(--ds-h-xs);padding:0 8px;gap:4px;font:500 11px/16px var(--ds-font)}.ds-btn--xs svg{width:12px;height:12px}
.ds-btn--s{height:var(--ds-h-s);padding:0 10px;gap:4px;font:500 12px/16px var(--ds-font)}
.ds-btn--l{height:var(--ds-h-l);padding:0 14px;font:500 14px/20px var(--ds-font)}
.ds-btn--xl{height:var(--ds-h-xl);padding:0 16px;gap:8px;font:500 16px/24px var(--ds-font)}.ds-btn--xl svg{width:20px;height:20px}
.ds-btn--primary{background:var(--ds-action-bg);color:var(--ds-on-action);font-weight:600}
.ds-btn--primary:hover{background:var(--ds-action-hover)}.ds-btn--primary:active{background:var(--ds-action-press)}
.ds-btn--secondary{background:var(--ds-surface);box-shadow:inset 0 0 0 1px var(--ds-border)}
.ds-btn--secondary:hover{background:var(--ds-surface-2);box-shadow:inset 0 0 0 1px var(--ds-text-disabled)}
.ds-btn--secondary:focus-visible{box-shadow:inset 0 0 0 1px var(--ds-border),var(--ds-focus)}
.ds-btn--subtle{background:transparent}.ds-btn--subtle:hover{background:var(--ds-surface-2)}.ds-btn--subtle:active{background:var(--ds-surface-3)}
.ds-btn--link{height:auto;padding:0;color:var(--ds-action)}.ds-btn--link:hover{text-decoration:underline}
.ds-btn--ai{background:linear-gradient(90deg,var(--ret),var(--acc));color:#fff;font-weight:600}.ds-btn--ai:hover{box-shadow:0 4px 12px -4px var(--retd)}
.ds-btn--icon{padding:0;width:var(--ds-h-m)}.ds-btn--icon.ds-btn--xs{width:var(--ds-h-xs)}.ds-btn--icon.ds-btn--s{width:var(--ds-h-s)}.ds-btn--icon.ds-btn--l{width:var(--ds-h-l)}
.ds-btn:disabled,.ds-btn[aria-disabled="true"]{cursor:not-allowed;opacity:.5}

/* fields — same sizes as buttons; radius 6; label 600 11–14 · helper 10–12 · stack gap 4 */
.ds-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.ds-field>label,.ds-field-label{font:var(--ds-label);color:var(--ds-text-label)}
.ds-field-help{font:var(--ds-caption);color:var(--ds-text-light)}.ds-field-help.is-error{color:var(--ds-critical)}
.ds-input{box-sizing:border-box;height:var(--ds-h-m);padding:0 12px;border-radius:var(--ds-r-field);border:1px solid var(--ds-border);background:var(--ds-surface);
  color:var(--ds-text);font:var(--ds-body-l);outline:none;transition:border-color .15s,box-shadow .15s;min-width:0}
.ds-input::placeholder{color:var(--ds-text-light)}
.ds-input:hover{border-color:var(--ds-text-disabled)}
.ds-input:focus{border-color:var(--ds-action);box-shadow:var(--ds-field-glow)}
.ds-input[aria-invalid="true"]{border-color:var(--ds-critical)}
.ds-input:disabled{background:var(--ds-surface-2);border-color:var(--ds-border-light);color:var(--ds-text-disabled)}
.ds-input--s{height:var(--ds-h-s);padding:0 10px;font:var(--ds-body)}.ds-input--l{height:var(--ds-h-l);padding:0 14px;font:var(--ds-body-xl)}

/* chips — status / filter; pill everywhere, square inside tables; a dot is always next to a word */
.ds-chip{display:inline-flex;align-items:center;gap:6px;height:var(--ds-h-xs);padding:0 8px;border-radius:var(--ds-r-pill);white-space:nowrap;
  font:var(--ds-chip-font);letter-spacing:var(--ds-track-tight);background:var(--ds-neutral-bg);color:var(--ds-text);border:1px solid transparent}
.ds-chip--s{height:var(--ds-h-s)}.ds-chip--m{height:var(--ds-h-m);font:500 12px/16px var(--ds-font)}
.ds-chip--square{border-radius:4px}
.ds-chip-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.ds-chip--success{background:var(--ds-success-bg);color:var(--ds-success)}.ds-chip--warning{background:var(--ds-warning-bg);color:var(--ds-warning)}
.ds-chip--critical{background:var(--ds-critical-bg);color:var(--ds-critical)}.ds-chip--info{background:var(--ds-info-bg);color:var(--ds-info)}
.ds-chip--ai{background:var(--ds-ai-bg);color:var(--ds-ai)}.ds-chip--neutral{background:var(--ds-neutral-bg);color:var(--ds-neutral)}
button.ds-chip{cursor:pointer}button.ds-chip:hover{border-color:var(--ds-border)}
button.ds-chip[aria-pressed="true"],.ds-chip.is-selected{background:var(--ds-action-tint);border-color:var(--ds-action-line);color:var(--ds-action)}
button.ds-chip:focus-visible{box-shadow:var(--ds-focus);outline:none}

/* surfaces — cards sit on the page well; one border, one shadow */
.ds-card{background:var(--ds-surface);border:1px solid var(--ds-border-light);border-radius:var(--ds-r-card);box-shadow:var(--ds-shadow-card)}
.ds-card--l{border-radius:var(--ds-r-card-l)}
.ds-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ds-border-light)}
.ds-card-b{padding:16px}
.ds-well{background:var(--ds-surface-2);border:1px solid var(--ds-border-light);border-radius:var(--ds-r-field);padding:12px}
.ds-divider{height:1px;background:var(--ds-border-light);border:0;margin:0}

/* tables — header 40 caps; rows 40 / 48 / 56; one divider per row; numbers right + tabular */
.ds-table{width:100%;border-collapse:separate;border-spacing:0;font:var(--ds-td);letter-spacing:var(--ds-track-caps);color:var(--ds-text)}
.ds-table th{height:40px;padding:0 12px;background:var(--ds-surface-2);font:var(--ds-th);letter-spacing:var(--ds-track-caps);text-transform:uppercase;
  color:var(--ds-text-label);text-align:left;border-bottom:1px solid var(--ds-border-light);white-space:nowrap}
.ds-table td{height:48px;padding:0 12px;border-bottom:1px solid var(--ds-border-light);vertical-align:middle}
.ds-table th:first-child,.ds-table td:first-child{padding-left:16px}.ds-table th:last-child,.ds-table td:last-child{padding-right:16px}
.ds-table--compact td{height:40px}.ds-table--comfortable td{height:56px}
.ds-table tbody tr:hover td{background:var(--ds-hover)}
.ds-table .num{text-align:right;font-variant-numeric:tabular-nums}
.ds-table .strong{font:var(--ds-td-strong);color:var(--ds-text-heading)}
.ds-table .meta{display:block;font:var(--ds-caption);letter-spacing:0;color:var(--ds-text-light)}

/* summary stat strip — 3px accent edge · label · value (· delta) */
.ds-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.ds-stat{position:relative;display:flex;flex-direction:column;gap:2px;padding:12px 16px 12px 19px;background:var(--ds-surface);
  border:1px solid var(--ds-border-light);border-radius:var(--ds-r-field);overflow:hidden}
.ds-stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ds-stat-accent,var(--ds-action))}
.ds-stat-l{font:var(--ds-overline);letter-spacing:var(--ds-track-overline);text-transform:uppercase;color:var(--ds-text-label)}
.ds-stat-v{font:600 20px/28px var(--ds-font);letter-spacing:var(--ds-track-tight);color:var(--ds-text-heading);font-variant-numeric:tabular-nums}
.ds-stat-d{font:600 11px/16px var(--ds-font)}.ds-stat-d.is-good{color:var(--ds-success)}.ds-stat-d.is-bad{color:var(--ds-critical)}.ds-stat-d.is-flat{color:var(--ds-text-light)}

/* tabs — primary underline row · secondary segmented pills */
.ds-tabs{display:flex;gap:24px;border-bottom:1px solid var(--ds-border-light);overflow-x:auto;scrollbar-width:none}
.ds-tab{all:unset;cursor:pointer;padding:12px 0 10px;font:400 13px/16px var(--ds-font);color:var(--ds-text-label);border-bottom:2px solid transparent;white-space:nowrap}
.ds-tab:hover{color:var(--ds-text);border-bottom-color:var(--ds-border)}
.ds-tab[aria-selected="true"],.ds-tab.is-on{font-weight:600;color:var(--ds-action);border-bottom-color:var(--ds-action)}
.ds-tab:focus-visible{box-shadow:var(--ds-focus)}
.ds-seg{display:inline-flex;gap:2px;padding:2px;border-radius:var(--ds-r-pill);background:var(--ds-surface-2);box-shadow:inset 0 0 0 1px var(--ds-border-light)}
.ds-seg button{all:unset;cursor:pointer;height:var(--ds-h-s);padding:0 12px;border-radius:var(--ds-r-pill);font:500 12px/16px var(--ds-font);color:var(--ds-text-label)}
.ds-seg button:hover{color:var(--ds-text)}
.ds-seg button[aria-pressed="true"],.ds-seg button.is-on{background:var(--ds-surface);color:var(--ds-action);font-weight:600;box-shadow:var(--ds-shadow-card),inset 0 0 0 1px var(--ds-border-light)}
.ds-seg button:focus-visible{box-shadow:var(--ds-focus)}

/* feedback — inline notification · toast · tooltip · empty state · skeleton · progress */
.ds-note{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--ds-r-field);font:var(--ds-body-l);
  background:var(--ds-info-bg);border:1px solid var(--ds-action-line);color:var(--ds-text)}
.ds-note--success{background:var(--ds-success-bg);border-color:color-mix(in srgb,var(--ds-success) 35%,transparent)}
.ds-note--warning{background:var(--ds-warning-bg);border-color:color-mix(in srgb,var(--ds-warning) 35%,transparent)}
.ds-note--critical{background:var(--ds-critical-bg);border-color:color-mix(in srgb,var(--ds-critical) 35%,transparent)}
.ds-toast{position:relative;display:flex;gap:12px;align-items:flex-start;width:min(380px,calc(100vw - 32px));min-height:54px;box-sizing:border-box;
  padding:12px 8px 12px 16px;border-radius:var(--ds-r-field);background:var(--ds-surface);box-shadow:inset 0 0 0 1px var(--ds-border-light),var(--ds-shadow-toast);overflow:hidden}
.ds-toast::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ds-toast-accent,var(--ds-action))}
.ds-tip{background:var(--t1);color:var(--s1);font:var(--ds-body);padding:4px 8px;border-radius:4px;min-height:24px;box-sizing:border-box}
.ds-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:24px;max-width:360px;margin:0 auto}
.ds-empty-ic{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--ds-action-tint);color:var(--ds-action);margin-bottom:8px}
.ds-empty-t{font:var(--ds-h5);color:var(--ds-text-heading)}.ds-empty-d{font:var(--ds-body-l);color:var(--ds-text-light)}
.ds-skel{display:block;border-radius:4px;background:linear-gradient(90deg,var(--ds-surface-3) 25%,var(--ds-surface-2) 50%,var(--ds-surface-3) 75%);
  background-size:200% 100%;animation:ds-shimmer 1.4s linear infinite}
@keyframes ds-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.ds-skel{animation:ds-pulse 2s ease-in-out infinite alternate}}
@keyframes ds-pulse{from{opacity:.6}to{opacity:1}}
.ds-progress{height:4px;border-radius:99px;background:var(--ds-surface-3);overflow:hidden}
.ds-progress>i{display:block;height:100%;border-radius:inherit;background:var(--ds-action)}

/* overlays — popover / modal: radius 8, one shadow, padding 20 */
.ds-popover{background:var(--ds-surface);border:1px solid var(--ds-border-light);border-radius:var(--ds-r-card);box-shadow:var(--ds-shadow-popover);padding:4px}
.ds-modal-bg{position:fixed;inset:0;background:rgba(17,24,39,.4);display:flex;align-items:center;justify-content:center;padding:16px;z-index:2000}
.ds-modal{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--ds-surface);border-radius:var(--ds-r-card);box-shadow:var(--ds-shadow-modal);
  padding:20px;display:flex;flex-direction:column;gap:16px}
.ds-modal--m{width:min(560px,100%)}
.ds-modal-t{font:var(--ds-title-modal);color:var(--ds-text-heading)}.ds-modal-b{font:var(--ds-body-xl);color:var(--ds-text-label)}
.ds-modal-f{display:flex;justify-content:flex-end;gap:8px}
`;

const BASE = `
:root{--mx-l:#bac8ff;--mx-lt:#0b1b33;--mx-m:#748ffc;--mx-mt:#0b1b33;--mx-s:#4263eb;--mx-st:#ffffff;--mx-c:#898781;--mono:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --bg:#060b14;--s1:#0d1520;--s2:#131e2e;--s3:#192540;--b1:#1b2d48;--b2:#243859;
  --acc:#00e5ff;--adim:rgba(0,229,255,.1);--accb:rgba(0,229,255,.25);
  --long:#00c896;--longd:rgba(0,200,150,.12);--short:#ff4454;--shortd:rgba(255,68,84,.12);--mixed:#ffaa00;--mixedd:rgba(255,170,0,.12);
  --ret:#a259ff;--retd:rgba(162,89,255,.12);--t1:#d0dff0;--t2:#8da4bf;--t3:#6a84a2;color-scheme:dark;
  --on-acc:#04121a;--glass:rgba(13,21,32,.96);--hover:rgba(255,255,255,.03);--pop:#0a1220;--sel-t:#fff}
:root[data-theme="light"]{--mx-l:#3b5bdb;--mx-lt:#ffffff;--mx-m:#748ffc;--mx-mt:#0b1b33;--mx-s:#bac8ff;--mx-st:#0b1b33;--mx-c:#898781;--bg:#f3f6fa;--s1:#ffffff;--s2:#f3f6fa;--s3:#e2e8f0;--b1:#dfe6ef;--b2:#c9d4e2;
  --acc:#0891b2;--adim:rgba(8,145,178,.09);--accb:rgba(8,145,178,.32);
  --long:#059669;--longd:rgba(5,150,105,.1);--short:#dc2626;--shortd:rgba(220,38,38,.08);--mixed:#d97706;--mixedd:rgba(217,119,6,.1);
  --ret:#7c3aed;--retd:rgba(124,58,237,.08);--t1:#0f1b2d;--t2:#4b5f7a;--t3:#66778e;color-scheme:light;
  --on-acc:#ffffff;--glass:rgba(255,255,255,.94);--hover:rgba(15,27,45,.04);--pop:#ffffff;--sel-t:#0f1b2d}
:root[data-theme="light"] .primary{background:var(--ds-action-bg);color:#fff}
:root[data-theme="light"] .hero-h span{background:linear-gradient(90deg,#0891b2,#6366f1);-webkit-background-clip:text;background-clip:text}
:root[data-theme="light"] .modal{box-shadow:0 30px 70px -20px rgba(15,27,45,.35)}
*{box-sizing:border-box}
html{background:var(--bg)}
html,body{margin:0;color:var(--t1);font:13px/20px var(--sans)}
body{background:transparent}   /* the canvas (html) carries the colour, so a fixed layer behind the app (AI Mode's gradient) can show */
/* K4K: tabular figures for amounts, counts and dates — on numbers only (Inter's tnum also widens hyphens in prose) */
/* font-feature-settings, not font-variant-numeric: the font shorthand used on most numbers resets the latter */
td,th,b,strong,input,output,.mono,.num,.sym,.pct,.ds-num{font-feature-settings:"tnum"}
button{font:inherit;cursor:pointer;color:inherit}
a{color:var(--acc)}
.mono{font-family:var(--mono)}
.muted{color:var(--t2)}
.sub{font-size:12px;color:var(--t2)}
.small{font-size:12px}
.dim{color:var(--t3)}
.fine{font-size:11px;color:var(--t2);line-height:16px;max-width:920px}
.center{text-align:center;margin:0 auto}
.lbl{font:600 10px/16px var(--sans);color:var(--t2);text-transform:uppercase;letter-spacing:.6px}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:8px;box-shadow:var(--ds-shadow-card)}
.up{color:var(--long)}
.down{color:var(--short)}
.brand{display:flex;align-items:center;gap:10px}
.brand-name{font:700 19px/1.05 'Oxanium',var(--mono);letter-spacing:.9px;color:var(--t1)}
.brand-name b{color:var(--acc);font-weight:700}
.brand-by{font-size:11px;color:var(--t2);margin-top:2px}
.loading{min-height:100vh;display:flex;align-items:center;justify-content:center}
input,select{font:inherit;color:var(--t1);background:var(--s1);border:1px solid var(--b2);border-radius:6px;padding:7px 12px;width:100%;min-width:0;transition:border-color .15s,box-shadow .15s}
input[type=checkbox],input[type=radio]{width:auto;padding:0;border:0;background:none;accent-color:var(--acc)}
/* on / off switch (alerts, step-up …): <label class="hp-switch"><input type=checkbox/>…</label> */
.hp-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:600 12.5px var(--sans);color:var(--t2);user-select:none}
.hp-switch input{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:34px;height:20px;margin:0;border-radius:999px;background:var(--s3);border:1px solid var(--b2);cursor:pointer;transition:background .15s,border-color .15s}
.hp-switch input::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
.hp-switch input:checked{background:var(--acc);border-color:var(--acc)}.hp-switch input:checked::after{transform:translateX(14px)}
.hp-switch input:focus-visible{outline:2px solid var(--acc);outline-offset:2px}.hp-switch.on{color:var(--t1)}
input::placeholder{color:var(--t3)}input:hover,select:hover{border-color:var(--t3)}
input:focus,select:focus{outline:none;border-color:var(--acc);box-shadow:var(--ds-field-glow)}
.primary{background:var(--ds-action-bg);color:var(--on-acc);border:0;border-radius:4px;min-height:40px;padding:8px 16px;font:600 14px/24px var(--sans);transition:background .15s}
.primary:hover{background:var(--ds-action-hover)}.primary:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.primary:disabled{opacity:.6}
.ghost{background:var(--s1);border:1px solid var(--b2);border-radius:4px;min-height:28px;padding:4px 10px;white-space:nowrap;font:500 12px/16px var(--sans);color:var(--t1)}
.ghost:hover{background:var(--s2)}
.ghost:disabled{opacity:.35;cursor:default}
.err{color:var(--short);font-size:12px}
.ok{background:var(--longd);color:var(--long);border:1px solid color-mix(in srgb,var(--long) 35%,transparent);border-radius:6px;padding:10px 12px;font-size:13px;line-height:20px}
/* auth */
.auth-page{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
.hero{position:relative;overflow:hidden;padding:48px 56px;display:flex;flex-direction:column;justify-content:center;gap:16px;border-right:1px solid var(--b1);
  background:radial-gradient(90% 70% at 10% 0%,rgba(0,229,255,.16),transparent 60%),radial-gradient(70% 60% at 100% 100%,rgba(99,102,241,.18),transparent 60%),var(--bg)}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(var(--b1) 1px,transparent 1px),linear-gradient(90deg,var(--b1) 1px,transparent 1px);background-size:44px 44px;opacity:.25;mask-image:radial-gradient(80% 70% at 30% 40%,#000,transparent)}
.hero>*{position:relative}
.hero-h{font:600 32px/44px var(--sans);margin:14px 0 0;letter-spacing:-.02em}
.hero-h span{background:linear-gradient(90deg,#00e5ff,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-p{font-size:14px;color:var(--t2);max-width:500px;margin:0;line-height:22px}
.hero-k{margin-top:14px;font:600 10px/16px var(--sans);letter-spacing:.6px;text-transform:uppercase;color:var(--acc)}
.hero-k+.hero-h{margin-top:6px}
.hero-fine{font-size:11px;color:var(--t2);max-width:480px;margin:2px 0 0;line-height:16px}
.hd-row .meter{font-size:12px}
.hd-note b{color:var(--mixed)}
.wa-l{display:inline-flex;align-items:center;gap:6px}
.wa-in{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px}
.dial .ms-btn{height:100%;min-height:38px;font-size:13px;color:var(--t1);text-transform:none;letter-spacing:0}
.dial .ms-btn small{font-size:11px;font-weight:500;color:var(--t2);margin-left:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dial .ms-btn>span:first-child{display:flex;align-items:baseline;min-width:0;overflow:hidden}
.dial-pop{width:300px;text-transform:none;letter-spacing:0;font-weight:400}
.dial-pop .ms-list{max-height:260px}
.dial-h{padding:7px 8px 3px;font-size:10px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--t3)}
.dial-it{display:flex;justify-content:space-between;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:6px;background:none;color:var(--t1);font-size:13px;text-align:left}
.dial-it:hover,.dial-it.on{background:var(--adim)}
.dial-it b{font:600 12px var(--mono);color:var(--acc)}
.wa-in input{font:600 14px var(--mono);letter-spacing:1px}
.wa-err{font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--mixed)}
.feats{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:13px;max-width:480px}
.feats li{display:flex;gap:12px}
.feats b{display:block;font:600 14px/20px var(--sans);color:var(--t1)}
.feats span{font-size:13px;line-height:20px;color:var(--t2)}
.tick{flex-shrink:0;width:22px;height:22px;border-radius:999px;background:var(--adim);border:1px solid var(--accb);color:var(--acc);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
.hero-demo{margin-top:8px;max-width:420px;background:var(--s1);border:1px solid var(--b1);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}
.hd-row{display:grid;grid-template-columns:80px 92px 1fr;gap:10px;align-items:center;font-size:12px;color:var(--t2)}
.hd-note{font-size:11px;color:var(--t3);margin-top:2px}
.auth-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 20px}
.auth{width:100%;max-width:460px;padding:32px 28px;display:flex;flex-direction:column;gap:16px;background:var(--s1);border:1px solid var(--b1);border-radius:8px;box-shadow:var(--ds-shadow-popover)}
.auth h1{font:600 24px/32px var(--sans);letter-spacing:-.02em;margin:0}
.auth>p{margin:-6px 0 4px;font-size:13px}
.field{display:flex;flex-direction:column;gap:4px;min-width:0;font:600 12px/16px var(--sans);color:var(--t2)}
.field input,.field select{min-height:40px;font-size:14px}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.agree{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--b2);border-radius:6px;background:var(--s2);cursor:pointer;font-size:12px;color:var(--t2);line-height:1.5}
.agree.on{border-color:var(--acc);background:var(--adim)}
.agree input{width:22px;height:22px;flex-shrink:0;margin:1px 0 0;accent-color:#00e5ff;cursor:pointer}
.agree b{color:var(--t1);font-size:12px}
.switch{font-size:13px;text-align:center;color:var(--t2)}
.forgot{margin-top:-6px;text-align:right;font-size:12px}
/* round 17c: inline field messages, eye toggle, password meter */
.auth .field.bad input,.auth .field.bad select,.auth .field.bad .pw input{border-color:var(--short)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--short) 14%,transparent)!important}
.auth .fe{display:block;margin-top:4px;font:600 12px/16px var(--sans);color:var(--short)}.auth .fh{display:block;margin-top:4px;font:400 11.5px/16px var(--sans);color:var(--t3)}
.auth .pw{position:relative;display:block}.auth .pw input{width:100%;padding-right:42px}
.auth .pw-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:8px;background:none;color:var(--t3);cursor:pointer}
.auth .pw-eye:hover{color:var(--acc);background:var(--adim)}
.auth .pwm{display:flex;align-items:center;gap:10px;margin-top:-4px;font:600 11.5px var(--sans);color:var(--t2)}.auth .pwm span{display:flex;gap:4px;flex:1}
.auth .pwm i{flex:1;height:4px;border-radius:3px;background:var(--s3)}.auth .pwm.s1 i:nth-child(-n+1){background:var(--short)}.auth .pwm.s2 i:nth-child(-n+2){background:var(--mixed)}
.auth .pwm.s3 i:nth-child(-n+3){background:var(--acc)}.auth .pwm.s4 i{background:var(--long)}
.auth .agree.bad{border-color:var(--short)}
.auth .resend{width:100%;height:38px;margin-top:-4px;border-radius:8px;border:1px solid var(--accb);background:var(--adim);color:var(--acc);font:600 13px var(--sans);cursor:pointer}.auth .resend:hover:not(:disabled){background:var(--ds-action-bg);color:var(--on-acc)}
.auth .small{font-size:12.5px;margin:0}
@media (max-width:900px){.auth-page{grid-template-columns:1fr}}
@media (max-width:900px){.hero{padding:30px 22px;border-right:0;border-bottom:1px solid var(--b1)}}
@media (max-width:900px){.hero-h{font-size:24px}}
@media (max-width:900px){.hero-demo{display:none}}
`;
export const COPIED_CSS = BASE + DS_CSS;
