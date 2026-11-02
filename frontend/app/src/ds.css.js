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

export const DS_CSS = `
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
