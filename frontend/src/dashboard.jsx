import React from "react";
import * as XLSX from "xlsx";
const { useState, useEffect, useCallback, useMemo, useRef } = React;

const APP_NAME = "Hyperplane";

const BIAS_COLOR = {
  LONG:         { bg:"#0f2d1a", text:"#4ade80", border:"#166534" },
  SHORT:        { bg:"#2d0f0f", text:"#f87171", border:"#7f1d1d" },
  MIXED:        { bg:"#2d1f0a", text:"#fbbf24", border:"#78350f" },
  RETRACEMENT:  { bg:"#1a0f2d", text:"#c084fc", border:"#581c87" },
  NEUTRAL:      { bg:"#1a1a1a", text:"#9ca3af", border:"#374151" },
};

const STRENGTH_COLOR = {
  "Very Strong": { text:"#00e5ff", bg:"rgba(0,229,255,.12)",  border:"rgba(0,229,255,.4)"  },
  "Strong":      { text:"#4ade80", bg:"rgba(74,222,128,.12)", border:"rgba(74,222,128,.4)" },
  "Neutral":     { text:"#fbbf24", bg:"rgba(251,191,36,.12)", border:"rgba(251,191,36,.4)" },
  "Weak":        { text:"#ff9466", bg:"rgba(255,148,102,.12)",border:"rgba(255,148,102,.4)"},
  "Very Weak":   { text:"#f87171", bg:"rgba(248,113,113,.12)",border:"rgba(248,113,113,.4)"},
};

const SECTOR_PALETTE = [
  "#00e5ff","#ff6c35","#4ade80","#f87171","#fbbf24","#c084fc","#38bdf8","#fb7185",
  "#a3e635","#fb923c","#2dd4bf","#e879f9","#facc15","#60a5fa","#f472b6","#84cc16",
  "#22d3ee","#f97316","#a78bfa","#34d399","#eab308","#fda4af","#93c5fd","#d946ef",
  "#4ade80","#f87171",
];

const MCAP_COLOR = { Largecap:"#00e5ff", Midcap:"#fbbf24", Smallcap:"#ff6c35", Microcap:"#a259ff" };

const ALL_COLS = [
  "Symbol","Sector","Industry","Signal_Name","Signal_Category","Signal_Type","Trading_Bias",
  "Total_Zone_Signals","Total_NR_Signals","Has_Both_Types","Is_FNO",
  "Is_Nifty_LargeCap_100","Is_Midcap_150","Is_SmallCap_250","Is_MicroCap_250",
  "Is_Nifty_500","Timeframe","Long_Signal_Count","Short_Signal_Count",
  "Retracement_Signal_Count","Mixed_Signal_Count",
];

const DEFAULT_SLICER_COLS = [
  "Sector","Signal_Category","Signal_Type","Trading_Bias","Is_FNO",
  "Is_Nifty_LargeCap_100","Is_Midcap_150","Is_SmallCap_250","Is_Nifty_500","Timeframe",
];

const FLAG_LABELS = {
  Is_FNO:"FNO",
  Is_Nifty_LargeCap_100:"LargeCap",
  Is_Midcap_150:"Midcap",
  Is_SmallCap_250:"SmallCap",
  Is_MicroCap_250:"MicroCap",
  Is_Nifty_500:"Nifty 500",
};

const CSS = `
  :root {
    --mono:'IBM Plex Mono',monospace; --sans:'Inter',sans-serif;
    --r:8px;
  }
  .app-shell.theme-dark {
    --bg:#060b14; --s1:#0d1520; --s2:#131e2e; --s3:#192540;
    --b1:#1b2d48; --b2:#243859;
    --acc:#00e5ff; --adim:rgba(0,229,255,.1); --accborder:rgba(0,229,255,.25);
    --a2:#ff6c35;
    --long:#00c896; --longd:rgba(0,200,150,.12);
    --short:#ff4454; --shortd:rgba(255,68,84,.12);
    --mixed:#ffaa00; --mixedd:rgba(255,170,0,.12);
    --ret:#a259ff; --retd:rgba(162,89,255,.12);
    --neut:#546e8a;
    --t1:#d0dff0; --t2:#6a86a6; --t3:#364d66;
    --rowhover: rgba(255,255,255,.03);
    --gridline: rgba(0,229,255,.012);
    --headerbg: rgba(13,21,32,.96);
    --shadow: rgba(0,0,0,.55);
    color-scheme: dark;
  }
  .app-shell.theme-light {
    --bg:#f3f6fb; --s1:#ffffff; --s2:#eef2f8; --s3:#e4eaf3;
    --b1:#dbe3ee; --b2:#c2ceE0;
    --acc:#0891b2; --adim:rgba(8,145,178,.08); --accborder:rgba(8,145,178,.3);
    --a2:#d9541f;
    --long:#0a8f5b; --longd:rgba(10,143,91,.10);
    --short:#dc2626; --shortd:rgba(220,38,38,.08);
    --mixed:#b45309; --mixedd:rgba(180,83,9,.08);
    --ret:#7c3aed; --retd:rgba(124,58,237,.08);
    --neut:#64748b;
    --t1:#101a2b; --t2:#4b5d75; --t3:#7c8ca3;
    --rowhover: rgba(15,30,50,.035);
    --gridline: rgba(8,145,178,.03);
    --headerbg: rgba(255,255,255,.92);
    --shadow: rgba(15,30,60,.14);
    color-scheme: light;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#060b14;min-height:100vh;overflow-x:clip}
  .app-shell{min-height:100vh;background:var(--bg);color:var(--t1);font-family:var(--sans);transition:background .2s,color .2s}
  #root{min-height:100vh}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:var(--b2);border-radius:3px}
  input,select,button{font-family:var(--sans);outline:none}
  button{cursor:pointer;background:none;border:none}
  .mono{font-family:var(--mono)}

  .theme-toggle {
    display:flex; align-items:center; gap:6px; background:var(--s2);
    border:1px solid var(--b2); color:var(--t2); padding:5px 10px;
    border-radius:6px; font-size:11px; cursor:pointer; transition:all .15s;
  }
  .theme-toggle:hover { border-color:var(--acc); color:var(--acc); }

  .copy-btn {
    background: var(--s2);
    border: 1px solid var(--b2);
    color: var(--acc);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-family: var(--mono);
    cursor: pointer;
    transition: background .15s, color .15s;
    opacity: 0;
    user-select: none;
    flex-shrink: 0;
  }
  .copy-btn:hover { background: var(--adim); }
  .copy-btn.copied { color: var(--long); border-color: var(--long); }
  .sym-cell { display: flex; align-items: center; gap: 6px; }
  .sym-cell:hover .copy-btn,
  tr:hover .copy-btn { opacity: 1; }

  .tv-copy-btn {
    background: var(--s2);
    border: 1px solid var(--accborder);
    color: var(--acc);
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 9.5px;
    font-family: var(--mono);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background .15s, border-color .15s;
  }
  .tv-copy-btn:hover { background: var(--adim); border-color: var(--acc); }
  .tv-copy-btn.copied { color: var(--long); border-color: var(--long); }

  .flag-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-family: var(--mono);
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid;
  }
  .flag-chip.yes { background: var(--longd); color: var(--long); border-color: var(--long); }
  .flag-chip.no  { background: rgba(84,110,138,.08); color: var(--t3); border-color: var(--b1); }

  .grid-bg::before{content:'';position:fixed;inset:0;background-image:linear-gradient(var(--gridline) 1px,transparent 1px),linear-gradient(90deg,var(--gridline) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}

  @keyframes pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(0,229,255,.35); }
    70%  { box-shadow: 0 0 0 8px rgba(0,229,255,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
  }
  .pulse { animation: pulse-ring 2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
  .blink { animation: blink 1.4s infinite; }
  @keyframes slide-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
  .slide-in { animation: slide-in .35s ease both; }

  .hm-cell { border-radius: 4px; transition: transform .15s; cursor: default; }
  .hm-cell:hover { transform: scale(1.1); z-index: 10; }
  .tower-scroll { overflow-y: auto; scrollbar-width: thin; }
  .tower-scroll::-webkit-scrollbar { width: 3px; }
  .tower-scroll::-webkit-scrollbar-thumb { background: var(--b2); }

  .sector-card { transition: transform .15s, box-shadow .15s; }
  .sector-card:hover { transform: translateY(-2px); }
  .sec-row:hover { background: var(--rowhover); }
  .ct-layout { transition: padding-left .22s ease; }
  .ct-nav { position:fixed; left:0; top:96px; bottom:0; width:248px; z-index:150; overflow-y:auto; scrollbar-width:thin; padding:12px 14px 18px; box-sizing:border-box;
            background:var(--s1); border-right:1px solid var(--b1); box-shadow:6px 0 24px rgba(0,0,0,.28); transform:translateX(-105%); transition:transform .22s ease; visibility:hidden; }
  .ct-nav.open { transform:none; visibility:visible; }
  .ct-nav-link:hover { background: var(--s2); }
  .nav-pull:hover { border-color: var(--acc) !important; color: var(--acc) !important; }
  @media (min-width: 1100px) { .ct-layout.nav-open { padding-left: 248px; } }
  @media (prefers-reduced-motion: reduce) { .ct-nav, .ct-layout { transition:none; } }
  @media (max-width: 1350px) { .hdr-stats { display:none !important; } }
  .eq-cell { min-width: 0; }
  .eq-cell > * { height: 100% !important; overflow-y: auto; scrollbar-width: thin; box-sizing: border-box; }
  .eq-cell > *::-webkit-scrollbar { width: 3px; }
  .sec-row:hover .copy-btn, .sector-card:hover .copy-btn { opacity: 1; }

  .quad-bubble circle { transition: r .12s ease, stroke-width .12s ease, fill-opacity .12s ease; }
  .quad-bubble:hover circle { stroke-width: 3; fill-opacity: .55 !important; }
  .quad-bubble:hover text { font-weight: 800; }

  .version-chip { transition: all .15s; }
  .version-chip:hover { transform: translateY(-1px); }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const str = v => (v == null ? "" : String(v));
const cleanSym = s => str(s).replace("NSE:","").replace(",","").trim();

function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
  } catch { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(ta);
}

function hashStr(s) {
  let h = 0;
  const st = str(s);
  for (let i = 0; i < st.length; i++) { h = (h * 31 + st.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function sectorColor(sector) {
  if (!sector) return "var(--t3)";
  return SECTOR_PALETTE[hashStr(sector) % SECTOR_PALETTE.length];
}
function parseMcapBreakdown(s) {
  return str(s).split(",").map(x=>x.trim()).filter(Boolean).map(pair=>{
    const idx = pair.indexOf(":");
    if (idx < 0) return null;
    return { label: pair.slice(0,idx).trim(), val: +pair.slice(idx+1).trim() || 0 };
  }).filter(Boolean);
}

// TV copy button — always visible
function TVCopyBtn({ symbols, label="⎘ TV" }) {
  const [copied, setCopied] = useState(false);
  const text = Array.isArray(symbols)
    ? symbols.map(s=>`NSE:${s}`).join(",")
    : `NSE:${symbols}`;
  return (
    <button
      className={`tv-copy-btn${copied?" copied":""}`}
      onClick={e=>{ e.stopPropagation(); copyToClipboard(text); setCopied(true); setTimeout(()=>setCopied(false),1400); }}
      title={`Copy as TradingView: ${text.slice(0,60)}...`}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copy-btn${copied?" copied":""}`}
      onClick={e=>{ e.stopPropagation(); e.preventDefault(); copyToClipboard(text); setCopied(true); setTimeout(()=>setCopied(false),1400); }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function SymCell({ sym }) {
  return (
    <div className="sym-cell">
      <span style={{fontFamily:"var(--mono)",fontSize:"11px",fontWeight:700,color:"var(--acc)"}}>{sym}</span>
      <CopyBtn text={sym} />
    </div>
  );
}

function biasBadge(v, small=false) {
  const b = BIAS_COLOR[v] || BIAS_COLOR.NEUTRAL;
  return (
    <span style={{
      background:b.bg, color:b.text, border:`1px solid ${b.border}`,
      padding:"2px 7px", borderRadius:4, fontSize:small?"10px":"11px",
      fontFamily:"var(--mono)", fontWeight:600, letterSpacing:".3px", whiteSpace:"nowrap",
    }}>{v}</span>
  );
}

function catBadge(v) {
  const is_zone = v==="ZONE";
  return (
    <span style={{
      background: is_zone ? "rgba(0,229,255,.08)" : "rgba(255,108,53,.08)",
      color: is_zone ? "var(--acc)" : "var(--a2)",
      border: `1px solid ${is_zone ? "rgba(0,229,255,.2)" : "rgba(255,108,53,.2)"}`,
      padding:"2px 7px", borderRadius:4, fontSize:"10px",
      fontFamily:"var(--mono)", fontWeight:600,
    }}>{v}</span>
  );
}

function strengthBadge(label, small=false) {
  const c = STRENGTH_COLOR[label] || STRENGTH_COLOR.Neutral;
  return (
    <span style={{
      background:c.bg, color:c.text, border:`1px solid ${c.border}`,
      padding: small?"2px 7px":"3px 9px", borderRadius:4, fontSize: small?"9.5px":"11px",
      fontFamily:"var(--mono)", fontWeight:600, whiteSpace:"nowrap",
    }}>{label||"—"}</span>
  );
}

function SectorChip({ sector, industry, dim=false }) {
  if (!sector) return null;
  const c = sectorColor(sector);
  return (
    <span title={industry && industry!==sector ? `${sector} — ${industry}` : sector} style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontSize: dim?9:9.5, padding:"1.5px 7px", borderRadius:3,
      background:`${c}14`, color:c, border:`1px solid ${c}40`,
      fontFamily:"var(--mono)", fontWeight:600, whiteSpace:"nowrap",
      maxWidth:120, overflow:"hidden", textOverflow:"ellipsis",
    }}>
      <span style={{width:5,height:5,borderRadius:999,background:c,flexShrink:0}}/>
      {sector}
    </span>
  );
}

function IndustryTag({ industry }) {
  if (!industry) return null;
  return (
    <span title={industry} style={{
      fontSize:9, padding:"1.5px 6px", borderRadius:3, background:"var(--s3)",
      color:"var(--t2)", whiteSpace:"nowrap", maxWidth:140, overflow:"hidden",
      textOverflow:"ellipsis", display:"inline-block", verticalAlign:"middle",
    }}>{industry}</span>
  );
}

function McapChips({ breakdown }) {
  const items = parseMcapBreakdown(breakdown);
  if (!items.length) return null;
  return (
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {items.map(it=>{
        const c = MCAP_COLOR[it.label] || "var(--t3)";
        return (
          <span key={it.label} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,background:`${c}18`,color:c,border:`1px solid ${c}40`,fontFamily:"var(--mono)",fontWeight:600}}>{it.label} {it.val}</span>
        );
      })}
    </div>
  );
}

function FlagChip({ label, active }) {
  return (
    <span className={`flag-chip${active?" yes":" no"}`}>{label}</span>
  );
}

function FlagChips({ row, keys }) {
  return (
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {(keys||Object.keys(FLAG_LABELS)).map(k=>(
        <FlagChip key={k} label={FLAG_LABELS[k]||k} active={row[k]==="Yes"} />
      ))}
    </div>
  );
}

function yesnoBadge(v) {
  return v==="Yes"
    ? <span style={{background:"var(--longd)",color:"var(--long)",border:"1px solid rgba(0,200,150,.25)",padding:"2px 6px",borderRadius:4,fontSize:"9.5px",fontFamily:"var(--mono)"}}>Yes</span>
    : <span style={{background:"rgba(84,110,138,.08)",color:"var(--t3)",padding:"2px 6px",borderRadius:4,fontSize:"9.5px",fontFamily:"var(--mono)"}}>No</span>;
}

// ─── DATA MAPPING ─────────────────────────────────────────────────────────────
function mapDB(rawDB) {
  const find = (...kws) => {
    for (const kw of kws) {
      const k = Object.keys(rawDB).find(k => k.toLowerCase().replace(/[\s_]/g,"").includes(kw.toLowerCase().replace(/[\s_]/g,"")));
      if (k) return rawDB[k];
    }
    return [];
  };

  const master = find("MasterStockData","Master_Stock_Data","MasterStock").map(r => ({
    Sr: str(r.Sr||""),
    Stock_Name: str(r.Stock_Name||r.StockName||""),
    Symbol: cleanSym(r.Symbol||r.SYMBOL),
    Price: str(r.Price||"0"),
    Change_Pct: str(r.Change_Pct||"0"),
    Volume: str(r.Volume||"0"),
    Sector: str(r.Sector||"Unknown")||"Unknown",
    Industry: str(r.Industry||"Unknown")||"Unknown",
    Marketcap: str(r.Marketcap||""),
  }));
  const masterMap = {};
  master.forEach(m => { masterMap[m.Symbol] = m; });
  const enrich = row => {
    const m = masterMap[row.Symbol];
    row.Sector = m ? m.Sector : "Unknown";
    row.Industry = m ? m.Industry : "Unknown";
    row.Marketcap = m ? m.Marketcap : "";
    row.Stock_Name = m ? m.Stock_Name : "";
    row.Price = m ? m.Price : "";
    row.Change_Pct = m ? m.Change_Pct : "";
    return row;
  };

  const flat = find("FlatData","Flat").map(r => enrich({
    Symbol: cleanSym(r.Symbol||r.SYMBOL),
    Signal_Name: str(r.Signal_Name||r.SIGNAL_NAME),
    Signal_Category: str(r.Signal_Category||r.SIGNAL_CATEGORY),
    Signal_Type: str(r.Signal_Type||r.SIGNAL_TYPE),
    Trading_Bias: str(r.Trading_Bias||r.TRADING_BIAS),
    Total_Zone_Signals: str(r.Total_Zone_Signals||"0"),
    Total_NR_Signals: str(r.Total_NR_Signals||"0"),
    Has_Both_Types: str(r.Has_Both_Types||"No"),
    Is_FNO: str(r.Is_FNO||"No"),
    Is_Nifty_LargeCap_100: str(r.Is_Nifty_LargeCap_100||"No"),
    Is_Midcap_150: str(r.Is_Midcap_150||"No"),
    Is_SmallCap_250: str(r.Is_SmallCap_250||"No"),
    Is_MicroCap_250: str(r.Is_MicroCap_250||"No"),
    Is_Nifty_500: str(r.Is_Nifty_500||"No"),
    Timeframe: str(r.Timeframe||""),
    Long_Signal_Count: str(r.Long_Signal_Count||"0"),
    Short_Signal_Count: str(r.Short_Signal_Count||"0"),
    Retracement_Signal_Count: str(r.Retracement_Signal_Count||"0"),
    Mixed_Signal_Count: str(r.Mixed_Signal_Count||"0"),
  }));

  const top = find("TopOpportunities","Top").map(r => enrich({
    Symbol: cleanSym(r.Symbol||r.SYMBOL),
    Trading_Bias: str(r.Trading_Bias||r.TRADING_BIAS),
    Total_Signals: str(r.Total_Signals||"0"),
    Zone_Signals: str(r.Zone_Signals||"0"),
    NR_Signals: str(r.NR_Signals||"0"),
    Long_Signals: str(r.Long_Signals||"0"),
    Short_Signals: str(r.Short_Signals||"0"),
    Retracement_Signals: str(r.Retracement_Signals||"0"),
    Zone_Signal_List: str(r.Zone_Signal_List||""),
    NR_Signal_List: str(r.NR_Signal_List||""),
    Is_FNO: str(r.Is_FNO||"No"),
    Is_Nifty_LargeCap_100: str(r.Is_Nifty_LargeCap_100||"No"),
    Is_Midcap_150: str(r.Is_Midcap_150||"No"),
    Is_SmallCap_250: str(r.Is_SmallCap_250||"No"),
    Is_MicroCap_250: str(r.Is_MicroCap_250||"No"),
    Is_Nifty_500: str(r.Is_Nifty_500||"No"),
  }));

  const summary = find("SignalSummary","Signal_Summary").map(r => ({
    Signal_Name: str(r.Signal_Name||""),
    Signal_Category: str(r.Signal_Category||""),
    Signal_Type: str(r.Signal_Type||""),
    Stock_Count: str(r.Stock_Count||"0"),
    URL: str(r.URL||""),
    Timeframe: str(r.Timeframe||""),
  }));

  const strong = find("StrongConviction","Strong_Conviction").map(r => enrich({
    Symbol: cleanSym(r.Symbol),
    Conviction_Type: str(r.Conviction_Type||""),
    Conviction_Score: str(r.Conviction_Score||"0"),
    Long_Signals: str(r.Long_Signals||"0"),
    Short_Signals: str(r.Short_Signals||"0"),
    Retracement_Signals: str(r.Retracement_Signals||"0"),
    Has_NR_Signal: str(r.Has_NR_Signal||""),
    NR_Signal_Count: str(r.NR_Signal_Count||"0"),
    Is_FNO: str(r.Is_FNO||"No"),
    Is_Nifty_500: str(r.Is_Nifty_500||"No"),
    Is_Nifty_LargeCap_100: str(r.Is_Nifty_LargeCap_100||"No"),
    Is_Midcap_150: str(r.Is_Midcap_150||"No"),
    Is_SmallCap_250: str(r.Is_SmallCap_250||"No"),
  }));

  const mtnr = find("MultiTimeframe","Multi_Timeframe").map(r => enrich({
    Symbol: cleanSym(r.Symbol),
    NR_Signal_Count: str(r.NR_Signal_Count||"0"),
    Timeframes: str(r.Timeframes||""),
    Timeframe_Count: str(r.Timeframe_Count||"0"),
    NR_Signals: str(r.NR_Signals||""),
    Is_FNO: str(r.Is_FNO||"No"),
    Is_Nifty_500: str(r.Is_Nifty_500||"No"),
  }));

  const virgin = find("VirginBO","Virgin_BO").map(r => enrich({
    Symbol: cleanSym(r.Symbol),
    Virgin_Type: str(r.Virgin_Type||""),
    Virgin_Signal_Count: str(r.Virgin_Signal_Count||"0"),
    Timeframes: str(r.Timeframes||""),
    Has_NR_Signal: str(r.Has_NR_Signal||""),
    NR_Count: str(r.NR_Count||"0"),
    Is_FNO: str(r.Is_FNO||"No"),
    Is_Nifty_500: str(r.Is_Nifty_500||"No"),
  }));

  const sectorAnalysis = find("SectorAnalysis","Sector_Analysis").map(r => ({
    Sector: str(r.Sector||"Unknown"),
    Total_Stocks: +r.Total_Stocks||0,
    Advancing: +r.Advancing||0,
    Declining: +r.Declining||0,
    Unchanged: +r.Unchanged||0,
    Avg_Change_Pct: +r.Avg_Change_Pct||0,
    Total_Volume: +r.Total_Volume||0,
    Marketcap_Breakdown: str(r.Marketcap_Breakdown||""),
    Stocks_With_Zone_Signal: +r.Stocks_With_Zone_Signal||0,
    Zone_Long_Count: +r.Zone_Long_Count||0,
    Zone_Short_Count: +r.Zone_Short_Count||0,
    Zone_Retracement_Count: +r.Zone_Retracement_Count||0,
    Zone_Mixed_Count: +r.Zone_Mixed_Count||0,
    Stocks_With_NR_Signal: +r.Stocks_With_NR_Signal||0,
    NR_Breakout_Count: +r.NR_Breakout_Count||0,
    NR_Breakdown_Count: +r.NR_Breakdown_Count||0,
    NR_Near_High_Count: +r.NR_Near_High_Count||0,
    NR_Near_Low_Count: +r.NR_Near_Low_Count||0,
    NR_Back_To_NR_Count: +r.NR_Back_To_NR_Count||0,
    Total_Signal_Count: +r.Total_Signal_Count||0,
    Bullish_Score: +r.Bullish_Score||0,
    Bearish_Score: +r.Bearish_Score||0,
    Net_Bias_Score: +r.Net_Bias_Score||0,
    Advance_Decline_Ratio: +r.Advance_Decline_Ratio||0,
    Signal_Density: +r.Signal_Density||0,
    Strength_Score: +r.Strength_Score||0,
    Strength_Label: str(r.Strength_Label||"Neutral"),
  }));

  const industryAnalysis = find("IndustryAnalysis","Industry_Analysis").map(r => ({
    Sector: str(r.Sector||"Unknown"),
    Industry: str(r.Industry||"Unknown"),
    Total_Stocks: +r.Total_Stocks||0,
    Advancing: +r.Advancing||0,
    Declining: +r.Declining||0,
    Unchanged: +r.Unchanged||0,
    Avg_Change_Pct: +r.Avg_Change_Pct||0,
    Total_Volume: +r.Total_Volume||0,
    Marketcap_Breakdown: str(r.Marketcap_Breakdown||""),
    Stocks_With_Zone_Signal: +r.Stocks_With_Zone_Signal||0,
    Zone_Long_Count: +r.Zone_Long_Count||0,
    Zone_Short_Count: +r.Zone_Short_Count||0,
    Zone_Retracement_Count: +r.Zone_Retracement_Count||0,
    Zone_Mixed_Count: +r.Zone_Mixed_Count||0,
    Stocks_With_NR_Signal: +r.Stocks_With_NR_Signal||0,
    NR_Breakout_Count: +r.NR_Breakout_Count||0,
    NR_Breakdown_Count: +r.NR_Breakdown_Count||0,
    NR_Near_High_Count: +r.NR_Near_High_Count||0,
    NR_Near_Low_Count: +r.NR_Near_Low_Count||0,
    NR_Back_To_NR_Count: +r.NR_Back_To_NR_Count||0,
    Total_Signal_Count: +r.Total_Signal_Count||0,
    Bullish_Score: +r.Bullish_Score||0,
    Bearish_Score: +r.Bearish_Score||0,
    Net_Bias_Score: +r.Net_Bias_Score||0,
    Advance_Decline_Ratio: +r.Advance_Decline_Ratio||0,
    Signal_Density: +r.Signal_Density||0,
    Strength_Score: +r.Strength_Score||0,
    Strength_Label: str(r.Strength_Label||"Neutral"),
  }));

  const nrSectorIndustry = find("NRBreakoutSectorIndustry","NR_Breakout_Sector").map(r => ({
    Sector: str(r.Sector||"Unknown"),
    Industry: str(r.Industry||"Unknown"),
    NR_Signal: str(r.NR_Signal||""),
    Pattern_Type: str(r.Pattern_Type||""),
    Stock_Count: +r.Stock_Count||0,
  }));

  const sig_stocks = {};
  flat.forEach(r => {
    const sn = r.Signal_Name;
    if (!sig_stocks[sn]) sig_stocks[sn] = [];
    sig_stocks[sn].push({ s:r.Symbol, b:r.Trading_Bias, fno:r.Is_FNO, n500:r.Is_Nifty_500, n100:r.Is_Nifty_LargeCap_100, mid:r.Is_Midcap_150, sec:r.Sector, ind:r.Industry });
  });

  const numOrNull = v => (v===""||v==null||isNaN(+v)) ? null : +v;
  const zoneLevels = find("ZoneLevels","Zone_Levels").map(r => {
    const o = { Symbol: cleanSym(r.Symbol), Stock_Name: str(r.Stock_Name), Sector: str(r.Sector||"Unknown")||"Unknown",
      Industry: str(r.Industry||"Unknown")||"Unknown", Price: numOrNull(r.Price), Change_Pct: numOrNull(r.Change_Pct),
      Is_FNO: str(r.Is_FNO||"No"), Is_Nifty_500: str(r.Is_Nifty_500||"No"),
      prev: { D:numOrNull(r.Prev_Day_Close), W:numOrNull(r.Prev_Week_Close), M:numOrNull(r.Prev_Month_Close), Q:numOrNull(r.Prev_Quarter_Close), Y:numOrNull(r.Prev_Year_Close) } };
    ["D","W","M","Q","Y"].forEach(t => {
      o[t] = { tz: numOrNull(r[`${t}_Top_Zone`]), tn: numOrNull(r[`${t}_Top_Near`]), bn: numOrNull(r[`${t}_Bottom_Near`]),
               bz: numOrNull(r[`${t}_Bottom_Zone`]), pos: str(r[`${t}_Position`]), dTop: numOrNull(r[`${t}_Dist_Top_Pct`]),
               dBot: numOrNull(r[`${t}_Dist_Bottom_Pct`]) };
    });
    return o;
  }).filter(z => z.Symbol);
  const RP_NUM = ["Price","Entry_Monthly_Zone","Stop","Target_Quarterly","Target_Yearly","Return_To_Q_Pct","Return_To_Y_Pct","Best_Return_Pct",
                  "Remaining_To_Q_Pct","Remaining_To_Y_Pct","Risk_Pct","RR_Q","RR_Y","Distance_To_Entry_Pct"];
  const returnPotential = find("ReturnPotential","Return_Potential").map(r => {
    const o = { Symbol: cleanSym(r.Symbol), Stock_Name: str(r.Stock_Name), Sector: str(r.Sector||"Unknown")||"Unknown", Industry: str(r.Industry||"Unknown")||"Unknown",
      Direction: str(r.Direction), Status: str(r.Status), Is_FNO: str(r.Is_FNO||"No"), Is_Nifty_500: str(r.Is_Nifty_500||"No") };
    RP_NUM.forEach(k => { o[k] = numOrNull(r[k]); });
    return o;
  }).filter(r => r.Symbol && r.Direction);

  // Price_Health (long-term quality of each stock from its yearly candles)
  const priceHealth = find("PriceHealth","Price_Health").map(r => {
    const longKey = Object.keys(r).find(k => /^Return_\d+Y_Pct$/.test(k) && k !== "Return_3Y_Pct");
    return { Symbol: cleanSym(r.Symbol), Health: str(r.Health).toUpperCase(), Price: numOrNull(r.Price),
      Sector: str(r.Sector||"Unknown")||"Unknown", Industry: str(r.Industry||"Unknown")||"Unknown",
      Peak_High: numOrNull(r.Peak_High), Peak_Years_Ago: numOrNull(r.Peak_Years_Ago),
      Drawdown: numOrNull(r.Drawdown_From_Peak_Pct), RetLong: longKey ? numOrNull(r[longKey]) : null,
      RetLongLabel: longKey ? longKey.replace(/^Return_|_Pct$/g,"") : "", Ret3Y: numOrNull(r.Return_3Y_Pct),
      Years: numOrNull(r.Years_Of_History), Reason: str(r.Reason), Is_FNO: str(r.Is_FNO||"No") };
  }).filter(r => r.Symbol && r.Health);

  // Failed_NR (NR trap: failed breakout / breakdown, price back at the opposite mother edge)
  const FN_NUM = ["Price","Mother_Bars_Ago","Mother_High","Mother_Low","Failure_Bars_Ago","Failure_Close","Position_In_Mother_Pct",
                  "Entry","Stop","Target","Risk_Pct","Reward_Pct","RR"];
  const failedNR = find("FailedNR","Failed_NR").map(r => {
    const o = { Symbol: cleanSym(r.Symbol), Stock_Name: str(r.Stock_Name), Sector: str(r.Sector||"Unknown")||"Unknown",
      Industry: str(r.Industry||"Unknown")||"Unknown", Timeframe: str(r.Timeframe), Trap: str(r.Trap), Trade: str(r.Trade),
      Health: str(r.Health).toUpperCase(), Is_FNO: str(r.Is_FNO||"No"), Is_Nifty_500: str(r.Is_Nifty_500||"No") };
    FN_NUM.forEach(k => { o[k] = numOrNull(r[k]); });
    return o;
  }).filter(r => r.Symbol && r.Trade);

  const has = { priceHealth: !!Object.keys(rawDB).find(k=>k.toLowerCase().replace(/[\s_]/g,"")==="pricehealth"),
                failedNR: !!Object.keys(rawDB).find(k=>k.toLowerCase().replace(/[\s_]/g,"")==="failednr") };

  return { flat, top, summary, strong, mtnr, virgin, sig_stocks, master, masterMap, sectorAnalysis, industryAnalysis, nrSectorIndustry, zoneLevels, returnPotential, priceHealth, failedNR, has };
}

function classifyHorizons(flat) {
  const intraday = new Set(), swing = new Set(), invest = new Set();
  flat.forEach(r => {
    const name = r.Signal_Name, tf = r.Timeframe, nl = name.toLowerCase();
    if (tf==="Daily" || name.startsWith("D_N") || nl.includes("daily"))  intraday.add(name);
    if (tf==="" || tf==="Daily" || tf==="Weekly" || name.startsWith("W_") || name.startsWith("D_")) swing.add(name);
    if (tf==="Monthly"||tf==="Quarterly"||tf==="Yearly"||name.startsWith("M_")||name.startsWith("Q_")||name.startsWith("Y_")) invest.add(name);
  });
  return { intraday, swing, invest };
}

function getHorizonList(sigName, horizons) {
  const { intraday, swing, invest } = horizons;
  const out = [];
  if (intraday.has(sigName)) out.push("intraday");
  if (swing.has(sigName)) out.push("swing");
  if (invest.has(sigName)) out.push("investment");
  return out.length ? out : ["swing"];
}

// ─── VERSION / FILE HELPERS ────────────────────────────────────────────────────
function extractDateFromFilename(name) {
  const n = str(name);
  let m = n.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (m) {
    const y=+m[1], mo=+m[2], d=+m[3];
    if (mo>=1&&mo<=12&&d>=1&&d<=31) { const dt=new Date(y,mo-1,d); if(!isNaN(dt.getTime())) return dt; }
  }
  m = n.match(/(\d{2})[-_](\d{2})[-_](20\d{2})/);
  if (m) {
    const d=+m[1], mo=+m[2], y=+m[3];
    if (mo>=1&&mo<=12&&d>=1&&d<=31) { const dt=new Date(y,mo-1,d); if(!isNaN(dt.getTime())) return dt; }
  }
  return null;
}
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDateLabel(dt) {
  if (!dt) return null;
  return `${dt.getDate()} ${MONTH_ABBR[dt.getMonth()]} ${dt.getFullYear()}`;
}
function parseWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type:"array" });
        const rawDB = {};
        wb.SheetNames.forEach(n => { rawDB[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval:"" }); });
        const db = mapDB(rawDB);
        const dateValue = extractDateFromFilename(file.name) || (file.lastModified ? new Date(file.lastModified) : null);
        resolve({ fileName: file.name, db, dateValue, dateLabel: formatDateLabel(dateValue) });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Could not read "+file.name));
    reader.readAsArrayBuffer(file);
  });
}


// ─── LOGO — the hyperplane symbol: a plane, its normal vector, and the two classes it separates ──
function HyperplaneLogo({ size=28 }) {
  const id = "hpl" + size;
  const small = size < 36;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Hyperplane logo" style={{flexShrink:0,display:"block"}}>
      <defs>
        <linearGradient id={id+"bg"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{stopColor:"#0d1b33"}}/><stop offset="1" style={{stopColor:"#070d1a"}}/>
        </linearGradient>
        <linearGradient id={id+"pl"} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{stopColor:"#22d3ee",stopOpacity:.95}}/><stop offset="1" style={{stopColor:"#6366f1",stopOpacity:.95}}/>
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="16" fill={`url(#${id}bg)`} stroke="#1f3a5f" strokeWidth="1.5"/>
      {/* class below the plane */}
      <circle cx="14" cy="47" r={small?3.4:3} fill="#6366f1"/>
      {!small && <circle cx="22" cy="53" r="2.6" fill="#6366f1" opacity=".8"/>}
      {/* the plane, seen in perspective */}
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill={`url(#${id}pl)`} opacity=".9"/>
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill="none" stroke="#a5f3fc" strokeOpacity=".7" strokeWidth="1.2" strokeLinejoin="round"/>
      {/* normal vector w, standing up from the plane */}
      <line x1="32" y1="36" x2="32" y2="12" stroke="#e0f2fe" strokeWidth="3.4" strokeLinecap="round"/>
      <path d="M26.5 17 L32 10 L37.5 17" fill="none" stroke="#e0f2fe" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="32" cy="36" r="2.6" fill="#070d1a" stroke="#e0f2fe" strokeWidth="1.8"/>
      {/* class above the plane */}
      <circle cx="49" cy="17" r={small?3.4:3} fill="#22d3ee"/>
      {!small && <circle cx="43" cy="11" r="2.6" fill="#22d3ee" opacity=".8"/>}
    </svg>
  );
}

// ─── THEME TOGGLE ───────────────────────────────────────────────────────────────
function ThemeToggle({ theme, setTheme }) {
  return (
    <button className="theme-toggle" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} title="Toggle light / dark theme">
      {theme==="dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────
function UploadScreen({ onLoaded, theme, setTheme }) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef();

  const process = async fileList => {
    const files = Array.from(fileList||[]).filter(f=>f);
    if (!files.length) return;
    setError(""); setProgress(5); setProgressLabel(files.length>1?`Parsing 0 / ${files.length} files...`:"Parsing file...");
    try {
      const results = [];
      for (let i=0;i<files.length;i++){
        setProgressLabel(files.length>1?`Parsing ${i+1} / ${files.length} files...`:"Parsing file...");
        setProgress(10 + Math.round((i/files.length)*80));
        const parsed = await parseWorkbookFile(files[i]);
        results.push(parsed);
      }
      results.sort((a,b)=>{
        if (a.dateValue && b.dateValue) return a.dateValue-b.dateValue;
        if (a.dateValue) return -1;
        if (b.dateValue) return 1;
        return 0;
      });
      setProgress(100); setProgressLabel("Done");
      setTimeout(() => onLoaded(results), 250);
    } catch(err) { setError("Parse error: "+err.message); setProgress(null); }
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)",position:"relative"}}>
      <div className="grid-bg" />
      <div style={{position:"absolute",top:20,right:24,zIndex:2}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{textAlign:"center",maxWidth:560,width:"92%",position:"relative",zIndex:1}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:28}}>
          <HyperplaneLogo size={64}/>
          <div style={{fontFamily:"var(--mono)",fontSize:"12px",color:"var(--acc)",letterSpacing:"4px",textTransform:"uppercase"}}>{APP_NAME}</div>
        </div>
        <h1 style={{fontSize:42,fontWeight:700,lineHeight:1.1,marginBottom:10,color:"var(--t1)"}}>
          Quant<br/><span style={{color:"var(--acc)"}}>Intelligence</span>
        </h1>
        <p style={{fontSize:14,color:"var(--t2)",marginBottom:36,lineHeight:1.7}}>
          Upload your Excel signals file to explore opportunities, sector &amp; industry strength, apply slicers, and access the Control Tower.
          <br/>Drop <strong style={{color:"var(--t1)"}}>more than one dated export</strong> together (today's, yesterday's, ...) to unlock trend &amp; version comparison.
        </p>
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true)}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)process(e.dataTransfer.files);}}
          onClick={()=>inputRef.current.click()}
          style={{
            background: dragging?"var(--s2)":"var(--s1)",
            border:`2px dashed ${dragging?"var(--acc)":"var(--b2)"}`,
            borderRadius:14, padding:"44px 28px", cursor:"pointer", transition:"all .2s",
          }}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&process(e.target.files)} />
          <div style={{fontSize:44,marginBottom:14}}>📊</div>
          <div style={{fontSize:16,fontWeight:600,marginBottom:5}}>Drop your Excel file(s) here</div>
          <div style={{fontSize:13,color:"var(--t2)"}}>or click to browse · .xlsx / .xls · select multiple for version comparison</div>
        </div>
        {progress!=null && (
          <div style={{marginTop:18}}>
            <div style={{height:3,background:"var(--b1)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",background:"var(--acc)",width:progress+"%",transition:"width .3s"}} />
            </div>
            <div style={{fontSize:11,color:"var(--t2)",marginTop:7,fontFamily:"var(--mono)"}}>{progressLabel} {progress}%</div>
          </div>
        )}
        {error && <div style={{color:"var(--short)",fontSize:13,marginTop:10}}>{error}</div>}
      </div>
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:"tower",    label:"🏛 Control Tower" },
  { id:"sector",   label:"🏭 Sector & Industry" },
  { id:"flat",     label:"🎛 Slicer" },
  { id:"opp",      label:"🎯 Opportunities" },
  { id:"horizon",  label:"⏱ Horizon" },
  { id:"strong",   label:"💪 Conviction" },
  { id:"mtnr",     label:"📐 Multi-TF NR" },
  { id:"virgin",   label:"🔓 Virgin BO/BD" },
  { id:"summary",  label:"📋 Signals" },
  { id:"master",   label:"🗂 Master List" },
];
const TREND_TAB = { id:"trend", label:"📈 Trend & Versions" };

export function Dashboard({ rawVersions, theme, setTheme, headerCenter=null, headerRight=null, extraTabs=[], emptyState=null }) {
  const [activeIdx, setActiveIdx] = useState(Math.max(0, rawVersions.length-1));
  useEffect(() => { setActiveIdx(Math.max(0, rawVersions.length-1)); }, [rawVersions]);
  const [tab, setTab]     = useState("tower");
  const [navOpen, setNavOpen] = useState(false);
  const [ctFilters, setCtFilters] = useState(0);
  const [healthAllow, setHealthAllowState] = useState(() => {
    const v = loadPref("hp_health_allow", "HEALTHY,WEAK,POOR").split(",").filter(h=>HEALTH_LEVELS.includes(h));
    return new Set(v.length ? v : HEALTH_LEVELS);
  });
  const setHealthAllow = upd => setHealthAllowState(prev => { const n = typeof upd==="function" ? upd(prev) : upd; savePref("hp_health_allow", [...n].join(",")); return n; });
  const healthMode = HEALTH_LEVELS.every(h=>healthAllow.has(h)) ? "all" : "custom";
  const hIdx = useMemo(() => healthIndex(rawVersions), [rawVersions]);
  const excluded = useMemo(() => {
    const all = new Set(); rawVersions.forEach(v => { v.db.flat.forEach(r=>all.add(r.Symbol)); (v.db.zoneLevels||[]).forEach(r=>all.add(r.Symbol)); (v.db.master||[]).forEach(r=>all.add(r.Symbol)); });
    return excludedSymbols(healthAllow, hIdx, all);
  }, [rawVersions, healthAllow, hIdx]);
  const versions = useMemo(() => rawVersions.map(v => ({ ...v, db: filterDB(v.db, excluded) })), [rawVersions, excluded]);
  const health = { allow: healthAllow, setAllow: setHealthAllow, hIdx, removed: excluded.size };
  const safeActive = Math.min(activeIdx, Math.max(0, versions.length-1));
  const db = versions.length ? versions[safeActive].db : null;
  const fileName = versions.length ? versions[safeActive].fileName : "";
  const horizons = useMemo(() => db ? classifyHorizons(db.flat) : { intraday:new Set(),swing:new Set(),invest:new Set() }, [db]);
  const hasMultiVersions = versions.length > 1;
  const tabs = [...(db ? (hasMultiVersions ? [...TABS, TREND_TAB] : TABS) : []), ...extraTabs.map(t=>({id:t.id,label:t.label}))];
  const extra = extraTabs.find(t => t.id === tab);
  const showTab = (!db && !extra && extraTabs.length) ? null : tab;

  const syms = db ? new Set(db.flat.map(r=>r.Symbol)) : new Set();

  return (
    <>
      <style>{CSS}</style>
      <div className={`app-shell theme-${theme}`}>
        <div style={{background:"var(--headerbg)",backdropFilter:"blur(12px)",borderBottom:"1px solid var(--b1)",padding:"0 20px",display:"flex",alignItems:"center",gap:16,position:"sticky",top:0,zIndex:200,height:52}}>
          <div style={{display:"flex",alignItems:"center",gap:9,whiteSpace:"nowrap"}}>
            <HyperplaneLogo size={28}/>
            <span style={{fontFamily:"var(--mono)",fontSize:15,fontWeight:700,color:"var(--t1)",letterSpacing:".5px"}}>{APP_NAME}</span>
          </div>
          <div style={{width:1,height:22,background:"var(--b1)"}} />
          {headerCenter || <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--mono)",overflow:"hidden",textOverflow:"ellipsis",maxWidth:200,whiteSpace:"nowrap"}}>{fileName}</div>}
          {healthMode!=="all" && hIdx.available && (
            <div onClick={()=>setTab("tower")} title="Stock quality filter is on for every page — change it in the Control Tower"
                 style={{cursor:"pointer",fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:20,border:"1px solid var(--long)",color:"var(--long)",whiteSpace:"nowrap"}}>
              🩺 {HEALTH_LEVELS.filter(h=>healthAllow.has(h)).map(h=>HEALTH_LABEL[h]).join(" + ")} only · {excluded.size.toLocaleString()} hidden
            </div>
          )}
          <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
            {db && <div className="hdr-stats" style={{display:"flex",gap:20,alignItems:"center"}}>
              {[{n:"Stocks",v:syms.size},{n:"Rows",v:db.flat.length},{n:"Opps",v:db.top.length},{n:"Sectors",v:db.sectorAnalysis.length},{n:"Industries",v:db.industryAnalysis.length}].map(({n,v})=>(
                <div key={n} style={{textAlign:"center"}}>
                  <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:700,color:"var(--acc)",lineHeight:1}}>{v.toLocaleString()}</div>
                  <div style={{fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",marginTop:2}}>{n}</div>
                </div>
              ))}
            </div>}
            <ThemeToggle theme={theme} setTheme={setTheme}/>
            {headerRight}
          </div>
        </div>

        <div style={{background:"var(--s1)",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",overflowX:"auto",padding:"0 20px 0 10px",position:"sticky",top:52,zIndex:199,scrollbarWidth:"none"}}>
          {tab==="tower" && db && (
            <button onClick={()=>setNavOpen(v=>!v)} title={navOpen?"Close filters & navigation":"Open filters & navigation"} className="nav-pull"
              style={{position:"relative",flexShrink:0,width:28,height:28,marginRight:6,borderRadius:7,border:`1px solid ${navOpen||ctFilters?"var(--acc)":"var(--b2)"}`,background:navOpen?"var(--adim)":"var(--s2)",color:navOpen||ctFilters?"var(--acc)":"var(--t2)",fontSize:14,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {navOpen?"✕":"☰"}
              {!navOpen && ctFilters>0 && <span style={{position:"absolute",top:-5,right:-6,fontSize:9,fontFamily:"var(--mono)",fontWeight:700,color:"var(--bg)",background:"var(--acc)",borderRadius:8,padding:"0 4px",lineHeight:"14px"}}>{ctFilters}</span>}
            </button>
          )}
          {tabs.map(t => (
            <div key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"12px 14px",fontSize:12.5,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",
              borderBottom: tab===t.id ? "2px solid var(--acc)" : "2px solid transparent",
              color: tab===t.id ? "var(--acc)" : "var(--t2)",
              transition:"all .18s",
            }}>{t.label}</div>
          ))}
        </div>

        <div>
          {!db && !extra && (emptyState || null)}
          {db && tab==="tower"   && <ControlTowerCombined versions={versions} health={health} navOpen={navOpen} setNavOpen={setNavOpen} onFilterCount={setCtFilters} />}
          {db && tab==="sector"  && <SectorIndustryTab db={db} />}
          {db && tab==="flat"    && <FlatSlicer     db={db} />}
          {db && tab==="opp"     && <Opportunities  db={db} />}
          {db && tab==="horizon" && <HorizonTab     db={db} horizons={horizons} />}
          {db && tab==="strong"  && <StrongConviction db={db} />}
          {db && tab==="mtnr"    && <MTNR           db={db} />}
          {db && tab==="virgin"  && <Virgin         db={db} />}
          {db && tab==="summary" && <SignalSummary  db={db} />}
          {db && tab==="master"  && <MasterListTab  db={db} />}
          {db && tab==="trend" && hasMultiVersions && <TrendVersionsTab versions={versions} activeIdx={safeActive} onSelectVersion={setActiveIdx} />}
          {extra && extra.render({ versions, db, health, setTab })}
        </div>
      </div>
    </>
  );
}

// ─── GAUGE ────────────────────────────────────────────────────────────────────
function Gauge({ pct, color, size=80, label, value }) {
  const r = 28, cx = 40, cy = 40, circ = 2*Math.PI*r, arc = circ*0.75;
  const offset = arc - (pct/100)*arc;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={7} stroke="var(--s3)" strokeDasharray={`${arc} ${circ-arc}`} transform="rotate(135 40 40)"/>
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={7} stroke={color} strokeDasharray={`${arc} ${circ-arc}`} strokeDashoffset={offset} transform="rotate(135 40 40)" strokeLinecap="round" style={{transition:"stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"}}/>
        <text x={cx} y={cy+2} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="IBM Plex Mono">{pct.toFixed(0)}%</text>
      </svg>
      <div style={{fontSize:10,color:"var(--t2)",textAlign:"center"}}>{label}</div>
      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",fontFamily:"var(--mono)"}}>{value}</div>
    </div>
  );
}

function DonutChart({ slices, size=100 }) {
  const r=36, cx=50, cy=50, circ=2*Math.PI*r;
  let cumPct=0;
  const total=slices.reduce((s,sl)=>s+sl.val,0)||1;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--s3)" strokeWidth={12}/>
      {slices.map((sl,i)=>{
        const pct=sl.val/total, dashArr=circ*pct, offset=circ*(1-cumPct);
        cumPct+=pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={sl.color} strokeWidth={12} strokeDasharray={`${dashArr} ${circ-dashArr}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" style={{transition:"stroke-dashoffset .6s"}}/>;
      })}
      <text x={cx} y={cy-3} textAnchor="middle" fill="var(--t1)" fontSize="14" fontWeight="700" fontFamily="IBM Plex Mono">{total}</text>
      <text x={cx} y={cy+12} textAnchor="middle" fill="var(--t3)" fontSize="8">stocks</text>
    </svg>
  );
}

function SignalHeatmap({ db }) {
  const cells = useMemo(()=>{
    const cats={}, biases=new Set();
    db.flat.forEach(r=>{ biases.add(r.Trading_Bias); if(!cats[r.Signal_Category])cats[r.Signal_Category]={}; cats[r.Signal_Category][r.Trading_Bias]=(cats[r.Signal_Category][r.Trading_Bias]||0)+1; });
    return {cats,biases:[...biases].filter(Boolean)};
  },[db.flat]);
  const catList=Object.keys(cells.cats);
  const maxVal=Math.max(...catList.flatMap(c=>cells.biases.map(b=>cells.cats[c][b]||0)),1);
  return (
    <div>
      <div style={{display:"flex",gap:2,marginBottom:4,marginLeft:56}}>
        {cells.biases.map(b=><div key={b} style={{width:44,fontSize:8,color:"var(--t3)",textAlign:"center",textTransform:"uppercase",letterSpacing:".4px"}}>{b.slice(0,4)}</div>)}
      </div>
      {catList.map(cat=>(
        <div key={cat} style={{display:"flex",alignItems:"center",gap:2,marginBottom:2}}>
          <div style={{width:52,fontSize:9,color:"var(--t2)",textAlign:"right",paddingRight:4,flexShrink:0}}>{cat}</div>
          {cells.biases.map(b=>{
            const v=cells.cats[cat][b]||0, intensity=v/maxVal, bc=BIAS_COLOR[b]||BIAS_COLOR.NEUTRAL;
            return (
              <div key={b} className="hm-cell" title={`${cat}×${b}: ${v}`}
                style={{width:44,height:20,background:bc.bg,borderRadius:3,position:"relative",overflow:"hidden",border:`1px solid ${intensity>.2?bc.border:"var(--b1)"}`}}>
                <div style={{position:"absolute",inset:0,background:bc.text,opacity:intensity*.6,borderRadius:3}}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:"var(--mono)",color:intensity>.4?bc.text:"var(--t3)",fontWeight:600}}>{v||""}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── WATCHLIST BUILDER ────────────────────────────────────────────────────────
function WatchlistBuilder({ db }) {
  const [list, setList] = useState([]);
  const [copied, setCopied] = useState(false);

  const presets = [
    { label:"FNO Strong Long",       fn:()=>[...db.strong].filter(r=>r.Is_FNO==="Yes"&&r.Conviction_Type.includes("LONG")).sort((a,b)=>+b.Long_Signals-+a.Long_Signals).slice(0,10).map(r=>r.Symbol) },
    { label:"FNO Strong Short",      fn:()=>[...db.strong].filter(r=>r.Is_FNO==="Yes"&&r.Conviction_Type.includes("SHORT")).sort((a,b)=>+b.Short_Signals-+a.Short_Signals).slice(0,10).map(r=>r.Symbol) },
    { label:"Multi-TF NR ≥4",        fn:()=>[...db.mtnr].filter(r=>+r.Timeframe_Count>=4).sort((a,b)=>+b.NR_Signal_Count-+a.NR_Signal_Count).slice(0,15).map(r=>r.Symbol) },
    { label:"Virgin Breakouts",      fn:()=>[...db.virgin].filter(r=>r.Virgin_Type.toLowerCase().includes("breakout")).sort((a,b)=>+b.Virgin_Signal_Count-+a.Virgin_Signal_Count).slice(0,10).map(r=>r.Symbol) },
    { label:"Virgin Breakdowns",     fn:()=>[...db.virgin].filter(r=>r.Virgin_Type.toLowerCase().includes("breakdown")).sort((a,b)=>+b.Virgin_Signal_Count-+a.Virgin_Signal_Count).slice(0,10).map(r=>r.Symbol) },
    { label:"Top 15 Opportunities",  fn:()=>[...db.top].sort((a,b)=>+b.Total_Signals-+a.Total_Signals).slice(0,15).map(r=>r.Symbol) },
    { label:"Top Sector Leaders",    fn:()=>{
        const topSec=[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score)[0];
        if(!topSec) return [];
        const inSec=new Set(db.master.filter(m=>m.Sector===topSec.Sector).map(m=>m.Symbol));
        const cnt={};
        db.flat.forEach(r=>{ if(inSec.has(r.Symbol)) cnt[r.Symbol]=(cnt[r.Symbol]||0)+1; });
        return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([s])=>s);
      } },
    { label:"Weakest Sector Shorts", fn:()=>{
        const weakSec=[...db.sectorAnalysis].sort((a,b)=>a.Strength_Score-b.Strength_Score)[0];
        if(!weakSec) return [];
        const inSec=new Set(db.master.filter(m=>m.Sector===weakSec.Sector).map(m=>m.Symbol));
        return [...db.strong].filter(r=>inSec.has(r.Symbol)&&r.Conviction_Type.includes("SHORT")).sort((a,b)=>+b.Short_Signals-+a.Short_Signals).slice(0,10).map(r=>r.Symbol);
      } },
  ];

  const addPreset = fn => { const syms=fn(); setList(l=>[...new Set([...l,...syms])]); };
  const remove = sym => setList(l=>l.filter(s=>s!==sym));

  const csvText = list.join(",");
  const tvText  = list.map(s=>`NSE:${s}`).join(",");

  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>📋 Watchlist Builder</div>
        {list.length>0&&(
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{copyToClipboard(csvText);setCopied("csv");setTimeout(()=>setCopied(false),1500);}} style={{background:"var(--s2)",border:"1px solid var(--b2)",color:copied==="csv"?"var(--long)":"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:10.5,cursor:"pointer"}}>
              {copied==="csv"?"✓ Copied":"⎘ Copy CSV"} ({list.length})
            </button>
            <button onClick={()=>{copyToClipboard(tvText);setCopied("tv");setTimeout(()=>setCopied(false),1500);}} style={{background:"var(--s2)",border:"1px solid rgba(0,229,255,.3)",color:copied==="tv"?"var(--long)":"var(--acc)",padding:"4px 10px",borderRadius:5,fontSize:10.5,cursor:"pointer"}}>
              {copied==="tv"?"✓ Copied":"⎘ TradingView"}
            </button>
            <button onClick={()=>setList([])} style={{background:"transparent",border:"1px solid var(--b2)",color:"var(--t3)",padding:"4px 10px",borderRadius:5,fontSize:10.5,cursor:"pointer"}}>Clear</button>
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
        {presets.map(p=>(
          <button key={p.label} onClick={()=>addPreset(p.fn)} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:9.5,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            <span style={{color:"var(--acc)"}}>+</span>{p.label}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap",minHeight:28,maxHeight:72,overflowY:"auto",scrollbarWidth:"thin"}}>
        {list.map(sym=>(
          <span key={sym} onClick={()=>remove(sym)} style={{background:"var(--adim)",border:"1px solid var(--acc)",color:"var(--acc)",padding:"2px 7px",borderRadius:4,fontSize:9.5,cursor:"pointer",fontFamily:"var(--mono)"}}>
            {sym} ✕
          </span>
        ))}
        {list.length===0&&<span style={{fontSize:11,color:"var(--t3)"}}>Add stocks via presets above</span>}
      </div>
    </div>
  );
}

// ─── STRATEGY FLOW ────────────────────────────────────────────────────────────
function StrategyFlowPanel({ db }) {
  const tfData = useMemo(()=>{
    const m={};
    db.flat.forEach(r=>{
      const tf=r.Timeframe||"Unknown", bias=r.Trading_Bias;
      if(!m[tf])m[tf]={tf,LONG:0,SHORT:0,MIXED:0,RETRACEMENT:0,total:0};
      m[tf][bias]=(m[tf][bias]||0)+1; m[tf].total++;
    });
    return Object.values(m).sort((a,b)=>b.total-a.total).slice(0,8);
  },[db.flat]);
  const maxTotal=Math.max(...tfData.map(t=>t.total),1);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:12}}>⚡ Timeframe Signal Flow</div>
      {tfData.map(t=>(
        <div key={t.tf} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:11,fontWeight:600,color:"var(--t1)",fontFamily:"var(--mono)"}}>{t.tf}</span>
            <span style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--mono)"}}>{t.total}</span>
          </div>
          <div style={{height:8,background:"var(--s3)",borderRadius:5,overflow:"hidden",display:"flex"}}>
            {["LONG","SHORT","MIXED","RETRACEMENT"].map(b=>{
              const w=(t[b]||0)/t.total*100;
              if(!w) return null;
              const bc=BIAS_COLOR[b]||BIAS_COLOR.NEUTRAL;
              return <div key={b} title={`${b}: ${t[b]}`} style={{height:"100%",width:`${w}%`,background:bc.text,opacity:.8}}/>;
            })}
          </div>
        </div>
      ))}
      <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
        {["LONG","SHORT","MIXED","RETRACEMENT"].map(b=>{
          const bc=BIAS_COLOR[b]||BIAS_COLOR.NEUTRAL;
          return <div key={b} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:2,background:bc.text}}/><span style={{fontSize:9,color:"var(--t2)"}}>{b}</span></div>;
        })}
      </div>
    </div>
  );
}

// ─── RISK PANEL ───────────────────────────────────────────────────────────────
function RiskPanel({ db }) {
  const stats = useMemo(()=>{
    const syms=new Set(db.flat.map(r=>r.Symbol)), total=syms.size||1;
    const biasMap={};
    db.flat.forEach(r=>{ biasMap[r.Symbol]=r.Trading_Bias; });
    const longs=Object.values(biasMap).filter(b=>b==="LONG").length;
    const shorts=Object.values(biasMap).filter(b=>b==="SHORT").length;
    const conviction4tf=db.mtnr.filter(r=>+r.Timeframe_Count>=4).length;
    const virginBO=db.virgin.filter(r=>r.Virgin_Type.toLowerCase().includes("breakout")).length;
    const virginBD=db.virgin.filter(r=>r.Virgin_Type.toLowerCase().includes("breakdown")).length;
    const longPct=longs/total*100, shortPct=shorts/total*100;
    const sentiment=Math.min(100,Math.max(0,50+(longPct-shortPct)*0.7));
    const volatilityScore=Math.min(100,(conviction4tf/Math.max(total,1)*100)*5);
    return {total,longs,shorts,bullBear:longs/(shorts||1),conviction4tf,virginBO,virginBD,sentiment,volatilityScore,longPct,shortPct};
  },[db]);
  const sentimentColor=stats.sentiment>65?"var(--long)":stats.sentiment<35?"var(--short)":"var(--mixed)";
  const sentimentLabel=stats.sentiment>65?"Bullish":stats.sentiment>55?"Mildly Bullish":stats.sentiment>45?"Neutral":stats.sentiment>35?"Mildly Bearish":"Bearish";
  const volColor=stats.volatilityScore>60?"var(--mixed)":stats.volatilityScore>30?"var(--acc)":"var(--long)";
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:14}}>🎯 Market Risk Dashboard</div>
      <div style={{display:"flex",gap:16,justifyContent:"space-around",marginBottom:14,flexWrap:"wrap"}}>
        <Gauge pct={stats.sentiment} color={sentimentColor} label={sentimentLabel} value={`${stats.longs}L/${stats.shorts}S`}/>
        <Gauge pct={stats.volatilityScore} color={volColor} label="Coil Index" value={`${stats.conviction4tf} 4-TF`}/>
        <Gauge pct={Math.min(100,stats.virginBO/(Math.max(stats.virginBD,1))*50+50)} color="var(--ret)" label="BO/BD Ratio" value={`${stats.virginBO}/${stats.virginBD}`}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {[
          {l:"Bull/Bear",v:stats.bullBear.toFixed(2)+"x",c:stats.bullBear>1?"var(--long)":"var(--short)"},
          {l:"4-TF Coiling",v:stats.conviction4tf,c:"var(--mixed)"},
          {l:"Virgin Events",v:stats.virginBO+stats.virginBD,c:"var(--ret)"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"var(--s2)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:15,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:9.5,color:"var(--t3)",marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── INDEX CONCENTRATION ──────────────────────────────────────────────────────
function IndexConcentration({ db }) {
  const data = useMemo(()=>{
    const syms=new Set(db.flat.map(r=>r.Symbol)), total=syms.size||1;
    const flags=[
      {l:"FNO",k:"Is_FNO",c:"var(--long)"},
      {l:"LargeCap 100",k:"Is_Nifty_LargeCap_100",c:"var(--acc)"},
      {l:"Midcap 150",k:"Is_Midcap_150",c:"var(--mixed)"},
      {l:"SmallCap 250",k:"Is_SmallCap_250",c:"var(--a2)"},
      {l:"MicroCap 250",k:"Is_MicroCap_250",c:"var(--ret)"},
      {l:"Nifty 500",k:"Is_Nifty_500",c:"var(--t1)"},
    ];
    return flags.map(f=>{ const cnt=new Set(db.flat.filter(r=>r[f.k]==="Yes").map(r=>r.Symbol)).size; return {...f,cnt,pct:(cnt/total*100).toFixed(1)}; });
  },[db.flat]);
  const slices=data.filter(d=>d.cnt>0).map(d=>({val:d.cnt,color:d.c}));
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:12}}>🗂 Index Concentration</div>
      <div style={{display:"flex",gap:16,alignItems:"center"}}>
        <DonutChart slices={slices} size={90}/>
        <div style={{flex:1}}>
          {data.map(d=>(
            <div key={d.l} style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
              <div style={{width:8,height:8,borderRadius:2,background:d.c,flexShrink:0}}/>
              <div style={{flex:1,fontSize:10.5,color:"var(--t2)"}}>{d.l}</div>
              <div style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:d.c}}>{d.cnt}</div>
              <div style={{fontSize:9.5,color:"var(--t3)",width:36,textAlign:"right"}}>{d.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ALPHA IDEAS ──────────────────────────────────────────────────────────────
function AlphaIdeasPanel({ db }) {
  const ideas = useMemo(()=>{
    const strongMap={}, mtnrMap={}, topMap={}, virginMap={};
    db.strong.forEach(r=>{strongMap[r.Symbol]=r;});
    db.mtnr.forEach(r=>{mtnrMap[r.Symbol]=r;});
    db.top.forEach(r=>{topMap[r.Symbol]=r;});
    db.virgin.forEach(r=>{virginMap[r.Symbol]=r;});
    const allSyms=new Set([...Object.keys(strongMap),...Object.keys(mtnrMap),...Object.keys(topMap)]);
    const out=[];
    allSyms.forEach(sym=>{
      const s=strongMap[sym], m=mtnrMap[sym], t=topMap[sym], v=virginMap[sym];
      const score=(s?+s.Conviction_Score*2:0)+(m?+m.NR_Signal_Count*3:0)+(t?+t.Total_Signals:0)+(v?+v.Virgin_Signal_Count*4:0);
      if(score>0) out.push({
        sym, score:Math.round(score),
        bias:(s?.Conviction_Type)||t?.Trading_Bias||"MIXED",
        convScore:s?.Conviction_Score||"-", nrCount:m?.NR_Signal_Count||"-", tfCount:m?.Timeframe_Count||"-",
        totalSigs:t?.Total_Signals||"-", isVirgin:!!v, virginType:v?.Virgin_Type||"",
        isFNO:(s?.Is_FNO||t?.Is_FNO||m?.Is_FNO)==="Yes",
        isN500:(s?.Is_Nifty_500||t?.Is_Nifty_500||m?.Is_Nifty_500)==="Yes",
        sector:(s?.Sector||t?.Sector||m?.Sector||"Unknown"),
        industry:(s?.Industry||t?.Industry||m?.Industry||"Unknown"),
        tags:[(s?"CONV":""),( m?"NR":""),( t?"OPP":""),( v?"VIR":"")].filter(Boolean),
      });
    });
    return out.sort((a,b)=>b.score-a.score).slice(0,30);
  },[db]);

  const maxScore=ideas[0]?.score||1;
  const tagColor={CONV:"var(--mixed)",NR:"var(--a2)",OPP:"var(--acc)",VIR:"var(--ret)"};
  const allSyms=ideas.map(r=>r.sym);

  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)"}}>💎 Alpha Composite Rankings</div>
          <div style={{fontSize:11,color:"var(--t2)",marginTop:2}}>Cross-referenced: Conviction × NR × Opportunity × Virgin × Sector — top {ideas.length}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <TVCopyBtn symbols={allSyms} label="⎘ Copy All TV"/>
          <div style={{fontSize:9,color:"var(--t3)",lineHeight:1.6}}>
            CONV=Conviction · NR=Multi-TF · OPP=Opportunity · VIR=Virgin
          </div>
        </div>
      </div>
      <div style={{overflowX:"auto",maxHeight:340}} className="tower-scroll">
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr>
              {["#","Symbol","Sector","Bias","Score","Conv","NR","TF","Sigs","Tags","Flags"].map(h=>(
                <th key={h} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"8px 12px",fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:".6px",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap",position:"sticky",top:0}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ideas.map((r,i)=>{
              const isBull=r.bias.includes("LONG"), isBear=r.bias.includes("SHORT");
              const scorePct=r.score/maxScore*100;
              return (
                <tr key={r.sym} style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"7px 12px",color:"var(--t3)",fontFamily:"var(--mono)",fontWeight:700}}>{i+1}</td>
                  <td style={{padding:"7px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      {i===0&&<span style={{fontSize:10}}>🥇</span>}
                      {i===1&&<span style={{fontSize:10}}>🥈</span>}
                      {i===2&&<span style={{fontSize:10}}>🥉</span>}
                      <SymCell sym={r.sym}/>
                      <TVCopyBtn symbols={[r.sym]} label="TV"/>
                    </div>
                  </td>
                  <td style={{padding:"7px 12px"}}><SectorChip sector={r.sector} industry={r.industry}/></td>
                  <td style={{padding:"7px 12px"}}>{biasBadge(isBull?"LONG":isBear?"SHORT":"MIXED",true)}</td>
                  <td style={{padding:"7px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:50,height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${scorePct}%`,background:isBull?"var(--long)":isBear?"var(--short)":"var(--mixed)",borderRadius:3}}/>
                      </div>
                      <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:isBull?"var(--long)":isBear?"var(--short)":"var(--mixed)"}}>{r.score}</span>
                    </div>
                  </td>
                  <td style={{padding:"7px 12px",fontFamily:"var(--mono)",color:"var(--mixed)"}}>{r.convScore}</td>
                  <td style={{padding:"7px 12px",fontFamily:"var(--mono)",color:"var(--a2)"}}>{r.nrCount}</td>
                  <td style={{padding:"7px 12px",fontFamily:"var(--mono)",color:"var(--acc)"}}>{r.tfCount}</td>
                  <td style={{padding:"7px 12px",fontFamily:"var(--mono)",color:"var(--t1)"}}>{r.totalSigs}</td>
                  <td style={{padding:"7px 12px"}}>
                    <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                      {r.tags.map(tag=>(
                        <span key={tag} style={{fontSize:8.5,padding:"1px 5px",borderRadius:3,background:`${tagColor[tag]||"var(--acc)"}18`,color:tagColor[tag]||"var(--acc)",border:`1px solid ${tagColor[tag]||"var(--acc)"}40`,fontFamily:"var(--mono)",fontWeight:600}}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{padding:"7px 12px"}}>
                    <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                      {r.isFNO&&<span style={{background:"var(--longd)",color:"var(--long)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>FNO</span>}
                      {r.isN500&&<span style={{background:"var(--adim)",color:"var(--acc)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>N500</span>}
                      {r.isVirgin&&<span style={{background:"var(--retd)",color:"var(--ret)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>{r.virginType.toLowerCase().includes("breakout")?"↑VIR":"↓VIR"}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TOP MOVERS ───────────────────────────────────────────────────────────────
function TopMoversPanel({ db }) {
  const [mode, setMode] = useState("long");
  const lists = useMemo(()=>({
    long:   [...db.strong].filter(r=>r.Conviction_Type.includes("LONG")).sort((a,b)=>+b.Long_Signals-+a.Long_Signals).slice(0,8),
    short:  [...db.strong].filter(r=>r.Conviction_Type.includes("SHORT")).sort((a,b)=>+b.Short_Signals-+a.Short_Signals).slice(0,8),
    nr:     [...db.mtnr].sort((a,b)=>+b.NR_Signal_Count-+a.NR_Signal_Count).slice(0,8),
    virgin: [...db.virgin].sort((a,b)=>+b.Virgin_Signal_Count-+a.Virgin_Signal_Count).slice(0,8),
  }),[db]);
  const modeConfig={
    long:  {label:"Strong Long", color:"var(--long)", icon:"↑"},
    short: {label:"Strong Short",color:"var(--short)",icon:"↓"},
    nr:    {label:"Multi-TF NR", color:"var(--a2)",   icon:"◆"},
    virgin:{label:"Virgin",      color:"var(--ret)",   icon:"🔓"},
  };
  const cfg=modeConfig[mode], data=lists[mode];
  const getVal=r=>{
    if(mode==="long")   return {v:r.Long_Signals, l:"long sigs"};
    if(mode==="short")  return {v:r.Short_Signals,l:"short sigs"};
    if(mode==="nr")     return {v:r.NR_Signal_Count,l:`${r.Timeframe_Count} TF`};
    if(mode==="virgin") return {v:r.Virgin_Signal_Count,l:"signals"};
    return {v:"-",l:""};
  };
  const maxV=Math.max(...data.map(r=>+getVal(r).v),1);
  const allSyms=data.map(r=>r.Symbol);

  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
        {Object.entries(modeConfig).map(([k,c])=>(
          <button key={k} onClick={()=>setMode(k)} style={{padding:"4px 10px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${mode===k?c.color:"var(--b2)"}`,background:mode===k?`${c.color}18`:"var(--s2)",color:mode===k?c.color:"var(--t2)"}}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      <div style={{marginBottom:8}}>
        <TVCopyBtn symbols={allSyms} label={`⎘ Copy ${cfg.label} TV`}/>
      </div>
      <div style={{flex:1}}>
        {data.map((r,i)=>{
          const {v,l}=getVal(r), bar=(+v/maxV*100).toFixed(0);
          return (
            <div key={r.Symbol} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,padding:"5px 0",borderBottom:"1px solid var(--b1)"}}>
              <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",width:16,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,flexWrap:"wrap"}}>
                  <SymCell sym={r.Symbol}/>
                  {r.Is_FNO==="Yes"&&<span style={{background:"var(--longd)",color:"var(--long)",fontSize:8,padding:"1px 4px",borderRadius:3}}>FNO</span>}
                  <SectorChip sector={r.Sector} industry={r.Industry} dim/>
                </div>
                <div style={{height:3,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${bar}%`,background:cfg.color,borderRadius:2,opacity:.8}}/>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:cfg.color}}>{v}</div>
                <div style={{fontSize:9,color:"var(--t3)"}}>{l}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SIGNAL DENSITY ───────────────────────────────────────────────────────────
function SignalDensityHistogram({ db }) {
  const data = useMemo(()=>{
    const sigMap={};
    db.flat.forEach(r=>{ if(!sigMap[r.Symbol])sigMap[r.Symbol]={sym:r.Symbol,count:0}; sigMap[r.Symbol].count++; });
    const buckets={1:0,2:0,'3-5':0,'6-10':0,'11-20':0,'21+':0};
    Object.values(sigMap).forEach(({count})=>{
      if(count===1)buckets[1]++;
      else if(count===2)buckets[2]++;
      else if(count<=5)buckets['3-5']++;
      else if(count<=10)buckets['6-10']++;
      else if(count<=20)buckets['11-20']++;
      else buckets['21+']++;
    });
    return buckets;
  },[db.flat]);
  const maxV=Math.max(...Object.values(data),1);
  const labels=Object.keys(data);
  const colors=["var(--t3)","var(--t2)","var(--acc)","var(--mixed)","var(--a2)","var(--ret)"];
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:12}}>📊 Signal Density Distribution</div>
      <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:6,height:80,marginBottom:8}}>
        {labels.map((l,i)=>{
          const v=data[l], h=Math.max(6,(v/maxV)*72);
          return (
            <div key={l} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{fontSize:9,color:colors[i],fontFamily:"var(--mono)",fontWeight:700}}>{v}</div>
              <div style={{width:"100%",height:h,background:colors[i],borderRadius:"3px 3px 0 0",opacity:.85,minHeight:4}}/>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:6}}>
        {labels.map((l,i)=><div key={l} style={{flex:1,textAlign:"center",fontSize:8.5,color:"var(--t3)"}}>{l}</div>)}
      </div>
      <div style={{marginTop:8,borderTop:"1px solid var(--b1)",paddingTop:8,fontSize:10.5,color:"var(--t2)"}}>
        High-density (6+ signals): <strong style={{color:"var(--acc)"}}>{(data['6-10']+data['11-20']+data['21+']).toLocaleString()}</strong> stocks
      </div>
    </div>
  );
}

// ─── FNO STRATEGY ─────────────────────────────────────────────────────────────
function FNOStrategyPanel({ db }) {
  const data = useMemo(()=>{
    const fno=db.flat.filter(r=>r.Is_FNO==="Yes"), biasBuckets={};
    fno.forEach(r=>{ const b=r.Trading_Bias; if(!biasBuckets[b])biasBuckets[b]={bias:b,syms:new Set(),zone:0,nr:0,sectorCount:{}}; biasBuckets[b].syms.add(r.Symbol); if(r.Signal_Category==="ZONE")biasBuckets[b].zone++; else biasBuckets[b].nr++; if(r.Sector) biasBuckets[b].sectorCount[r.Sector]=(biasBuckets[b].sectorCount[r.Sector]||0)+1; });
    return Object.values(biasBuckets).sort((a,b)=>b.syms.size-a.syms.size);
  },[db.flat]);
  const strategies={
    LONG:{label:"Bull Spread / CE Buy",desc:"Buy ATM/OTM CE or Bull Call Spread",color:"var(--long)"},
    SHORT:{label:"Bear Spread / PE Buy",desc:"Buy ATM/OTM PE or Bear Put Spread",color:"var(--short)"},
    MIXED:{label:"Iron Condor / Strangle",desc:"Sell both sides — range-bound play",color:"var(--mixed)"},
    RETRACEMENT:{label:"Covered Call / Ratio Spread",desc:"Sell OTM CE against long position",color:"var(--ret)"},
  };
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:12}}>🎰 FNO Strategy Mapper</div>
      {data.map(d=>{
        const strat=strategies[d.bias]||strategies.MIXED, bc=BIAS_COLOR[d.bias]||BIAS_COLOR.NEUTRAL;
        const topSector=Object.entries(d.sectorCount).sort((a,b)=>b[1]-a[1])[0];
        return (
          <div key={d.bias} style={{background:"var(--s2)",border:`1px solid ${bc.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              {biasBadge(d.bias,true)}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <TVCopyBtn symbols={[...d.syms]} label="⎘ TV"/>
                <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:700,color:strat.color}}>{d.syms.size}<span style={{fontSize:10,color:"var(--t3)",fontWeight:400,marginLeft:4}}>stocks</span></div>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:"var(--t1)",marginBottom:2}}>{strat.label}</div>
            <div style={{fontSize:10.5,color:"var(--t2)"}}>{strat.desc}</div>
            <div style={{display:"flex",gap:8,marginTop:5,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:9.5,color:"var(--acc)",fontFamily:"var(--mono)"}}>Zone: {d.zone}</span>
              <span style={{fontSize:9.5,color:"var(--a2)",fontFamily:"var(--mono)"}}>NR: {d.nr}</span>
              {topSector&&<SectorChip sector={topSector[0]} dim/>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SECTOR LEADERBOARD (NEW) ─────────────────────────────────────────────────
function SectorLeaderboardPanel({ db }) {
  const sectors = useMemo(()=>[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score).slice(0,10),[db.sectorAnalysis]);
  const maxScore = Math.max(...sectors.map(s=>s.Strength_Score),1);
  const allSyms = useMemo(()=>{
    if(!sectors.length) return [];
    const topSec=sectors[0].Sector;
    return db.master.filter(m=>m.Sector===topSec).map(m=>m.Symbol);
  },[sectors,db.master]);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>🏭 Sector Strength Leaderboard</div>
        {sectors[0]&&<TVCopyBtn symbols={allSyms} label={`⎘ ${sectors[0].Sector} TV`}/>}
      </div>
      {sectors.map((s,i)=>{
        const c=sectorColor(s.Sector), pct=s.Strength_Score/maxScore*100;
        return (
          <div key={s.Sector} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",width:14,flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:6}}>
                <span style={{fontSize:11,fontWeight:600,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.Sector}</span>
                {strengthBadge(s.Strength_Label,true)}
              </div>
              <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:3}}/>
              </div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:c,width:38,textAlign:"right",flexShrink:0}}>{s.Strength_Score.toFixed(1)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── INDUSTRY MOMENTUM (NEW) ──────────────────────────────────────────────────
function IndustryMomentumPanel({ db }) {
  const [mode,setMode]=useState("top");
  const inds = useMemo(()=>[...db.industryAnalysis].sort((a,b)=>b.Net_Bias_Score-a.Net_Bias_Score).slice(0,8),[db.industryAnalysis]);
  const bottomInds = useMemo(()=>[...db.industryAnalysis].sort((a,b)=>a.Net_Bias_Score-b.Net_Bias_Score).slice(0,8),[db.industryAnalysis]);
  const data = mode==="top"?inds:bottomInds;
  const maxAbs = Math.max(...data.map(d=>Math.abs(d.Net_Bias_Score)),1);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>📐 Industry Bias Momentum</div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setMode("top")} style={{padding:"3px 8px",borderRadius:5,fontSize:10,cursor:"pointer",border:`1px solid ${mode==="top"?"var(--long)":"var(--b2)"}`,background:mode==="top"?"var(--longd)":"var(--s2)",color:mode==="top"?"var(--long)":"var(--t2)"}}>Bullish</button>
          <button onClick={()=>setMode("bottom")} style={{padding:"3px 8px",borderRadius:5,fontSize:10,cursor:"pointer",border:`1px solid ${mode==="bottom"?"var(--short)":"var(--b2)"}`,background:mode==="bottom"?"var(--shortd)":"var(--s2)",color:mode==="bottom"?"var(--short)":"var(--t2)"}}>Bearish</button>
        </div>
      </div>
      {data.map(d=>{
        const w=Math.abs(d.Net_Bias_Score)/maxAbs*100, pos=d.Net_Bias_Score>=0;
        return (
          <div key={d.Sector+d.Industry} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:6}}>
              <span style={{fontSize:10.5,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}} title={d.Industry}>{d.Industry}</span>
              <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:pos?"var(--long)":"var(--short)",flexShrink:0}}>{pos?"+":""}{d.Net_Bias_Score}</span>
            </div>
            <div style={{height:4,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${w}%`,background:pos?"var(--long)":"var(--short)",borderRadius:2,opacity:.85}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
function genInsights(biasCnt, total, db) {
  const sorted=Object.entries(biasCnt).sort((a,b)=>b[1]-a[1]), ins=[];
  if(sorted.length){
    const [top,cnt]=sorted[0], pct=((cnt/total)*100).toFixed(1);
    ins.push({ico:"📡",h:`${top} Dominates (${pct}%)`,t:top==="SHORT"?`Bearish phase — ${pct}% SHORT. Favour breakdown plays, PE buys, and hedged positions.`:top==="LONG"?`Bullish breadth — ${pct}% LONG. Momentum favouring breakouts and CE buying.`:`Mixed market at ${pct}% — selective approach.`});
  }
  const fno=new Set(db.flat.filter(r=>r.Is_FNO==="Yes").map(r=>r.Symbol));
  ins.push({ico:"🎯",h:`${fno.size} FNO Stocks Active`,t:`${fno.size} derivative-eligible stocks. Prioritise for options strategies — spreads reduce premium risk while capturing direction.`});
  if(db.strong.length){
    const t=[...db.strong].sort((a,b)=>+b.Conviction_Score-+a.Conviction_Score)[0];
    ins.push({ico:"💎",h:`#1 Conviction: ${t.Symbol} (${t.Conviction_Score})`,t:`${t.Long_Signals} long zone signals, ${t.NR_Signal_Count} NR setups. ${t.Sector&&t.Sector!=="Unknown"?`Sector: ${t.Sector}. `:""}${t.Is_FNO==="Yes"?"FNO eligible — options strategy applicable.":"Cash segment."}`});
  }
  if(db.mtnr.length){
    const by4=db.mtnr.filter(r=>+r.Timeframe_Count>=4).length, by3=db.mtnr.filter(r=>+r.Timeframe_Count===3).length;
    ins.push({ico:"📐",h:`${by4} Four-TF + ${by3} Three-TF NR Alignments`,t:`Extreme coiling detected. ${by4} stocks compressed across 4 timeframes — historically precede explosive moves. Trade on NR breakout.`});
  }
  if(db.virgin.length){
    const vbo=db.virgin.filter(r=>r.Virgin_Type.toLowerCase().includes("breakout")).length;
    const vbd=db.virgin.filter(r=>r.Virgin_Type.toLowerCase().includes("breakdown")).length;
    ins.push({ico:"🔓",h:`${vbo} Virgin Breakouts · ${vbd} Breakdowns`,t:`Virgin zones = no prior price memory. Zero overhead resistance for BO, zero support for BD. Highest probability momentum setups.`});
  }
  const fnoLong=db.strong.filter(r=>r.Is_FNO==="Yes"&&r.Conviction_Type.includes("LONG")).length;
  const fnoShort=db.strong.filter(r=>r.Is_FNO==="Yes"&&r.Conviction_Type.includes("SHORT")).length;
  ins.push({ico:"⚖️",h:`FNO Split: ${fnoLong}L vs ${fnoShort}S`,t:`${fnoLong>fnoShort?"Long side dominates — favour CE/Bull spreads.":fnoShort>fnoLong?"Short side dominates — favour PE/Bear spreads.":"Balanced — consider Iron Condors."}`});
  const sig4=db.mtnr.filter(r=>+r.Timeframe_Count>=4&&r.Is_FNO==="Yes").map(r=>r.Symbol);
  if(sig4.length) ins.push({ico:"🚨",h:`${sig4.length} FNO × 4-TF NR Stocks`,t:`${sig4.slice(0,3).join(", ")}${sig4.length>3?` +${sig4.length-3} more`:""} — coiling on all major timeframes AND FNO eligible. Buy straddles or trade directional NR breakout.`});
  if(db.sectorAnalysis && db.sectorAnalysis.length){
    const bySc=[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score);
    const topSec=bySc[0], botSec=bySc[bySc.length-1];
    ins.push({ico:"🏭",h:`${topSec.Sector} Strongest Sector (${topSec.Strength_Score.toFixed(1)})`,t:`${topSec.Advancing}/${topSec.Total_Stocks} advancing, net bias ${topSec.Net_Bias_Score>0?'+':''}${topSec.Net_Bias_Score}, ${topSec.Strength_Label.toLowerCase()} momentum. Prioritise ${topSec.Sector} names for long setups and FNO plays.`});
    ins.push({ico:"🧊",h:`${botSec.Sector} Weakest Sector (${botSec.Strength_Score.toFixed(1)})`,t:`${botSec.Declining}/${botSec.Total_Stocks} declining, net bias ${botSec.Net_Bias_Score>0?'+':''}${botSec.Net_Bias_Score}. ${botSec.Strength_Label} — favour short/hedge setups or avoid fresh longs here.`});
  }
  if(db.industryAnalysis && db.industryAnalysis.length){
    const topInd=[...db.industryAnalysis].sort((a,b)=>b.Net_Bias_Score-a.Net_Bias_Score)[0];
    if(topInd) ins.push({ico:"🔬",h:`${topInd.Industry} Leads Industries`,t:`Net bias +${topInd.Net_Bias_Score} within ${topInd.Sector}. ${topInd.Stocks_With_Zone_Signal} of ${topInd.Total_Stocks} stocks carrying active zone signals — narrow, high-conviction basket.`});
  }
  return ins;
}

// ─── CONTROL TOWER ────────────────────────────────────────────────────────────
function ControlTower({ db, horizons, embedded=false }) {
  const syms=new Set(db.flat.map(r=>r.Symbol));
  const fno=new Set(db.flat.filter(r=>r.Is_FNO==="Yes").map(r=>r.Symbol));
  const n500=new Set(db.flat.filter(r=>r.Is_Nifty_500==="Yes").map(r=>r.Symbol));
  const n100=new Set(db.flat.filter(r=>r.Is_Nifty_LargeCap_100==="Yes").map(r=>r.Symbol));
  const mid=new Set(db.flat.filter(r=>r.Is_Midcap_150==="Yes").map(r=>r.Symbol));

  const biasSymMap={};
  db.flat.forEach(r=>{biasSymMap[r.Symbol]=r.Trading_Bias;});
  const biasCnt={};
  Object.values(biasSymMap).forEach(b=>{biasCnt[b]=(biasCnt[b]||0)+1;});
  const total=syms.size||1;

  let swSym=new Set(), invSym=new Set();
  db.flat.forEach(r=>{
    const hs=getHorizonList(r.Signal_Name, horizons);
    if(hs.includes("swing"))      swSym.add(r.Symbol);
    if(hs.includes("investment")) invSym.add(r.Symbol);
  });

  const longPct=((biasCnt.LONG||0)/total*100);
  const shortPct=((biasCnt.SHORT||0)/total*100);
  const dominantBias=Object.entries(biasCnt).sort((a,b)=>b[1]-a[1])[0];
  const sortedSectors=[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score);
  const topSector=sortedSectors[0];

  const KPI_DATA=[
    {label:"Total Universe", value:syms.size.toLocaleString(), color:"var(--acc)",   sub:"tracked stocks"},
    {label:"Signal Rows",    value:db.flat.length.toLocaleString(), color:"var(--a2)",sub:"signal instances"},
    {label:"Opportunities",  value:db.top.length.toLocaleString(), color:"var(--long)",sub:"high-signal stocks"},
    {label:"FNO Eligible",   value:fno.size,          color:"var(--mixed)",sub:"derivative-ready"},
    {label:"Nifty 500",      value:n500.size,         color:"var(--ret)",  sub:"index constituents"},
    {label:"LargeCap 100",   value:n100.size,         color:"var(--acc)",  sub:"large cap signals"},
    {label:"Midcap 150",     value:mid.size,          color:"var(--t1)",   sub:"midcap signals"},
    {label:"Conviction",     value:db.strong.length,  color:"var(--mixed)",sub:"strong conviction"},
    {label:"Multi-TF NR",    value:db.mtnr.length,    color:"var(--a2)",   sub:"coiling stocks"},
    {label:"Virgin Events",  value:db.virgin.length,  color:"var(--ret)",  sub:"uncharted territory"},
    {label:"Swing Eligible", value:swSym.size,        color:"var(--acc)",  sub:"swing timeframe"},
    {label:"Investment",     value:invSym.size,       color:"var(--ret)",  sub:"long-term horizon"},
    {label:"Sectors",        value:db.sectorAnalysis.length, color:sectorColor(topSector?.Sector||""), sub:"tracked sectors"},
    {label:"Top Sector",     value:topSector?topSector.Sector:"—", color:sectorColor(topSector?.Sector||""), sub:topSector?`strength ${topSector.Strength_Score.toFixed(1)}`:""},
  ];

  const CARD={background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"};

  return (
    <div style={{padding:"18px 22px"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:embedded?18:22,fontWeight:700,color:"var(--t1)"}}>{embedded?"📡 Market Intelligence":"🏛 Control Tower"}</div>
          <div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>Where the market is — alpha rankings, sector &amp; industry strength, movers and F&amp;O strategy</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {dominantBias&&(
            <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 14px"}}>
              <div className="blink" style={{width:7,height:7,borderRadius:999,background:dominantBias[0]==="LONG"?"var(--long)":dominantBias[0]==="SHORT"?"var(--short)":"var(--mixed)"}}/>
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)"}}>MARKET</span>
              {biasBadge(dominantBias[0])}
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t1)",fontWeight:700}}>{((dominantBias[1]/total)*100).toFixed(1)}%</span>
            </div>
          )}
          {topSector&&(
            <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 14px"}}>
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)"}}>SECTOR</span>
              <SectorChip sector={topSector.Sector}/>
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:sectorColor(topSector.Sector),fontWeight:700}}>{topSector.Strength_Score.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:16}}>
        {KPI_DATA.map(k=>(
          <div key={k.label} style={{...CARD,padding:"10px 12px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:k.color,opacity:.5}}/>
            <div style={{fontFamily:"var(--mono)",fontSize:typeof k.value==="string"&&k.value.length>6?14:20,fontWeight:700,color:k.color,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.value}</div>
            <div style={{fontSize:10.5,color:"var(--t1)",marginTop:3,fontWeight:600}}>{k.label}</div>
            <div style={{fontSize:9,color:"var(--t3)",marginTop:1}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Alpha table */}
      <Anchor id="ct-alpha"/>
      <div style={{marginBottom:12}}>
        <AlphaIdeasPanel db={db}/>
      </div>

      {/* Sector + Industry (list ↔ bubble) — equal height */}
      <Anchor id="ct-sector"/>
      <EqRow height={440} cols="minmax(0,1fr) minmax(0,1fr)">
        <SectorLeaderboardPanelV2 db={db}/>
        <IndustryMomentumPanelV2 db={db}/>
      </EqRow>

      {/* Compact widgets — all the same height */}
      <Anchor id="ct-compact"/>
      <EqRow height={390} min={260}>
        <TopMoversPanel db={db}/>
        <FNOStrategyPanel db={db}/>
        <StrategyFlowPanel db={db}/>
        <BiasDistributionPanel db={db}/>
      </EqRow>
    </div>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ db, horizons }) {
  const syms=new Set(db.flat.map(r=>r.Symbol));
  const biasCount={};
  db.flat.forEach(r=>{ if(!biasCount[r.Trading_Bias])biasCount[r.Trading_Bias]={}; biasCount[r.Trading_Bias][r.Symbol]=1; });
  const biasCnt={};
  Object.entries(biasCount).forEach(([b,ss])=>biasCnt[b]=Object.keys(ss).length);
  const maxB=Math.max(...Object.values(biasCnt),1);
  const topOpps=[...db.top].sort((a,b)=>+b.Total_Signals-+a.Total_Signals).slice(0,5);
  const sigC={};
  db.summary.forEach(r=>sigC[r.Signal_Name]={cnt:+r.Stock_Count,type:r.Signal_Type,cat:r.Signal_Category});
  const topSigs=Object.entries(sigC).sort((a,b)=>b[1].cnt-a[1].cnt).slice(0,10);
  const sortedSectors=[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score);
  const CARD={background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"18px 20px"};

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:18}}>
        <div style={CARD}>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:14}}>Market Pulse</div>
          <div style={{display:"flex",gap:24,flexWrap:"wrap",marginBottom:18}}>
            {[{v:syms.size,l:"Stocks",c:"var(--acc)"},{v:db.flat.length,l:"Signal Rows",c:"var(--a2)"},{v:db.top.length,l:"Opportunities",c:"var(--long)"}].map(({v,l,c})=>(
              <div key={l}><div style={{fontFamily:"var(--mono)",fontSize:30,fontWeight:700,color:c,lineHeight:1}}>{v.toLocaleString()}</div><div style={{fontSize:11,color:"var(--t2)",marginTop:3}}>{l}</div></div>
            ))}
          </div>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600,marginBottom:10}}>Trading Bias Split</div>
          {Object.entries(biasCnt).sort((a,b)=>b[1]-a[1]).map(([bias,cnt])=>{
            const bc=BIAS_COLOR[bias]||BIAS_COLOR.NEUTRAL;
            return (
              <div key={bias} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:90,flexShrink:0}}>{biasBadge(bias,true)}</div>
                <div style={{flex:1,height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",background:bc.text,width:(cnt/maxB*100)+"%",borderRadius:3,opacity:.8}}/>
                </div>
                <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--t2)",width:90,textAlign:"right"}}>{cnt} ({((cnt/syms.size)*100).toFixed(1)}%)</div>
              </div>
            );
          })}
        </div>
        <div style={CARD}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>🔥 Top 5 Opportunities</div>
            <TVCopyBtn symbols={topOpps.map(r=>r.Symbol)} label="⎘ Copy TV"/>
          </div>
          {topOpps.map(r=>(
            <div key={r.Symbol} style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:7,padding:"9px 13px",marginBottom:7,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div className="sym-cell" style={{flex:1,minWidth:90}}><span style={{fontFamily:"var(--mono)",fontSize:12.5,fontWeight:700,color:"var(--acc)"}}>{r.Symbol}</span><CopyBtn text={r.Symbol}/></div>
              <SectorChip sector={r.Sector} industry={r.Industry}/>
              {biasBadge(r.Trading_Bias,true)}
              <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:700,color:"var(--t1)"}}>{r.Total_Signals}</div>
              <div style={{fontSize:9,color:"var(--t3)"}}>sigs</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{...CARD,marginBottom:16}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:12}}>🤖 AI Insights</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
          {genInsights(biasCnt,syms.size,db).map((ins,i)=>(
            <div key={i} style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:7,padding:"11px 13px",display:"flex",gap:10}}>
              <div style={{fontSize:19,flexShrink:0}}>{ins.ico}</div>
              <div><div style={{fontSize:11.5,fontWeight:600,color:"var(--t1)",marginBottom:2}}>{ins.h}</div><div style={{fontSize:11,color:"var(--t2)",lineHeight:1.55}}>{ins.t}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <div style={CARD}>
          <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)",marginBottom:12}}>📈 Top 10 Signals by Stock Count</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>{["Signal","Type","Stocks"].map(h=><th key={h} style={{borderBottom:"1px solid var(--b1)",padding:"6px 10px",fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{topSigs.map(([name,info])=>(
              <tr key={name} style={{borderBottom:"1px solid var(--b1)"}}>
                <td style={{padding:"6px 10px",fontSize:10.5,color:"var(--t2)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name.replace(/_/g," ")}</td>
                <td style={{padding:"6px 10px"}}>{biasBadge(info.type,true)}</td>
                <td style={{padding:"6px 10px",fontFamily:"var(--mono)",fontWeight:700,color:"var(--acc)"}}>{info.cnt}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={CARD}>
          <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)",marginBottom:12}}>⏱ Horizon Summary</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>{["Horizon","Signals","Description"].map(h=><th key={h} style={{borderBottom:"1px solid var(--b1)",padding:"6px 10px",fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {[
                {h:"Intraday",cnt:horizons.intraday.size,desc:"Daily NR patterns, D_ signals",c:"var(--mixed)"},
                {h:"Swing",cnt:horizons.swing.size,desc:"Daily+Weekly zone/NR signals",c:"var(--acc)"},
                {h:"Investment",cnt:horizons.invest.size,desc:"Monthly/Quarterly/Yearly",c:"var(--ret)"},
              ].map(r=>(
                <tr key={r.h} style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"8px 10px"}}><span style={{padding:"3px 9px",borderRadius:5,fontSize:11,fontWeight:500,border:`1px solid ${r.c}`,color:r.c,background:`${r.c}18`}}>{r.h}</span></td>
                  <td style={{padding:"8px 10px",fontFamily:"var(--mono)",color:"var(--acc)",fontWeight:700}}>{r.cnt}</td>
                  <td style={{padding:"8px 10px",fontSize:10.5,color:"var(--t2)"}}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector Performance */}
      <div style={CARD}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)"}}>🏭 Sector Performance ({sortedSectors.length})</div>
          <div style={{fontSize:10.5,color:"var(--t3)"}}>sorted by strength score</div>
        </div>
        <div style={{maxHeight:420,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>{["Sector","Stocks","Adv/Dec","Bull","Bear","Net Bias","Signals","Density","Strength"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s1)",borderBottom:"1px solid var(--b1)",padding:"6px 10px",fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {sortedSectors.map(s=>(
                <tr key={s.Sector} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"7px 10px",color:sectorColor(s.Sector),fontWeight:700}}>{s.Sector}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{s.Total_Stocks}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{s.Advancing}/{s.Declining}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--long)"}}>{s.Bullish_Score}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--short)"}}>{s.Bearish_Score}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",fontWeight:700,color:s.Net_Bias_Score>0?"var(--long)":s.Net_Bias_Score<0?"var(--short)":"var(--t2)"}}>{s.Net_Bias_Score>0?"+":""}{s.Net_Bias_Score}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--t1)"}}>{s.Total_Signal_Count}</td>
                  <td style={{padding:"7px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{s.Signal_Density}</td>
                  <td style={{padding:"7px 10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {strengthBadge(s.Strength_Label,true)}
                      <span style={{fontFamily:"var(--mono)",fontWeight:700,color:sectorColor(s.Sector)}}>{s.Strength_Score.toFixed(1)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── FLAT SLICER ──────────────────────────────────────────────────────────────
function FlatSlicer({ db }) {
  const [slicers, setSlicers]           = useState(DEFAULT_SLICER_COLS);
  const [slicerOpen, setSlicerOpen]     = useState({ Sector:true, Signal_Category:true, Trading_Bias:true });
  const [slicerSearch, setSlicerSearch] = useState({});
  const [filters, setFilters]           = useState({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [sort, setSort]                 = useState({ col:null, dir:1 });
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(50);
  const [showAddMenu, setShowAddMenu]   = useState(false);
  const [colFilters, setColFilters]     = useState({});
  const [openColFilter, setOpenColFilter] = useState(null);

  const getFilteredRows = useCallback((excludeCol=null)=>{
    return db.flat.filter(row=>{
      for(const [col,vals] of Object.entries(filters)){
        if(col===excludeCol) continue;
        if(vals.size>0&&!vals.has(row[col])) return false;
      }
      for(const [col,vals] of Object.entries(colFilters)){
        if(col===excludeCol) continue;
        if(vals.size>0&&!vals.has(row[col])) return false;
      }
      if(globalSearch){ const q=globalSearch.toLowerCase(); if(!Object.values(row).some(v=>String(v).toLowerCase().includes(q))) return false; }
      return true;
    });
  },[db.flat,filters,colFilters,globalSearch]);

  const filtered = useMemo(()=>{
    let data=getFilteredRows();
    if(sort.col){
      data=[...data].sort((a,b)=>{
        const av=a[sort.col]||"", bv=b[sort.col]||"";
        const an=+av, bn=+bv;
        if(!isNaN(an)&&!isNaN(bn)) return (an-bn)*sort.dir;
        return String(av).localeCompare(String(bv))*sort.dir;
      });
    }
    return data;
  },[getFilteredRows,sort]);

  const totalPg=Math.max(1,Math.ceil(filtered.length/pageSize));
  const curPage=Math.min(page,totalPg);
  const pageData=filtered.slice((curPage-1)*pageSize,curPage*pageSize);

  const toggleFilter=(col,val)=>{ setFilters(prev=>{ const s=new Set(prev[col]||[]); s.has(val)?s.delete(val):s.add(val); if(!s.size){const n={...prev};delete n[col];return n;} return {...prev,[col]:s}; }); setPage(1); };
  const toggleColFilter=(col,val)=>{ setColFilters(prev=>{ const s=new Set(prev[col]||[]); s.has(val)?s.delete(val):s.add(val); if(!s.size){const n={...prev};delete n[col];return n;} return {...prev,[col]:s}; }); setPage(1); };
  const addSlicer=col=>{ if(!slicers.includes(col)){setSlicers(p=>[...p,col]);setSlicerOpen(p=>({...p,[col]:true}));} setShowAddMenu(false); };
  const removeSlicer=col=>{ setSlicers(p=>p.filter(c=>c!==col)); setFilters(p=>{const n={...p};delete n[col];return n;}); };
  const clearAll=()=>{ setFilters({}); setColFilters({}); setGlobalSearch(""); setPage(1); };

  const allFilterChips=[
    ...Object.entries(filters).flatMap(([col,vals])=>[...vals].map(v=>({col,v,type:"slicer"}))),
    ...Object.entries(colFilters).flatMap(([col,vals])=>[...vals].map(v=>({col,v,type:"col"}))),
  ];

  const filteredSyms=[...new Set(filtered.map(r=>r.Symbol))];

  const SIDE={width:244,flexShrink:0,background:"var(--s1)",borderRight:"1px solid var(--b1)",display:"flex",flexDirection:"column",position:"sticky",top:108,height:"calc(100vh - 108px)",overflow:"hidden"};

  return (
    <div style={{display:"flex",minHeight:"calc(100vh - 108px)"}}>
      <div style={SIDE}>
        <div style={{padding:"8px 12px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{fontSize:10.5,fontWeight:600,color:"var(--t2)",textTransform:"uppercase",letterSpacing:"1px"}}>Slicers</span>
          <button onClick={clearAll} style={{background:"var(--s2)",border:"1px solid var(--b2)",color:"var(--t2)",padding:"2px 8px",borderRadius:5,fontSize:10.5}}>Clear All</button>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:6,scrollbarWidth:"thin"}}>
          {slicers.map(col=>{
            const isOpen=slicerOpen[col], active=filters[col], hasF=active&&active.size>0;
            const baseRows=getFilteredRows(col), valCounts={};
            baseRows.forEach(r=>{const v=r[col]||"";valCounts[v]=(valCounts[v]||0)+1;});
            const sq=(slicerSearch[col]||"").toLowerCase();
            const vals=Object.entries(valCounts).sort((a,b)=>b[1]-a[1]).filter(([v])=>!sq||v.toLowerCase().includes(sq));
            return (
              <div key={col} style={{background:"var(--s2)",border:`1px solid ${hasF?"rgba(0,229,255,.35)":"var(--b1)"}`,borderRadius:7,marginBottom:5,overflow:"hidden"}}>
                <div onClick={()=>setSlicerOpen(p=>({...p,[col]:!p[col]}))} style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:5,cursor:"pointer",userSelect:"none"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"var(--t1)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{col.replace(/_/g," ")}</div>
                  {hasF&&<span style={{background:"var(--acc)",color:"#000",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:999,fontFamily:"var(--mono)"}}>{active.size}</span>}
                  <span style={{color:"var(--t3)",fontSize:9,transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
                  <button onClick={e=>{e.stopPropagation();removeSlicer(col);}} style={{color:"var(--t3)",fontSize:12,padding:"0 2px",lineHeight:1}}>✕</button>
                </div>
                {isOpen&&(
                  <div style={{borderTop:"1px solid var(--b1)"}}>
                    <div style={{padding:"4px 7px",borderBottom:"1px solid var(--b1)"}}>
                      <input style={{width:"100%",background:"var(--s1)",border:"1px solid var(--b2)",borderRadius:5,color:"var(--t1)",fontSize:11,padding:"4px 7px"}} placeholder="Search..." value={slicerSearch[col]||""} onChange={e=>setSlicerSearch(p=>({...p,[col]:e.target.value}))} onClick={e=>e.stopPropagation()}/>
                    </div>
                    <div style={{maxHeight:160,overflowY:"auto",padding:3,scrollbarWidth:"thin"}}>
                      {vals.map(([v,cnt])=>{
                        const sel=active&&active.has(v);
                        const swatch = col==="Sector" ? sectorColor(v) : null;
                        return (
                          <div key={v} onClick={()=>toggleFilter(col,v)} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 8px",borderRadius:5,cursor:"pointer",background:sel?"var(--adim)":"transparent",userSelect:"none"}}>
                            <div style={{width:13,height:13,border:`1.5px solid ${sel?"var(--acc)":"var(--b2)"}`,borderRadius:3,background:sel?"var(--acc)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#000"}}>{sel?"✓":""}</div>
                            {swatch&&<div style={{width:7,height:7,borderRadius:999,background:swatch,flexShrink:0}}/>}
                            <div style={{fontSize:11,color:swatch||"var(--t1)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v===''?"(empty)":v}</div>
                            <div style={{fontSize:9.5,color:"var(--t3)",fontFamily:"var(--mono)"}}>{cnt}</div>
                          </div>
                        );
                      })}
                    </div>
                    {hasF&&<div style={{padding:"3px 7px",borderTop:"1px solid var(--b1)"}}><button onClick={()=>setFilters(p=>{const n={...p};delete n[col];return n;})} style={{width:"100%",background:"transparent",border:"1px solid var(--b2)",color:"var(--t2)",padding:3,borderRadius:5,fontSize:10.5}}>Clear filter</button></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:6,borderTop:"1px solid var(--b1)",flexShrink:0,position:"relative"}}>
          <button onClick={()=>setShowAddMenu(p=>!p)} style={{width:"100%",background:"transparent",border:"1px dashed var(--b2)",color:"var(--t2)",padding:"6px",borderRadius:6,fontSize:11.5,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>＋ Add Slicer</button>
          {showAddMenu&&(
            <div style={{position:"absolute",bottom:"100%",left:0,right:0,background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:8,padding:4,maxHeight:200,overflowY:"auto",marginBottom:4,boxShadow:"0 8px 28px rgba(0,0,0,.5)",zIndex:300}}>
              {ALL_COLS.map(c=>(
                <div key={c} onClick={()=>addSlicer(c)} style={{padding:"6px 10px",fontSize:11.5,borderRadius:5,cursor:slicers.includes(c)?"default":"pointer",color:slicers.includes(c)?"var(--t3)":"var(--t1)"}}>
                  {slicers.includes(c)?"✓ ":""}{c.replace(/_/g," ")}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid var(--b1)",background:"var(--s1)",flexShrink:0,flexWrap:"wrap"}}>
          <div style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--t2)"}}>Showing <strong style={{color:"var(--acc)"}}>{filtered.length.toLocaleString()}</strong> of {db.flat.length.toLocaleString()} rows</div>
          <TVCopyBtn symbols={filteredSyms} label={`⎘ Copy ${filteredSyms.length} Symbols TV`}/>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",flex:1,minWidth:0}}>
            {allFilterChips.map(({col,v,type})=>(
              <span key={col+v+type} onClick={()=>type==="slicer"?toggleFilter(col,v):toggleColFilter(col,v)} style={{background:"var(--adim)",border:"1px solid var(--acc)",color:"var(--acc)",padding:"2px 7px",borderRadius:4,fontSize:9.5,cursor:"pointer",whiteSpace:"nowrap"}}>
                {col.replace(/_/g," ")}: {v} ✕
              </span>
            ))}
          </div>
          <div style={{position:"relative",marginLeft:"auto"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",fontSize:12}}>🔍</span>
            <input style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:7,color:"var(--t1)",fontSize:11.5,padding:"5px 12px 5px 30px",width:200}} placeholder="Search all columns..." value={globalSearch} onChange={e=>{setGlobalSearch(e.target.value);setPage(1);}}/>
          </div>
        </div>
        <div style={{overflow:"auto",flex:1,scrollbarWidth:"thin"}} onClick={()=>setOpenColFilter(null)}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr>
                {ALL_COLS.map(col=>{
                  const sorted=sort.col===col, fa=colFilters[col]&&colFilters[col].size>0;
                  return (
                    <th key={col} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",position:"sticky",top:0,zIndex:10,whiteSpace:"nowrap",userSelect:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4,padding:"8px 10px",cursor:"pointer",position:"relative"}} onClick={()=>setSort(p=>p.col===col?{col,dir:-p.dir}:{col,dir:1})}>
                        <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",color:sorted?"var(--acc)":"var(--t2)"}}>{col.replace(/_/g," ")}</span>
                        <span style={{fontSize:10,color:"var(--t3)"}}>{sorted?(sort.dir===1?"↑":"↓"):"⇅"}</span>
                        <button onClick={e=>{e.stopPropagation();setOpenColFilter(p=>p===col?null:col);}} style={{fontSize:10,color:fa?"var(--acc)":"var(--t3)",background:fa?"var(--adim)":"transparent",padding:"1px 3px",borderRadius:3,border:"none"}}>▾</button>
                        {openColFilter===col&&(
                          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:0,minWidth:180,maxWidth:260,background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:8,padding:6,zIndex:500,boxShadow:"0 8px 28px rgba(0,0,0,.6)"}}>
                            <ColFilterDropdown col={col} db={db} getFilteredRows={getFilteredRows} colFilters={colFilters} onToggle={toggleColFilter} onClear={()=>{setColFilters(p=>{const n={...p};delete n[col];return n;});setOpenColFilter(null);}}/>
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row,i)=>(
                <tr key={i} style={{borderBottom:"1px solid var(--b1)"}}>
                  {ALL_COLS.map(col=>{
                    const v=row[col]||"";
                    let cell=<span style={{color:"var(--t1)"}}>{v}</span>;
                    if(col==="Symbol") cell=<SymCell sym={v}/>;
                    else if(col==="Sector") cell = v ? <span style={{color:sectorColor(v),fontWeight:600,fontSize:11}}>{v}</span> : <span style={{color:"var(--t3)"}}>—</span>;
                    else if(col==="Industry") cell = <span style={{color:"var(--t2)",fontSize:10.5}} title={v}>{v||"—"}</span>;
                    else if(col==="Trading_Bias"||col==="Signal_Type") cell=biasBadge(v,true);
                    else if(col==="Signal_Category") cell=catBadge(v);
                    else if(v==="Yes") cell=yesnoBadge("Yes");
                    else if(v==="No") cell=yesnoBadge("No");
                    return <td key={col} title={v} style={{padding:"6px 10px",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cell}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:7,borderTop:"1px solid var(--b1)",background:"var(--s1)",flexShrink:0}}>
          {[["«",1],["‹",curPage-1]].map(([l,t])=><button key={l} disabled={curPage<=1} onClick={()=>setPage(Math.max(1,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:curPage<=1?.3:1,cursor:curPage<=1?"default":"pointer"}}>{l}</button>)}
          <span style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--mono)",margin:"0 4px"}}>Page {curPage} / {totalPg}</span>
          {[["›",curPage+1],["»",totalPg]].map(([l,t])=><button key={l} disabled={curPage>=totalPg} onClick={()=>setPage(Math.min(totalPg,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:curPage>=totalPg?.3:1,cursor:curPage>=totalPg?"default":"pointer"}}>{l}</button>)}
          <select value={pageSize} onChange={e=>{setPageSize(+e.target.value);setPage(1);}} style={{marginLeft:"auto",background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 7px",borderRadius:5,fontSize:11}}>
            {[25,50,100,200].map(n=><option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function ColFilterDropdown({ col, getFilteredRows, colFilters, onToggle, onClear }) {
  const [search,setSearch]=useState("");
  const baseData=getFilteredRows(col), valCounts={};
  baseData.forEach(r=>{const v=r[col]||"";valCounts[v]=(valCounts[v]||0)+1;});
  const active=colFilters[col]||new Set();
  const sq=search.toLowerCase();
  const vals=Object.entries(valCounts).sort((a,b)=>b[1]-a[1]).filter(([v])=>!sq||v.toLowerCase().includes(sq));
  return (
    <>
      <input style={{width:"100%",background:"var(--s1)",border:"1px solid var(--b2)",borderRadius:5,color:"var(--t1)",fontSize:11,padding:"4px 8px",marginBottom:4}} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <div style={{maxHeight:160,overflowY:"auto",scrollbarWidth:"thin"}}>
        {vals.map(([v,cnt])=>{
          const sel=active.has(v);
          const swatch = col==="Sector" ? sectorColor(v) : null;
          return (
            <div key={v} onClick={()=>onToggle(col,v)} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 7px",borderRadius:4,cursor:"pointer",background:sel?"var(--adim)":"transparent"}}>
              <div style={{width:13,height:13,border:`1.5px solid ${sel?"var(--acc)":"var(--b2)"}`,borderRadius:3,background:sel?"var(--acc)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#000"}}>{sel?"✓":""}</div>
              {swatch&&<div style={{width:7,height:7,borderRadius:999,background:swatch,flexShrink:0}}/>}
              <div style={{fontSize:11,color:swatch||"var(--t1)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v===''?"(empty)":v}</div>
              <div style={{fontSize:9.5,color:"var(--t3)",fontFamily:"var(--mono)"}}>{cnt}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:4,marginTop:4,paddingTop:4,borderTop:"1px solid var(--b1)"}}>
        <button onClick={onClear} style={{flex:1,background:"transparent",border:"1px solid var(--b2)",color:"var(--t2)",padding:3,borderRadius:4,fontSize:10,cursor:"pointer"}}>Clear</button>
      </div>
    </>
  );
}

// ─── OPPORTUNITIES ────────────────────────────────────────────────────────────
function Opportunities({ db }) {
  const [bias,setBias]   = useState("ALL");
  const [flags,setFlags] = useState({});
  const [search,setSearch] = useState("");
  const [expanded,setExpanded] = useState({});
  const [sectorFilter,setSectorFilter] = useState("ALL");

  const sectorOpts = useMemo(()=>["ALL",...new Set(db.top.map(r=>r.Sector).filter(Boolean))].sort((a,b)=>a==="ALL"?-1:b==="ALL"?1:a.localeCompare(b)),[db.top]);

  const data = useMemo(()=>{
    return db.top.filter(r=>{
      if(bias!=="ALL"&&r.Trading_Bias!==bias) return false;
      if(sectorFilter!=="ALL"&&r.Sector!==sectorFilter) return false;
      if(search&&!r.Symbol.toLowerCase().includes(search.toLowerCase())) return false;
      for(const f of Object.keys(flags)) if(r[f]!=="Yes") return false;
      return true;
    }).sort((a,b)=>+b.Total_Signals-+a.Total_Signals);
  },[db.top,bias,flags,search,sectorFilter]);

  const BIAS_LIST=["ALL","LONG","SHORT","MIXED","RETRACEMENT"];
  const filteredSyms=data.map(r=>r.Symbol);

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <span style={{fontSize:10,color:"var(--t3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".7px"}}>Bias:</span>
        {BIAS_LIST.map(b=>{
          const bc=BIAS_COLOR[b]||BIAS_COLOR.NEUTRAL, active=bias===b;
          return <div key={b} onClick={()=>setBias(b)} style={{padding:"5px 11px",borderRadius:6,fontSize:11.5,fontWeight:500,cursor:"pointer",border:`1px solid ${active?bc.border:"var(--b2)"}`,background:active?bc.bg:"var(--s2)",color:active?bc.text:"var(--t2)",transition:"all .15s"}}>{b}</div>;
        })}
        <span style={{fontSize:10,color:"var(--t3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".7px",marginLeft:8}}>Index:</span>
        {Object.entries(FLAG_LABELS).map(([f,l])=>{
          const active=!!flags[f];
          return <div key={f} onClick={()=>setFlags(p=>{const n={...p};active?delete n[f]:n[f]=true;return n;})} style={{padding:"5px 11px",borderRadius:6,fontSize:11.5,cursor:"pointer",border:`1px solid ${active?"var(--acc)":"var(--b2)"}`,background:active?"var(--adim)":"var(--s2)",color:active?"var(--acc)":"var(--t2)"}}>{l}</div>;
        })}
        <select value={sectorFilter} onChange={e=>setSectorFilter(e.target.value)} style={{marginLeft:8,background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:6,color:sectorFilter==="ALL"?"var(--t2)":sectorColor(sectorFilter),fontSize:11.5,padding:"5px 9px"}}>
          {sectorOpts.map(s=><option key={s} value={s}>{s==="ALL"?"All Sectors":s}</option>)}
        </select>
        <TVCopyBtn symbols={filteredSyms} label={`⎘ Copy ${filteredSyms.length} TV`}/>
        <div style={{position:"relative",marginLeft:"auto"}}>
          <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",fontSize:12}}>🔍</span>
          <input style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:7,color:"var(--t1)",fontSize:11.5,padding:"5px 12px 5px 30px",width:200}} placeholder="Search symbol..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>
      <div style={{fontSize:11.5,color:"var(--t2)",fontFamily:"var(--mono)",marginBottom:12}}>{data.length} opportunities — click card to expand</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:12}}>
        {data.slice(0,200).map(r=>{
          const exp=expanded[r.Symbol], bc=BIAS_COLOR[r.Trading_Bias]||BIAS_COLOR.NEUTRAL;
          const total=+r.Total_Signals||1, zone=+r.Zone_Signals||0, nr=+r.NR_Signals||0;
          const zlist=(r.Zone_Signal_List||"").split(",").map(s=>s.trim()).filter(Boolean);
          const nlist=(r.NR_Signal_List||"").split(",").map(s=>s.trim()).filter(Boolean);
          return (
            <div key={r.Symbol} onClick={()=>setExpanded(p=>({...p,[r.Symbol]:!p[r.Symbol]}))} style={{background:"var(--s1)",borderLeft:`3px solid ${bc.text}`,borderTop:"1px solid var(--b1)",borderRight:"1px solid var(--b1)",borderBottom:"1px solid var(--b1)",borderRadius:10,padding:14,cursor:"pointer",transition:"all .2s"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div className="sym-cell" onClick={e=>e.stopPropagation()}>
                      <span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:"var(--acc)"}}>{r.Symbol}</span>
                      <CopyBtn text={r.Symbol}/>
                    </div>
                    <TVCopyBtn symbols={[r.Symbol]} label="TV"/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {biasBadge(r.Trading_Bias,true)}
                    <SectorChip sector={r.Sector} industry={r.Industry}/>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                  <div style={{fontFamily:"var(--mono)",fontSize:22,fontWeight:700,color:"var(--t1)",lineHeight:1}}>{total}</div>
                  <div style={{fontSize:9,color:"var(--t3)"}}>signals</div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                {[["Zone",zone,"var(--acc)"],["NR",nr,"var(--a2)"]].map(([l,v,c])=>(
                  <div key={l} style={{flex:1}}>
                    <div style={{height:3,background:"var(--s3)",borderRadius:2,overflow:"hidden",marginBottom:3}}>
                      <div style={{height:"100%",background:c,width:(v/total*100)+"%",borderRadius:2}}/>
                    </div>
                    <div style={{fontFamily:"var(--mono)",fontSize:12,fontWeight:700,color:"var(--t1)"}}>{v}</div>
                    <div style={{fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".4px"}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                {+r.Long_Signals>0&&<span style={{background:"var(--longd)",color:"var(--long)",padding:"2px 6px",borderRadius:4,fontSize:10,fontFamily:"var(--mono)"}}>↑{r.Long_Signals} Long</span>}
                {+r.Short_Signals>0&&<span style={{background:"var(--shortd)",color:"var(--short)",padding:"2px 6px",borderRadius:4,fontSize:10,fontFamily:"var(--mono)"}}>↓{r.Short_Signals} Short</span>}
                {+r.Retracement_Signals>0&&<span style={{background:"var(--retd)",color:"var(--ret)",padding:"2px 6px",borderRadius:4,fontSize:10,fontFamily:"var(--mono)"}}>↺{r.Retracement_Signals}</span>}
              </div>
              <FlagChips row={r} keys={["Is_FNO","Is_Nifty_LargeCap_100","Is_Midcap_150","Is_SmallCap_250","Is_MicroCap_250","Is_Nifty_500"]}/>
              {exp&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--b1)"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:9.5,color:"var(--t3)"}}>Industry:</span>
                    <IndustryTag industry={r.Industry}/>
                    {r.Price&&<span style={{fontSize:9.5,color:"var(--t3)",fontFamily:"var(--mono)"}}>₹{r.Price} ({+r.Change_Pct>0?"+":""}{r.Change_Pct}%)</span>}
                  </div>
                  {zlist.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:9.5,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",marginBottom:5}}>Zone Signals ({zlist.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{zlist.map(s=><span key={s} style={{fontSize:9.5,padding:"2px 6px",background:"rgba(0,229,255,.06)",color:"rgba(0,229,255,.7)",border:"1px solid rgba(0,229,255,.15)",borderRadius:3,fontFamily:"var(--mono)"}}>{s.replace(/_/g," ")}</span>)}</div></div>}
                  {nlist.length>0&&<div><div style={{fontSize:9.5,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",marginBottom:5}}>NR Signals ({nlist.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{nlist.map(s=><span key={s} style={{fontSize:9.5,padding:"2px 6px",background:"rgba(255,108,53,.06)",color:"rgba(255,108,53,.7)",border:"1px solid rgba(255,108,53,.15)",borderRadius:3,fontFamily:"var(--mono)"}}>{s}</span>)}</div></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HORIZON TAB ──────────────────────────────────────────────────────────────
function HorizonTab({ db, horizons }) {
  const [selHorizons,setSelHorizons] = useState(new Set(["intraday","swing","investment"]));
  const [bias,setBias]   = useState("ALL");
  const [search,setSearch] = useState("");
  const [sort,setSort]   = useState({ col:"signals", dir:-1 });
  const [page,setPage]   = useState(1);
  const [pageSize,setPageSize] = useState(50);

  const toggleH=h=>setSelHorizons(prev=>{ const s=new Set(prev); if(s.has(h)&&s.size>1)s.delete(h); else s.add(h); setPage(1); return s; });

  const data = useMemo(()=>{
    const stockSigs={};
    db.flat.forEach(r=>{
      const hs=getHorizonList(r.Signal_Name, horizons);
      if(!hs.some(h=>selHorizons.has(h))) return;
      if(!stockSigs[r.Symbol]) stockSigs[r.Symbol]={Symbol:r.Symbol,Trading_Bias:r.Trading_Bias,Is_FNO:r.Is_FNO,Is_Nifty_500:r.Is_Nifty_500,Is_Nifty_LargeCap_100:r.Is_Nifty_LargeCap_100,Is_Midcap_150:r.Is_Midcap_150,Is_SmallCap_250:r.Is_SmallCap_250,Sector:r.Sector,Industry:r.Industry,signals:[],hset:new Set(),intraday:0,swing:0,investment:0};
      stockSigs[r.Symbol].signals.push(r.Signal_Name);
      hs.forEach(h=>{stockSigs[r.Symbol].hset.add(h);stockSigs[r.Symbol][h]=(stockSigs[r.Symbol][h]||0)+1;});
    });
    let out=Object.values(stockSigs);
    if(bias!=="ALL") out=out.filter(r=>r.Trading_Bias===bias);
    if(search){const q=search.toLowerCase();out=out.filter(r=>r.Symbol.toLowerCase().includes(q));}
    if(sort.col){
      out=[...out].sort((a,b)=>{
        const av=sort.col==="signals"?a.signals.length:a[sort.col]||"";
        const bv=sort.col==="signals"?b.signals.length:b[sort.col]||"";
        if(typeof av==="number") return (av-bv)*sort.dir;
        return String(av).localeCompare(String(bv))*sort.dir;
      });
    }
    return out;
  },[db.flat,horizons,selHorizons,bias,search,sort]);

  const sortCol=col=>setSort(p=>p.col===col?{col,dir:-p.dir}:{col,dir:1});
  const totalPg=Math.max(1,Math.ceil(data.length/pageSize));
  const cur=Math.min(page,totalPg);
  const pg=data.slice((cur-1)*pageSize,cur*pageSize);
  const HOR_OPTS=[{h:"intraday",l:"📈 Intraday",c:"var(--mixed)"},{h:"swing",l:"📊 Swing",c:"var(--acc)"},{h:"investment",l:"💼 Investment",c:"var(--ret)"}];
  const filteredSyms=data.map(r=>r.Symbol);

  const TH=({col,label})=>(
    <th onClick={()=>sortCol(col)} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"9px 14px",fontSize:9.5,fontWeight:600,textTransform:"uppercase",letterSpacing:".6px",color:sort.col===col?"var(--acc)":"var(--t3)",textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"}}>
      {label} {sort.col===col?(sort.dir===1?"↑":"↓"):"⇅"}
    </th>
  );

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <span style={{fontSize:10,color:"var(--t3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".7px"}}>Horizon:</span>
        {HOR_OPTS.map(({h,l,c})=>{
          const active=selHorizons.has(h);
          return <div key={h} onClick={()=>toggleH(h)} style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",border:`1px solid ${active?c:"var(--b2)"}`,background:active?`${c}18`:"var(--s2)",color:active?c:"var(--t2)",transition:"all .15s"}}>{l}</div>;
        })}
        <span style={{fontSize:10,color:"var(--t3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".7px",marginLeft:8}}>Bias:</span>
        {["ALL","LONG","SHORT","MIXED","RETRACEMENT"].map(b=>{
          const bc=BIAS_COLOR[b]||BIAS_COLOR.NEUTRAL, active=bias===b;
          return <div key={b} onClick={()=>{setBias(b);setPage(1);}} style={{padding:"5px 10px",borderRadius:6,fontSize:11.5,cursor:"pointer",border:`1px solid ${active?bc.border:"var(--b2)"}`,background:active?bc.bg:"var(--s2)",color:active?bc.text:"var(--t2)"}}>{b}</div>;
        })}
        <TVCopyBtn symbols={filteredSyms} label={`⎘ Copy ${filteredSyms.length} TV`}/>
        <div style={{position:"relative",marginLeft:"auto"}}>
          <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",fontSize:12}}>🔍</span>
          <input style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:7,color:"var(--t1)",fontSize:11.5,padding:"5px 12px 5px 30px",width:200}} placeholder="Search symbol..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
      </div>
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
        <div style={{overflowX:"auto",maxHeight:"calc(100vh - 360px)",overflowY:"auto",scrollbarWidth:"thin"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr>
                <TH col="#" label="#"/>
                <TH col="Symbol" label="Symbol"/>
                <th style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"9px 14px",fontSize:9.5,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",textAlign:"left",whiteSpace:"nowrap"}}>TV Copy</th>
                <TH col="Sector" label="Sector"/>
                <TH col="Trading_Bias" label="Bias"/>
                <th style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"9px 14px",fontSize:9.5,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",textAlign:"left",whiteSpace:"nowrap"}}>Horizon</th>
                <TH col="signals" label="Signals"/>
                <TH col="intraday" label="Intraday"/>
                <TH col="swing" label="Swing"/>
                <TH col="investment" label="Invest"/>
                <TH col="Is_FNO" label="FNO"/>
                <TH col="Is_Nifty_500" label="N500"/>
              </tr>
            </thead>
            <tbody>
              {pg.map((r,i)=>(
                <tr key={r.Symbol} style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"7px 14px",color:"var(--t3)",fontFamily:"var(--mono)"}}>{(cur-1)*pageSize+i+1}</td>
                  <td style={{padding:"7px 14px"}}><SymCell sym={r.Symbol}/></td>
                  <td style={{padding:"7px 14px"}}><TVCopyBtn symbols={[r.Symbol]} label="TV"/></td>
                  <td style={{padding:"7px 14px"}}><SectorChip sector={r.Sector} industry={r.Industry}/></td>
                  <td style={{padding:"7px 14px"}}>{biasBadge(r.Trading_Bias,true)}</td>
                  <td style={{padding:"7px 14px"}}>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {[...r.hset].map(h=>{const opt=HOR_OPTS.find(o=>o.h===h);return <span key={h} style={{padding:"2px 8px",borderRadius:5,fontSize:10.5,fontWeight:500,border:`1px solid ${opt?.c||"var(--b2)"}`,color:opt?.c||"var(--t2)",background:`${opt?.c||"var(--b2)"}18`}}>{h}</span>;})}
                    </div>
                  </td>
                  <td style={{padding:"7px 14px",fontFamily:"var(--mono)",fontWeight:700,fontSize:14,color:"var(--t1)"}}>{r.signals.length}</td>
                  <td style={{padding:"7px 14px",fontFamily:"var(--mono)",color:r.intraday>0?"var(--mixed)":"var(--t3)"}}>{r.intraday||"—"}</td>
                  <td style={{padding:"7px 14px",fontFamily:"var(--mono)",color:r.swing>0?"var(--acc)":"var(--t3)"}}>{r.swing||"—"}</td>
                  <td style={{padding:"7px 14px",fontFamily:"var(--mono)",color:r.investment>0?"var(--ret)":"var(--t3)"}}>{r.investment||"—"}</td>
                  <td style={{padding:"7px 14px"}}>{yesnoBadge(r.Is_FNO)}</td>
                  <td style={{padding:"7px 14px"}}>{yesnoBadge(r.Is_Nifty_500)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:7,borderTop:"1px solid var(--b1)"}}>
          {[["«",1],["‹",cur-1]].map(([l,t])=><button key={l} disabled={cur<=1} onClick={()=>setPage(Math.max(1,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:cur<=1?.3:1,cursor:cur<=1?"default":"pointer"}}>{l}</button>)}
          <span style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--mono)",margin:"0 4px"}}>Page {cur} / {totalPg}</span>
          {[["›",cur+1],["»",totalPg]].map(([l,t])=><button key={l} disabled={cur>=totalPg} onClick={()=>setPage(Math.min(totalPg,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:cur>=totalPg?.3:1,cursor:cur>=totalPg?"default":"pointer"}}>{l}</button>)}
          <select value={pageSize} onChange={e=>{setPageSize(+e.target.value);setPage(1);}} style={{marginLeft:"auto",background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 7px",borderRadius:5,fontSize:11}}>
            {[25,50,100,200].map(n=><option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── STRONG CONVICTION ────────────────────────────────────────────────────────
function StrongConviction({ db }) {
  const [filterType,setFilterType] = useState("ALL");
  const sorted=useMemo(()=>[...db.strong].sort((a,b)=>+b.Conviction_Score-+a.Conviction_Score),[db.strong]);
  const types=useMemo(()=>{ const t={}; db.strong.forEach(r=>{t[r.Conviction_Type]=(t[r.Conviction_Type]||0)+1;}); return t; },[db.strong]);
  const data=filterType==="ALL"?sorted:sorted.filter(r=>r.Conviction_Type===filterType);
  const maxS=Math.max(...db.strong.map(r=>+r.Conviction_Score),1);
  const filteredSyms=data.map(r=>r.Symbol);

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:16}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>
          💪 Strong Conviction — {db.strong.length} stocks
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <TVCopyBtn symbols={filteredSyms} label={`⎘ Copy ${filteredSyms.length} TV`}/>
        </div>
      </div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18}}>
        {["ALL",...Object.keys(types)].map(t=>(
          <button key={t} onClick={()=>setFilterType(t)} style={{padding:"5px 11px",borderRadius:6,fontSize:11.5,cursor:"pointer",border:`1px solid ${filterType===t?"var(--acc)":"var(--b2)"}`,background:filterType===t?"var(--adim)":"var(--s2)",color:filterType===t?"var(--acc)":"var(--t2)"}}>
            {t} {t!=="ALL"&&<span style={{fontSize:9,background:"var(--s3)",borderRadius:999,padding:"1px 5px",marginLeft:3,color:"var(--t3)"}}>{types[t]}</span>}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
        {data.map(r=>{
          const isL=r.Conviction_Type.includes("LONG"), isS=r.Conviction_Type.includes("SHORT");
          const scoreColor=isL?"var(--long)":isS?"var(--short)":"var(--mixed)";
          const pct=(+r.Conviction_Score/maxS*100).toFixed(0);
          return (
            <div key={r.Symbol} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:9,padding:"13px 15px",borderLeft:`3px solid ${scoreColor}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <div className="sym-cell"><span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:"var(--acc)"}}>{r.Symbol}</span><CopyBtn text={r.Symbol}/></div>
                    <TVCopyBtn symbols={[r.Symbol]} label="TV"/>
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:scoreColor}}>{r.Conviction_Type}</div>
                  <div style={{marginTop:4}}><SectorChip sector={r.Sector} industry={r.Industry}/></div>
                </div>
                <div>
                  <div style={{fontFamily:"var(--mono)",fontSize:22,fontWeight:700,color:scoreColor,lineHeight:1}}>{r.Conviction_Score}</div>
                  <div style={{height:3,background:"var(--s3)",borderRadius:2,overflow:"hidden",marginTop:4}}>
                    <div style={{height:"100%",background:scoreColor,width:pct+"%",borderRadius:2}}/>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:8,fontSize:11,fontFamily:"var(--mono)"}}>
                {+r.Long_Signals>0&&<span style={{color:"var(--long)"}}>↑{r.Long_Signals} long</span>}
                {+r.Short_Signals>0&&<span style={{color:"var(--short)"}}>↓{r.Short_Signals} short</span>}
                {(r.Has_NR_Signal==="True"||r.Has_NR_Signal==="Yes")&&<span style={{color:"var(--acc)"}}>◆NR({r.NR_Signal_Count})</span>}
              </div>
              <FlagChips row={r} keys={["Is_FNO","Is_Nifty_500","Is_Nifty_LargeCap_100","Is_Midcap_150"]}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MULTI-TF NR ──────────────────────────────────────────────────────────────
function MTNR({ db }) {
  const sorted=useMemo(()=>[...db.mtnr].sort((a,b)=>+b.NR_Signal_Count-+a.NR_Signal_Count),[db.mtnr]);
  const by4=sorted.filter(r=>+r.Timeframe_Count>=4).length;
  const allSyms=sorted.map(r=>r.Symbol);

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:20,fontWeight:700,color:"var(--t1)"}}>📐 Multi-Timeframe NR Alignment</div>
        <TVCopyBtn symbols={allSyms} label={`⎘ Copy All ${allSyms.length} TV`}/>
      </div>
      <div style={{fontSize:13,color:"var(--t2)",marginBottom:16}}>{db.mtnr.length} stocks with NR patterns across multiple timeframes</div>
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderLeft:"3px solid var(--acc)",borderRadius:10,padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)",marginBottom:6}}>💡 Why Multi-TF NR matters</div>
        <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.7}}>When a stock shows Narrow Range patterns across Daily+Weekly+Monthly+Quarterly simultaneously, it signals extreme coiling. <strong style={{color:"var(--acc)"}}>{by4} stocks have 4-timeframe alignment</strong> — the highest-conviction NR setup.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[{v:db.mtnr.length,l:"Multi-TF Stocks",c:"var(--t1)"},{v:by4,l:"4-TF Aligned",c:"var(--long)"},{v:sorted.filter(r=>+r.Timeframe_Count===3).length,l:"3-TF Aligned",c:"var(--mixed)"},{v:Math.max(...db.mtnr.map(r=>+r.NR_Signal_Count),0),l:"Max NR Signals",c:"var(--acc)"}].map(({v,l,c})=>(
          <div key={l} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:9,padding:"14px 16px"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:24,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:11,color:"var(--t2)",marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>{["#","Symbol","TV","Sector","NR Count","Timeframes","TF Count","NR Signals","Flags"].map(h=><th key={h} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"9px 14px",fontSize:9.5,fontWeight:600,textTransform:"uppercase",letterSpacing:".6px",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {sorted.slice(0,150).map((r,i)=>{
                const tfc=+r.Timeframe_Count, c=tfc>=4?"var(--long)":tfc>=3?"var(--mixed)":"var(--t1)";
                return (
                  <tr key={r.Symbol} style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"7px 14px",color:"var(--t3)",fontFamily:"var(--mono)"}}>{i+1}</td>
                    <td style={{padding:"7px 14px"}}><SymCell sym={r.Symbol}/></td>
                    <td style={{padding:"7px 14px"}}><TVCopyBtn symbols={[r.Symbol]} label="TV"/></td>
                    <td style={{padding:"7px 14px"}}><SectorChip sector={r.Sector} industry={r.Industry}/></td>
                    <td style={{padding:"7px 14px",fontFamily:"var(--mono)",fontSize:14,fontWeight:700,color:c}}>{r.NR_Signal_Count}</td>
                    <td style={{padding:"7px 14px",fontSize:11,color:"var(--t2)"}}>{r.Timeframes}</td>
                    <td style={{padding:"7px 14px"}}><span style={{padding:"2px 8px",borderRadius:4,background:`${c}18`,color:c,fontSize:11,fontFamily:"var(--mono)",border:`1px solid ${c}40`}}>{tfc} TF</span></td>
                    <td style={{padding:"7px 14px",fontSize:10,color:"var(--t2)",maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.NR_Signals}>{r.NR_Signals}</td>
                    <td style={{padding:"7px 14px"}}>
                      {r.Is_FNO==="Yes"&&<span style={{background:"var(--longd)",color:"var(--long)",fontSize:9,padding:"1px 5px",borderRadius:3,marginRight:3}}>FNO</span>}
                      {r.Is_Nifty_500==="Yes"&&<span style={{background:"var(--adim)",color:"var(--acc)",fontSize:9,padding:"1px 5px",borderRadius:3}}>N500</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── VIRGIN BO/BD ─────────────────────────────────────────────────────────────
function Virgin({ db }) {
  const bouts  = useMemo(()=>[...db.virgin].filter(r=>r.Virgin_Type.toLowerCase().includes("breakout")).sort((a,b)=>+b.Virgin_Signal_Count-+a.Virgin_Signal_Count),[db.virgin]);
  const bdowns = useMemo(()=>[...db.virgin].filter(r=>r.Virgin_Type.toLowerCase().includes("breakdown")).sort((a,b)=>+b.Virgin_Signal_Count-+a.Virgin_Signal_Count),[db.virgin]);

  const Table=({title,data,color})=>(
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
      <div style={{padding:"11px 15px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:12.5,fontWeight:600,color}}>{title} ({data.length})</div>
        <TVCopyBtn symbols={data.map(r=>r.Symbol)} label={`⎘ Copy TV`}/>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
        <thead><tr>{["Symbol","TV","Sector","Signals","Timeframes","Has NR"].map(h=><th key={h} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"7px 14px",fontSize:9.5,fontWeight:600,textTransform:"uppercase",letterSpacing:".6px",color:"var(--t3)",textAlign:"left"}}>{h}</th>)}</tr></thead>
        <tbody>{data.map(r=>(
          <tr key={r.Symbol} style={{borderBottom:"1px solid var(--b1)"}}>
            <td style={{padding:"7px 14px"}}><SymCell sym={r.Symbol}/></td>
            <td style={{padding:"7px 14px"}}><TVCopyBtn symbols={[r.Symbol]} label="TV"/></td>
            <td style={{padding:"7px 14px"}}><SectorChip sector={r.Sector} industry={r.Industry}/></td>
            <td style={{padding:"7px 14px",fontFamily:"var(--mono)",fontWeight:700,color}}>{r.Virgin_Signal_Count}</td>
            <td style={{padding:"7px 14px",fontSize:11,color:"var(--t2)"}}>{r.Timeframes}</td>
            <td style={{padding:"7px 14px"}}>{(r.Has_NR_Signal==="True"||r.Has_NR_Signal==="Yes")?<span style={{background:"var(--longd)",color:"var(--long)",fontSize:9.5,padding:"2px 6px",borderRadius:4}}>Yes</span>:<span style={{background:"var(--s3)",color:"var(--t3)",fontSize:9.5,padding:"2px 6px",borderRadius:4}}>No</span>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{fontSize:20,fontWeight:700,color:"var(--t1)",marginBottom:4}}>🔓 Virgin Breakout / Breakdown</div>
      <div style={{fontSize:13,color:"var(--t2)",marginBottom:16}}>{db.virgin.length} stocks entering uncharted territory</div>
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)",marginBottom:6}}>🔬 Virgin Pattern Explained</div>
        <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.7}}><strong style={{color:"var(--long)"}}>Virgin Breakout</strong>: First-ever close above a zone — no prior test, no overhead resistance. <strong style={{color:"var(--short)"}}>Virgin Breakdown</strong>: First-ever close below a support zone. Highest-probability moves.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Table title="↑ Virgin Breakouts"  data={bouts}  color="var(--long)"/>
        <Table title="↓ Virgin Breakdowns" data={bdowns} color="var(--short)"/>
      </div>
    </div>
  );
}

// ─── SIGNAL SUMMARY ───────────────────────────────────────────────────────────
function SignalSummary({ db }) {
  const [filterType,setFilterType] = useState("ALL");
  const [search,setSearch]         = useState("");
  const [openAcc,setOpenAcc]       = useState({});
  const types=useMemo(()=>{ const t={}; db.summary.forEach(r=>{if(r.Signal_Type)t[r.Signal_Type]=(t[r.Signal_Type]||0)+1;}); return t; },[db.summary]);
  const data=useMemo(()=>{
    const sq=search.toLowerCase();
    return db.summary.filter(r=>{
      if(filterType!=="ALL"&&r.Signal_Type!==filterType&&r.Signal_Category!==filterType) return false;
      if(sq&&!r.Signal_Name.toLowerCase().includes(sq)) return false;
      return true;
    }).sort((a,b)=>+b.Stock_Count-+a.Stock_Count);
  },[db.summary,filterType,search]);

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:16}}>
        <span style={{fontSize:10,color:"var(--t3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".7px"}}>Filter:</span>
        {["ALL",...Object.keys(types)].map(t=>(
          <button key={t} onClick={()=>setFilterType(t)} style={{padding:"5px 11px",borderRadius:6,fontSize:11.5,cursor:"pointer",border:`1px solid ${filterType===t?"var(--acc)":"var(--b2)"}`,background:filterType===t?"var(--adim)":"var(--s2)",color:filterType===t?"var(--acc)":"var(--t2)"}}>
            {t} {t!=="ALL"&&types[t]&&<span style={{fontSize:9,marginLeft:2,color:"var(--t3)"}}>{types[t]}</span>}
          </button>
        ))}
        <div style={{position:"relative",marginLeft:"auto"}}>
          <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",fontSize:12}}>🔍</span>
          <input style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:7,color:"var(--t1)",fontSize:11.5,padding:"5px 12px 5px 30px",width:220}} placeholder="Search signals..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:8}}>
        {data.map(r=>{
          const isOpen=openAcc[r.Signal_Name];
          const stocks=db.sig_stocks[r.Signal_Name]||[];
          const stockSyms=stocks.map(s=>s.s);
          return (
            <div key={r.Signal_Name} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:8,overflow:"hidden"}}>
              <div onClick={()=>setOpenAcc(p=>({...p,[r.Signal_Name]:!p[r.Signal_Name]}))} style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={{fontSize:12.5,fontWeight:500,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}} title={r.Signal_Name}>{r.Signal_Name.replace(/_/g," ")}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {catBadge(r.Signal_Category)}
                    {biasBadge(r.Signal_Type,true)}
                    {r.Timeframe&&<span style={{padding:"2px 6px",borderRadius:4,fontSize:9.5,background:"var(--s3)",color:"var(--t3)"}}>{r.Timeframe}</span>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <div style={{fontFamily:"var(--mono)",fontSize:15,fontWeight:700,color:"var(--t1)"}}>{parseInt(r.Stock_Count).toLocaleString()}</div>
                  <TVCopyBtn symbols={stockSyms} label="⎘ TV"/>
                  {r.URL&&<a href={r.URL} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:"var(--acc)",fontSize:11,textDecoration:"none",border:"1px solid rgba(0,229,255,.3)",padding:"2px 7px",borderRadius:4,opacity:.7}}>↗</a>}
                  <span style={{color:"var(--t3)",fontSize:10,transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
                </div>
              </div>
              {isOpen&&(
                <div style={{borderTop:"1px solid var(--b1)",background:"var(--s2)"}}>
                  <div style={{padding:"7px 12px 3px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600}}>Stocks ({stocks.length})</div>
                    <TVCopyBtn symbols={stockSyms} label={`⎘ All ${stockSyms.length} TV`}/>
                  </div>
                  <div style={{maxHeight:230,overflowY:"auto",scrollbarWidth:"thin"}}>
                    {stocks.length===0&&<div style={{padding:14,textAlign:"center",fontSize:12,color:"var(--t3)"}}>No stock data</div>}
                    {stocks.slice(0,80).map(st=>(
                      <div key={st.s} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderBottom:"1px solid var(--b1)",flexWrap:"wrap"}}>
                        <div style={{width:100,flexShrink:0}}><SymCell sym={st.s}/></div>
                        <TVCopyBtn symbols={[st.s]} label="TV"/>
                        {biasBadge(st.b,true)}
                        <SectorChip sector={st.sec} industry={st.ind} dim/>
                        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginLeft:4}}>
                          {st.fno==="Yes"&&<span style={{background:"var(--longd)",color:"var(--long)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>FNO</span>}
                          {st.n500==="Yes"&&<span style={{background:"var(--adim)",color:"var(--acc)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>N500</span>}
                          {st.n100==="Yes"&&<span style={{background:"var(--adim)",color:"var(--acc)",fontSize:8.5,padding:"1px 4px",borderRadius:3}}>LC100</span>}
                        </div>
                      </div>
                    ))}
                    {stocks.length>80&&<div style={{padding:10,textAlign:"center",fontSize:11,color:"var(--t3)"}}>... and {stocks.length-80} more</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ROTATION QUADRANT (generic SVG bubble scatter, collision-resolved) ────────
function resolveBubbleCollisions(nodes, iterations=60, padding=2) {
  const arr = nodes.map(n => ({ ...n }));
  for (let iter=0; iter<iterations; iter++) {
    let moved = false;
    for (let i=0;i<arr.length;i++){
      for (let j=i+1;j<arr.length;j++){
        const a=arr[i], b=arr[j];
        let dx=b.x-a.x, dy=b.y-a.y;
        let dist=Math.sqrt(dx*dx+dy*dy);
        const minDist=a.r+b.r+padding;
        if (dist < minDist) {
          moved = true;
          if (dist < 0.01) { dx=(Math.random()-0.5)||0.01; dy=(Math.random()-0.5)||0.01; dist=Math.sqrt(dx*dx+dy*dy); }
          const overlap = (minDist-dist)/2;
          const ux=dx/dist, uy=dy/dist;
          a.x -= ux*overlap; a.y -= uy*overlap;
          b.x += ux*overlap; b.y += uy*overlap;
        }
      }
    }
    if (!moved) break;
  }
  return arr;
}

// items: [{ key, label, x (net bias), y (strength 0-100), size (weight), color, tooltip }]
function RotationQuadrantChart({ items, onSelect, selectedKey, height=380, xAxisLabel="Net Bias Score  (bearish ← 0 → bullish)", yAxisLabel="Strength Score", quadrantLabels=true, emptyLabel="No data", quadrantTexts=null }) {
  const [hoverKey, setHoverKey] = useState(null);
  const w=680, h=height, pad={l:52,r:24,t:20,b:44};
  if (!items.length) return <div style={{padding:"30px 0",textAlign:"center",color:"var(--t3)",fontSize:12}}>{emptyLabel}</div>;
  const xs = items.map(s=>s.x);
  const xMin=Math.min(...xs,0)-4, xMax=Math.max(...xs,0)+4;
  const yMin=0, yMax=100;
  const xScale = v => pad.l + (v-xMin)/((xMax-xMin)||1) * (w-pad.l-pad.r);
  const yScale = v => h-pad.b - (v-yMin)/(yMax-yMin) * (h-pad.t-pad.b);
  const maxSize = Math.max(...items.map(s=>s.size),1);
  const rScale = v => 7 + Math.sqrt(Math.max(v,0)/maxSize)*22;
  const zeroX = xScale(0);

  const rawNodes = items.map(it => ({ key:it.key, label:it.label, r:rScale(it.size), x:xScale(it.x), y:yScale(it.y), color:it.color, tooltip:it.tooltip }));
  const depKey = items.map(it=>`${it.key}:${it.x}:${it.y}:${it.size}`).join("|");
  const resolved = useMemo(()=>resolveBubbleCollisions(rawNodes, 60, 2), [depKey, w, h]);
  const byKey = {}; resolved.forEach(n=>{byKey[n.key]=n;});

  const ordered = [...resolved].sort((a,b)=>{
    if (a.key===hoverKey) return 1;
    if (b.key===hoverKey) return -1;
    return b.r - a.r;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"auto",display:"block"}}>
      {[0,20,40,60,80,100].map(v=>(
        <g key={v}>
          <line x1={pad.l} x2={w-pad.r} y1={yScale(v)} y2={yScale(v)} stroke="var(--b1)" strokeWidth="1"/>
          <text x={pad.l-8} y={yScale(v)+3} textAnchor="end" fontSize="9" fill="var(--t2)" fontFamily="IBM Plex Mono">{v}</text>
        </g>
      ))}
      <line x1={zeroX} x2={zeroX} y1={pad.t} y2={h-pad.b} stroke="var(--b2)" strokeWidth="1.2" strokeDasharray="3,3"/>
      <line x1={pad.l} x2={w-pad.r} y1={h-pad.b} y2={h-pad.b} stroke="var(--b2)" strokeWidth="1"/>
      <text x={w/2} y={h-6} textAnchor="middle" fontSize="9.5" fill="var(--t2)">{xAxisLabel}</text>
      <text x={14} y={h/2} textAnchor="middle" fontSize="9.5" fill="var(--t2)" transform={`rotate(-90 14 ${h/2})`}>{yAxisLabel}</text>
      {quadrantLabels && (()=>{
        const q = quadrantTexts || [
          {text:"STRONG + BULLISH",color:"#00c896"},{text:"STRONG + BEARISH",color:"#fbbf24"},
          {text:"WEAK + BULLISH",color:"#a259ff"},{text:"WEAK + BEARISH",color:"#ff4454"}];
        return <>
          <text x={w-pad.r} y={pad.t+12} textAnchor="end" fontSize="8.5" fill={q[0].color} fontWeight="700">{q[0].text}</text>
          <text x={pad.l+4} y={pad.t+12} textAnchor="start" fontSize="8.5" fill={q[1].color} fontWeight="700">{q[1].text}</text>
          <text x={w-pad.r} y={h-pad.b-6} textAnchor="end" fontSize="8.5" fill={q[2].color} fontWeight="700">{q[2].text}</text>
          <text x={pad.l+4} y={h-pad.b-6} textAnchor="start" fontSize="8.5" fill={q[3].color} fontWeight="700">{q[3].text}</text>
        </>;
      })()}
      {ordered.map(n=>{
        const active = selectedKey===n.key;
        const hovered = hoverKey===n.key;
        const r = hovered ? n.r+3 : n.r;
        return (
          <g key={n.key} className="quad-bubble"
             onClick={()=>onSelect&&onSelect(active?null:n.key)}
             onMouseEnter={()=>setHoverKey(n.key)} onMouseLeave={()=>setHoverKey(k=>k===n.key?null:k)}
             style={{cursor:onSelect?"pointer":"default"}}>
            <circle cx={n.x} cy={n.y} r={r} fill={n.color} fillOpacity={active?0.55:0.26} stroke={n.color} strokeWidth={active?2.5:1.4}/>
            <text x={n.x} y={n.y+3} textAnchor="middle" fontSize="7.5" fill={n.color} fontFamily="IBM Plex Mono" fontWeight="700" style={{pointerEvents:"none"}}>{n.label.length>11?n.label.slice(0,10)+"…":n.label}</text>
            <title>{n.tooltip}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SECTOR & INDUSTRY ANALYSIS TAB (NEW) ─────────────────────────────────────
function SectorIndustryTab({ db }) {
  const [selSector, setSelSector] = useState(null);
  const [indSearch, setIndSearch] = useState("");
  const [indSort, setIndSort] = useState({ col:"Strength_Score", dir:-1 });
  const [nrPattern, setNrPattern] = useState("ALL");
  const [stockSearch, setStockSearch] = useState("");

  const sectors = useMemo(()=>[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score),[db.sectorAnalysis]);
  const avgStrength = sectors.length ? (sectors.reduce((s,r)=>s+r.Strength_Score,0)/sectors.length) : 0;
  const selSectorData = sectors.find(s=>s.Sector===selSector);

  const industries = useMemo(()=>{
    let out = db.industryAnalysis;
    if(selSector) out = out.filter(r=>r.Sector===selSector);
    if(indSearch){ const q=indSearch.toLowerCase(); out = out.filter(r=>r.Industry.toLowerCase().includes(q)); }
    out = [...out].sort((a,b)=>{
      const av=a[indSort.col], bv=b[indSort.col];
      if(typeof av==="number") return (av-bv)*indSort.dir;
      return String(av).localeCompare(String(bv))*indSort.dir;
    });
    return out;
  },[db.industryAnalysis,selSector,indSearch,indSort]);

  const nrRows = useMemo(()=>{
    let out = db.nrSectorIndustry;
    if(selSector) out = out.filter(r=>r.Sector===selSector);
    if(nrPattern!=="ALL") out = out.filter(r=>r.Pattern_Type===nrPattern);
    return [...out].sort((a,b)=>b.Stock_Count-a.Stock_Count).slice(0,120);
  },[db.nrSectorIndustry,selSector,nrPattern]);

  const nrPatternTotals = useMemo(()=>{
    const base = selSector ? db.nrSectorIndustry.filter(r=>r.Sector===selSector) : db.nrSectorIndustry;
    const m={};
    base.forEach(r=>{ m[r.Pattern_Type]=(m[r.Pattern_Type]||0)+r.Stock_Count; });
    return m;
  },[db.nrSectorIndustry,selSector]);

  const flatBySym = useMemo(()=>{
    const m={};
    db.flat.forEach(r=>{ if(!m[r.Symbol]) m[r.Symbol]={count:0,bias:{}}; m[r.Symbol].count++; m[r.Symbol].bias[r.Trading_Bias]=(m[r.Symbol].bias[r.Trading_Bias]||0)+1; });
    return m;
  },[db.flat]);

  const stockRows = useMemo(()=>{
    let out = db.master;
    if(selSector) out = out.filter(r=>r.Sector===selSector);
    if(stockSearch){ const q=stockSearch.toLowerCase(); out = out.filter(r=>r.Symbol.toLowerCase().includes(q)||r.Stock_Name.toLowerCase().includes(q)); }
    return [...out].sort((a,b)=>{
      const ca=(flatBySym[a.Symbol]||{}).count||0, cb=(flatBySym[b.Symbol]||{}).count||0;
      return cb-ca;
    });
  },[db.master,selSector,stockSearch,flatBySym]);

  const patternTypes = ["ALL","Breakout","Breakdown","Near High","Near Low","Back to NR"];
  const patternColor = { Breakout:"var(--long)", Breakdown:"var(--short)", "Near High":"var(--acc)", "Near Low":"var(--mixed)", "Back to NR":"var(--ret)" };

  const IND_COLS = [
    {k:"Industry",l:"Industry"},{k:"Total_Stocks",l:"Stocks"},{k:"Advance_Decline_Ratio",l:"A/D"},
    {k:"Bullish_Score",l:"Bull"},{k:"Bearish_Score",l:"Bear"},{k:"Net_Bias_Score",l:"Net Bias"},
    {k:"Total_Signal_Count",l:"Signals"},{k:"Signal_Density",l:"Density"},{k:"Strength_Score",l:"Strength"},
  ];

  const maxNrPattern = Math.max(...Object.values(nrPatternTotals),1);

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:700,color:"var(--t1)"}}>🏭 Sector &amp; Industry Analysis</div>
        <div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>{sectors.length} sectors · {db.industryAnalysis.length} industries · {db.master.length.toLocaleString()} stocks mapped from the master list</div>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:18}}>
        {[
          {l:"Sectors",v:sectors.length,c:"var(--acc)"},
          {l:"Industries",v:db.industryAnalysis.length,c:"var(--a2)"},
          {l:"Avg Strength",v:avgStrength.toFixed(1),c:"var(--mixed)"},
          {l:"Strongest",v:sectors[0]?.Sector||"—",c:sectorColor(sectors[0]?.Sector||"")},
          {l:"Weakest",v:sectors[sectors.length-1]?.Sector||"—",c:sectorColor(sectors[sectors.length-1]?.Sector||"")},
          {l:"NR Patterns Tracked",v:db.nrSectorIndustry.length,c:"var(--ret)"},
        ].map(k=>(
          <div key={k.l} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:(k.l==="Strongest"||k.l==="Weakest")?15:20,fontWeight:700,color:k.c,lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.v}</div>
            <div style={{fontSize:10.5,color:"var(--t1)",marginTop:3,fontWeight:600}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Sector Rotation Quadrant */}
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"16px 18px",marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)"}}>🧭 Sector Rotation Quadrant</div>
          <div style={{fontSize:10,color:"var(--t3)"}}>bubble size = stock count · click a bubble to filter below</div>
        </div>
        <RotationQuadrantChart
          items={sectors.map(s=>({ key:s.Sector, label:s.Sector, x:s.Net_Bias_Score, y:s.Strength_Score, size:s.Total_Stocks, color:sectorColor(s.Sector),
            tooltip:`${s.Sector}: strength ${s.Strength_Score.toFixed(1)}, net bias ${s.Net_Bias_Score}, ${s.Total_Stocks} stocks, ${s.Advancing} advancing / ${s.Declining} declining` }))}
          onSelect={setSelSector} selectedKey={selSector}
        />
      </div>

      {/* Sector Grid */}
      <div style={{marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600}}>Sectors — click a card to filter industries, NR patterns &amp; stocks below</div>
        {selSector && <button onClick={()=>setSelSector(null)} style={{background:"var(--s2)",border:`1px solid ${sectorColor(selSector)}`,color:sectorColor(selSector),padding:"2px 9px",borderRadius:5,fontSize:10.5,cursor:"pointer"}}>✕ Clear: {selSector}</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:8,marginBottom:20}}>
        {sectors.map(s=>{
          const active = selSector===s.Sector;
          const col = sectorColor(s.Sector);
          return (
            <div key={s.Sector} className="sector-card" onClick={()=>setSelSector(active?null:s.Sector)} style={{
              background:"var(--s1)", border:`1px solid ${active?col:"var(--b1)"}`, borderLeft:`3px solid ${col}`,
              borderRadius:9, padding:"11px 13px", cursor:"pointer",
              boxShadow: active?`0 0 0 1px ${col}`:"none",
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,gap:6}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.Sector}</div>
                {strengthBadge(s.Strength_Label,true)}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontFamily:"var(--mono)",fontSize:18,fontWeight:700,color:col}}>{s.Strength_Score.toFixed(1)}</div>
                <div style={{flex:1,height:4,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${s.Strength_Score}%`,background:col,borderRadius:2}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,fontSize:10,fontFamily:"var(--mono)",color:"var(--t2)",flexWrap:"wrap"}}>
                <span>{s.Total_Stocks} stk</span>
                <span style={{color:"var(--long)"}}>↑{s.Advancing}</span>
                <span style={{color:"var(--short)"}}>↓{s.Declining}</span>
                <span>{s.Total_Signal_Count} sig</span>
                <span style={{color:s.Net_Bias_Score>0?"var(--long)":s.Net_Bias_Score<0?"var(--short)":"var(--t2)"}}>{s.Net_Bias_Score>0?"+":""}{s.Net_Bias_Score} net</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected sector detail */}
      {selSectorData && (
        <div style={{background:"var(--s1)",border:`1px solid ${sectorColor(selSector)}`,borderRadius:10,padding:"16px 18px",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{fontSize:15,fontWeight:700,color:sectorColor(selSector)}}>{selSector} — Detailed Breakdown</div>
            {strengthBadge(selSectorData.Strength_Label)}
            <TVCopyBtn symbols={db.master.filter(m=>m.Sector===selSector).map(m=>m.Symbol)} label={`⎘ Copy ${selSectorData.Total_Stocks} TV`}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
            <div>
              <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600,marginBottom:8}}>Zone Signal Split</div>
              {[["Long",selSectorData.Zone_Long_Count,"var(--long)"],["Short",selSectorData.Zone_Short_Count,"var(--short)"],["Retracement",selSectorData.Zone_Retracement_Count,"var(--ret)"],["Mixed",selSectorData.Zone_Mixed_Count,"var(--mixed)"]].map(([l,v,c])=>{
                const maxZ=Math.max(selSectorData.Zone_Long_Count,selSectorData.Zone_Short_Count,selSectorData.Zone_Retracement_Count,selSectorData.Zone_Mixed_Count,1);
                return (
                  <div key={l} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <div style={{width:70,fontSize:10,color:"var(--t2)"}}>{l}</div>
                    <div style={{flex:1,height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${v/maxZ*100}%`,background:c,borderRadius:3}}/></div>
                    <div style={{width:24,textAlign:"right",fontFamily:"var(--mono)",fontSize:10.5,color:c}}>{v}</div>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600,marginBottom:8}}>NR Pattern Split</div>
              {[["Breakout",selSectorData.NR_Breakout_Count,"var(--long)"],["Breakdown",selSectorData.NR_Breakdown_Count,"var(--short)"],["Near High",selSectorData.NR_Near_High_Count,"var(--acc)"],["Near Low",selSectorData.NR_Near_Low_Count,"var(--mixed)"],["Back to NR",selSectorData.NR_Back_To_NR_Count,"var(--ret)"]].map(([l,v,c])=>{
                const maxN=Math.max(selSectorData.NR_Breakout_Count,selSectorData.NR_Breakdown_Count,selSectorData.NR_Near_High_Count,selSectorData.NR_Near_Low_Count,selSectorData.NR_Back_To_NR_Count,1);
                return (
                  <div key={l} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <div style={{width:70,fontSize:10,color:"var(--t2)"}}>{l}</div>
                    <div style={{flex:1,height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${v/maxN*100}%`,background:c,borderRadius:3}}/></div>
                    <div style={{width:24,textAlign:"right",fontFamily:"var(--mono)",fontSize:10.5,color:c}}>{v}</div>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600,marginBottom:8}}>Marketcap Mix</div>
              <McapChips breakdown={selSectorData.Marketcap_Breakdown}/>
              <div style={{marginTop:12,fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".7px",fontWeight:600,marginBottom:6}}>Key Ratios</div>
              <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.9}}>
                Advance/Decline: <strong style={{color:"var(--t1)"}}>{selSectorData.Advance_Decline_Ratio}</strong><br/>
                Signal Density: <strong style={{color:"var(--t1)"}}>{selSectorData.Signal_Density}</strong><br/>
                Avg Change: <strong style={{color:selSectorData.Avg_Change_Pct>=0?"var(--long)":"var(--short)"}}>{selSectorData.Avg_Change_Pct>=0?"+":""}{selSectorData.Avg_Change_Pct}%</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Industry Rotation Quadrant — bullish vs bearish industries within selected sector */}
      {selSectorData && (()=>{
        const indItems = db.industryAnalysis.filter(r=>r.Sector===selSector).map(r=>({
          key:r.Industry, label:r.Industry, x:r.Net_Bias_Score, y:r.Strength_Score, size:r.Total_Stocks, color:sectorColor(r.Industry),
          tooltip:`${r.Industry}: strength ${r.Strength_Score.toFixed(1)}, net bias ${r.Net_Bias_Score}, ${r.Total_Stocks} stocks, ${r.Advancing} advancing / ${r.Declining} declining`,
        }));
        return (
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"16px 18px",marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)"}}>🧭 Industry Rotation within {selSector}</div>
              <div style={{fontSize:10,color:"var(--t3)"}}>which industries here are bullish/strong vs bearish/weak · bubble size = stock count</div>
            </div>
            <RotationQuadrantChart items={indItems} height={340} emptyLabel={`No industry-level data for ${selSector}`}/>
          </div>
        );
      })()}

      {/* Industry + NR side by side */}
      <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:14,marginBottom:18,alignItems:"start"}}>
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)",flex:1}}>Industries {selSector?`in ${selSector}`:""} ({industries.length})</div>
            <input value={indSearch} onChange={e=>setIndSearch(e.target.value)} placeholder="Search industry..." style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:6,color:"var(--t1)",fontSize:11,padding:"4px 9px",width:160}}/>
          </div>
          <div style={{maxHeight:440,overflowY:"auto"}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr>
                  {IND_COLS.map(c=>(
                    <th key={c.k} onClick={()=>setIndSort(p=>p.col===c.k?{col:c.k,dir:-p.dir}:{col:c.k,dir:-1})} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"7px 10px",fontSize:9,fontWeight:600,textTransform:"uppercase",color:indSort.col===c.k?"var(--acc)":"var(--t3)",textAlign:"left",cursor:"pointer",whiteSpace:"nowrap"}}>{c.l} {indSort.col===c.k?(indSort.dir===1?"↑":"↓"):""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {industries.slice(0,120).map((r,i)=>{
                  const c = sectorColor(r.Sector);
                  return (
                    <tr key={r.Sector+r.Industry+i} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                      <td style={{padding:"6px 10px",color:"var(--t1)",maxWidth:190,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Industry}>{r.Industry}{!selSector&&<div style={{fontSize:8.5,color:c}}>{r.Sector}</div>}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{r.Total_Stocks}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{r.Advance_Decline_Ratio}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--long)"}}>{r.Bullish_Score}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--short)"}}>{r.Bearish_Score}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",fontWeight:700,color:r.Net_Bias_Score>0?"var(--long)":r.Net_Bias_Score<0?"var(--short)":"var(--t2)"}}>{r.Net_Bias_Score>0?"+":""}{r.Net_Bias_Score}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t1)"}}>{r.Total_Signal_Count}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{r.Signal_Density}</td>
                      <td style={{padding:"6px 10px"}}><span style={{fontFamily:"var(--mono)",fontWeight:700,color:c}}>{r.Strength_Score.toFixed(1)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--b1)"}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)",marginBottom:8}}>NR Pattern Distribution {selSector?`— ${selSector}`:""}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
              {patternTypes.map(p=>(
                <button key={p} onClick={()=>setNrPattern(p)} style={{padding:"3px 9px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${nrPattern===p?(patternColor[p]||"var(--acc)"):"var(--b2)"}`,background:nrPattern===p?"var(--adim)":"var(--s2)",color:nrPattern===p?(patternColor[p]||"var(--acc)"):"var(--t2)"}}>{p}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(nrPatternTotals).sort((a,b)=>b[1]-a[1]).map(([p,v])=>(
                <div key={p} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{fontSize:9,fontFamily:"var(--mono)",color:patternColor[p]||"var(--t2)",fontWeight:700}}>{v}</div>
                  <div style={{width:36,height:Math.max(4,v/maxNrPattern*28),background:patternColor[p]||"var(--t3)",borderRadius:"2px 2px 0 0",opacity:.8}}/>
                  <div style={{fontSize:7.5,color:"var(--t3)",textAlign:"center",maxWidth:44,overflow:"hidden"}}>{p}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{maxHeight:330,overflowY:"auto"}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10.5}}>
              <thead><tr>{["Sector","Industry","Signal","Pattern","Count"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 9px",fontSize:8.5,fontWeight:600,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>
                {nrRows.map((r,i)=>(
                  <tr key={i} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"5px 9px",color:sectorColor(r.Sector),fontWeight:600,maxWidth:75,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Sector}>{r.Sector}</td>
                    <td style={{padding:"5px 9px",color:"var(--t2)",maxWidth:95,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Industry}>{r.Industry}</td>
                    <td style={{padding:"5px 9px",fontFamily:"var(--mono)",color:"var(--acc)",fontSize:9.5}}>{r.NR_Signal}</td>
                    <td style={{padding:"5px 9px",color:patternColor[r.Pattern_Type]||"var(--t2)"}}>{r.Pattern_Type}</td>
                    <td style={{padding:"5px 9px",fontFamily:"var(--mono)",fontWeight:700,color:"var(--t1)"}}>{r.Stock_Count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Stock browser */}
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)"}}>Stocks {selSector?`in ${selSector}`:"— All Sectors"} ({stockRows.length.toLocaleString()})</div>
          <input value={stockSearch} onChange={e=>setStockSearch(e.target.value)} placeholder="Search symbol or name..." style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:6,color:"var(--t1)",fontSize:11,padding:"4px 9px",width:200}}/>
          <TVCopyBtn symbols={stockRows.slice(0,500).map(r=>r.Symbol)} label={`⎘ Copy ${Math.min(stockRows.length,500)} TV`}/>
        </div>
        <div style={{maxHeight:380,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["Symbol","TV","Name","Industry","Mcap","Price","Chg%","Signals"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"7px 10px",fontSize:9,fontWeight:600,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {stockRows.slice(0,300).map(r=>{
                const sig = flatBySym[r.Symbol];
                const chg = +r.Change_Pct||0;
                const dominantBias = sig ? Object.entries(sig.bias).sort((a,b)=>b[1]-a[1])[0]?.[0] : null;
                return (
                  <tr key={r.Symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"6px 10px"}}><SymCell sym={r.Symbol}/></td>
                    <td style={{padding:"6px 10px"}}><TVCopyBtn symbols={[r.Symbol]} label="TV"/></td>
                    <td style={{padding:"6px 10px",color:"var(--t2)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Stock_Name}>{r.Stock_Name}</td>
                    <td style={{padding:"6px 10px",color:"var(--t3)",fontSize:10,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Industry}>{r.Industry}</td>
                    <td style={{padding:"6px 10px"}}><span style={{fontSize:9.5,color:MCAP_COLOR[r.Marketcap]||"var(--t3)"}}>{r.Marketcap}</span></td>
                    <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t1)"}}>{r.Price}</td>
                    <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:chg>0?"var(--long)":chg<0?"var(--short)":"var(--t2)"}}>{chg>0?"+":""}{r.Change_Pct}%</td>
                    <td style={{padding:"6px 10px"}}>{sig? <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontFamily:"var(--mono)",color:"var(--acc)"}}>{sig.count}</span>{dominantBias&&biasBadge(dominantBias,true)}</span> : <span style={{color:"var(--t3)"}}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stockRows.length>300 && <div style={{padding:10,textAlign:"center",fontSize:11,color:"var(--t3)"}}>... and {(stockRows.length-300).toLocaleString()} more — refine search to narrow down</div>}
        </div>
      </div>
    </div>
  );
}

// ─── MASTER LIST TAB (NEW) ─────────────────────────────────────────────────────
function MasterListTab({ db }) {
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ col:null, dir:1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const SLICER_COLS = ["Sector","Industry","Marketcap"];

  const getFilteredRows = useCallback((excludeCol=null)=>{
    return db.master.filter(row=>{
      for(const [col,vals] of Object.entries(filters)){
        if(col===excludeCol) continue;
        if(vals.size>0 && !vals.has(row[col])) return false;
      }
      if(search){ const q=search.toLowerCase(); if(!row.Symbol.toLowerCase().includes(q) && !row.Stock_Name.toLowerCase().includes(q)) return false; }
      return true;
    });
  },[db.master,filters,search]);

  const filtered = useMemo(()=>{
    let data = getFilteredRows();
    if(sort.col){
      data=[...data].sort((a,b)=>{
        const av=a[sort.col], bv=b[sort.col];
        const an=+av, bn=+bv;
        if(av!==""&&bv!==""&&!isNaN(an)&&!isNaN(bn)) return (an-bn)*sort.dir;
        return String(av).localeCompare(String(bv))*sort.dir;
      });
    }
    return data;
  },[getFilteredRows,sort]);

  const toggleFilter=(col,val)=>{ setFilters(prev=>{ const s=new Set(prev[col]||[]); s.has(val)?s.delete(val):s.add(val); if(!s.size){const n={...prev};delete n[col];return n;} return {...prev,[col]:s}; }); setPage(1); };
  const clearAll=()=>{ setFilters({}); setSearch(""); setPage(1); };

  const totalPg=Math.max(1,Math.ceil(filtered.length/pageSize));
  const cur=Math.min(page,totalPg);
  const pg=filtered.slice((cur-1)*pageSize,cur*pageSize);
  const filteredSyms=filtered.map(r=>r.Symbol);
  const chips=Object.entries(filters).flatMap(([col,vals])=>[...vals].map(v=>({col,v})));

  const COLS=[
    {k:"Symbol",l:"Symbol"},{k:"Stock_Name",l:"Name"},{k:"Sector",l:"Sector"},{k:"Industry",l:"Industry"},
    {k:"Marketcap",l:"Mcap"},{k:"Price",l:"Price"},{k:"Change_Pct",l:"Chg %"},{k:"Volume",l:"Volume"},
  ];

  return (
    <div style={{display:"flex",minHeight:"calc(100vh - 108px)"}}>
      <div style={{width:220,flexShrink:0,background:"var(--s1)",borderRight:"1px solid var(--b1)",padding:8,position:"sticky",top:108,height:"calc(100vh - 108px)",overflowY:"auto"}} className="tower-scroll">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:10.5,fontWeight:600,color:"var(--t2)",textTransform:"uppercase",letterSpacing:"1px"}}>Filters</span>
          <button onClick={clearAll} style={{background:"var(--s2)",border:"1px solid var(--b2)",color:"var(--t2)",padding:"2px 8px",borderRadius:5,fontSize:10}}>Clear</button>
        </div>
        {SLICER_COLS.map(col=>{
          const active=filters[col];
          const baseRows=getFilteredRows(col), valCounts={};
          baseRows.forEach(r=>{const v=r[col]||"";valCounts[v]=(valCounts[v]||0)+1;});
          const vals=Object.entries(valCounts).sort((a,b)=>b[1]-a[1]);
          return (
            <div key={col} style={{marginBottom:10}}>
              <div style={{fontSize:10.5,fontWeight:600,color:"var(--t1)",marginBottom:4}}>{col}</div>
              <div style={{maxHeight:170,overflowY:"auto"}} className="tower-scroll">
                {vals.map(([v,cnt])=>{
                  const sel=active&&active.has(v);
                  const swatch = col==="Sector" ? sectorColor(v) : (col==="Marketcap" ? (MCAP_COLOR[v]||"var(--t3)") : null);
                  return (
                    <div key={v} onClick={()=>toggleFilter(col,v)} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 6px",borderRadius:4,cursor:"pointer",background:sel?"var(--adim)":"transparent"}}>
                      <div style={{width:11,height:11,border:`1.5px solid ${sel?"var(--acc)":"var(--b2)"}`,borderRadius:3,background:sel?"var(--acc)":"transparent",flexShrink:0}}/>
                      {swatch&&<div style={{width:6,height:6,borderRadius:999,background:swatch,flexShrink:0}}/>}
                      <div style={{fontSize:10.5,color:swatch||"var(--t1)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={v}>{v||"(empty)"}</div>
                      <div style={{fontSize:9,color:"var(--t3)",fontFamily:"var(--mono)"}}>{cnt}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid var(--b1)",background:"var(--s1)",flexWrap:"wrap"}}>
          <div style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--t2)"}}>Showing <strong style={{color:"var(--acc)"}}>{filtered.length.toLocaleString()}</strong> of {db.master.length.toLocaleString()}</div>
          <TVCopyBtn symbols={filteredSyms.slice(0,500)} label={`⎘ Copy ${Math.min(filteredSyms.length,500)} TV`}/>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {chips.map(({col,v})=>(
              <span key={col+v} onClick={()=>toggleFilter(col,v)} style={{background:"var(--adim)",border:"1px solid var(--acc)",color:"var(--acc)",padding:"2px 7px",borderRadius:4,fontSize:9.5,cursor:"pointer"}}>{col}: {v} ✕</span>
            ))}
          </div>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search symbol or name..." style={{marginLeft:"auto",background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:7,color:"var(--t1)",fontSize:11.5,padding:"5px 12px",width:200}}/>
        </div>
        <div style={{overflow:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              {COLS.map(c=>(
                <th key={c.k} onClick={()=>setSort(p=>p.col===c.k?{col:c.k,dir:-p.dir}:{col:c.k,dir:1})} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"8px 10px",fontSize:10,fontWeight:600,textTransform:"uppercase",color:sort.col===c.k?"var(--acc)":"var(--t2)",textAlign:"left",cursor:"pointer",whiteSpace:"nowrap"}}>{c.l} {sort.col===c.k?(sort.dir===1?"↑":"↓"):"⇅"}</th>
              ))}
            </tr></thead>
            <tbody>
              {pg.map(r=>{
                const chg=+r.Change_Pct||0;
                return (
                  <tr key={r.Symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"6px 10px"}}><SymCell sym={r.Symbol}/></td>
                    <td style={{padding:"6px 10px",color:"var(--t2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Stock_Name}>{r.Stock_Name}</td>
                    <td style={{padding:"6px 10px",color:sectorColor(r.Sector),fontWeight:600}}>{r.Sector}</td>
                    <td style={{padding:"6px 10px",color:"var(--t3)",fontSize:10.5,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.Industry}>{r.Industry}</td>
                    <td style={{padding:"6px 10px"}}><span style={{fontSize:10,color:MCAP_COLOR[r.Marketcap]||"var(--t3)"}}>{r.Marketcap}</span></td>
                    <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t1)"}}>{r.Price}</td>
                    <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:chg>0?"var(--long)":chg<0?"var(--short)":"var(--t2)"}}>{chg>0?"+":""}{r.Change_Pct}%</td>
                    <td style={{padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{(+r.Volume||0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:7,borderTop:"1px solid var(--b1)",background:"var(--s1)"}}>
          {[["«",1],["‹",cur-1]].map(([l,t])=><button key={l} disabled={cur<=1} onClick={()=>setPage(Math.max(1,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:cur<=1?.3:1,cursor:cur<=1?"default":"pointer"}}>{l}</button>)}
          <span style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--mono)",margin:"0 4px"}}>Page {cur} / {totalPg}</span>
          {[["›",cur+1],["»",totalPg]].map(([l,t])=><button key={l} disabled={cur>=totalPg} onClick={()=>setPage(Math.min(totalPg,t))} style={{background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 10px",borderRadius:5,fontSize:11,opacity:cur>=totalPg?.3:1,cursor:cur>=totalPg?"default":"pointer"}}>{l}</button>)}
          <select value={pageSize} onChange={e=>{setPageSize(+e.target.value);setPage(1);}} style={{marginLeft:"auto",background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t2)",padding:"4px 7px",borderRadius:5,fontSize:11}}>
            {[25,50,100,200].map(n=><option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── TREND & VERSIONS TAB (NEW — only shown when multiple files are loaded) ────
function dominantBiasMap(db) {
  const counts = {};
  db.flat.forEach(r=>{
    if(!counts[r.Symbol]) counts[r.Symbol]={};
    counts[r.Symbol][r.Trading_Bias] = (counts[r.Symbol][r.Trading_Bias]||0)+1;
  });
  const m={};
  Object.entries(counts).forEach(([sym,c])=>{ m[sym]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]; });
  return m;
}
function computeStreaks(versions, getSymbolSet) {
  const sets = versions.map(v=>getSymbolSet(v.db));
  const allSyms = new Set();
  sets.forEach(s=>s.forEach(sym=>allSyms.add(sym)));
  const out = [];
  allSyms.forEach(sym=>{
    let streak=0;
    for(let i=sets.length-1;i>=0;i--){ if(sets[i].has(sym)) streak++; else break; }
    if(streak>0) out.push({ symbol:sym, streak, presentNow: sets[sets.length-1].has(sym) });
  });
  return out.filter(r=>r.presentNow).sort((a,b)=>b.streak-a.streak);
}

function TrendLineChart({ series, labels, height=220 }) {
  const w=640, h=height, pad={l:38,r:16,t:14,b:26};
  const allVals = series.flatMap(s=>s.values.filter(v=>v!=null&&!isNaN(v)));
  if (!allVals.length) return <div style={{padding:"20px 0",textAlign:"center",color:"var(--t3)",fontSize:11}}>Not enough data</div>;
  let yMin = Math.min(...allVals,0), yMax = Math.max(...allVals,1);
  if (yMin===yMax) { yMin-=1; yMax+=1; }
  const xStep = (w-pad.l-pad.r)/Math.max(labels.length-1,1);
  const xScale = i => pad.l + i*xStep;
  const yScale = v => h-pad.b - (v-yMin)/((yMax-yMin)||1)*(h-pad.t-pad.b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"auto",display:"block"}}>
      {[0,0.25,0.5,0.75,1].map(f=>{
        const v = yMin + f*(yMax-yMin);
        return (
          <g key={f}>
            <line x1={pad.l} x2={w-pad.r} y1={yScale(v)} y2={yScale(v)} stroke="var(--b1)" strokeWidth="1"/>
            <text x={pad.l-6} y={yScale(v)+3} textAnchor="end" fontSize="8.5" fill="var(--t3)" fontFamily="IBM Plex Mono">{v.toFixed(0)}</text>
          </g>
        );
      })}
      {labels.map((l,i)=>(
        <text key={i} x={xScale(i)} y={h-6} textAnchor="middle" fontSize="8" fill="var(--t3)">{l}</text>
      ))}
      {series.map(s=>{
        const pts = s.values.map((v,i)=>(v==null||isNaN(v))?null:[xScale(i),yScale(v)]).filter(Boolean);
        if (!pts.length) return null;
        const path = pts.map((p,i)=>(i===0?"M":"L")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={s.color} strokeWidth="2"/>
            {pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="3" fill={s.color}/>)}
          </g>
        );
      })}
    </svg>
  );
}

function TrendVersionsTab({ versions, activeIdx, onSelectVersion }) {
  const n = versions.length;
  const latest = versions[n-1];
  const prev = versions[n-2];
  const labels = versions.map((v,i)=>v.dateLabel || v.fileName.replace(/\.(xlsx|xls)$/i,"").slice(0,14) || `V${i+1}`);
  const [streakMode, setStreakMode] = useState("opp");
  const vstats = useMemo(()=>computeVersionStats(versions), [versions]);

  const deltaStats = useMemo(()=>{
    if(!prev) return [];
    const symsL = new Set(latest.db.flat.map(r=>r.Symbol));
    const symsP = new Set(prev.db.flat.map(r=>r.Symbol));
    const mk = (label,l,p) => ({ label, latest:l, prev:p, delta:l-p });
    return [
      mk("Total Stocks", symsL.size, symsP.size),
      mk("Signal Rows", latest.db.flat.length, prev.db.flat.length),
      mk("Opportunities", latest.db.top.length, prev.db.top.length),
      mk("FNO Active", new Set(latest.db.flat.filter(r=>r.Is_FNO==="Yes").map(r=>r.Symbol)).size, new Set(prev.db.flat.filter(r=>r.Is_FNO==="Yes").map(r=>r.Symbol)).size),
      mk("Strong Conviction", latest.db.strong.length, prev.db.strong.length),
      mk("Multi-TF NR", latest.db.mtnr.length, prev.db.mtnr.length),
      mk("Virgin Events", latest.db.virgin.length, prev.db.virgin.length),
    ];
  },[latest,prev]);

  const sectorTrend = useMemo(()=>{
    const names = new Set();
    versions.forEach(v=>v.db.sectorAnalysis.forEach(s=>names.add(s.Sector)));
    const rows = [...names].map(sec=>{
      const seriesVals = versions.map(v=>{ const s=v.db.sectorAnalysis.find(x=>x.Sector===sec); return s?s.Strength_Score:null; });
      const known = seriesVals.filter(v=>v!=null);
      const delta = known.length>=2 ? known[known.length-1]-known[0] : 0;
      return { sector:sec, series:seriesVals, delta, lastVal: known.length?known[known.length-1]:0 };
    });
    return rows;
  },[versions]);
  const gainers = [...sectorTrend].sort((a,b)=>b.delta-a.delta).filter(r=>r.delta>0).slice(0,5);
  const decliners = [...sectorTrend].sort((a,b)=>a.delta-b.delta).filter(r=>r.delta<0).slice(0,5);

  const oppNew = useMemo(()=>{
    if(!prev) return [];
    const symsL=new Set(latest.db.top.map(r=>r.Symbol)), symsP=new Set(prev.db.top.map(r=>r.Symbol));
    return [...symsL].filter(s=>!symsP.has(s));
  },[latest,prev]);
  const oppFaded = useMemo(()=>{
    if(!prev) return [];
    const symsL=new Set(latest.db.top.map(r=>r.Symbol)), symsP=new Set(prev.db.top.map(r=>r.Symbol));
    return [...symsP].filter(s=>!symsL.has(s));
  },[latest,prev]);

  const biasFlips = useMemo(()=>{
    if(!prev) return [];
    const mapL=dominantBiasMap(latest.db), mapP=dominantBiasMap(prev.db);
    const out=[];
    Object.keys(mapL).forEach(sym=>{ if(mapP[sym] && mapP[sym]!==mapL[sym]) out.push({ symbol:sym, from:mapP[sym], to:mapL[sym] }); });
    return out.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  },[latest,prev]);

  const streakConfigs = {
    opp:  { label:"Top Opportunities", color:"var(--acc)", data:computeStreaks(versions, db=>new Set(db.top.map(r=>r.Symbol))) },
    conv: { label:"Strong Conviction", color:"var(--mixed)", data:computeStreaks(versions, db=>new Set(db.strong.map(r=>r.Symbol))) },
    mtnr: { label:"Multi-TF NR (coiling)", color:"var(--a2)", data:computeStreaks(versions, db=>new Set(db.mtnr.map(r=>r.Symbol))) },
  };
  const streakData = streakConfigs[streakMode].data.slice(0,20);

  const DeltaCard = ({ d }) => {
    const up = d.delta>0, down = d.delta<0;
    const c = up?"var(--long)":down?"var(--short)":"var(--t3)";
    return (
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:10.5,color:"var(--t2)",marginBottom:4}}>{d.label}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <div style={{fontFamily:"var(--mono)",fontSize:19,fontWeight:700,color:"var(--t1)"}}>{d.latest.toLocaleString()}</div>
          <div style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:c}}>{up?"▲":down?"▼":"•"} {Math.abs(d.delta).toLocaleString()}</div>
        </div>
        <div style={{fontSize:9,color:"var(--t3)",marginTop:2}}>was {d.prev.toLocaleString()}</div>
      </div>
    );
  };

  return (
    <div style={{padding:"18px 22px"}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:700,color:"var(--t1)"}}>📈 Trend &amp; Version Comparison</div>
        <div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>{n} versions loaded · comparing continuation of trend across your saved exports</div>
      </div>

      {/* Version timeline */}
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px",marginBottom:18}}>
        <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:10}}>🕐 Versions — click to view that file's full dashboard in every other tab</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {versions.map((v,i)=>{
            const active = i===activeIdx;
            const syms = new Set(v.db.flat.map(r=>r.Symbol));
            return (
              <React.Fragment key={v.fileName+i}>
                <div className="version-chip" onClick={()=>onSelectVersion(i)} style={{
                  cursor:"pointer", background: active?"var(--adim)":"var(--s2)",
                  border:`1px solid ${active?"var(--acc)":"var(--b1)"}`, borderRadius:9, padding:"9px 13px", minWidth:120,
                }}>
                  <div style={{fontSize:11,fontWeight:700,color:active?"var(--acc)":"var(--t1)",whiteSpace:"nowrap"}}>{v.dateLabel || `Version ${i+1}`}</div>
                  <div style={{fontSize:9,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}} title={v.fileName}>{v.fileName}</div>
                  <div style={{fontSize:9.5,color:"var(--t2)",marginTop:3,fontFamily:"var(--mono)"}}>{syms.size} stk · {v.db.top.length} opp</div>
                  {i===n-1 && <div style={{fontSize:8,color:"var(--long)",marginTop:2,fontWeight:700}}>LATEST</div>}
                </div>
                {i<n-1 && <div style={{color:"var(--t3)",fontSize:14}}>→</div>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Headline deltas */}
      {prev ? (
        <>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:600,marginBottom:8}}>Headline Deltas — {labels[n-1]} vs {labels[n-2]}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:20}}>
            {deltaStats.map(d=><DeltaCard key={d.label} d={d}/>)}
          </div>
        </>
      ) : null}

      <TrendAnalyticsA versions={versions} labels={labels} vstats={vstats}/>

      {/* Sector strength trend */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20,alignItems:"start"}}>
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)",marginBottom:2}}>📈 Top Improving Sectors</div>
          <div style={{fontSize:10,color:"var(--t3)",marginBottom:10}}>strength score, {labels[0]} → {labels[n-1]}</div>
          <TrendLineChart labels={labels} series={gainers.map(g=>({name:g.sector,color:sectorColor(g.sector),values:g.series}))}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            {gainers.map(g=>(
              <div key={g.sector} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:sectorColor(g.sector)}}/>
                <span style={{fontSize:10,color:"var(--t2)"}}>{g.sector}</span>
                <span style={{fontSize:10,fontFamily:"var(--mono)",color:"var(--long)",fontWeight:700}}>+{g.delta.toFixed(1)}</span>
              </div>
            ))}
            {!gainers.length && <span style={{fontSize:11,color:"var(--t3)"}}>No sector improved across this window</span>}
          </div>
        </div>
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)",marginBottom:2}}>📉 Top Weakening Sectors</div>
          <div style={{fontSize:10,color:"var(--t3)",marginBottom:10}}>strength score, {labels[0]} → {labels[n-1]}</div>
          <TrendLineChart labels={labels} series={decliners.map(g=>({name:g.sector,color:sectorColor(g.sector),values:g.series}))}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            {decliners.map(g=>(
              <div key={g.sector} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:sectorColor(g.sector)}}/>
                <span style={{fontSize:10,color:"var(--t2)"}}>{g.sector}</span>
                <span style={{fontSize:10,fontFamily:"var(--mono)",color:"var(--short)",fontWeight:700}}>{g.delta.toFixed(1)}</span>
              </div>
            ))}
            {!decliners.length && <span style={{fontSize:11,color:"var(--t3)"}}>No sector weakened across this window</span>}
          </div>
        </div>
      </div>

      <TrendAnalyticsB versions={versions} labels={labels} vstats={vstats}/>

      {/* Continuation watchlist */}
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t1)",flex:1}}>💪 Continuation Watchlist — persisted across consecutive versions</div>
          <div style={{display:"flex",gap:4}}>
            {Object.entries(streakConfigs).map(([k,c])=>(
              <button key={k} onClick={()=>setStreakMode(k)} style={{padding:"4px 10px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${streakMode===k?c.color:"var(--b2)"}`,background:streakMode===k?`${c.color}18`:"var(--s2)",color:streakMode===k?c.color:"var(--t2)"}}>{c.label}</button>
            ))}
          </div>
          <ListCopy symbols={streakData.map(r=>r.symbol)}/>
        </div>
        <div style={{maxHeight:320,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>{["#","Symbol","TV","Streak","Present In"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"7px 12px",fontSize:9,fontWeight:600,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {streakData.map((r,i)=>(
                <tr key={r.symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"6px 12px",color:"var(--t3)",fontFamily:"var(--mono)"}}>{i+1}</td>
                  <td style={{padding:"6px 12px"}}><SymCell sym={r.symbol}/></td>
                  <td style={{padding:"6px 12px"}}><TVCopyBtn symbols={[r.symbol]} label="TV"/></td>
                  <td style={{padding:"6px 12px"}}>
                    <span style={{fontFamily:"var(--mono)",fontWeight:700,color:streakConfigs[streakMode].color}}>{r.streak}</span>
                    <span style={{fontSize:9.5,color:"var(--t3)"}}> / {n} versions</span>
                  </td>
                  <td style={{padding:"6px 12px"}}>
                    <div style={{display:"flex",gap:3}}>
                      {versions.map((v,vi)=>(
                        <div key={vi} title={v.dateLabel||v.fileName} style={{width:14,height:6,borderRadius:2,background:vi>=n-r.streak?streakConfigs[streakMode].color:"var(--s3)"}}/>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!streakData.length && <tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"var(--t3)"}}>No persisting stocks found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* New entrants / faded + bias flips */}
      {prev && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"11px 15px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--long)"}}>🆕 New Entrants ({oppNew.length})</div>
              <ListCopy symbols={oppNew}/>
            </div>
            <div style={{maxHeight:260,overflowY:"auto",padding:"6px 10px"}} className="tower-scroll">
              {oppNew.length ? oppNew.map(s=>(
                <div key={s} style={{padding:"4px 0",borderBottom:"1px solid var(--b1)"}}><SymCell sym={s}/></div>
              )) : <div style={{color:"var(--t3)",fontSize:11,padding:"10px 0"}}>None — no new opportunities vs {labels[n-2]}</div>}
            </div>
          </div>
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"11px 15px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--short)"}}>👋 Faded Signals ({oppFaded.length})</div>
              <ListCopy symbols={oppFaded}/>
            </div>
            <div style={{maxHeight:260,overflowY:"auto",padding:"6px 10px"}} className="tower-scroll">
              {oppFaded.length ? oppFaded.map(s=>(
                <div key={s} style={{padding:"4px 0",borderBottom:"1px solid var(--b1)"}}><SymCell sym={s}/></div>
              )) : <div style={{color:"var(--t3)",fontSize:11,padding:"10px 0"}}>None dropped out since {labels[n-2]}</div>}
            </div>
          </div>
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"11px 15px",borderBottom:"1px solid var(--b1)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--ret)"}}>🔄 Bias Flips ({biasFlips.length})</div>
              <ListCopy symbols={biasFlips.map(r=>r.symbol)}/>
            </div>
            <div style={{maxHeight:260,overflowY:"auto",padding:"6px 10px"}} className="tower-scroll">
              {biasFlips.length ? biasFlips.map(r=>(
                <div key={r.symbol} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:"1px solid var(--b1)"}}>
                  <div style={{width:76,flexShrink:0}}><SymCell sym={r.symbol}/></div>
                  {biasBadge(r.from,true)}<span style={{color:"var(--t3)",fontSize:10}}>→</span>{biasBadge(r.to,true)}
                </div>
              )) : <div style={{color:"var(--t3)",fontSize:11,padding:"10px 0"}}>No bias reversals since {labels[n-2]}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FOCUS ENGINE ─────────────────────────────────────────────────────────────
const FOCUS_TFS = ["D","W","M","Q","Y"];
const TF_NAME = { D:"Daily", W:"Weekly", M:"Monthly", Q:"Quarterly", Y:"Yearly" };
const TF_WEIGHT = { D:1, W:2, M:3, Q:4, Y:5 };
const EVENT_META = {
  BREAKOUT:  { kind:"TRIGGER", w:1.0,  label:"NR Breakout" },
  BREAKDOWN: { kind:"TRIGGER", w:1.0,  label:"NR Breakdown" },
  CROSS:     { kind:"TRIGGER", w:1.0,  label:"Zone Cross" },
  VIRGIN:    { kind:"TRIGGER", w:1.2,  label:"Virgin Break" },
  FLAG:      { kind:"TRIGGER", w:0.9,  label:"Flag Break" },
  STATE:     { kind:"STATE",   w:0.6,  label:"Holding Zone" },
  PULLBACK:  { kind:"PULLBACK",w:0.5,  label:"Pullback" },
  RECLAIM:   { kind:"TRIGGER", w:0.7,  label:"Back to NR" },
  NEAR:      { kind:"SETUP",   w:0.35, label:"Near Level" },
};
const TF_WORDS = { daily:"D", weekly:"W", monthly:"M", quarterly:"Q", quaterly:"Q", yearly:"Y" };

function tfRefsIn(s) {
  const out = [];
  const re = /(daily|weekly|monthly|quarterly|quaterly|yearly)|(?:^|_)([dwmqy])_?z(?=_|$|[hl])/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) out.push(TF_WORDS[m[1]]);
    else if (m[2]) out.push(m[2].toUpperCase());
  }
  return out;
}

const _sigCache = {};
function classifySignal(row) {
  const name = row.Signal_Name, key = name + "|" + row.Signal_Type + "|" + row.Timeframe;
  if (_sigCache[key]) return _sigCache[key];
  const nl = name.toLowerCase();
  const type = row.Signal_Type;
  let tf = null, event = "STATE", dir = 0;

  if (row.Signal_Category === "NR_PATTERN") {
    tf = { Daily:"D", Weekly:"W", Monthly:"M", Quarterly:"Q", Yearly:"Y" }[row.Timeframe] || (nl[0] ? nl[0].toUpperCase() : "D");
    if (type === "Breakout")        { event="BREAKOUT";  dir=1; }
    else if (type === "Breakdown")  { event="BREAKDOWN"; dir=-1; }
    else if (type === "Near High")  { event="NEAR";      dir=1; }
    else if (type === "Near Low")   { event="NEAR";      dir=-1; }
    else if (type === "Back to NR") { event="RECLAIM";   dir=1; }
  } else if (nl.includes("virgin")) {
    tf = nl.includes("year") ? "Y" : nl.includes("quarter") ? "Q" : nl.includes("month") ? "M" : "W";
    event = "VIRGIN"; dir = nl.includes("breakout") ? 1 : -1;
  } else if (nl.startsWith("last_")) {
    tf = nl.includes("mon") ? "M" : nl.includes("wk") ? "W" : "D";
    if (nl.includes("nearto")) { event = "PULLBACK"; dir = nl.includes("up_trend") ? 1 : -1; }
    else { event = "FLAG"; dir = nl.includes("broakup") || nl.includes("breakup") ? 1 : -1; }
  } else {
    const idx = nl.indexOf("close");
    const tail = idx >= 0 ? nl.slice(idx + 5) : nl;
    const refs = tfRefsIn(tail);
    if (refs.length) {
      tf = nl.includes("overlap") ? refs.reduce((a,b)=>TF_WEIGHT[b]>TF_WEIGHT[a]?b:a) : refs[0];
    } else tf = "D";
    if (type === "RETRACEMENT") {
      event = "PULLBACK";
      dir = (/near(_and)?_abv/.test(nl) || /near_[dwmqy]z_low/.test(nl)) ? 1 : -1;
    } else {
      dir = type === "LONG" ? 1 : type === "SHORT" ? -1 : 0;
      if (nl.includes("cro") || nl.includes("csd")) event = "CROSS";
      else if (nl.includes("near")) event = "NEAR";
      else event = "STATE";
    }
  }
  const res = { tf, event, dir, kind: EVENT_META[event].kind, w: EVENT_META[event].w };
  _sigCache[key] = res;
  return res;
}

function humanizeSignal(row) {
  const c = classifySignal(row);
  const n = row.Signal_Name;
  if (row.Signal_Category === "NR_PATTERN") {
    const m = n.match(/_(\d+)[DWMQY]_/i);
    const len = m ? m[1] : "";
    const verb = { BREAKOUT:"broke out of", BREAKDOWN:"broke down from", NEAR: c.dir>0?"is pressing the top of":"is sitting at the bottom of", RECLAIM:"broke below then reclaimed" }[c.event] || "is in";
    return `${TF_NAME[c.tf]} — price ${verb} a ${len}-${TF_NAME[c.tf].toLowerCase().replace("ly","").replace("dai","day")} narrow range`;
  }
  let t = n.replace(/_/g," ")
    .replace(/\babv\b/gi,"above").replace(/\bblw\b/gi,"below").replace(/\bcsd\b|\bcro\b/gi,"crossed")
    .replace(/\bcls\b/gi,"close").replace(/\bmn\b/gi,"monthly").replace(/\bzn\b/gi,"zone")
    .replace(/broakup/gi,"breakup").replace(/quaterly/gi,"quarterly").replace(/\bnearto\b/gi,"near")
    .replace(/\bwk\b/gi,"week").replace(/\bmon\b/gi,"month");
  return `${TF_NAME[c.tf]} level — ${t}`;
}

function buildFocusModel(db, presence=null, nFiles=1) {
  const secMap = {};
  db.sectorAnalysis.forEach(s => { secMap[s.Sector] = s; });
  const strongSet = new Set(db.strong.map(r=>r.Symbol));
  const mtnrMap = {}; db.mtnr.forEach(r=>{ mtnrMap[r.Symbol]=r; });
  const virginMap = {}; db.virgin.forEach(r=>{ virginMap[r.Symbol]=r; });

  const stocks = {};
  db.flat.forEach(r => {
    const c = classifySignal(r);
    if (!stocks[r.Symbol]) {
      const tfs = {};
      FOCUS_TFS.forEach(t => { tfs[t] = { bull:0, bear:0, triggersUp:0, triggersDn:0, setupsUp:0, setupsDn:0, signals:[] }; });
      stocks[r.Symbol] = { symbol:r.Symbol, sector:r.Sector, industry:r.Industry, name:r.Stock_Name, price:r.Price, chg:r.Change_Pct,
        isFNO:r.Is_FNO==="Yes", isN500:r.Is_Nifty_500==="Yes", tfs, signals:[], bullW:0, bearW:0 };
    }
    const s = stocks[r.Symbol];
    const cell = s.tfs[c.tf];
    const weight = TF_WEIGHT[c.tf] * c.w;
    const sig = { name:r.Signal_Name, tf:c.tf, event:c.event, kind:c.kind, dir:c.dir, text:humanizeSignal(r) };
    cell.signals.push(sig); s.signals.push(sig);
    if (c.dir > 0) { cell.bull += c.w; s.bullW += weight; if (c.kind==="TRIGGER") cell.triggersUp++; if (c.kind==="SETUP") cell.setupsUp++; }
    if (c.dir < 0) { cell.bear += c.w; s.bearW += weight; if (c.kind==="TRIGGER") cell.triggersDn++; if (c.kind==="SETUP") cell.setupsDn++; }
  });

  const list = Object.values(stocks).map(s => {
    const tot = s.bullW + s.bearW;
    const net = tot ? (s.bullW - s.bearW) / tot : 0;
    const dir = Math.abs(net) < 0.2 ? "MIXED" : net > 0 ? "LONG" : "SHORT";
    const sgn = net >= 0 ? 1 : -1;
    const ladder = {};
    FOCUS_TFS.forEach(t => {
      const c = s.tfs[t];
      const v = c.bull - c.bear;
      ladder[t] = { net:v, state: v>0.01?1:v<-0.01?-1:0, trig: sgn>0?c.triggersUp:c.triggersDn, setup: sgn>0?c.setupsUp:c.setupsDn, count:c.signals.length };
    });
    let alignedW = 0, opposedW = 0, alignedTfs = [];
    FOCUS_TFS.forEach(t => {
      if (ladder[t].state === sgn) { alignedW += TF_WEIGHT[t]; alignedTfs.push(t); }
      else if (ladder[t].state === -sgn) opposedW += TF_WEIGHT[t];
    });
    const trigTfs = FOCUS_TFS.filter(t => ladder[t].trig > 0 && ladder[t].state === sgn);
    const setupTfs = FOCUS_TFS.filter(t => ladder[t].setup > 0 && ladder[t].state === sgn);
    const htfTrig = trigTfs.filter(t => TF_WEIGHT[t] >= 3);
    const ltfTrig = trigTfs.filter(t => TF_WEIGHT[t] <= 2);
    const htfState = alignedTfs.filter(t => TF_WEIGHT[t] >= 3);
    const ltfState = alignedTfs.filter(t => TF_WEIGHT[t] <= 2);
    const nDirSignals = s.signals.filter(x => x.dir === sgn).length;

    const sec = secMap[s.sector];
    const secStrength = sec ? sec.Strength_Score : 50;
    const secAlign = Math.max(-1, Math.min(1, sgn > 0 ? (secStrength-50)/30 : (50-secStrength)/30));

    const comp = {
      confluence: alignedW / 15 * 30,
      trigger: (htfTrig.length ? 12 + Math.min(htfTrig.length-1,2)*2 : 0) + (ltfTrig.length ? 8 : 0),
      intensity: Math.min(1, Math.log(1+nDirSignals)/Math.log(21)) * 15,
      sector: secAlign * 10,
      extras: (strongSet.has(s.symbol)?5:0) + (virginMap[s.symbol]?5:0) + (mtnrMap[s.symbol]?3:0) + (s.isFNO?2:0),
      persistence: (nFiles>1 && presence) ? ((presence[s.symbol]||1)-1)/(nFiles-1)*6 : 0,
      conflict: -(opposedW / 15) * 20,
    };
    let score = Object.values(comp).reduce((a,b)=>a+b,0);
    if (dir === "MIXED") score *= 0.6;
    score = Math.max(0, Math.min(100, score));

    const topTf = alignedTfs.length ? alignedTfs.reduce((a,b)=>TF_WEIGHT[b]>TF_WEIGHT[a]?b:a) : null;
    const horizon = !topTf ? "—" : TF_WEIGHT[topTf] >= 4 ? "Investment" : TF_WEIGHT[topTf] === 3 ? "Positional" : "Swing";

    const reasons = [];
    if (htfTrig.length && ltfTrig.length) reasons.push(`${htfTrig.join("+")} trigger + ${ltfTrig.join("+")} trigger`);
    else if (htfTrig.length) reasons.push(`${htfTrig.join("+")} trigger`);
    else if (ltfTrig.length) reasons.push(`${ltfTrig.join("+")} trigger`);
    if (alignedTfs.length >= 3) reasons.push(`${alignedTfs.length}/5 TFs aligned`);
    if (secAlign > 0.3) reasons.push(`${s.sector} ${sgn>0?"tailwind":"weakness"}`);
    if (secAlign < -0.3) reasons.push(`against ${s.sector} trend`);
    if (virginMap[s.symbol]) reasons.push("virgin level");
    if (strongSet.has(s.symbol)) reasons.push("strong conviction");
    if (mtnrMap[s.symbol]) reasons.push(`coiled ${mtnrMap[s.symbol].Timeframe_Count}-TF NR`);
    const persist = presence ? (presence[s.symbol]||1) : 1;
    if (nFiles>1) reasons.push(`seen in ${persist}/${nFiles} files`);

    return { ...s, persist, nFiles, net, dir, sgn, ladder, alignedTfs, trigTfs, setupTfs, htfTrig, ltfTrig, htfState, ltfState,
      nDirSignals, secStrength, secAlign, comp, score, horizon, reasons, opposedW, alignedW,
      isStrong: strongSet.has(s.symbol), virgin: virginMap[s.symbol] || null, mtnr: mtnrMap[s.symbol] || null };
  });
  list.sort((a,b)=>b.score-a.score);
  return { list, secMap };
}

// ─── FOCUS COMMAND — UI ───────────────────────────────────────────────────────
const FOCUS_TIERS = [
  { key:"act",   min:55, label:"Act Now",    color:"var(--acc)",   desc:"Multiple timeframes agree AND fresh triggers fired. These are today's first charts to open." },
  { key:"prep",  min:42, label:"Prepare",    color:"var(--mixed)", desc:"Good structure but one piece is missing (trigger, alignment or sector). Build the plan, wait for confirmation." },
  { key:"watch", min:28, label:"Watch",      color:"var(--ret)",   desc:"Something is forming. Keep on a watchlist — no action yet." },
  { key:"bg",    min:0,  label:"Background", color:"var(--t3)",    desc:"Noise for today. Deliberately ignore these to protect your attention." },
];
const tierOf = score => FOCUS_TIERS.find(t => score >= t.min) || FOCUS_TIERS[3];
const dirColor = d => d==="LONG" ? "var(--long)" : d==="SHORT" ? "var(--short)" : "var(--mixed)";
const COMP_META = [
  { k:"confluence", label:"TF Confluence", color:"var(--acc)" },
  { k:"trigger",    label:"Fresh Triggers", color:"var(--long)" },
  { k:"intensity",  label:"Signal Intensity", color:"var(--a2)" },
  { k:"sector",     label:"Sector Tailwind", color:"var(--ret)" },
  { k:"extras",     label:"Conviction / Virgin / Coil / FNO", color:"var(--mixed)" },
  { k:"persistence", label:"Persistence across files", color:"#38bdf8" },
  { k:"conflict",   label:"Opposing TFs (penalty)", color:"var(--short)" },
];

function PlainCopyBtn({ symbols, label }) {
  const [copied, setCopied] = useState(false);
  const text = symbols.join(",");
  return (
    <button className={`tv-copy-btn${copied?" copied":""}`} title={`Copy comma-separated: ${text.slice(0,60)}${text.length>60?"...":""}`}
      onClick={e=>{e.stopPropagation();copyToClipboard(text);setCopied(true);setTimeout(()=>setCopied(false),1400);}}
      style={{color:copied?"var(--long)":"var(--t2)",borderColor:copied?"var(--long)":"var(--b2)"}}>
      {copied?"✓ Copied":(label||`⎘ Copy ${symbols.length}`)}
    </button>
  );
}
function ListCopy({ symbols, compact=false }) {
  const syms = [...new Set((symbols||[]).filter(Boolean))];
  if (!syms.length) return null;
  return (
    <span style={{display:"inline-flex",gap:4,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
      <PlainCopyBtn symbols={syms} label={compact?"⎘":undefined}/>
      <TVCopyBtn symbols={syms} label={compact?"TV":`⎘ TV ${syms.length}`}/>
    </span>
  );
}

function InfoTip({ children }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const show = pinned || hover;
  return (
    <span style={{position:"relative",display:"inline-flex",verticalAlign:"middle",marginLeft:6}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <button onClick={e=>{e.stopPropagation();setPinned(p=>!p);}} title={pinned?"Click to close":"Click to pin"} aria-label="Info"
        style={{width:16,height:16,borderRadius:999,fontSize:10,fontWeight:700,fontStyle:"italic",fontFamily:"Georgia,serif",lineHeight:"14px",textAlign:"center",padding:0,
          border:`1px solid ${show?"var(--acc)":"var(--b2)"}`,color:show?"var(--acc)":"var(--t3)",background:show?"var(--adim)":"transparent"}}>i</button>
      {show && (
        <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:22,left:-8,zIndex:400,width:"min(340px,80vw)",background:"var(--s1)",border:"1px solid var(--accborder)",borderRadius:9,
          padding:"10px 12px",fontSize:11.5,fontWeight:400,fontStyle:"normal",color:"var(--t1)",lineHeight:1.65,boxShadow:"0 10px 30px var(--shadow)",textAlign:"left",whiteSpace:"normal"}}>
          {children}
          {pinned && <div style={{marginTop:6,fontSize:9.5,color:"var(--t3)"}}>Pinned · click ⓘ again to close</div>}
        </div>
      )}
    </span>
  );
}

function FocusCard({ icon, title, sub, learn, right, children, style }) {
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",minWidth:0,...style}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",display:"flex",alignItems:"center"}}>{icon} {title}{learn && <InfoTip>{learn}</InfoTip>}</div>
          {sub && <div style={{fontSize:10.5,color:"var(--t3)",marginTop:2,lineHeight:1.5}}>{sub}</div>}
        </div>
        {right && <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>{right}</div>}
      </div>
      {children}
    </div>
  );
}

function FocusSym({ sym, onOpen, size=11.5 }) {
  return (
    <div className="sym-cell">
      <span onClick={e=>{e.stopPropagation();onOpen(sym);}} title="Open deep-dive" style={{fontFamily:"var(--mono)",fontSize:size,fontWeight:700,color:"var(--acc)",cursor:"pointer",borderBottom:"1px dotted var(--accborder)"}}>{sym}</span>
      <CopyBtn text={sym}/>
    </div>
  );
}

function TFLadder({ ladder, sgn=1, cell=20, showLabels=true }) {
  return (
    <div style={{display:"flex",gap:3}}>
      {FOCUS_TFS.map(t=>{
        const l = ladder[t], st = l.state;
        const c = st>0 ? "var(--long)" : st<0 ? "var(--short)" : "var(--b2)";
        const trig = l.trig>0 && st===sgn, setup = l.setup>0 && st===sgn;
        return (
          <div key={t} title={`${TF_NAME[t]}: ${st>0?"bullish":st<0?"bearish":"no signal"}${trig?" · fresh trigger":""}${setup?" · setup forming":""} · ${l.count} signals`}
            style={{width:cell,height:cell,borderRadius:4,position:"relative",border:`1.5px solid ${trig?c:"var(--b1)"}`,background:"var(--s2)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:c,opacity:st===0?0:trig?0.55:0.25}}/>
            {showLabels && <span style={{position:"relative",fontSize:cell*0.45,fontWeight:700,fontFamily:"var(--mono)",color:st===0?"var(--t3)":"var(--t1)"}}>{t}</span>}
            {setup && !trig && <span style={{position:"absolute",top:1,right:2,width:4,height:4,borderRadius:9,border:`1px solid ${c}`}}/>}
          </div>
        );
      })}
    </div>
  );
}

function ScoreRing({ score, size=46 }) {
  const t = tierOf(score), r = 18, circ = 2*Math.PI*r, off = circ*(1-score/100);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--s3)" strokeWidth="4"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke={t.color} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 22 22)"/>
      <text x="22" y="25" textAnchor="middle" fontSize="11" fontWeight="700" fill={t.color} fontFamily="IBM Plex Mono">{Math.round(score)}</text>
    </svg>
  );
}

function tfWeightedNet(s, tfs) { return tfs.reduce((a,t)=>a+s.ladder[t].net*TF_WEIGHT[t],0); }

// ─── STOCK DEEP-DIVE DRAWER ───────────────────────────────────────────────────
function StockDeepDive({ s, onClose }) {
  if (!s) return null;
  const d = s.sgn>0 ? "bullish" : "bearish";
  const pct = Math.round(Math.abs(s.net)*100);
  const opp = FOCUS_TFS.filter(t=>s.ladder[t].state===-s.sgn);
  const checks = [
    { ok: s.htfState.length>0, t:"Higher timeframe (M/Q/Y) agrees with the bias", why:"Trade in the direction of the bigger tide." },
    { ok: s.htfTrig.length>0, t:"Fresh trigger on a higher timeframe", why:"A new HTF break is rare and tends to carry for weeks." },
    { ok: s.ltfTrig.length>0, t:"Lower timeframe (D/W) trigger for timing", why:"Entry timing comes from the smaller chart." },
    { ok: s.secAlign>0.15, t:`Sector ${s.sgn>0?"tailwind":"weakness"} (${s.sector}: ${Math.round(s.secStrength)})`, why:"Stocks move 2–3x easier when their sector moves the same way." },
    { ok: opp.length===0, t:"No timeframe points the other way", why:"Opposing timeframes = someone is on the other side." },
    { ok: s.isFNO || s.isN500, t:"Liquid (FNO / Nifty 500)", why:"Liquidity means cleaner fills and reliable levels." },
    { ok: s.isStrong || !!s.mtnr || !!s.virgin, t:"Extra edge: conviction list / NR coil / virgin level", why:"Independent confirmation from your other scanners." },
  ];
  const passed = checks.filter(c=>c.ok).length;
  const next = s.htfTrig.length && s.ltfTrig.length ? "Everything lines up. Open the chart, mark the breakout level as your invalidation, size normally."
    : s.htfTrig.length ? "The big timeframe has broken. Wait for a Daily/Weekly trigger in the same direction before entering."
    : s.ltfTrig.length && !s.htfState.length ? "Only a short-term trigger with no bigger-picture support — trade small or skip."
    : s.setupTfs.length ? `Setup forming on ${s.setupTfs.join("+")}. Put an alert at the range ${s.sgn>0?"high":"low"} and wait.`
    : "Structure only, no trigger. Keep on the watchlist.";
  const total = Object.values(s.comp).reduce((a,b)=>a+Math.max(0,b),0) || 1;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:600,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} className="tower-scroll slide-in" style={{width:"min(560px,100%)",height:"100%",background:"var(--bg)",borderLeft:"1px solid var(--b2)",overflowY:"auto",padding:"18px 20px",boxShadow:"-12px 0 40px var(--shadow)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14}}>
          <ScoreRing score={s.score} size={58}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontFamily:"var(--mono)",fontSize:20,fontWeight:700,color:"var(--acc)"}}>{s.symbol}</span>
              {biasBadge(s.dir)}
              <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:`1px solid ${tierOf(s.score).color}`,color:tierOf(s.score).color,fontWeight:700}}>{tierOf(s.score).label}</span>
              <TVCopyBtn symbols={[s.symbol]} label="⎘ TV"/>
            </div>
            <div style={{fontSize:11.5,color:"var(--t2)",marginTop:3}}>{s.name}</div>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
              <SectorChip sector={s.sector}/><IndustryTag industry={s.industry}/>
              <span style={{fontSize:10,color:"var(--t3)"}}>Horizon: <strong style={{color:"var(--t1)"}}>{s.horizon}</strong></span>
              {s.price && <span style={{fontSize:10,fontFamily:"var(--mono)",color:+s.chg>=0?"var(--long)":"var(--short)"}}>₹{s.price} ({+s.chg>=0?"+":""}{s.chg}%)</span>}
            </div>
          </div>
          <button onClick={onClose} style={{fontSize:18,color:"var(--t2)",padding:"0 4px"}}>✕</button>
        </div>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:12,color:"var(--t1)",lineHeight:1.7}}>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,marginBottom:6}}>🧠 The story</div>
          <strong>{s.symbol}</strong> carries a <strong style={{color:dirColor(s.dir)}}>{d}</strong> bias — {pct}% of the timeframe-weighted evidence points {s.sgn>0?"up":"down"}.{" "}
          {s.htfTrig.length ? <>A fresh <strong>{s.htfTrig.map(t=>TF_NAME[t]).join(" & ")}</strong> trigger fired — levels on these charts take months to build, so breaks here tend to matter. </>
            : s.htfState.length ? <>Higher timeframes ({s.htfState.map(t=>TF_NAME[t]).join(", ")}) lean {d}, but there is no fresh higher-TF trigger — that's structure, not an entry. </>
            : <>Nothing on the higher timeframes supports it — treat it as a short-term idea only. </>}
          {s.ltfTrig.length ? <>The <strong>{s.ltfTrig.map(t=>TF_NAME[t]).join(" & ")}</strong> chart has also triggered, so timing is in place. </> : <>The lower timeframes haven't triggered yet — let the Daily/Weekly confirm. </>}
          {s.secAlign>0.3 ? <>Its sector (<strong>{s.sector}</strong>) is moving the same way — a tailwind. </> : s.secAlign<-0.3 ? <>Careful: it's fighting its sector (<strong>{s.sector}</strong>). </> : null}
          {opp.length ? <>Watch out: <strong>{opp.map(t=>TF_NAME[t]).join(", ")}</strong> point{opp.length===1?"s":""} the other way.</> : null}
          <div style={{marginTop:8,padding:"8px 10px",background:"var(--adim)",borderRadius:6,borderLeft:"3px solid var(--acc)"}}><strong>Next action:</strong> {next}</div>
        </div>

        <DeepDiveSetups s={s}/>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,marginBottom:8}}>🧮 Score anatomy — why {Math.round(s.score)}?</div>
          <div style={{display:"flex",height:12,borderRadius:6,overflow:"hidden",background:"var(--s3)",marginBottom:8}}>
            {COMP_META.filter(c=>s.comp[c.k]>0).map(c=><div key={c.k} title={`${c.label}: +${s.comp[c.k].toFixed(1)}`} style={{width:`${s.comp[c.k]/total*100}%`,background:c.color}}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px"}}>
            {COMP_META.filter(c=>c.k!=="persistence"||s.nFiles>1).map(c=>(
              <div key={c.k} style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5}}>
                <span style={{width:8,height:8,borderRadius:2,background:c.color}}/>
                <span style={{color:"var(--t2)",flex:1}}>{c.label}</span>
                <span style={{fontFamily:"var(--mono)",fontWeight:700,color:s.comp[c.k]<0?"var(--short)":"var(--t1)"}}>{s.comp[c.k]>=0?"+":""}{s.comp[c.k].toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,marginBottom:8}}>✅ Pre-trade checklist — {passed}/{checks.length} passed</div>
          {checks.map((c,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:i<checks.length-1?"1px solid var(--b1)":"none"}}>
              <span style={{fontSize:13,color:c.ok?"var(--long)":"var(--short)",width:16,flexShrink:0}}>{c.ok?"✓":"✗"}</span>
              <div><div style={{fontSize:11.5,color:"var(--t1)",fontWeight:600}}>{c.t}</div><div style={{fontSize:10,color:"var(--t3)"}}>{c.why}</div></div>
            </div>
          ))}
        </div>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,marginBottom:8}}>🪜 Timeframe ladder — biggest picture on top</div>
          {[...FOCUS_TFS].reverse().map(t=>{
            const l=s.ladder[t], sigs=s.tfs[t].signals;
            const c = l.state>0?"var(--long)":l.state<0?"var(--short)":"var(--t3)";
            return (
              <div key={t} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--b1)"}}>
                <div style={{width:74,flexShrink:0}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:c}}>{TF_NAME[t]}</div>
                  <div style={{fontSize:9.5,color:"var(--t3)"}}>{l.state>0?"▲ bullish":l.state<0?"▼ bearish":"— quiet"}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  {sigs.length===0 && <div style={{fontSize:10.5,color:"var(--t3)"}}>No signals on this timeframe.</div>}
                  {sigs.map((g,i)=>(
                    <div key={i} style={{display:"flex",gap:6,alignItems:"baseline",marginBottom:3}}>
                      <span style={{fontSize:8.5,padding:"1px 5px",borderRadius:3,fontWeight:700,fontFamily:"var(--mono)",flexShrink:0,
                        color:g.kind==="TRIGGER"?"var(--acc)":g.kind==="SETUP"?"var(--ret)":g.kind==="PULLBACK"?"var(--mixed)":"var(--t2)",
                        border:"1px solid var(--b2)"}}>{g.kind}</span>
                      <span style={{fontSize:10.5,color:g.dir>0?"var(--long)":g.dir<0?"var(--short)":"var(--t2)"}}>{g.dir>0?"▲":g.dir<0?"▼":"•"}</span>
                      <span style={{fontSize:10.5,color:"var(--t1)"}} title={g.name}>{g.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── FOCUS COMMAND TAB ────────────────────────────────────────────────────────
function FocusCommandTab({ db, presence=null, nFiles=1, embedded=false, afterSetups=null, gDir="ALL", setupExtra=null }) {
  const model = useMemo(()=>buildFocusModel(db, presence, nFiles), [db, presence, nFiles]);
  const dirF = gDir;
  const [secF, setSecF] = useState(null);
  const fnoOnly = false;   // F&O filter lives in the side nav (applied to the data)
  const [openSym, setOpenSym] = useState(null);
  const [strict, setStrict] = useState(true);
  const [cellSel, setCellSel] = useState(null);
  const [indOpen, setIndOpen] = useState(null);
  const open = sym => setOpenSym(sym);
  const bySym = useMemo(()=>{ const m={}; model.list.forEach(s=>{m[s.symbol]=s;}); return m; },[model]);

  const base = useMemo(()=>model.list.filter(s=>(dirF==="ALL"||s.dir===dirF) && (!fnoOnly||s.isFNO)),[model,dirF,fnoOnly]);
  const filtered = useMemo(()=>base.filter(s=>!secF||s.sector===secF),[base,secF]);
  const directional = filtered.filter(s=>s.dir!=="MIXED");

  const secSorted = [...db.sectorAnalysis].filter(s=>s.Sector!=="Unknown"&&s.Sector!=="Indices").sort((a,b)=>b.Strength_Score-a.Strength_Score);

  // ── Confluence grid
  const HTF_ROWS = ["Y","Q","M"], LTF_COLS = ["W","D"];
  const confMatch = (s,h,l) => s.ladder[h].trig>0 && s.ladder[h].state===s.sgn && (strict ? (s.ladder[l].trig>0 && s.ladder[l].state===s.sgn) : s.ladder[l].state===s.sgn);
  const confDirs = dirF==="ALL" ? ["LONG","SHORT"] : [dirF];
  const confList = directional.filter(s=>{
    if (cellSel) return s.dir===cellSel.dir && confMatch(s,cellSel.h,cellSel.l);
    return HTF_ROWS.some(h=>LTF_COLS.some(l=>confMatch(s,h,l)));
  });

  // ── Sector × TF heat
  const secHeat = useMemo(()=>{
    const m={};
    base.forEach(s=>{
      if(!m[s.sector]) m[s.sector]={sector:s.sector,tf:{D:0,W:0,M:0,Q:0,Y:0},focus:0,n:0,focusSyms:[]};
      FOCUS_TFS.forEach(t=>{ m[s.sector].tf[t]+=s.ladder[t].net; });
      m[s.sector].n++; if(s.score>=42&&s.dir!=="MIXED") { m[s.sector].focus++; m[s.sector].focusSyms.push(s.symbol); }
    });
    return Object.values(m).map(r=>({...r,strength:(model.secMap[r.sector]||{}).Strength_Score||0})).sort((a,b)=>b.strength-a.strength);
  },[base,model]);
  const heatMax = Math.max(1,...secHeat.flatMap(r=>FOCUS_TFS.map(t=>Math.abs(r.tf[t]/Math.max(r.n,1)))));

  // ── Special lists
  const leaders = directional.filter(s=>s.dir==="LONG"&&s.score>=30&&s.secStrength<45).slice(0,10);
  const laggards = directional.filter(s=>s.dir==="SHORT"&&s.score>=30&&s.secStrength>55).slice(0,10);
  const coiled = directional.filter(s=>(s.setupTfs.length>=2||(s.mtnr&&s.setupTfs.length>=1))&&s.trigTfs.length===0)
    .sort((a,b)=>(b.setupTfs.reduce((x,t)=>x+TF_WEIGHT[t],0)+(b.mtnr?3:0))-(a.setupTfs.reduce((x,t)=>x+TF_WEIGHT[t],0)+(a.mtnr?3:0))).slice(0,12);
  const pullbacks = filtered.filter(s=>tfWeightedNet(s,["M","Q","Y"])>0.5&&tfWeightedNet(s,["D","W"])<-0.5).sort((a,b)=>tfWeightedNet(b,["M","Q","Y"])-tfWeightedNet(a,["M","Q","Y"])).slice(0,10);
  const bounces = filtered.filter(s=>tfWeightedNet(s,["M","Q","Y"])<-0.5&&tfWeightedNet(s,["D","W"])>0.5).sort((a,b)=>tfWeightedNet(a,["M","Q","Y"])-tfWeightedNet(b,["M","Q","Y"])).slice(0,10);

  // ── Industry hotspots
  const industries = useMemo(()=>{
    const m={};
    directional.filter(s=>s.score>=35).forEach(s=>{
      const k=s.industry||"Unknown";
      if(!m[k]) m[k]={ind:k,sector:s.sector,long:[],short:[]};
      (s.dir==="LONG"?m[k].long:m[k].short).push(s);
    });
    return Object.values(m).sort((a,b)=>(b.long.length+b.short.length)-(a.long.length+a.short.length)).slice(0,12);
  },[directional]);
  const indMax = Math.max(1,...industries.map(i=>Math.max(i.long.length,i.short.length)));

  const radar = directional.slice(0,12);
  const sel = openSym ? bySym[openSym] : null;

  const pill = (active,c) => ({padding:"5px 11px",borderRadius:6,fontSize:11.5,fontWeight:600,cursor:"pointer",border:`1px solid ${active?c:"var(--b2)"}`,background:active?"var(--adim)":"var(--s2)",color:active?c:"var(--t2)"});
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"};

  const MiniRow = ({ s, extra }) => (
    <div onClick={()=>open(s.symbol)} className="sec-row" style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",borderBottom:"1px solid var(--b1)",cursor:"pointer"}}>
      <div style={{width:92,flexShrink:0}}><FocusSym sym={s.symbol} onOpen={open}/></div>
      <TFLadder ladder={s.ladder} sgn={s.sgn} cell={15} showLabels={false}/>
      <div style={{flex:1,minWidth:0,fontSize:10,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{extra}</div>
      <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:tierOf(s.score).color}}>{Math.round(s.score)}</span>
    </div>
  );

  return (
    <div style={{padding:"18px 22px"}}>
      {/* Header + filters */}
      <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap",marginBottom:14}}>
        <div style={{flex:1,minWidth:260}}>
          <div style={{fontSize:embedded?18:22,fontWeight:700,color:"var(--t1)"}}>🔭 Focus Command{embedded&&nFiles>1?<span style={{fontSize:12,color:"var(--t3)",fontWeight:500}}> · combined view of {nFiles} files</span>:null}</div>
          <div style={{fontSize:12.5,color:"var(--t2)",marginTop:2}}>Where to look first — every stock scored on timeframe confluence, fresh triggers, intensity and sector tailwind. Click any symbol for a full explanation.</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <select value={secF||""} onChange={e=>setSecF(e.target.value||null)} style={{background:"var(--s2)",border:`1px solid ${secF?sectorColor(secF):"var(--b2)"}`,color:secF?sectorColor(secF):"var(--t2)",borderRadius:6,fontSize:11.5,padding:"5px 8px"}}>
            <option value="">All sectors</option>
            {secSorted.map(s=><option key={s.Sector} value={s.Sector}>{s.Sector}</option>)}
          </select>
        </div>
      </div>

      {/* Priority radar */}
      <Anchor id="ct-radar"/>
      <FocusCard icon="🚨" title="Priority Radar — your first charts to open" sub={`Top ${radar.length} by Focus Score${secF?` in ${secF}`:""}. Coloured squares = D·W·M·Q·Y (bold border = fresh trigger).`}
        right={<ListCopy symbols={radar.map(s=>s.symbol)}/>}
        learn={<>The <strong>Focus Score (0–100)</strong> adds up: how many timeframes agree (weighted — a Yearly vote counts 5×, Daily 1×), whether fresh triggers fired on higher and lower timeframes, how many signals stack up, whether the sector moves the same way, and bonuses from your conviction / NR-coil / virgin scanners. Opposing timeframes subtract points. Read each card left-to-right: <em>score → direction → ladder → why</em>.</>}
        style={{marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:8}}>
          {radar.map((s,i)=>(
            <div key={s.symbol} onClick={()=>open(s.symbol)} className="sector-card" style={{background:"var(--s2)",border:"1px solid var(--b1)",borderLeft:`3px solid ${dirColor(s.dir)}`,borderRadius:9,padding:"10px 12px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <ScoreRing score={s.score}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10,color:"var(--t3)",fontFamily:"var(--mono)"}}>#{i+1}</span>
                    <FocusSym sym={s.symbol} onOpen={open} size={13}/>
                    {biasBadge(s.dir,true)}
                  </div>
                  <div style={{display:"flex",gap:4,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
                    <SectorChip sector={s.sector} industry={s.industry} dim/>
                    <span style={{fontSize:9,color:"var(--t3)"}}>{s.horizon}</span>
                    {s.isFNO&&<span style={{fontSize:8.5,padding:"1px 4px",borderRadius:3,background:"var(--longd)",color:"var(--long)"}}>FNO</span>}
                    {s.nFiles>1&&<span title="Number of selected files this stock appeared in" style={{fontSize:8.5,padding:"1px 4px",borderRadius:3,background:"rgba(56,189,248,.14)",color:"#38bdf8",fontFamily:"var(--mono)"}}>{s.persist}/{s.nFiles}d</span>}
                  </div>
                </div>
              </div>
              <div style={{margin:"8px 0 6px"}}><TFLadder ladder={s.ladder} sgn={s.sgn}/></div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {s.reasons.slice(0,3).map(r=><span key={r} style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"var(--s3)",color:"var(--t2)"}}>{r}</span>)}
              </div>
            </div>
          ))}
          {!radar.length && <div style={{color:"var(--t3)",fontSize:12,padding:12}}>No directional stocks match these filters.</div>}
        </div>
      </FocusCard>

      {/* Confluence grid + Focus map */}
      <Anchor id="ct-confluence"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.15fr",gap:12,marginBottom:12,alignItems:"stretch"}}>
        <FocusCard icon="⚡" title="Higher-TF × Lower-TF Confluence" sub="Example: a Quarterly breakout that ALSO triggered on the Daily. Click a cell to list those stocks."
          right={<div onClick={()=>{setStrict(v=>!v);setCellSel(null);}} style={pill(strict,"var(--acc)")}>{strict?"Strict: both triggered":"Relaxed: LTF aligned"}</div>}
          learn={<>The <strong>higher timeframe</strong> (Monthly/Quarterly/Yearly) tells you <em>what</em> to trade — the big level just broke. The <strong>lower timeframe</strong> (Weekly/Daily) tells you <em>when</em> — momentum has arrived right now. When both fire together you get the best of both: a meaningful level and a timely entry. <strong>Strict</strong> mode needs a fresh trigger on both; <strong>Relaxed</strong> only needs the lower TF to lean the same way.</>}>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10}}>
            {confDirs.map(dd=>(
              <div key={dd} style={{flex:1,minWidth:170}}>
                <div style={{fontSize:10.5,fontWeight:700,color:dirColor(dd),marginBottom:5}}>{dd==="LONG"?"▲ Long confluence":"▼ Short confluence"}</div>
                <table style={{borderCollapse:"separate",borderSpacing:3,width:"100%"}}>
                  <thead><tr><th/>{LTF_COLS.map(l=><th key={l} style={{fontSize:9.5,color:"var(--t3)",fontWeight:600}}>+ {TF_NAME[l]}</th>)}</tr></thead>
                  <tbody>{HTF_ROWS.map(h=>(
                    <tr key={h}>
                      <td style={{fontSize:9.5,color:"var(--t3)",fontWeight:600,paddingRight:4,whiteSpace:"nowrap"}}>{TF_NAME[h]} trigger</td>
                      {LTF_COLS.map(l=>{
                        const n = directional.filter(s=>s.dir===dd&&confMatch(s,h,l)).length;
                        const act = cellSel&&cellSel.dir===dd&&cellSel.h===h&&cellSel.l===l;
                        return (
                          <td key={l} onClick={()=>setCellSel(act?null:{dir:dd,h,l})} style={{cursor:"pointer",textAlign:"center",borderRadius:6,padding:"9px 4px",position:"relative",border:`1.5px solid ${act?dirColor(dd):"var(--b1)"}`,background:"var(--s2)"}}>
                            <div style={{position:"absolute",inset:0,borderRadius:5,background:dirColor(dd),opacity:n?Math.min(.55,.12+n/25):0}}/>
                            <span style={{position:"relative",fontFamily:"var(--mono)",fontSize:15,fontWeight:700,color:n?"var(--t1)":"var(--t3)"}}>{n}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <div style={{fontSize:10.5,color:"var(--t2)"}}>{cellSel?`${cellSel.dir} · ${TF_NAME[cellSel.h]} trigger + ${TF_NAME[cellSel.l]}`:"All confluence stocks"} ({confList.length})</div>
            <ListCopy symbols={confList.map(s=>s.symbol)}/>
          </div>
          <div style={{maxHeight:260,overflowY:"auto"}} className="tower-scroll">
            {confList.slice(0,60).map(s=><MiniRow key={s.symbol} s={s} extra={`${s.dir} · ${s.sector} · ${s.reasons[0]||""}`}/>)}
            {!confList.length && <div style={{color:"var(--t3)",fontSize:11,padding:10}}>No stocks meet this confluence — try Relaxed mode.</div>}
          </div>
        </FocusCard>

        <FocusCard icon="🗺" right={<ListCopy symbols={directional.slice(0,70).map(s=>s.symbol)}/>} title="Focus Map" sub="Top 70 names · x = how one-sided the evidence is · y = Focus Score · bubble = signal count · colour = sector. Click a bubble."
          learn={<>Upper corners are where you want to be: high score <em>and</em> one-sided evidence. Bubbles near the <strong>centre line</strong> have evidence pulling both ways — even with many signals, they're lower quality. Clusters of the same colour in an upper corner mean a whole sector is moving — the strongest kind of move.</>}>
          <RotationQuadrantChart
            items={directional.slice(0,70).map(s=>({key:s.symbol,label:s.symbol,x:Math.round(s.net*100),y:s.score,size:s.nDirSignals,color:sectorColor(s.sector),
              tooltip:`${s.symbol} (${s.sector}) · ${s.dir} · score ${Math.round(s.score)} · ${s.alignedTfs.length}/5 TFs aligned · ${s.nDirSignals} signals`}))}
            onSelect={k=>k&&open(k)} selectedKey={openSym} height={400}
            xAxisLabel="Evidence balance  (all bearish ← 0 → all bullish)" yAxisLabel="Focus Score"
            quadrantTexts={[
              {text:"FOCUS: BULLISH CONFLUENCE",color:"#00c896"},{text:"FOCUS: BEARISH CONFLUENCE",color:"#ff4454"},
              {text:"DEVELOPING LONG",color:"#a259ff"},{text:"DEVELOPING SHORT",color:"#fbbf24"}]}
          />
        </FocusCard>
      </div>

      {/* Alignment matrix + Sector×TF */}
      <Anchor id="ct-matrix"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12,alignItems:"stretch"}}>
        <FocusCard icon="🪜" right={<ListCopy symbols={directional.slice(0,25).map(s=>s.symbol)}/>} title="Timeframe Alignment Matrix" sub="Top 25 names. A full row of one colour = the whole ladder agrees."
          learn={<>Read each row from <strong>Y</strong> (right, the ocean) down to <strong>D</strong> (left, the waves). Trends that agree from Yearly down to Daily are the ones institutions are riding. A bold-bordered cell means a <strong>fresh trigger</strong> fired on that timeframe; a faint cell means the stock is simply holding above/below a level. The number is how many signals that timeframe contributes.</>}>
          <div style={{maxHeight:420,overflowY:"auto"}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr><th style={TH}>Symbol</th>{FOCUS_TFS.map(t=><th key={t} style={{...TH,textAlign:"center"}}>{t}</th>)}<th style={TH}>Aligned</th><th style={TH}>Score</th></tr></thead>
              <tbody>
                {directional.slice(0,25).map(s=>(
                  <tr key={s.symbol} className="sec-row" onClick={()=>open(s.symbol)} style={{borderBottom:"1px solid var(--b1)",cursor:"pointer"}}>
                    <td style={{padding:"5px 8px"}}><FocusSym sym={s.symbol} onOpen={open}/><div style={{fontSize:8.5,color:sectorColor(s.sector)}}>{s.sector}</div></td>
                    {FOCUS_TFS.map(t=>{
                      const l=s.ladder[t], c=l.state>0?"var(--long)":l.state<0?"var(--short)":"transparent", trig=l.trig>0&&l.state===s.sgn;
                      return (
                        <td key={t} style={{padding:2}}>
                          <div style={{position:"relative",height:26,borderRadius:4,border:`1.5px solid ${trig?c:"var(--b1)"}`,background:"var(--s2)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                            <div style={{position:"absolute",inset:0,background:c,opacity:l.state===0?0:Math.min(.6,.18+Math.abs(l.net)*.18)}}/>
                            <span style={{position:"relative",fontFamily:"var(--mono)",fontSize:10,fontWeight:700,color:l.count?"var(--t1)":"var(--t3)"}}>{l.count||"·"}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td style={{padding:"5px 8px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{s.alignedTfs.length}/5</td>
                    <td style={{padding:"5px 8px",fontFamily:"var(--mono)",fontWeight:700,color:tierOf(s.score).color}}>{Math.round(s.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FocusCard>

        <FocusCard icon="🏭" title="Sector × Timeframe Heat" sub="Where each sector's move is happening. Click a row to focus the whole tab on that sector."
          right={<>{secF && <button onClick={()=>setSecF(null)} style={{fontSize:10.5,padding:"3px 9px",borderRadius:5,border:`1px solid ${sectorColor(secF)}`,color:sectorColor(secF),background:"var(--s2)"}}>✕ {secF}</button>}<ListCopy symbols={secHeat.filter(r=>!secF||r.sector===secF).flatMap(r=>r.focusSyms)}/></>}
          learn={<>Each cell is the average bullish-minus-bearish evidence of that sector's stocks on that timeframe. A sector that is <strong>red on Q/Y but green on D/W</strong> is bouncing inside a downtrend — rallies there are suspect. <strong>Green on M/Q/Y</strong> means real accumulation. The <em>Focus</em> column counts names worth your time (score ≥ 42).</>}>
          <div style={{maxHeight:420,overflowY:"auto"}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr><th style={TH}>Sector</th><th style={TH}>Str.</th>{FOCUS_TFS.map(t=><th key={t} style={{...TH,textAlign:"center"}}>{t}</th>)}<th style={TH}>Focus</th><th style={TH}>Copy</th></tr></thead>
              <tbody>
                {secHeat.map(r=>{
                  const act = secF===r.sector;
                  return (
                    <tr key={r.sector} className="sec-row" onClick={()=>setSecF(act?null:r.sector)} style={{borderBottom:"1px solid var(--b1)",cursor:"pointer",background:act?"var(--adim)":"transparent"}}>
                      <td style={{padding:"5px 8px",color:sectorColor(r.sector),fontWeight:700,whiteSpace:"nowrap",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis"}}>{r.sector}</td>
                      <td style={{padding:"5px 8px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{Math.round(r.strength)}</td>
                      {FOCUS_TFS.map(t=>{
                        const v=r.tf[t]/Math.max(r.n,1), c=v>0?"var(--long)":"var(--short)";
                        return (
                          <td key={t} style={{padding:2}}>
                            <div title={`${r.sector} ${TF_NAME[t]}: ${v>0?"+":""}${v.toFixed(2)} per stock`} style={{position:"relative",height:22,borderRadius:3,background:"var(--s2)",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <div style={{position:"absolute",inset:0,background:c,opacity:Math.min(.75,Math.abs(v)/heatMax*.75)}}/>
                              <span style={{position:"relative",fontSize:9,fontFamily:"var(--mono)",color:"var(--t1)"}}>{v>0?"+":""}{v.toFixed(1)}</span>
                            </div>
                          </td>
                        );
                      })}
                      <td style={{padding:"5px 8px",fontFamily:"var(--mono)",fontWeight:700,color:r.focus?"var(--acc)":"var(--t3)"}}>{r.focus}</td>
                      <td style={{padding:"3px 6px",whiteSpace:"nowrap"}}><ListCopy symbols={r.focusSyms} compact/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FocusCard>
      </div>

      {/* Special situations + industry hotspots */}
      <Anchor id="ct-special"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,marginBottom:12,alignItems:"stretch"}}>
        <FocusCard icon="🔥" right={<ListCopy symbols={industries.flatMap(g=>[...g.short,...g.long]).map(s=>s.symbol)}/>} title="Industry Hotspots" sub="Industries with the most focus-worthy names (score ≥ 35). Click to see the names."
          learn={<>When several stocks from the <strong>same industry</strong> light up together, it's rarely coincidence — it's usually money rotating into or out of that theme. One stock breaking out is a trade; five from the same industry is a <strong>theme</strong>, and themes last longer. Left bars = short candidates, right bars = long candidates.</>}>
          {industries.map(g=>{
            const act = indOpen===g.ind;
            return (
              <div key={g.ind} style={{marginBottom:5}}>
                <div onClick={()=>setIndOpen(act?null:g.ind)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                  <div style={{flex:1,display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4}}>
                    {g.short.length>0&&<span style={{fontSize:9.5,fontFamily:"var(--mono)",color:"var(--short)"}}>{g.short.length}</span>}
                    <div style={{height:12,width:`${g.short.length/indMax*100}%`,background:"var(--short)",borderRadius:"3px 0 0 3px",opacity:.8}}/>
                  </div>
                  <div title={`${g.ind} (${g.sector})`} style={{width:150,textAlign:"center",fontSize:10,color:act?"var(--acc)":"var(--t1)",fontWeight:act?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{g.ind}</div>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:4}}>
                    <div style={{height:12,width:`${g.long.length/indMax*100}%`,background:"var(--long)",borderRadius:"0 3px 3px 0",opacity:.8}}/>
                    {g.long.length>0&&<span style={{fontSize:9.5,fontFamily:"var(--mono)",color:"var(--long)"}}>{g.long.length}</span>}
                  </div>
                </div>
                {act && (
                  <div style={{padding:"6px 0 4px"}}>
                    <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
                      <span style={{fontSize:9.5,color:"var(--t3)"}}>All</span><ListCopy symbols={[...g.short,...g.long].map(s=>s.symbol)}/>
                      {g.long.length>0 && <><span style={{fontSize:9.5,color:"var(--long)"}}>▲</span><ListCopy symbols={g.long.map(s=>s.symbol)} compact/></>}
                      {g.short.length>0 && <><span style={{fontSize:9.5,color:"var(--short)"}}>▼</span><ListCopy symbols={g.short.map(s=>s.symbol)} compact/></>}
                    </div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
                      {[...g.short,...g.long].map(s=>(
                        <span key={s.symbol} className="sym-cell" style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontFamily:"var(--mono)",fontWeight:700,padding:"2px 5px 2px 7px",borderRadius:4,border:`1px solid ${dirColor(s.dir)}`,color:dirColor(s.dir)}}>
                          <span onClick={()=>open(s.symbol)} style={{cursor:"pointer"}}>{s.symbol} {Math.round(s.score)}</span>
                          <CopyBtn text={s.symbol}/>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!industries.length && <div style={{color:"var(--t3)",fontSize:11}}>No industry clusters for these filters.</div>}
        </FocusCard>
        <FocusCard icon="🎯" title="Near Breakout — set alerts" sub="Near a zone or NR edge on 2+ timeframes, not broken yet."
          right={<ListCopy symbols={coiled.map(s=>s.symbol)}/>}
          learn={<>A narrow range or price hugging a level on several timeframes at once is energy being stored. These aren't trades <em>yet</em> — they're <strong>alerts</strong>. Put an alert at the range high (for ▲) or low (for ▼). When it fires, the stock usually jumps straight into the Priority Radar.</>}>
          {coiled.map(s=><MiniRow key={s.symbol} s={s} extra={`${s.sgn>0?"pressing top":"sitting on floor"} · ${s.setupTfs.join("+")}${s.mtnr?` · ${s.mtnr.Timeframe_Count}-TF NR`:""}`}/>)}
          {!coiled.length && <div style={{color:"var(--t3)",fontSize:11}}>None right now.</div>}
        </FocusCard>

        <FocusCard icon="💎" title="Relative Strength / Weakness" sub="Stocks moving against their own sector." right={<ListCopy symbols={[...leaders,...laggards].map(s=>s.symbol)}/>}
          learn={<>A stock rising while its sector falls has a <strong>buyer who doesn't care about the sector</strong> — often the strongest names once the sector turns. The mirror case, a stock falling inside a strong sector, often has a company-specific problem — prime short or avoid.</>}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><div style={{fontSize:10.5,fontWeight:700,color:"var(--long)"}}>▲ Leaders in weak sectors ({leaders.length})</div><ListCopy symbols={leaders.map(s=>s.symbol)} compact/></div>
          {leaders.map(s=><MiniRow key={s.symbol} s={s} extra={`${s.sector} str ${Math.round(s.secStrength)}`}/>)}
          {!leaders.length && <div style={{color:"var(--t3)",fontSize:11,marginBottom:6}}>None.</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"10px 0 2px"}}><div style={{fontSize:10.5,fontWeight:700,color:"var(--short)"}}>▼ Laggards in strong sectors ({laggards.length})</div><ListCopy symbols={laggards.map(s=>s.symbol)} compact/></div>
          {laggards.map(s=><MiniRow key={s.symbol} s={s} extra={`${s.sector} str ${Math.round(s.secStrength)}`}/>)}
          {!laggards.length && <div style={{color:"var(--t3)",fontSize:11}}>None.</div>}
        </FocusCard>

        <FocusCard icon="⚠️" title="Conflict Zone — wait, don't act" sub="Higher and lower timeframes disagree." right={<ListCopy symbols={[...pullbacks,...bounces].map(s=>s.symbol)}/>}
          learn={<><strong>Pullback in an uptrend</strong> (big TFs up, small TFs down) is where patient traders buy — but only after the Daily turns back up. <strong>Bounce in a downtrend</strong> (big TFs down, small TFs up) is where beginners get trapped buying. Both lists say the same thing: <em>wait for the small timeframe to rejoin the big one</em>.</>}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><div style={{fontSize:10.5,fontWeight:700,color:"var(--long)"}}>↘ Pullback in uptrend ({pullbacks.length}) — future buy-the-dip</div><ListCopy symbols={pullbacks.map(s=>s.symbol)} compact/></div>
          {pullbacks.map(s=><MiniRow key={s.symbol} s={s} extra={`HTF ${tfWeightedNet(s,["M","Q","Y"]).toFixed(1)} · LTF ${tfWeightedNet(s,["D","W"]).toFixed(1)}`}/>)}
          {!pullbacks.length && <div style={{color:"var(--t3)",fontSize:11,marginBottom:6}}>None.</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"10px 0 2px"}}><div style={{fontSize:10.5,fontWeight:700,color:"var(--short)"}}>↗ Bounce in downtrend ({bounces.length}) — trap risk</div><ListCopy symbols={bounces.map(s=>s.symbol)} compact/></div>
          {bounces.map(s=><MiniRow key={s.symbol} s={s} extra={`HTF ${tfWeightedNet(s,["M","Q","Y"]).toFixed(1)} · LTF ${tfWeightedNet(s,["D","W"]).toFixed(1)}`}/>)}
          {!bounces.length && <div style={{color:"var(--t3)",fontSize:11}}>None.</div>}
        </FocusCard>
      </div>

      <Anchor id="ct-setups"/>
      <SetupScanner list={filtered} open={open} extra={setupExtra} zoneLevels={db.zoneLevels} lockDir={gDir==="ALL"?null:gDir}/>

      {afterSetups && <div style={{margin:"0 -22px"}}>{afterSetups}</div>}

      <StockDeepDive s={sel} onClose={()=>setOpenSym(null)}/>
    </div>
  );
}


// ─── MULTI-FILE MERGE ─────────────────────────────────────────────────────────
function strengthLabelFor(score) {
  return score>=70 ? "Very Strong" : score>=55 ? "Strong" : score>=45 ? "Neutral" : score>=32 ? "Weak" : "Very Weak";
}
const SCORE_FIELDS = new Set(["Avg_Change_Pct","Net_Bias_Score","Advance_Decline_Ratio","Signal_Density","Strength_Score","Bullish_Score","Bearish_Score"]);
function averageAnalysis(lists, keyFn) {
  const acc = {};
  lists.forEach(list => list.forEach(r => {
    const k = keyFn(r);
    if (!acc[k]) acc[k] = { latest:r, n:0, sums:{} };
    acc[k].latest = r; acc[k].n++;
    Object.entries(r).forEach(([f,v]) => { if (typeof v === "number") acc[k].sums[f] = (acc[k].sums[f]||0) + v; });
  }));
  return Object.values(acc).map(({latest,n,sums}) => {
    const out = { ...latest };
    Object.entries(sums).forEach(([f,sum]) => {
      const avg = sum/n;
      out[f] = SCORE_FIELDS.has(f) ? Math.round(avg*10)/10 : Math.round(avg);
    });
    out.Strength_Label = strengthLabelFor(out.Strength_Score);
    return out;
  });
}
// dbs ordered oldest → newest; later files win for per-row metadata.
function mergeDBs(dbs) {
  if (dbs.length === 1) return { db: dbs[0], presence: null, nFiles: 1 };
  const flatMap = new Map(), presenceSets = {};
  dbs.forEach((db, i) => db.flat.forEach(r => {
    flatMap.set(r.Symbol + "||" + r.Signal_Name, r);
    (presenceSets[r.Symbol] = presenceSets[r.Symbol] || new Set()).add(i);
  }));
  const flat = [...flatMap.values()];
  const latestBy = (key, keyFn) => { const m = new Map(); dbs.forEach(db => (db[key]||[]).forEach(r => m.set(keyFn(r), r))); return [...m.values()]; };
  const bySym = r => r.Symbol;
  const master = latestBy("master", bySym);
  const masterMap = {}; master.forEach(m => { masterMap[m.Symbol] = m; });
  const sig_stocks = {}, sigCount = {};
  flat.forEach(r => {
    (sig_stocks[r.Signal_Name] = sig_stocks[r.Signal_Name] || []).push({ s:r.Symbol, b:r.Trading_Bias, fno:r.Is_FNO, n500:r.Is_Nifty_500, n100:r.Is_Nifty_LargeCap_100, mid:r.Is_Midcap_150, sec:r.Sector, ind:r.Industry });
    sigCount[r.Signal_Name] = (sigCount[r.Signal_Name]||0) + 1;
  });
  const summary = latestBy("summary", r => r.Signal_Name).map(r => ({ ...r, Stock_Count: String(sigCount[r.Signal_Name]||0) }));
  const presence = {};
  Object.entries(presenceSets).forEach(([s,set]) => { presence[s] = set.size; });
  return {
    db: {
      flat, summary, master, masterMap, sig_stocks,
      top: latestBy("top", bySym), strong: latestBy("strong", bySym),
      mtnr: latestBy("mtnr", bySym), virgin: latestBy("virgin", bySym),
      sectorAnalysis: averageAnalysis(dbs.map(d=>d.sectorAnalysis), r=>r.Sector),
      industryAnalysis: averageAnalysis(dbs.map(d=>d.industryAnalysis), r=>r.Sector+"||"+r.Industry),
      nrSectorIndustry: latestBy("nrSectorIndustry", r => [r.Sector,r.Industry,r.NR_Signal,r.Pattern_Type].join("||")),
      zoneLevels: latestBy("zoneLevels", bySym),
      returnPotential: latestBy("returnPotential", r => r.Symbol + "|" + r.Direction),
      priceHealth: latestBy("priceHealth", bySym),
      failedNR: latestBy("failedNR", r => r.Symbol + "|" + r.Timeframe),
      has: { priceHealth: dbs.some(d=>d.has&&d.has.priceHealth), failedNR: dbs.some(d=>d.has&&d.has.failedNR) },
    },
    presence, nFiles: dbs.length,
  };
}


// ─── STOCK QUALITY (Price_Health) — global filter applied to every page ───────
const HEALTH_LEVELS = ["HEALTHY","WEAK","POOR"];
const HEALTH_C = { POOR:"var(--short)", WEAK:"var(--mixed)", HEALTHY:"var(--long)" };
const HEALTH_LABEL = { HEALTHY:"Healthy", WEAK:"Weak", POOR:"Poor" };

function healthIndex(versions) {
  // latest rating per symbol across all loaded files
  const map = {}; let available = false;
  versions.forEach(v => { if (v.db.has && v.db.has.priceHealth) available = true; (v.db.priceHealth||[]).forEach(r => { map[r.Symbol] = r; }); });
  const counts = { POOR:0, WEAK:0, HEALTHY:0 };
  Object.values(map).forEach(r => { if (counts[r.Health]!=null) counts[r.Health]++; });
  return { map, available, counts };
}

// allow = Set of ticked levels. A stock without a rating (not enough yearly history) counts as WEAK.
function excludedSymbols(allow, hIdx, allSymbols) {
  const ex = new Set();
  if (!hIdx.available || HEALTH_LEVELS.every(h=>allow.has(h))) return ex;
  allSymbols.forEach(sym => {
    const h = hIdx.map[sym] ? hIdx.map[sym].Health : "WEAK";
    if (!allow.has(h)) ex.add(sym);
  });
  return ex;
}

function filterDB(db, ex) {
  if (!ex || !ex.size) return db;
  const keep = r => !ex.has(r.Symbol);
  const flat = db.flat.filter(keep);
  const master = db.master.filter(keep);
  const masterMap = {}; master.forEach(m => { masterMap[m.Symbol] = m; });
  const sig_stocks = {}, sigCount = {};
  flat.forEach(r => {
    (sig_stocks[r.Signal_Name] = sig_stocks[r.Signal_Name] || []).push({ s:r.Symbol, b:r.Trading_Bias, fno:r.Is_FNO, n500:r.Is_Nifty_500, n100:r.Is_Nifty_LargeCap_100, mid:r.Is_Midcap_150, sec:r.Sector, ind:r.Industry });
    sigCount[r.Signal_Name] = (sigCount[r.Signal_Name]||0) + 1;
  });
  return { ...db, flat, master, masterMap, sig_stocks,
    summary: db.summary.map(r => ({ ...r, Stock_Count: String(sigCount[r.Signal_Name]||0) })),
    top: db.top.filter(keep), strong: db.strong.filter(keep), mtnr: db.mtnr.filter(keep), virgin: db.virgin.filter(keep),
    zoneLevels: (db.zoneLevels||[]).filter(keep), returnPotential: (db.returnPotential||[]).filter(keep),
    failedNR: (db.failedNR||[]).filter(keep),
    healthFiltered: ex.size };
}

const loadPref = (k, d) => { try { const v = window.localStorage && window.localStorage.getItem(k); return v || d; } catch(e) { return d; } };
const savePref = (k, v) => { try { window.localStorage && window.localStorage.setItem(k, v); } catch(e) {} };

function HealthBadge({ h, small=false }) {
  if (!h) return <span style={{fontSize:9,color:"var(--t3)"}}>—</span>;
  return <span style={{fontSize:small?8.5:9.5,fontWeight:700,padding:small?"1px 5px":"2px 7px",borderRadius:4,color:HEALTH_C[h]||"var(--t2)",border:`1px solid ${HEALTH_C[h]||"var(--b2)"}`,whiteSpace:"nowrap"}}>{h}</span>;
}

// The POOR / WEAK / HEALTHY list, opened from the side nav
function HealthListPanel({ level, hIdx, onClose }) {
  const list = Object.values(hIdx.map).filter(r=>r.Health===level).sort((a,b)=>(a.Drawdown??0)-(b.Drawdown??0));
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"5px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"};
  return (
    <div style={{background:"var(--s1)",border:`1px solid ${HEALTH_C[level]}`,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
        <span style={{fontSize:12.5,fontWeight:700,color:HEALTH_C[level]}}>{list.length.toLocaleString()} {HEALTH_LABEL[level].toLowerCase()} stocks</span>
        <span style={{fontSize:10,color:"var(--t3)"}}>long-term price quality from the yearly candles · sorted by distance below peak</span>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}><ListCopy symbols={list.map(r=>r.Symbol)} compact/><button onClick={onClose} style={{fontSize:11,padding:"2px 8px",borderRadius:5,border:"1px solid var(--b2)",color:"var(--t2)",background:"var(--s2)"}}>✕ Close</button></div>
      </div>
      <div style={{maxHeight:300,overflow:"auto"}} className="tower-scroll">
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["Symbol","Sector","CMP","Peak high","Peak (yrs ago)","Below peak","Long-term return","3Y return","Why"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.slice(0,300).map(r=>(
              <tr key={r.Symbol} style={{borderBottom:"1px solid var(--b1)"}}>
                <td style={{padding:"4px 8px"}}><SymCell sym={r.Symbol}/></td>
                <td style={{padding:"4px 8px",fontSize:10,color:sectorColor(r.Sector),whiteSpace:"nowrap"}}>{r.Sector}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)"}}>{r.Price}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)"}}>{r.Peak_High}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)"}}>{r.Peak_Years_Ago===0?"this yr":r.Peak_Years_Ago}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)",fontWeight:700,color:HEALTH_C[r.Health]}}>{r.Drawdown!=null?`${r.Drawdown.toFixed(0)}%`:"—"}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)",color:r.RetLong<0?"var(--short)":"var(--t1)"}}>{r.RetLong!=null?`${r.RetLong.toFixed(0)}% (${r.RetLongLabel})`:"—"}</td>
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)",color:r.Ret3Y<0?"var(--short)":"var(--t1)"}}>{r.Ret3Y!=null?`${r.Ret3Y.toFixed(0)}%`:"—"}</td>
                <td style={{padding:"4px 8px",fontSize:10,color:"var(--t2)"}}>{r.Reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length>300 && <div style={{fontSize:10,color:"var(--t3)",padding:6}}>Showing 300 of {list.length} — use Copy for the full list.</div>}
      </div>
    </div>
  );
}

// ─── CONTROL TOWER SIDE NAV — filters + jump links ───────────────────────────
const CT_NAV = [
  { group:"Market Intelligence", items:[
    ["ct-market","📡","Market overview"], ["ct-alpha","💎","Alpha rankings"], ["ct-sector","🏭","Sector & industry strength"],
    ["ct-compact","📊","Movers · F&O · flow · bias"] ]},
  { group:"Focus Command", items:[
    ["ct-radar","🚨","Priority radar"], ["ct-confluence","⚡","Confluence & focus map"], ["ct-matrix","🪜","Alignment & sector heat"],
    ["ct-special","🎯","Near breakout · RS · conflict · hotspots"] ]},
  { group:"Setups", items:[
    ["ct-intraday","🚀","Zone breakout analyser"], ["ct-stacked","🏆","Stacked setups"], ["ct-setupcards","🎯","Setup lists"], ["ct-trap","🪤","NR trap"] ]},
  { group:"Trade ideas", items:[
    ["ct-opps","🔮","Opportunities"], ["ct-returns","💰","Return expectations"], ["ct-watch","📌","Watchlist builder"] ]},
];
const CAP_OPTS = [["all","All caps"],["large","Large 100"],["mid","Mid 150"],["small","Small 250"]];

const ctFilterCount = (f, health) => (f.dir!=="ALL") + f.fno + !!f.n500 + (f.cap!=="all") + !!f.sector
  + !!(health && health.hIdx.available && !HEALTH_LEVELS.every(h=>health.allow.has(h)));

function CTSideNav({ open, setOpen, f, setF, sectors, health, onShowList, active, counts }) {
  const jump = id => { const el=document.getElementById(id); if (el) el.scrollIntoView({behavior:"smooth",block:"start"}); };
  const chip = (on, c="var(--acc)") => ({padding:"4px 9px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${on?c:"var(--b2)"}`,background:on?"var(--adim)":"var(--s2)",color:on?c:"var(--t2)",whiteSpace:"nowrap"});
  const Lbl = ({children}) => <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,margin:"12px 0 6px"}}>{children}</div>;
  const nOn = ctFilterCount(f, health);
  useEffect(()=>{
    if (!open) return;
    const onKey = e => { if (e.key==="Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <aside className={`ct-nav ${open?"open":""}`} aria-hidden={!open}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:12.5,fontWeight:700,color:"var(--t1)"}}>Filters</span>
        {nOn>0 && <button onClick={()=>{ setF({dir:"ALL",fno:false,n500:false,cap:"all",sector:""}); health.setAllow(new Set(HEALTH_LEVELS)); }} style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--b2)",color:"var(--t2)",background:"var(--s2)"}}>Reset ({nOn})</button>}
        <button onClick={()=>setOpen(false)} title="Close (Esc)" style={{marginLeft:"auto",fontSize:14,width:26,height:26,borderRadius:6,border:"1px solid var(--b2)",background:"var(--s2)",color:"var(--t2)",lineHeight:1}}>✕</button>
      </div>

      <Lbl>Stock quality <span style={{textTransform:"none",letterSpacing:0,fontWeight:500}}>· all pages</span></Lbl>
      {health.hIdx.available ? HEALTH_LEVELS.map(h=>{
        const on = health.allow.has(h);
        return (
          <div key={h} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
            <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",flex:1,fontSize:11.5,color:on?"var(--t1)":"var(--t3)"}}>
              <input id={`hq-${h}`} type="checkbox" checked={on} onChange={()=>health.setAllow(prev=>{ const n=new Set(prev); n.has(h)?n.delete(h):n.add(h); return n.size?n:prev; })} style={{accentColor:HEALTH_C[h]}}/>
              <span style={{width:7,height:7,borderRadius:2,background:HEALTH_C[h]}}/>{HEALTH_LABEL[h]} stocks
            </label>
            <span onClick={()=>onShowList(h)} title={`Show the ${HEALTH_LABEL[h].toLowerCase()} list`} style={{cursor:"pointer",fontFamily:"var(--mono)",fontSize:10.5,color:HEALTH_C[h],textDecoration:"underline dotted"}}>{health.hIdx.counts[h].toLocaleString()}</span>
          </div>
        );
      }) : <div style={{fontSize:10.5,color:"var(--t3)",lineHeight:1.5}}>Needs the Price_Health sheet from the new scanner.</div>}
      {health.hIdx.available && <div style={{fontSize:10,color:"var(--t3)",marginTop:2,lineHeight:1.5}}>{health.removed>0?<>{health.removed.toLocaleString()} stocks hidden on every page. </>:null}Stocks with too little history count as Weak.</div>}

      <Lbl>Direction</Lbl>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {[["ALL","All"],["LONG","▲ Long"],["SHORT","▼ Short"]].map(([k,l])=><div key={k} onClick={()=>setF(p=>({...p,dir:k}))} style={chip(f.dir===k,k==="LONG"?"var(--long)":k==="SHORT"?"var(--short)":"var(--acc)")}>{l}</div>)}
      </div>
      <Lbl>Segment</Lbl>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        <div onClick={()=>setF(p=>({...p,fno:!p.fno}))} style={chip(f.fno,"var(--long)")}>{f.fno?"✓ ":""}F&amp;O only</div>
        <div onClick={()=>setF(p=>({...p,n500:!p.n500}))} style={chip(f.n500,"var(--ret)")}>{f.n500?"✓ ":""}Nifty 500</div>
        {CAP_OPTS.map(([k,l])=><div key={k} onClick={()=>setF(p=>({...p,cap:k}))} style={chip(f.cap===k)}>{l}</div>)}
      </div>
      <Lbl>Sector</Lbl>
      <select id="ct-sector-filter" value={f.sector} onChange={e=>setF(p=>({...p,sector:e.target.value}))} style={{width:"100%",background:"var(--s2)",border:`1px solid ${f.sector?sectorColor(f.sector):"var(--b2)"}`,color:f.sector?sectorColor(f.sector):"var(--t2)",borderRadius:6,fontSize:11.5,padding:"5px 8px"}}>
        <option value="">All sectors</option>
        {sectors.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <div style={{fontSize:10,color:"var(--t3)",marginTop:8,lineHeight:1.5}}>
        Showing <strong style={{color:"var(--t1)"}}>{counts.shown.toLocaleString()}</strong> of {counts.total.toLocaleString()} stocks in the Control Tower.
      </div>

      <div style={{borderTop:"1px dashed var(--b2)",margin:"12px 0 4px"}}/>
      <Lbl>Jump to</Lbl>
      {CT_NAV.map(g=>(
        <div key={g.group} style={{marginBottom:6}}>
          <div style={{fontSize:10.5,fontWeight:700,color:"var(--t2)",margin:"6px 0 3px"}}>{g.group}</div>
          {g.items.map(([id,ic,l])=>(
            <div key={id} onClick={()=>jump(id)} className="ct-nav-link" style={{display:"flex",gap:7,alignItems:"center",padding:"4px 8px",borderRadius:6,cursor:"pointer",fontSize:11.5,
              color:active===id?"var(--acc)":"var(--t1)",background:active===id?"var(--adim)":"transparent",borderLeft:`2px solid ${active===id?"var(--acc)":"transparent"}`}}>
              <span style={{width:16,textAlign:"center"}}>{ic}</span>{l}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

function versionLabel(v, i) { return v.dateLabel || (v.fileName||"").replace(/\.(xlsx|xls)$/i,"").slice(0,16) || `File ${i+1}`; }

// ─── CONTROL TOWER (Focus Command + Market Intelligence, file-scope aware) ────
// Symbol attributes used by the side-nav filters
function symbolAttrs(db) {
  const a = {};
  const get = sym => (a[sym] = a[sym] || { fno:false, n500:false, cap:null, sector:null });
  db.flat.forEach(r => { const x=get(r.Symbol);
    if (r.Is_FNO==="Yes") x.fno=true;
    if (r.Is_Nifty_500==="Yes") x.n500=true;
    if (r.Is_Nifty_LargeCap_100==="Yes") x.cap="large"; else if (r.Is_Midcap_150==="Yes" && x.cap!=="large") x.cap="mid"; else if (r.Is_SmallCap_250==="Yes" && !x.cap) x.cap="small";
    if (!x.sector && r.Sector && r.Sector!=="Unknown") x.sector=r.Sector; });
  (db.zoneLevels||[]).forEach(r => { const x=get(r.Symbol); if (r.Is_FNO==="Yes") x.fno=true; if (r.Is_Nifty_500==="Yes") x.n500=true; if (!x.sector && r.Sector && r.Sector!=="Unknown") x.sector=r.Sector; });
  (db.master||[]).forEach(r => { const x=get(r.Symbol); if (!x.sector && r.Sector && r.Sector!=="Unknown") x.sector=r.Sector; });
  return a;
}

function ControlTowerCombined({ versions, health=null, navOpen=false, setNavOpen=()=>{}, onFilterCount=()=>{} }) {
  const n = versions.length;
  const [sel, setSel] = useState(()=>new Set([n-1]));
  const selIdx = useMemo(()=>[...sel].filter(i=>i<n).sort((a,b)=>a-b), [sel, n]);
  const safeIdx = selIdx.length ? selIdx : [n-1];
  const merged = useMemo(()=>mergeDBs(safeIdx.map(i=>versions[i].db)), [versions, safeIdx.join(",")]);
  const mode = safeIdx.length===1 && safeIdx[0]===n-1 ? "latest" : safeIdx.length===n ? "all" : "custom";

  // side-nav filters (Control Tower only; stock quality is global and lives in App)
  const [f, setF] = useState({ dir:"ALL", fno:false, n500:false, cap:"all", sector:"" });
  const [healthList, setHealthList] = useState(null);
  const [active, setActive] = useState("ct-market");

  const attrs = useMemo(()=>symbolAttrs(merged.db), [merged]);
  const sectors = useMemo(()=>[...new Set(Object.values(attrs).map(x=>x.sector).filter(Boolean))].sort(), [attrs]);
  const scopeEx = useMemo(()=>{
    const ex = new Set();
    if (!f.fno && !f.n500 && f.cap==="all" && !f.sector) return ex;
    Object.entries(attrs).forEach(([sym,x]) => {
      if ((f.fno && !x.fno) || (f.n500 && !x.n500) || (f.cap!=="all" && x.cap!==f.cap) || (f.sector && x.sector!==f.sector)) ex.add(sym);
    });
    return ex;
  }, [attrs, f.fno, f.n500, f.cap, f.sector]);
  const db = useMemo(()=>filterDB(merged.db, scopeEx), [merged, scopeEx]);
  const model = useMemo(()=>buildFocusModel(db, merged.presence, merged.nFiles), [db, merged]);
  const modelBySym = useMemo(()=>{ const m={}; model.list.forEach(s=>{ m[s.symbol]=s; }); return m; }, [model]);
  // Long / Short: market widgets keep only stocks whose overall direction matches
  const dbDir = useMemo(()=>{
    if (f.dir==="ALL") return db;
    const ex = new Set(model.list.filter(s=>s.dir!==f.dir).map(s=>s.symbol));
    return filterDB(db, ex);
  }, [db, model, f.dir]);
  const horizons = useMemo(()=>classifyHorizons(dbDir.flat), [dbDir]);
  const lock = f.dir==="ALL" ? null : f.dir;
  const lockLS = lock ? (lock==="LONG"?"L":"S") : null;
  const [openSym, setOpenSym] = useState(null);

  const totalN = Object.keys(attrs).length;
  const shownN = new Set([...dbDir.flat.map(r=>r.Symbol), ...(f.dir==="ALL"?(db.zoneLevels||[]).map(r=>r.Symbol):[])]).size;

  // opening / closing the nav changes the page width — keep the section you were reading in place
  const activeRef = useRef(active); activeRef.current = active;
  const firstNav = useRef(true);
  useEffect(()=>{
    if (firstNav.current) { firstNav.current = false; return; }
    if (window.scrollY < 300) return;
    const id = activeRef.current;
    const t = setTimeout(()=>{ const el=document.getElementById(id); if (el) el.scrollIntoView({block:"start"}); }, 260);
    return () => clearTimeout(t);
  }, [navOpen]);

  // highlight the nav item for the section in view
  useEffect(()=>{
    const onScroll = () => {
      const els = [...document.querySelectorAll("[data-ct-anchor]")];
      let cur = els.length ? els[0].id : null;
      const line = Math.max(140, window.innerHeight*0.35);
      els.forEach(el => { if (el.getBoundingClientRect().top < line) cur = el.id; });
      if (cur) setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive:true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggle = i => setSel(prev => {
    const s = new Set(prev);
    if (s.has(i)) { if (s.size>1) s.delete(i); } else s.add(i);
    return s;
  });
  const chipBtn = (active,c="var(--acc)") => ({padding:"5px 12px",borderRadius:6,fontSize:11.5,fontWeight:600,cursor:"pointer",border:`1px solid ${active?c:"var(--b2)"}`,background:active?"var(--adim)":"var(--s2)",color:active?c:"var(--t2)"});
  const rangeText = safeIdx.length===1 ? versionLabel(versions[safeIdx[0]],safeIdx[0]) : `${versionLabel(versions[safeIdx[0]],safeIdx[0])} → ${versionLabel(versions[safeIdx[safeIdx.length-1]],safeIdx[safeIdx.length-1])}`;
  const Divider = () => <div style={{margin:"6px 22px 10px",borderTop:"1px dashed var(--b2)"}}/>;
  const hp = health || { allow:new Set(HEALTH_LEVELS), setAllow:()=>{}, hIdx:{available:false,counts:{POOR:0,WEAK:0,HEALTHY:0},map:{}}, removed:0 };
  const nFilters = ctFilterCount(f, hp);
  useEffect(()=>{ onFilterCount(nFilters); }, [nFilters]);

  return (
    <div className={`ct-layout ${navOpen?"nav-open":""}`}>
      <CTSideNav open={navOpen} setOpen={setNavOpen} f={f} setF={setF} sectors={sectors} health={hp}
        onShowList={h=>{ setHealthList(h); window.scrollTo({top:0,behavior:"smooth"}); }} active={active} counts={{shown:shownN,total:totalN}}/>
      <div style={{minWidth:0}}>
        {/* Scope bar */}
        <div style={{padding:"14px 22px 0"}}>
          {healthList && hp.hIdx.available && <HealthListPanel level={healthList} hIdx={hp.hIdx} onClose={()=>setHealthList(null)}/>}
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:12,padding:"12px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",marginRight:6}}>🏛 Control Tower</div>
              <span style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700}}>Data scope</span>
              <div onClick={()=>setSel(new Set([n-1]))} style={chipBtn(mode==="latest")}>Latest file</div>
              <div onClick={()=>setSel(new Set(versions.map((_,i)=>i)))} style={{...chipBtn(mode==="all"),opacity:n>1?1:.5,pointerEvents:n>1?"auto":"none"}}>All files ({n})</div>
              <div style={chipBtn(mode==="custom","var(--mixed)")}>Custom{mode==="custom"?` (${safeIdx.length})`:""}</div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"stretch"}}>
              {versions.map((v,i)=>{
                const on = safeIdx.includes(i);
                const syms = new Set(v.db.flat.map(r=>r.Symbol)).size;
                return (
                  <div key={v.fileName+i} className="version-chip" onClick={()=>toggle(i)} title={v.fileName} style={{cursor:"pointer",display:"flex",gap:8,alignItems:"center",padding:"7px 11px",borderRadius:8,border:`1px solid ${on?"var(--acc)":"var(--b1)"}`,background:on?"var(--adim)":"var(--s2)"}}>
                    <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${on?"var(--acc)":"var(--b2)"}`,background:on?"var(--acc)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"var(--bg)"}}>{on?"✓":""}</div>
                    <div>
                      <div style={{fontSize:11.5,fontWeight:700,color:on?"var(--acc)":"var(--t1)",whiteSpace:"nowrap"}}>{versionLabel(v,i)}{i===n-1&&<span style={{fontSize:8.5,color:"var(--long)",marginLeft:5}}>LATEST</span>}</div>
                      <div style={{fontSize:9.5,color:"var(--t3)",fontFamily:"var(--mono)"}}>{syms} stk · {v.db.flat.length} sig · {v.db.top.length} opp</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10.5,color:"var(--t2)",marginTop:8,lineHeight:1.55}}>
              Showing <strong style={{color:"var(--t1)"}}>{safeIdx.length===1?"a single file":`${safeIdx.length} files combined`}</strong> ({rangeText}) · {shownN.toLocaleString()} stocks after filters.
              {safeIdx.length>1 && <span style={{color:"var(--t3)"}}> Combining rules: each stock+signal pair counted once, stock details and lists from the newest selected file, sector/industry scores averaged, and a <span style={{color:"#38bdf8"}}>persistence</span> bonus for stocks that show up in more of the selected files.</span>}
              {n===1 && <span style={{color:"var(--t3)"}}> Upload several dated files together to unlock multi-file scopes.</span>}
              {(f.dir!=="ALL"||f.fno||f.n500||f.cap!=="all"||f.sector) && <span style={{color:"var(--acc)"}}> Filters on: {[f.dir!=="ALL"&&(f.dir==="LONG"?"Long":"Short"), f.fno&&"F&O only", f.n500&&"Nifty 500", f.cap!=="all"&&CAP_OPTS.find(c=>c[0]===f.cap)[1], f.sector].filter(Boolean).join(" · ")}. Sector and industry scores come from the Excel and are not re-computed.</span>}
            </div>
          </div>
        </div>

        <Anchor id="ct-market"/>
        <ControlTower db={dbDir} horizons={horizons} embedded/>
        <Divider/>
        <FocusCommandTab db={db} presence={merged.presence} nFiles={merged.nFiles} embedded gDir={f.dir}
          setupExtra={<NRTrapSection db={db} open={setOpenSym} lockDir={lock} embedded/>}
          afterSetups={<>
            <Anchor id="ct-opps"/>
            <OpportunitiesSection db={db} model={model} open={setOpenSym} lockDir={lockLS}/>
            <Anchor id="ct-returns"/>
            <ReturnExpectationsSection db={db} open={setOpenSym} lockDir={lock}/>
          </>}/>
        <div style={{padding:"0 22px 24px"}}>
          <Anchor id="ct-watch"/>
          <WatchlistBuilder db={dbDir}/>
        </div>
        <StockDeepDive s={openSym ? modelBySym[openSym] : null} onClose={()=>setOpenSym(null)}/>
      </div>
    </div>
  );
}


// ─── TREND ANALYTICS (per-version stats) ──────────────────────────────────────
function computeVersionStats(versions) {
  return versions.map(v => {
    const model = buildFocusModel(v.db);
    const directional = model.list.filter(s=>s.dir!=="MIXED");
    const dirCount = { LONG:0, SHORT:0, MIXED:0 };
    const scoreMap = {};
    model.list.forEach(s => { dirCount[s.dir]++; scoreMap[s.symbol] = s; });
    const tfCount = {D:0,W:0,M:0,Q:0,Y:0}, kindCount = {TRIGGER:0,STATE:0,SETUP:0,PULLBACK:0}, nrPat = {};
    v.db.flat.forEach(r => {
      const c = classifySignal(r);
      tfCount[c.tf]++; kindCount[c.kind]++;
      if (r.Signal_Category==="NR_PATTERN") nrPat[r.Signal_Type] = (nrPat[r.Signal_Type]||0)+1;
    });
    const top20 = directional.slice(0,20);
    return {
      model, scoreMap, dirCount, tfCount, kindCount, nrPat,
      actNow: directional.filter(s=>s.score>=55).length,
      prepare: directional.filter(s=>s.score>=42).length,
      confluence: directional.filter(s=>s.htfTrig.length&&s.ltfTrig.length).length,
      avgTop20: top20.length ? top20.reduce((a,s)=>a+s.score,0)/top20.length : 0,
      actSet: new Set(directional.filter(s=>s.score>=55).map(s=>s.symbol)),
      topSet: new Set(v.db.top.map(r=>r.Symbol)),
      symSet: new Set(v.db.flat.map(r=>r.Symbol)),
      sectorStrength: Object.fromEntries(v.db.sectorAnalysis.map(s=>[s.Sector,s.Strength_Score])),
    };
  });
}
const jaccard = (a,b) => { if(!a.size&&!b.size) return 100; let i=0; a.forEach(x=>{if(b.has(x))i++;}); return i/(a.size+b.size-i)*100; };

function StackedColumns({ labels, rows, height=150 }) {
  // rows: [{ segments:[{key,label,value,color}] }]
  const maxT = Math.max(1,...rows.map(r=>r.segments.reduce((a,s)=>a+s.value,0)));
  const legend = rows[0] ? rows[0].segments : [];
  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",gap:10,height,padding:"0 4px"}}>
        {rows.map((r,i)=>{
          const tot = r.segments.reduce((a,s)=>a+s.value,0);
          return (
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:0}}>
              <div style={{fontSize:9,fontFamily:"var(--mono)",color:"var(--t2)"}}>{tot}</div>
              <div style={{width:"100%",maxWidth:56,height:(tot/maxT)*(height-18),display:"flex",flexDirection:"column-reverse",borderRadius:"4px 4px 0 0",overflow:"hidden"}}>
                {r.segments.map(s=><div key={s.key} title={`${labels[i]} · ${s.label}: ${s.value} (${tot?Math.round(s.value/tot*100):0}%)`} style={{height:`${tot?s.value/tot*100:0}%`,background:s.color,opacity:.85}}/>)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10,padding:"4px 4px 0"}}>{labels.map((l,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:8.5,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</div>)}</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>{legend.map(s=><div key={s.key} style={{display:"flex",alignItems:"center",gap:4,fontSize:9.5,color:"var(--t2)"}}><span style={{width:8,height:8,borderRadius:2,background:s.color}}/>{s.label}</div>)}</div>
    </div>
  );
}
const LegendRow = ({ items }) => (
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:6}}>{items.map(([l,c])=><div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:9.5,color:"var(--t2)"}}><span style={{width:10,height:3,borderRadius:2,background:c}}/>{l}</div>)}</div>
);

// Block A: breadth, focus pipeline, momentum, stock tracker
function TrendAnalyticsA({ versions, labels, vstats }) {
  const n = versions.length;
  const [baseMode, setBaseMode] = useState("prev");
  const baseIdx = baseMode==="prev" ? n-2 : 0;
  const L = vstats[n-1], B = vstats[baseIdx];
  const allSyms = useMemo(()=>{ const s=new Set(); vstats.forEach(v=>v.symSet.forEach(x=>s.add(x))); return [...s].sort(); },[vstats]);
  const defaultSym = (L.model.list.find(s=>s.dir!=="MIXED")||{}).symbol || allSyms[0] || "";
  const [trackSym, setTrackSym] = useState(defaultSym);
  const [trackInput, setTrackInput] = useState(defaultSym);

  const momentum = useMemo(()=>{
    const rows = L.model.list.filter(s=>s.dir!=="MIXED").map(s=>{
      const b = B.scoreMap[s.symbol];
      const bScore = b ? (b.dir===s.dir ? b.score : b.dir==="MIXED" ? b.score*0.5 : 0) : 0;
      return { s, base: b, bScore, delta: s.score - bScore, isNew: !b };
    });
    return {
      rising: [...rows].sort((a,b)=>b.delta-a.delta).slice(0,10),
      fading: Object.values(B.scoreMap).filter(b=>b.dir!=="MIXED" && b.score>=35).map(b=>{
        const l = L.scoreMap[b.symbol];
        const lScore = l ? (l.dir===b.dir ? l.score : 0) : 0;
        return { s:b, now:l, lScore, delta: lScore - b.score, gone: !l, flipped: l && l.dir!==b.dir && l.dir!=="MIXED" };
      }).sort((a,b)=>a.delta-b.delta).slice(0,10),
    };
  },[L,B]);
  const maxD = Math.max(1,...momentum.rising.map(r=>Math.abs(r.delta)),...momentum.fading.map(r=>Math.abs(r.delta)));

  const track = vstats.map(v=>v.scoreMap[trackSym]||null);
  const regimeOf = v => { const t=v.dirCount.LONG+v.dirCount.SHORT+v.dirCount.MIXED||1; return v.dirCount.SHORT/t>0.55?["Risk-Off","var(--short)"]:v.dirCount.LONG/t>0.55?["Risk-On","var(--long)"]:["Two-Way","var(--mixed)"]; };
  const pill = on => ({padding:"3px 9px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${on?"var(--acc)":"var(--b2)"}`,background:on?"var(--adim)":"var(--s2)",color:on?"var(--acc)":"var(--t2)"});

  return (
    <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14,alignItems:"stretch"}}>
        <FocusCard icon="🌡" title="Market Breadth & Regime" sub="Stocks by dominant direction in each file."
          learn={<>Breadth is the share of stocks leaning one way. A regime that stays <strong>Risk-Off</strong> for several files in a row is a trend in itself — fading it is expensive. The most important signal is a <strong>change</strong>: breadth turning after several files in one direction often marks a market turn before the index shows it.</>}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {vstats.map((v,i)=>{ const [t,c]=regimeOf(v); return <div key={i} style={{fontSize:9.5,padding:"3px 8px",borderRadius:5,border:`1px solid ${c}`,color:c,fontWeight:700}}>{labels[i]}: {t}</div>; })}
          </div>
          <TrendLineChart labels={labels} series={[
            {name:"Long",color:"var(--long)",values:vstats.map(v=>v.dirCount.LONG)},
            {name:"Short",color:"var(--short)",values:vstats.map(v=>v.dirCount.SHORT)},
            {name:"Mixed",color:"var(--mixed)",values:vstats.map(v=>v.dirCount.MIXED)}]}/>
          <LegendRow items={[["Long stocks","var(--long)"],["Short stocks","var(--short)"],["Mixed","var(--mixed)"]]}/>
        </FocusCard>
        <FocusCard icon="🎯" title="Focus Pipeline Trend" sub="How many stocks reach each quality tier per file."
          learn={<>This tells you whether the <strong>quality of opportunity</strong> is improving. Rising Act-Now and confluence counts = the market is producing clean setups (trade more). Falling counts with steady signal volume = lots of noise, little quality (trade less, be pickier). The top-20 average score is a single "opportunity temperature" number.</>}>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            {[["Act Now",vstats.map(v=>v.actNow),"var(--acc)"],["HTF+LTF confluence",vstats.map(v=>v.confluence),"var(--long)"],["Top-20 avg score",vstats.map(v=>Math.round(v.avgTop20)),"var(--mixed)"]].map(([l,arr,c])=>{
              const d = arr[n-1]-arr[n-2];
              return <div key={l} style={{flex:1,minWidth:110,background:"var(--s2)",borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:9.5,color:"var(--t3)"}}>{l}</div>
                <div style={{fontFamily:"var(--mono)",fontSize:18,fontWeight:700,color:c}}>{arr[n-1]} <span style={{fontSize:10.5,color:d>0?"var(--long)":d<0?"var(--short)":"var(--t3)"}}>{d>0?"▲":d<0?"▼":"•"}{Math.abs(d)}</span></div>
              </div>;
            })}
          </div>
          <TrendLineChart labels={labels} series={[
            {name:"Act Now",color:"var(--acc)",values:vstats.map(v=>v.actNow)},
            {name:"Prepare+",color:"var(--mixed)",values:vstats.map(v=>v.prepare)},
            {name:"Confluence",color:"var(--long)",values:vstats.map(v=>v.confluence)}]}/>
          <LegendRow items={[["Act Now (55+)","var(--acc)"],["Prepare+ (42+)","var(--mixed)"],["HTF+LTF confluence","var(--long)"]]}/>
        </FocusCard>
      </div>

      <FocusCard icon="🚀" title="Focus Score Momentum" sub={`Latest file vs ${baseMode==="prev"?"previous file":"first file"} — which stocks are gaining or losing evidence.`}
        right={<div style={{display:"flex",gap:4}}><div onClick={()=>setBaseMode("prev")} style={pill(baseMode==="prev")}>vs previous</div><div onClick={()=>setBaseMode("first")} style={pill(baseMode==="first")}>vs first</div></div>}
        learn={<>A stock whose Focus Score is <strong>climbing</strong> file after file is building evidence — more timeframes joining, fresh triggers firing. That's often more valuable than a static high score, because you're catching it early. <strong>Fading</strong> stocks are losing support: if you hold one, it's a reason to tighten stops. A "flipped" tag means the direction itself reversed.</>}
        style={{marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {[["▲ Rising — gaining evidence",momentum.rising,"var(--long)",true],["▼ Fading — losing evidence",momentum.fading,"var(--short)",false]].map(([title,rows,c,rising])=>(
            <div key={title}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:c}}>{title}</div>
                <ListCopy symbols={rows.map(r=>r.s.symbol)}/>
              </div>
              {rows.map(r=>(
                <div key={r.s.symbol} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid var(--b1)"}}>
                  <div style={{width:92}}><SymCell sym={r.s.symbol}/></div>
                  {biasBadge(r.s.dir,true)}
                  <div style={{flex:1,height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.abs(r.delta)/maxD*100}%`,height:"100%",background:c}}/></div>
                  <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",width:62,textAlign:"right"}}>{Math.round(rising?r.bScore:r.s.score)}→{Math.round(rising?r.s.score:r.lScore)}</span>
                  <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:c,width:34,textAlign:"right"}}>{r.delta>0?"+":""}{Math.round(r.delta)}</span>
                  {rising&&r.isNew&&<span style={{fontSize:8.5,padding:"1px 5px",borderRadius:3,background:"var(--adim)",color:"var(--acc)"}}>NEW</span>}
                  {!rising&&r.gone&&<span style={{fontSize:8.5,padding:"1px 5px",borderRadius:3,background:"var(--s3)",color:"var(--t3)"}}>GONE</span>}
                  {!rising&&r.flipped&&<span style={{fontSize:8.5,padding:"1px 5px",borderRadius:3,background:"var(--retd)",color:"var(--ret)"}}>FLIPPED</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </FocusCard>

      <FocusCard icon="🔎" title="Stock Tracker" sub="Follow any single stock through every file: direction, score and timeframe ladder."
        right={<div style={{display:"flex",gap:6,alignItems:"center"}}>
          <input list="trend-sym-list" value={trackInput} onChange={e=>{const v=e.target.value.toUpperCase();setTrackInput(v); if(allSyms.includes(v)) setTrackSym(v);}} placeholder="Type a symbol…" style={{background:"var(--s2)",border:"1px solid var(--b2)",borderRadius:6,color:"var(--t1)",fontSize:11.5,padding:"5px 9px",width:160,fontFamily:"var(--mono)"}}/>
          <datalist id="trend-sym-list">{allSyms.map(s=><option key={s} value={s}/>)}</datalist>
        </div>}
        learn={<>Use this to answer "is my stock getting better or worse?". Watch three things across files: whether the <strong>direction</strong> stays the same, whether the <strong>score</strong> climbs, and whether the ladder <strong>fills in</strong> (more timeframes turning the same colour). A ladder that fills from Daily upward is a new trend being born; one that empties from the top down is a trend dying.</>}
        style={{marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:16,alignItems:"start"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["File","Dir","Score","Ladder D·W·M·Q·Y","Signals","Why"].map(h=><th key={h} style={{background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{track.map((s,i)=>(
              <tr key={i} style={{borderBottom:"1px solid var(--b1)"}}>
                <td style={{padding:"6px 8px",color:"var(--t2)",whiteSpace:"nowrap"}}>{labels[i]}</td>
                {s ? <>
                  <td style={{padding:"6px 8px"}}>{biasBadge(s.dir,true)}</td>
                  <td style={{padding:"6px 8px",fontFamily:"var(--mono)",fontWeight:700,color:tierOf(s.score).color}}>{Math.round(s.score)}</td>
                  <td style={{padding:"6px 8px"}}><TFLadder ladder={s.ladder} sgn={s.sgn} cell={16} showLabels={false}/></td>
                  <td style={{padding:"6px 8px",fontFamily:"var(--mono)",color:"var(--t2)"}}>{s.signals.length}</td>
                  <td style={{padding:"6px 8px",fontSize:9.5,color:"var(--t3)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={s.reasons.join(" · ")}>{s.reasons[0]||"—"}</td>
                </> : <td colSpan={5} style={{padding:"6px 8px",color:"var(--t3)"}}>Not in this file (no signals)</td>}
              </tr>
            ))}</tbody>
          </table>
          <div>
            <div style={{fontSize:10.5,color:"var(--t2)",marginBottom:4}}><strong style={{color:"var(--acc)",fontFamily:"var(--mono)"}}>{trackSym}</strong> Focus Score by file</div>
            <TrendLineChart labels={labels} height={180} series={[{name:trackSym,color:"var(--acc)",values:track.map(s=>s?Math.round(s.score):0)}]}/>
          </div>
        </div>
      </FocusCard>
    </>
  );
}

// Block B: sector heatmap, mixes, transitions, stability
function TrendAnalyticsB({ versions, labels, vstats }) {
  const n = versions.length;
  const [secSort, setSecSort] = useState("delta");
  const sectors = useMemo(()=>{
    const names = new Set(); vstats.forEach(v=>Object.keys(v.sectorStrength).forEach(s=>names.add(s)));
    return [...names].map(sec=>{
      const vals = vstats.map(v=>v.sectorStrength[sec]??null);
      const known = vals.filter(x=>x!=null);
      return { sec, vals, delta: known.length>=2 ? known[known.length-1]-known[0] : 0, last: known.length?known[known.length-1]:0 };
    }).sort((a,b)=> secSort==="delta" ? b.delta-a.delta : b.last-a.last);
  },[vstats,secSort]);

  const TFC = { D:"#fbbf24", W:"#38bdf8", M:"#a78bfa", Q:"#00c896", Y:"#f472b6" };
  const KC = { TRIGGER:"var(--acc)", STATE:"var(--t3)", SETUP:"var(--ret)", PULLBACK:"var(--mixed)" };
  const NRC = { "Breakout":"var(--long)", "Breakdown":"var(--short)", "Near High":"var(--acc)", "Near Low":"var(--mixed)", "Back to NR":"var(--ret)" };

  const L = vstats[n-1], P = vstats[n-2];
  const states = ["LONG","SHORT","MIXED","ABSENT"];
  const trans = {};
  states.forEach(a=>{ trans[a]={}; states.forEach(b=>{ trans[a][b]=0; }); });
  const allSyms = new Set([...P.symSet, ...L.symSet]);
  allSyms.forEach(sym=>{
    const a = P.scoreMap[sym] ? P.scoreMap[sym].dir : "ABSENT";
    const b = L.scoreMap[sym] ? L.scoreMap[sym].dir : "ABSENT";
    trans[a][b]++;
  });
  const transMax = Math.max(1,...states.flatMap(a=>states.map(b=>a===b?0:trans[a][b])));
  const stColor = { LONG:"var(--long)", SHORT:"var(--short)", MIXED:"var(--mixed)", ABSENT:"var(--t3)" };

  const persistHist = useMemo(()=>{
    const cnt = {};
    vstats.forEach(v=>v.symSet.forEach(s=>{ cnt[s]=(cnt[s]||0)+1; }));
    const h = Array.from({length:n},()=>0);
    Object.values(cnt).forEach(k=>{ h[k-1]++; });
    return h;
  },[vstats,n]);
  const pMax = Math.max(1,...persistHist);

  const stabLabels = labels.slice(1);
  const stabTop = vstats.slice(1).map((v,i)=>Math.round(jaccard(vstats[i].topSet, v.topSet)));
  const stabAct = vstats.slice(1).map((v,i)=>Math.round(jaccard(vstats[i].actSet, v.actSet)));
  const pill = on => ({padding:"3px 9px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${on?"var(--acc)":"var(--b2)"}`,background:on?"var(--adim)":"var(--s2)",color:on?"var(--acc)":"var(--t2)"});

  return (
    <>
      <FocusCard icon="🗺" title="Sector Rotation Heatmap" sub="Strength score of every sector in every file. Green = strong, red = weak."
        right={<div style={{display:"flex",gap:4}}><div onClick={()=>setSecSort("delta")} style={pill(secSort==="delta")}>Sort: change</div><div onClick={()=>setSecSort("last")} style={pill(secSort==="last")}>Sort: latest</div></div>}
        learn={<>Money rotates: it leaves one sector and enters another. Read <strong>rows</strong> to see a sector warming up (cells turning greener left→right) or cooling. Read <strong>columns</strong> to see the whole market's leadership on a given day. The best long hunting ground is a sector that is both <strong>green now</strong> and <strong>improving</strong> (top of the list when sorted by change).</>}
        style={{marginBottom:14}}>
        <div style={{overflowX:"auto",maxHeight:440}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              <th style={{position:"sticky",top:0,background:"var(--s2)",padding:"6px 8px",fontSize:9,textAlign:"left",color:"var(--t3)",textTransform:"uppercase"}}>Sector</th>
              {labels.map((l,i)=><th key={i} style={{position:"sticky",top:0,background:"var(--s2)",padding:"6px 4px",fontSize:9,color:"var(--t3)",whiteSpace:"nowrap"}}>{l}</th>)}
              <th style={{position:"sticky",top:0,background:"var(--s2)",padding:"6px 8px",fontSize:9,color:"var(--t3)",textTransform:"uppercase"}}>Change</th>
            </tr></thead>
            <tbody>{sectors.map(r=>(
              <tr key={r.sec} className="sec-row">
                <td style={{padding:"4px 8px",color:sectorColor(r.sec),fontWeight:700,whiteSpace:"nowrap"}}>{r.sec}</td>
                {r.vals.map((v,i)=>(
                  <td key={i} style={{padding:2}}>
                    {v==null ? <div style={{height:22,textAlign:"center",color:"var(--t3)"}}>—</div> :
                    <div style={{position:"relative",height:22,borderRadius:3,background:"var(--s2)",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",minWidth:46}}>
                      <div style={{position:"absolute",inset:0,background:v>=50?"var(--long)":"var(--short)",opacity:Math.min(.75,Math.abs(v-50)/50*1.2)}}/>
                      <span style={{position:"relative",fontFamily:"var(--mono)",fontSize:10,fontWeight:600,color:"var(--t1)"}}>{v.toFixed(0)}</span>
                    </div>}
                  </td>
                ))}
                <td style={{padding:"4px 8px",fontFamily:"var(--mono)",fontWeight:700,color:r.delta>0?"var(--long)":r.delta<0?"var(--short)":"var(--t3)"}}>{r.delta>0?"+":""}{r.delta.toFixed(1)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </FocusCard>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14,marginBottom:14}}>
        <FocusCard icon="⏳" title="Timeframe Mix" sub="Which timeframe the signals come from, per file."
          learn={<>If the share of <strong>Quarterly/Yearly</strong> signals grows, big structural levels are being tested — expect larger, longer moves. A mix dominated by <strong>Daily/Weekly</strong> signals means short-term churn; swing trading beats positional holding in that environment.</>}>
          <StackedColumns labels={labels} rows={vstats.map(v=>({segments:FOCUS_TFS.map(t=>({key:t,label:TF_NAME[t],value:v.tfCount[t],color:TFC[t]}))}))}/>
        </FocusCard>
        <FocusCard icon="⚙️" title="Event Mix" sub="Fresh triggers vs holding states vs forming setups."
          learn={<>A rising <strong>Trigger</strong> share means the market is <em>moving</em> — levels are breaking. A rising <strong>Setup</strong> share means it's <em>coiling</em> — levels are being approached but not broken; a burst of triggers usually follows. <strong>State</strong> is inertia — trends just holding.</>}>
          <StackedColumns labels={labels} rows={vstats.map(v=>({segments:[["TRIGGER","Trigger"],["STATE","State"],["SETUP","Setup"],["PULLBACK","Pullback"]].map(([k,l])=>({key:k,label:l,value:v.kindCount[k],color:KC[k]}))}))}/>
        </FocusCard>
        <FocusCard icon="📐" title="NR Pattern Mix" sub="Narrow-range outcomes per file."
          learn={<>Narrow ranges end in one of two ways — breakout or breakdown. Watching the <strong>Breakout vs Breakdown</strong> balance across files tells you which way compressed energy is releasing. Many <strong>Near High/Near Low</strong> patterns mean lots of pending decisions — alerts matter more than entries.</>}>
          <StackedColumns labels={labels} rows={vstats.map(v=>({segments:["Breakout","Breakdown","Near High","Near Low","Back to NR"].map(k=>({key:k,label:k,value:v.nrPat[k]||0,color:NRC[k]}))}))}/>
        </FocusCard>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14,marginBottom:14,alignItems:"stretch"}}>
        <FocusCard icon="🔀" title="Direction Transitions" sub={`How each stock's direction moved from ${labels[n-2]} (rows) to ${labels[n-1]} (columns).`}
          learn={<>The <strong>diagonal</strong> is stability — stocks that kept their direction. Off-diagonal cells are change. <strong>SHORT→LONG</strong> is the most interesting cell for bottom-fishers; <strong>LONG→SHORT</strong> is the warning cell for anyone holding longs. A big <strong>ABSENT→</strong> row means many brand-new names entered the signal universe.</>}>
          <table style={{borderCollapse:"separate",borderSpacing:3,width:"100%"}}>
            <thead><tr><th style={{fontSize:8.5,color:"var(--t3)",textAlign:"left"}}>from ↓ / to →</th>{states.map(s=><th key={s} style={{fontSize:9,color:stColor[s],fontWeight:700}}>{s}</th>)}</tr></thead>
            <tbody>{states.map(a=>(
              <tr key={a}>
                <td style={{fontSize:9,color:stColor[a],fontWeight:700}}>{a}</td>
                {states.map(b=>{
                  const v = trans[a][b], diag = a===b;
                  return <td key={b} style={{position:"relative",textAlign:"center",padding:"9px 4px",borderRadius:5,background:"var(--s2)",border:`1px solid ${diag?"var(--b2)":"var(--b1)"}`}}>
                    {!diag && <div style={{position:"absolute",inset:0,borderRadius:5,background:stColor[b],opacity:v?Math.min(.55,.1+v/transMax*.45):0}}/>}
                    <span style={{position:"relative",fontFamily:"var(--mono)",fontSize:12,fontWeight:700,color:v?(diag?"var(--t2)":"var(--t1)"):"var(--t3)"}}>{a==="ABSENT"&&b==="ABSENT"?"—":v}</span>
                  </td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </FocusCard>
        <FocusCard icon="🧷" title="List Stability" sub="Overlap between consecutive files (100% = identical list)."
          learn={<>High overlap means your watchlist stays valid day to day — ideas get time to play out. Low overlap in the <strong>Act Now</strong> list means leadership is rotating fast: act quickly on today's names or skip them, because tomorrow's list will be different.</>}>
          {n>=2 ? <>
            <TrendLineChart labels={stabLabels.length>1?stabLabels:[labels[0],...stabLabels]} height={170} series={stabLabels.length>1?[
              {name:"Top Opportunities",color:"var(--acc)",values:stabTop},{name:"Act Now",color:"var(--mixed)",values:stabAct}]:[
              {name:"Top Opportunities",color:"var(--acc)",values:[100,...stabTop]},{name:"Act Now",color:"var(--mixed)",values:[100,...stabAct]}]}/>
            <LegendRow items={[["Top Opportunities overlap %","var(--acc)"],["Act Now overlap %","var(--mixed)"]]}/>
            <div style={{fontSize:10.5,color:"var(--t2)",marginTop:6}}>Latest: Top list <strong style={{color:"var(--acc)"}}>{stabTop[stabTop.length-1]}%</strong> · Act Now <strong style={{color:"var(--mixed)"}}>{stabAct[stabAct.length-1]}%</strong> same as previous file.</div>
          </> : null}
        </FocusCard>
        <FocusCard icon="📚" title="Persistence Distribution" sub="How many files each stock appeared in. Copy = stocks present in every file."
          right={<ListCopy symbols={[...vstats[n-1].symSet].filter(s=>vstats.every(v=>v.symSet.has(s)))}/>}
          learn={<>Stocks showing up in <strong>every</strong> file are persistent themes — the market keeps flagging them. Stocks seen only once are one-day events. The right-most bar is your "reliable universe"; select all files in the Control Tower scope to have these names rewarded with a persistence bonus.</>}>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:150}}>
            {persistHist.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{fontSize:9.5,fontFamily:"var(--mono)",color:"var(--t2)"}}>{v}</div>
                <div style={{width:"100%",maxWidth:48,height:Math.max(3,v/pMax*120),background:i===n-1?"var(--acc)":"var(--b2)",borderRadius:"4px 4px 0 0"}}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>{persistHist.map((_,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:9,color:"var(--t3)"}}>{i+1}/{n}</div>)}</div>
        </FocusCard>
      </div>
    </>
  );
}

// ─── SETUP ENGINE (use-case playbooks) ────────────────────────────────────────
function overlapPair(nl) {
  const i = nl.indexOf("overlap");
  const tail = i>=0 ? nl.slice(i+8) : nl;
  const out = [];
  tail.split("_").forEach(tok => {
    let tf = TF_WORDS[tok] || null;
    if (!tf && /^[dwmqy]$|^[dwmqy][hl]?z[hl]?$/.test(tok)) tf = tok[0].toUpperCase();
    if (tf && !out.includes(tf)) out.push(tf);
  });
  return out.join("/");
}
function lookbackOf(nl) {
  const m = nl.match(/last_(\d)_?(mon|month|wk|week|day|quarter|year)/);
  if (!m) return "";
  const u = { mon:"month", month:"month", wk:"week", week:"week", day:"day", quarter:"quarter", year:"year" }[m[2]];
  return `${m[1]}-${u}`;
}
const isNRName = nl => /^[dwmqy]_nr?_/.test(nl);

const SETUP_DEFS = [
  { id:"virgin", icon:"🔓", title:"Virgin Break", short:"Virgin", rank:11,
    sub:"First-ever break of a zone in the lookback — no trapped traders on the other side.",
    learn:<>A <strong>virgin</strong> level has never been broken in the lookback window, so nobody is sitting on losses waiting to sell (for a breakout) or buy (for a breakdown). With no overhead supply, moves tend to be fast. Longer lookbacks (quarters, years) are rarer and stronger.</>,
    match:(nl)=>nl.includes("virgin"), detail:(nl)=>lookbackOf(nl) },
  { id:"overlapBreak", icon:"💥", title:"Overlap Zone Break", short:"Overlap BO/BD", rank:10,
    sub:"Price closed through zones of two timeframes stacked on top of each other.",
    learn:<>When a zone on one timeframe overlaps a zone on another (e.g. Weekly top zone sitting on the Monthly bottom zone), that price band is <strong>double resistance / double support</strong>. Breaking through it takes real force — so a close beyond it is one of the <strong>strongest breakout / breakdown</strong> signals you have. The tag shows which timeframes overlapped (e.g. W/M).</>,
    match:(nl)=>nl.includes("overlap") && !nl.includes("near"), detail:(nl)=>overlapPair(nl)+" overlap" },
  { id:"zoneCross", icon:"⚡", title:"Fresh Zone Cross", short:"Zone Cross", rank:8,
    sub:"Close crossed a zone on this bar — the event just happened.",
    learn:<>"Above zone" is a state; "<strong>crossed</strong> above zone" is an event that happened on this candle. Fresh crosses are where momentum begins. The tag shows which timeframe's zone was crossed — Monthly/Quarterly crosses matter far more than Daily ones.</>,
    match:(nl)=>(nl.includes("crossed")||/_cro_|csd/.test(nl)) && !nl.includes("overlap") && !nl.startsWith("last_"), detail:(nl,g)=>`${TF_NAME[g.tf]} zone` },
  { id:"nrBreak", icon:"📐", title:"NR Expansion", short:"NR Break", rank:7,
    sub:"Price broke out of / down from a narrow-range (compressed) bar.",
    learn:<>A narrow range is the smallest candle of the last N bars — volatility compression. Compression is followed by expansion, and the direction of the break tells you which way. Breaks on <strong>several timeframes at once</strong> are much stronger than a single Daily NR break.</>,
    match:(nl,g)=>g.event==="BREAKOUT"||g.event==="BREAKDOWN", detail:(nl,g)=>{ const m=nl.match(/_(\d+)[dwmqy]_/); return `${g.tf} NR${m?m[1]:""}`; } },
  { id:"flag", icon:"🚩", title:"Flag / Trend Break", short:"Flag", rank:6,
    sub:"An established trend broke its zone the other way — reversal or flag resolution.",
    learn:<>After an up-trend of N bars, a close <strong>below</strong> the low zone says the trend has broken (short). After a down-trend, a close <strong>above</strong> the high zone says sellers are exhausted (long). The lookback (e.g. 4-month) tells you how big the trend being broken was.</>,
    match:(nl)=>nl.startsWith("last_") && !nl.includes("virgin") && !nl.includes("nearto"), detail:(nl)=>lookbackOf(nl)+" trend" },
  { id:"between", icon:"🪜", title:"Between Zones — Room to Run", short:"Room to Run", rank:5,
    sub:"Broke one timeframe's zone; the next higher-TF zone is the target / obstacle.",
    learn:<>The stock has cleared a lower-timeframe zone but hasn't reached the higher-timeframe zone yet. The distance between the two is <strong>room to run</strong> — a natural target. When the next zone is reached, expect a reaction; if it later breaks too, it may graduate to an Overlap or Zone Cross setup.</>,
    match:(nl)=>/(above|abv)/.test(nl) && /(below|blw)/.test(nl) && !nl.includes("overlap") && !nl.includes("near"),
    detail:(nl)=>{ const i=nl.indexOf("close"); const r=tfRefsIn(i>=0?nl.slice(i+5):nl); return r.length>=2?`${r[0]} → ${r[1]} zone`:""; } },
  { id:"overlapRetrace", icon:"↩️", title:"Overlap Retracement", short:"Overlap Retrace", rank:4,
    sub:"Near a zone whose low overlaps another timeframe's top zone — pullback into double support.",
    learn:<>When the <strong>lower zone</strong> of one timeframe overlaps the <strong>top zone</strong> of another, a pullback into that band meets support from both. That's a classic <strong>retracement entry</strong>: buy the dip into double support (or sell the rally into double resistance for the ▼ side). Invalidation is a close through the whole overlap band.</>,
    match:(nl)=>/near_[dwmqy]z_(low|high)_overlap/.test(nl), detail:(nl)=>overlapPair(nl)+" band" },
  { id:"trendPullback", icon:"🎢", title:"Trend Pullback to Zone", short:"Trend Pullback", rank:3,
    sub:"Established trend pulling back near its zone — buy-the-dip / sell-the-rally.",
    learn:<>An up-trend of N bars with price back near the <strong>low zone</strong> is the textbook buy-the-dip: the trend is intact and you're buying near support. The mirror (down-trend near the high zone) is sell-the-rally. Wait for a lower-timeframe trigger (Daily NR break or zone cross) before entering.</>,
    match:(nl)=>nl.startsWith("last_") && nl.includes("nearto"), detail:(nl)=>lookbackOf(nl)+" trend" },
  { id:"overlapWall", icon:"🧱", title:"Testing Overlap Wall", short:"Overlap Wall", rank:2,
    sub:"Price is right at stacked zones of two timeframes — very strong support/resistance.",
    learn:<>Price is <strong>at</strong> the overlap band but hasn't broken it. ▼ rows are just <strong>below stacked resistance</strong>: a rejection here is a short, but a close above turns it into a very strong <strong>Overlap Zone Break</strong> — set an alert. ▲ rows are sitting <strong>on stacked support</strong>: bounce candidates, and a close below would be a strong breakdown.</>,
    match:(nl)=>/near_and_(abv|blw)_overlap/.test(nl), detail:(nl)=>overlapPair(nl)+(nl.includes("abv")?" support":" resistance") },
  { id:"bearTrap", icon:"🪤", title:"Failed Breakdown (Back to NR)", short:"Bear Trap", rank:1.5,
    sub:"Broke below the NR range, then came back inside — trapped sellers.",
    learn:<>Price broke down, sellers piled in, then price came back inside the range. Those sellers are now trapped and their stops sit above — fuel for a move up. Stronger on higher timeframes.</>,
    match:(nl,g)=>g.event==="RECLAIM", detail:(nl,g)=>`${g.tf} NR` },
  { id:"nrCoil", icon:"🎯", title:"Near NR Breakout — set alerts", short:"Near NR Break", rank:1,
    sub:"Price is close to the mother candle High (▲) or Low (▼) — the breakout has not happened yet.",
    learn:<>These are <strong>alerts, not trades</strong>. Price is inside the mother candle and within 5% of its High (▲) or Low (▼). Set an alert at that edge; when it closes beyond, the stock moves to the NR Expansion list.</>,
    match:(nl,g)=>g.event==="NEAR" && isNRName(nl), detail:(nl,g)=>{ const m=nl.match(/_(\d+)[dwmqy]_/); return `${g.tf} NR${m?m[1]:""}`; } },
];
const SETUP_BY_ID = Object.fromEntries(SETUP_DEFS.map(d=>[d.id,d]));

// For one stock (from buildFocusModel): { setupId: { dir, details[], n } }
function stockSetups(s) {
  if (s._setups) return s._setups;
  const acc = {};
  s.signals.forEach(g => {
    const nl = g.name.toLowerCase();
    SETUP_DEFS.forEach(d => {
      if (!d.match(nl, g)) return;
      const e = acc[d.id] || (acc[d.id] = { up:0, dn:0, details:[] });
      if (g.dir>0) e.up++; else if (g.dir<0) e.dn++;
      const det = d.detail(nl, g);
      if (det && !e.details.includes(det)) e.details.push(det);
    });
  });
  const out = {};
  Object.entries(acc).forEach(([id,e]) => {
    const dir = e.up>e.dn ? 1 : e.dn>e.up ? -1 : (s.sgn||1);
    out[id] = { dir, details:e.details, n:e.up+e.dn };
  });
  s._setups = out;
  return out;
}

// ─── SETUP SCANNER UI ─────────────────────────────────────────────────────────
function SetupAlsoChips({ s, currentId, dir }) {
  const all = stockSetups(s);
  const cur = SETUP_BY_ID[currentId];
  const others = Object.entries(all).filter(([id])=>id!==currentId).map(([id,e])=>({ d:SETUP_BY_ID[id], e }))
    .sort((a,b)=>b.d.rank-a.d.rank);
  if (!others.length) return <span style={{fontSize:9,color:"var(--t3)"}}>—</span>;
  return (
    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
      {others.map(({d,e})=>{
        const same = e.dir===dir, better = same && d.rank>cur.rank;
        return (
          <span key={d.id} title={`${d.title} (${e.dir>0?"▲":"▼"}) ${e.details.join(", ")}${better?" — stronger setup than this one":""}${!same?" — opposite direction":""}`}
            style={{fontSize:9,padding:"1px 5px",borderRadius:3,whiteSpace:"nowrap",fontWeight:better?700:500,
              border:`1px solid ${better?"#f5b301":same?"var(--b2)":"var(--short)"}`,
              background:better?"rgba(245,179,1,.12)":"transparent",
              color:!same?"var(--short)":better?"#d99a00":"var(--t2)",textDecoration:!same?"line-through":"none"}}>
            {better?"⬆ ":""}{d.icon} {d.short}
          </span>
        );
      })}
    </div>
  );
}

function SetupCard({ def, rows, open }) {
  const [tab, setTab] = useState("ALL");
  const [showAll, setShowAll] = useState(false);
  const nL = rows.filter(r=>r.e.dir>0).length, nS = rows.length-nL;
  const shown = rows.filter(r=>tab==="ALL"||(tab==="L"?r.e.dir>0:r.e.dir<0));
  const vis = showAll ? shown : shown.slice(0,12);
  const tabBtn = (k,l,c) => <div onClick={()=>setTab(k)} style={{padding:"2px 8px",borderRadius:5,fontSize:10,cursor:"pointer",fontWeight:600,border:`1px solid ${tab===k?c:"var(--b2)"}`,color:tab===k?c:"var(--t2)",background:tab===k?"var(--adim)":"var(--s2)"}}>{l}</div>;
  return (
    <div id={`setup-${def.id}`} style={{scrollMarginTop:120,display:"flex"}}>
      <FocusCard icon={def.icon} title={def.title} sub={def.sub} learn={def.learn} style={{flex:1}}
        right={<ListCopy symbols={shown.map(r=>r.s.symbol)}/>}>
        <div style={{display:"flex",gap:4,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
          {tabBtn("ALL",`All ${rows.length}`,"var(--acc)")}{tabBtn("L",`▲ ${nL}`,"var(--long)")}{tabBtn("S",`▼ ${nS}`,"var(--short)")}
          <span style={{marginLeft:"auto",fontSize:9,color:"var(--t3)"}}>Also = other setups this stock qualifies for · <span style={{color:"#d99a00",fontWeight:700}}>⬆ gold</span> = stronger</span>
        </div>
        <div style={{maxHeight:330,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["","Symbol","Setup","Score","Also has"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"5px 6px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",zIndex:1}}>{h}</th>)}</tr></thead>
            <tbody>
              {vis.map(({s,e})=>{
                const against = s.dir!=="MIXED" && e.dir!==s.sgn;
                return (
                  <tr key={s.symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"5px 4px",color:e.dir>0?"var(--long)":"var(--short)",fontWeight:700}}>{e.dir>0?"▲":"▼"}</td>
                    <td style={{padding:"5px 6px",whiteSpace:"nowrap"}}>
                      <FocusSym sym={s.symbol} onOpen={open}/>
                      <div style={{fontSize:8.5,color:sectorColor(s.sector),maxWidth:110,overflow:"hidden",textOverflow:"ellipsis"}}>{s.sector}</div>
                    </td>
                    <td style={{padding:"5px 6px"}}>
                      <div style={{fontSize:10,color:"var(--t1)",fontFamily:"var(--mono)"}}>{e.details.slice(0,2).join(" · ")||"—"}</div>
                      {against && <div style={{fontSize:8.5,color:"var(--mixed)"}}>⚠ against stock's {s.dir} bias</div>}
                    </td>
                    <td style={{padding:"5px 6px"}}>
                      <span style={{fontFamily:"var(--mono)",fontWeight:700,color:tierOf(s.score).color}}>{Math.round(s.score)}</span>
                      {s.score>=55 && <div style={{fontSize:8,color:"var(--acc)",fontWeight:700}}>ACT NOW</div>}
                      {s.htfTrig.length>0&&s.ltfTrig.length>0 && <div style={{fontSize:8,color:"var(--long)",fontWeight:700}}>HTF+LTF</div>}
                    </td>
                    <td style={{padding:"5px 6px"}}><SetupAlsoChips s={s} currentId={def.id} dir={e.dir}/></td>
                  </tr>
                );
              })}
              {!vis.length && <tr><td colSpan={5} style={{padding:14,color:"var(--t3)",textAlign:"center"}}>No stocks in this setup today.</td></tr>}
            </tbody>
          </table>
        </div>
        {shown.length>12 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 12":`Show all ${shown.length}`}</button>}
      </FocusCard>
    </div>
  );
}

function SetupScanner({ list, open, extra=null, zoneLevels=null, lockDir=null }) {
  const [minStack, setMinStack] = useState(3);
  const [stackAll, setStackAll] = useState(false);
  const bySetup = useMemo(()=>{
    const m = {}; SETUP_DEFS.forEach(d=>{ m[d.id]=[]; });
    list.forEach(s=>{ Object.entries(stockSetups(s)).forEach(([id,e])=>{ m[id].push({s,e}); }); });
    Object.values(m).forEach(arr=>arr.sort((a,b)=>b.s.score-a.s.score));
    return m;
  },[list]);
  const stacked = useMemo(()=>list.map(s=>{
    const st = stockSetups(s);
    const sgn = s.dir==="MIXED" ? (Object.values(st).reduce((a,e)=>a+e.dir,0)>=0?1:-1) : s.sgn;
    const aligned = Object.entries(st).filter(([,e])=>e.dir===sgn).map(([id])=>SETUP_BY_ID[id]).sort((a,b)=>b.rank-a.rank);
    const opposed = Object.entries(st).filter(([,e])=>e.dir!==sgn).map(([id])=>SETUP_BY_ID[id]);
    return { s, sgn, aligned, opposed, rankSum: aligned.reduce((a,d)=>a+d.rank,0) };
  }).filter(r=>r.aligned.length>=minStack)
    .sort((a,b)=>b.aligned.length-a.aligned.length || b.rankSum-a.rankSum || b.s.score-a.s.score),[list,minStack]);
  const stackVis = stackAll ? stacked : stacked.slice(0,20);
  const jump = id => { const el=document.getElementById(`setup-${id}`); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); };

  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,margin:"6px 0 10px",flexWrap:"wrap"}}>
        <div style={{fontSize:18,fontWeight:700,color:"var(--t1)"}}>🎯 Setup Scanner</div>
        <div style={{fontSize:12,color:"var(--t2)"}}>Use-case lists — each stock also shows every other setup it qualifies for.</div>
      </div>

      {/* Navigator */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {extra && <div className="version-chip" onClick={()=>{const el=document.getElementById("ct-trap"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"});}} title="Failed NR breakout / breakdown, price back at the other mother edge" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"var(--s1)",border:"1px solid var(--accborder)"}}><span>🪤</span><span style={{fontSize:11,fontWeight:600,color:"var(--t1)"}}>NR Trap</span></div>}
        {SETUP_DEFS.map(d=>{
          const rows = bySetup[d.id], nL = rows.filter(r=>r.e.dir>0).length, nS = rows.length-nL;
          return (
            <div key={d.id} className="version-chip" onClick={()=>jump(d.id)} title={d.sub} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"var(--s1)",border:"1px solid var(--b1)",opacity:rows.length?1:.5}}>
              <span>{d.icon}</span>
              <span style={{fontSize:11,fontWeight:600,color:"var(--t1)"}}>{d.short}</span>
              <span style={{fontSize:10,fontFamily:"var(--mono)",color:"var(--long)"}}>▲{nL}</span>
              <span style={{fontSize:10,fontFamily:"var(--mono)",color:"var(--short)"}}>▼{nS}</span>
            </div>
          );
        })}
      </div>

      {/* Intraday momentum — first thing in the scanner */}
      <Anchor id="ct-intraday"/>
      {zoneLevels && zoneLevels.length
        ? <ZoneBreakoutAnalyser zoneLevels={zoneLevels} list={list} open={open} lockDir={lockDir}/>
        : <IntradayMomentumCard list={list} open={open}/>}

      {/* Stacked setups */}
      <Anchor id="ct-stacked"/>
      <FocusCard icon="🏆" title="Stacked Setups — multiple playbooks agree" style={{marginBottom:12}}
        sub={`Stocks qualifying for ${minStack}+ setups in the same direction. Strongest setups listed first.`}
        right={<>
          {[2,3,4].map(k=><div key={k} onClick={()=>setMinStack(k)} style={{padding:"3px 9px",borderRadius:5,fontSize:10.5,cursor:"pointer",border:`1px solid ${minStack===k?"var(--acc)":"var(--b2)"}`,color:minStack===k?"var(--acc)":"var(--t2)",background:minStack===k?"var(--adim)":"var(--s2)"}}>{k}+</div>)}
          <ListCopy symbols={stacked.map(r=>r.s.symbol)}/>
        </>}
        learn={<>One setup is an idea; several different setups on the same stock pointing the same way is <strong>evidence</strong>. For example a stock that is a <em>Virgin Break</em> + <em>Overlap Zone Break</em> + <em>NR Expansion</em> has three independent reasons to move. Struck-through red chips are setups pointing the <strong>opposite</strong> way — they don't cancel the idea but deserve a look.</>}>
        <div style={{maxHeight:420,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["#","Symbol","Dir","Setups (aligned)","Opposing","Score","Ladder"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"5px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",zIndex:1}}>{h}</th>)}</tr></thead>
            <tbody>
              {stackVis.map((r,i)=>(
                <tr key={r.s.symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                  <td style={{padding:"5px 8px",fontFamily:"var(--mono)",color:"var(--t3)"}}>{i+1}</td>
                  <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}><FocusSym sym={r.s.symbol} onOpen={open}/><div style={{fontSize:8.5,color:sectorColor(r.s.sector)}}>{r.s.sector}</div></td>
                  <td style={{padding:"5px 8px"}}>{biasBadge(r.sgn>0?"LONG":"SHORT",true)}</td>
                  <td style={{padding:"5px 8px"}}>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                      {r.aligned.map(d=><span key={d.id} onClick={()=>jump(d.id)} title={`${d.title}: ${stockSetups(r.s)[d.id].details.join(", ")}`} style={{cursor:"pointer",fontSize:9.5,padding:"1px 6px",borderRadius:3,border:`1px solid ${r.sgn>0?"var(--long)":"var(--short)"}`,color:r.sgn>0?"var(--long)":"var(--short)",whiteSpace:"nowrap"}}>{d.icon} {d.short}</span>)}
                    </div>
                  </td>
                  <td style={{padding:"5px 8px"}}>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                      {r.opposed.map(d=><span key={d.id} title={d.title} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid var(--short)",color:"var(--short)",textDecoration:"line-through",whiteSpace:"nowrap"}}>{d.icon} {d.short}</span>)}
                      {!r.opposed.length && <span style={{fontSize:9,color:"var(--t3)"}}>none</span>}
                    </div>
                  </td>
                  <td style={{padding:"5px 8px",fontFamily:"var(--mono)",fontWeight:700,color:tierOf(r.s.score).color}}>{Math.round(r.s.score)}</td>
                  <td style={{padding:"5px 8px"}}><TFLadder ladder={r.s.ladder} sgn={r.s.sgn} cell={14} showLabels={false}/></td>
                </tr>
              ))}
              {!stackVis.length && <tr><td colSpan={7} style={{padding:14,color:"var(--t3)",textAlign:"center"}}>No stock has {minStack}+ aligned setups with these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {stacked.length>20 && <button onClick={()=>setStackAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{stackAll?"Show top 20":`Show all ${stacked.length}`}</button>}
      </FocusCard>

      <Anchor id="ct-setupcards"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(460px,1fr))",gap:12}}>
        {SETUP_DEFS.map(d=><SetupCard key={d.id} def={d} rows={bySetup[d.id]} open={open}/>)}
      </div>
      {extra && <div style={{marginTop:14}}>{extra}</div>}
    </div>
  );
}

function DeepDiveSetups({ s }) {
  const st = Object.entries(stockSetups(s)).map(([id,e])=>({d:SETUP_BY_ID[id],e})).sort((a,b)=>b.d.rank-a.d.rank);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700,marginBottom:8}}>🎯 Setups this stock qualifies for ({st.length}) — strongest first</div>
      {!st.length && <div style={{fontSize:11,color:"var(--t3)"}}>No named setup — signals are general zone states.</div>}
      {st.map(({d,e})=>(
        <div key={d.id} style={{display:"flex",gap:8,alignItems:"baseline",padding:"4px 0",borderBottom:"1px solid var(--b1)"}}>
          <span style={{color:e.dir>0?"var(--long)":"var(--short)",fontWeight:700,width:12}}>{e.dir>0?"▲":"▼"}</span>
          <span style={{fontSize:11.5,fontWeight:600,color:"var(--t1)",minWidth:170}}>{d.icon} {d.title}</span>
          <span style={{fontSize:10,fontFamily:"var(--mono)",color:"var(--t2)"}}>{e.details.join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
//   CONTROL TOWER v6 — equal-height rows, Opportunities, Hidden Return, Intraday
// ════════════════════════════════════════════════════════════════════════════

// Equal-height row: every widget in the row gets the same fixed height and scrolls inside.
function EqRow({ children, height=380, min=280, cols, style }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <div style={{display:"grid",gridTemplateColumns: cols || `repeat(auto-fit,minmax(${min}px,1fr))`,gap:12,marginBottom:12,...style}}>
      {kids.map((k,i)=><div key={i} className="eq-cell" style={{height}}>{k}</div>)}
    </div>
  );
}

function ViewToggle({ value, onChange, options=[["list","☰ List"],["bubble","◉ Bubble"]] }) {
  return (
    <div style={{display:"inline-flex",border:"1px solid var(--b2)",borderRadius:6,overflow:"hidden",flexShrink:0}}>
      {options.map(([k,l])=>(
        <button key={k} onClick={()=>onChange(k)} style={{padding:"3px 9px",fontSize:10.5,fontWeight:600,background:value===k?"var(--adim)":"var(--s2)",color:value===k?"var(--acc)":"var(--t2)",borderRight:"1px solid var(--b2)"}}>{l}</button>
      ))}
    </div>
  );
}

function Pill({ active, color="var(--acc)", onClick, children, title }) {
  return <div title={title} onClick={onClick} style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",border:`1px solid ${active?color:"var(--b2)"}`,background:active?"var(--adim)":"var(--s2)",color:active?color:"var(--t2)"}}>{children}</div>;
}

// Jump target for the Control Tower side nav
const Anchor = ({ id }) => <div id={id} data-ct-anchor="1" style={{height:0,scrollMarginTop:104}}/>;
// State that follows a global value when one is set (side-nav Long/Short), otherwise is local
function useLockable(lockVal, init) {
  const [v, setV] = useState(init);
  return [lockVal!=null ? lockVal : v, lockVal!=null ? ()=>{} : setV];
}

const SectionTitle = ({ icon, title, sub, right }) => (
  <div style={{display:"flex",alignItems:"flex-end",gap:10,flexWrap:"wrap",margin:"4px 0 12px"}}>
    <div style={{flex:1,minWidth:260}}>
      <div style={{fontSize:18,fontWeight:700,color:"var(--t1)"}}>{icon} {title}</div>
      {sub && <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ─── SECTOR / INDUSTRY with list ↔ bubble toggle ──────────────────────────────
function SectorLeaderboardPanelV2({ db }) {
  const [view, setView] = useState("bubble");
  const sectors = useMemo(()=>[...db.sectorAnalysis].sort((a,b)=>b.Strength_Score-a.Strength_Score),[db.sectorAnalysis]);
  const top10 = sectors.slice(0,10);
  const maxScore = Math.max(...top10.map(s=>s.Strength_Score),1);
  const topSyms = useMemo(()=> top10[0] ? db.master.filter(m=>m.Sector===top10[0].Sector).map(m=>m.Symbol) : [], [top10, db.master]);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",display:"flex",alignItems:"center",flex:1}}>🏭 Sector Strength Leaderboard
          <InfoTip><strong>List</strong>: strongest sectors by strength score (breadth + signal bias + price momentum). <strong>Bubble</strong>: every sector — x = net bias (bearish ← → bullish), y = strength, <strong>bubble size = signal intensity</strong> (total signals). Big bubbles in the top-right = strong, busy, bullish sectors.</InfoTip>
        </div>
        <ViewToggle value={view} onChange={setView}/>
        {view==="list" && top10[0] && <ListCopy symbols={topSyms} compact/>}
      </div>
      {view==="list" ? top10.map((s,i)=>{
        const c=sectorColor(s.Sector), pct=s.Strength_Score/maxScore*100;
        return (
          <div key={s.Sector} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",width:14,flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:6}}>
                <span style={{fontSize:11,fontWeight:600,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.Sector}</span>
                <span style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:9.5,fontFamily:"var(--mono)",color:s.Net_Bias_Score>=0?"var(--long)":"var(--short)"}}>{s.Net_Bias_Score>0?"+":""}{s.Net_Bias_Score}</span>
                  {strengthBadge(s.Strength_Label,true)}
                </span>
              </div>
              <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:3}}/></div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:c,width:38,textAlign:"right",flexShrink:0}}>{s.Strength_Score.toFixed(1)}</div>
          </div>
        );
      }) : (
        <RotationQuadrantChart height={360}
          items={sectors.map(s=>({key:s.Sector,label:s.Sector,x:s.Net_Bias_Score,y:s.Strength_Score,size:s.Total_Signal_Count,color:sectorColor(s.Sector),
            tooltip:`${s.Sector}: strength ${s.Strength_Score.toFixed(1)} · net bias ${s.Net_Bias_Score} · ${s.Total_Signal_Count} signals across ${s.Total_Stocks} stocks`}))}/>
      )}
    </div>
  );
}

function IndustryMomentumPanelV2({ db }) {
  const [view, setView] = useState("bubble");
  const [mode, setMode] = useState("top");
  const sorted = useMemo(()=>[...db.industryAnalysis].sort((a,b)=>b.Net_Bias_Score-a.Net_Bias_Score),[db.industryAnalysis]);
  const data = mode==="top" ? sorted.slice(0,10) : [...sorted].reverse().slice(0,10);
  const maxAbs = Math.max(...data.map(d=>Math.abs(d.Net_Bias_Score)),1);
  const bubbles = useMemo(()=>[...db.industryAnalysis].sort((a,b)=>b.Total_Signal_Count-a.Total_Signal_Count).slice(0,40),[db.industryAnalysis]);
  const symsOf = ind => db.master.filter(m=>m.Industry===ind.Industry && m.Sector===ind.Sector).map(m=>m.Symbol);
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",display:"flex",alignItems:"center",flex:1}}>📐 Industry Bias Momentum
          <InfoTip><strong>List</strong>: industries with the most bullish (or bearish) net signal bias. <strong>Bubble</strong>: the 40 busiest industries — x = net bias, y = strength, <strong>bubble size = signal intensity</strong>, colour = sector. A cluster of same-colour bubbles on one side = a whole sector rotating.</InfoTip>
        </div>
        {view==="list" && <>
          <Pill active={mode==="top"} color="var(--long)" onClick={()=>setMode("top")}>▲ Bullish</Pill>
          <Pill active={mode==="bottom"} color="var(--short)" onClick={()=>setMode("bottom")}>▼ Bearish</Pill>
        </>}
        <ViewToggle value={view} onChange={setView}/>
      </div>
      {view==="list" ? data.map(d=>{
        const w=Math.abs(d.Net_Bias_Score)/maxAbs*100, pos=d.Net_Bias_Score>=0;
        return (
          <div key={d.Sector+d.Industry} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:6,alignItems:"center"}}>
              <span style={{fontSize:10.5,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}} title={`${d.Industry} (${d.Sector})`}>{d.Industry} <span style={{fontSize:9,color:sectorColor(d.Sector)}}>· {d.Sector}</span></span>
              <ListCopy symbols={symsOf(d)} compact/>
              <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:pos?"var(--long)":"var(--short)",flexShrink:0,width:32,textAlign:"right"}}>{pos?"+":""}{d.Net_Bias_Score}</span>
            </div>
            <div style={{height:4,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${w}%`,background:pos?"var(--long)":"var(--short)",borderRadius:2,opacity:.85}}/></div>
          </div>
        );
      }) : (
        <RotationQuadrantChart height={360}
          items={bubbles.map(d=>({key:d.Sector+"|"+d.Industry,label:d.Industry,x:d.Net_Bias_Score,y:d.Strength_Score,size:d.Total_Signal_Count,color:sectorColor(d.Sector),
            tooltip:`${d.Industry} (${d.Sector}): strength ${d.Strength_Score.toFixed(1)} · net bias ${d.Net_Bias_Score} · ${d.Total_Signal_Count} signals · ${d.Total_Stocks} stocks`}))}/>
      )}
    </div>
  );
}

function BiasDistributionPanel({ db }) {
  const biasSymMap = {};
  db.flat.forEach(r=>{ biasSymMap[r.Symbol]=r.Trading_Bias; });
  const biasCnt = {};
  Object.values(biasSymMap).forEach(b=>{ biasCnt[b]=(biasCnt[b]||0)+1; });
  const total = Object.keys(biasSymMap).length || 1;
  const longPct = (biasCnt.LONG||0)/total*100, shortPct = (biasCnt.SHORT||0)/total*100;
  return (
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,display:"flex",alignItems:"center"}}>📡 Market Bias Distribution
        <InfoTip>How many stocks carry each trading bias today. When one side dominates, trade that side and demand exceptional setups for the other.</InfoTip>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:"var(--longd)",borderRadius:7,padding:"10px 12px"}}>
          <div style={{fontSize:22,fontWeight:700,color:"var(--long)",fontFamily:"var(--mono)"}}>{longPct.toFixed(0)}%</div>
          <div style={{fontSize:10,color:"var(--long)"}}>Bullish · {biasCnt.LONG||0}</div>
        </div>
        <div style={{background:"var(--shortd)",borderRadius:7,padding:"10px 12px"}}>
          <div style={{fontSize:22,fontWeight:700,color:"var(--short)",fontFamily:"var(--mono)"}}>{shortPct.toFixed(0)}%</div>
          <div style={{fontSize:10,color:"var(--short)"}}>Bearish · {biasCnt.SHORT||0}</div>
        </div>
      </div>
      {Object.entries(biasCnt).sort((a,b)=>b[1]-a[1]).map(([bias,cnt])=>{
        const bc=BIAS_COLOR[bias]||BIAS_COLOR.NEUTRAL, pct=(cnt/total*100).toFixed(1);
        return (
          <div key={bias} style={{marginBottom:9}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
              {biasBadge(bias,true)}
              <span style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--t1)"}}>{cnt} <span style={{color:"var(--t3)",fontSize:10}}>({pct}%)</span></span>
            </div>
            <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:bc.text,width:pct+"%",borderRadius:3,opacity:.8}}/></div>
          </div>
        );
      })}
    </div>
  );
}

// ─── INTRADAY MOMENTUM (daily zone break + bigger TF zone or NR break) ────────
const INTRA_ZONE_W = { W:2, M:3, Q:4, Y:5 };
const INTRA_NR_W = { D:1.5, W:2, M:3, Q:3.5, Y:4 };

function intradayPicks(list) {
  const out = [];
  list.forEach(s => {
    const names = new Set(s.signals.map(g=>g.name));
    const up = names.has('Daily_Close_Above_Daily_Zone_High'), dn = names.has('Daily_Close_Below_Daily_Zone_Low');
    if (up === dn) return;                                   // need exactly one daily zone break
    const sgn = up ? 1 : -1;
    const zoneTfs = new Set(), nr = [], fresh = new Set();
    s.signals.forEach(g => {
      if (g.dir !== sgn) return;
      if (g.event === 'BREAKOUT' || g.event === 'BREAKDOWN') {
        const m = g.name.match(/_(\d+)[DWMQY]_/);
        nr.push({ tf:g.tf, label:`${g.tf} NR${m?m[1]:''}` });
        return;
      }
      if (g.tf === 'D') return;
      if (['CROSS','STATE','VIRGIN','FLAG'].includes(g.event)) {
        zoneTfs.add(g.tf);
        if (g.event === 'CROSS' || g.event === 'VIRGIN') fresh.add(g.tf);
      }
    });
    if (!zoneTfs.size && !nr.length) return;
    const chg = +s.chg || 0;
    const agree = sgn > 0 ? chg > 0 : chg < 0;
    const nrBest = {}; nr.forEach(n => { nrBest[n.tf] = Math.max(nrBest[n.tf]||0, INTRA_NR_W[n.tf]||1); });
    const score = 10
      + [...zoneTfs].reduce((a,t)=>a+(INTRA_ZONE_W[t]||1),0)
      + Object.values(nrBest).reduce((a,b)=>a+b,0)
      + fresh.size * 2.5
      + Math.min(Math.abs(chg), 10) * (agree ? 1 : -0.5)
      + (s.isFNO ? 3 : 0);
    out.push({ s, sgn, zoneTfs:[...zoneTfs].sort((a,b)=>TF_WEIGHT[b]-TF_WEIGHT[a]), fresh, nr, chg, agree, score });
  });
  return out.sort((a,b)=>b.score-a.score);
}

function IntradayMomentumCard({ list, open, lockDir=null }) {
  const [dir, setDir] = useLockable(lockDir, "ALL");
  const [fnoOnly, setFnoOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const picks = useMemo(()=>intradayPicks(list),[list]);
  const shown = picks.filter(p => (dir==="ALL" || (dir==="L" ? p.sgn>0 : p.sgn<0)) && (!fnoOnly || p.s.isFNO));
  const vis = showAll ? shown : shown.slice(0, 15);
  const nL = picks.filter(p=>p.sgn>0).length, nS = picks.length - nL;
  return (
    <FocusCard icon="⚡" title="Intraday Momentum — today's best picks" style={{marginBottom:12,border:"1px solid var(--accborder)"}}
      sub="Daily zone broke today AND a bigger-timeframe zone or an NR range broke the same way. Ranked by momentum."
      right={<>
        <Pill active={dir==="ALL"} onClick={()=>setDir("ALL")}>All {picks.length}</Pill>
        <Pill active={dir==="L"} color="var(--long)" onClick={()=>setDir("L")}>▲ {nL}</Pill>
        <Pill active={dir==="S"} color="var(--short)" onClick={()=>setDir("S")}>▼ {nS}</Pill>
        <Pill active={fnoOnly} color="var(--long)" onClick={()=>setFnoOnly(v=>!v)}>FNO only</Pill>
        <ListCopy symbols={shown.map(p=>p.s.symbol)}/>
      </>}
      learn={<>A daily zone break alone is noise. It becomes an intraday trade when the <strong>same move also breaks a bigger zone</strong> (weekly / monthly / quarterly / yearly) or an <strong>NR range</strong> — the bigger picture is pushing the same way. Score = timeframe weight of every confirming zone (W 2 · M 3 · Q 4 · Y 5) + NR breaks + 2.5 per fresh cross today + today's % move (penalised if against the direction) + 3 for FNO liquidity. <span style={{color:"var(--mixed)"}}>⚡ chips</span> = crossed today.</>}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["#","Symbol","Dir","% Chg","Bigger TF zones broken","NR broken","Score"].map(h=><th key={h} style={{position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {vis.map((p,i)=>(
              <tr key={p.s.symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                <td style={{padding:"6px 8px",fontFamily:"var(--mono)",color:"var(--t3)"}}>{i+1}</td>
                <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><FocusSym sym={p.s.symbol} onOpen={open}/>{p.s.isFNO&&<span style={{fontSize:8.5,padding:"1px 4px",borderRadius:3,background:"var(--longd)",color:"var(--long)"}}>FNO</span>}</div>
                  <div style={{fontSize:8.5,color:sectorColor(p.s.sector)}}>{p.s.sector}</div>
                </td>
                <td style={{padding:"6px 8px"}}>{biasBadge(p.sgn>0?"LONG":"SHORT",true)}</td>
                <td style={{padding:"6px 8px",fontFamily:"var(--mono)",fontWeight:700,color:p.chg>0?"var(--long)":p.chg<0?"var(--short)":"var(--t2)"}}>{p.chg>0?"+":""}{p.chg.toFixed(2)}%{!p.agree&&<span title="Today's move is against the break direction" style={{color:"var(--mixed)"}}> ⚠</span>}</td>
                <td style={{padding:"6px 8px"}}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {p.zoneTfs.map(t=><span key={t} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,fontFamily:"var(--mono)",fontWeight:700,border:`1px solid ${p.fresh.has(t)?"var(--mixed)":p.sgn>0?"var(--long)":"var(--short)"}`,color:p.fresh.has(t)?"var(--mixed)":p.sgn>0?"var(--long)":"var(--short)"}}>{p.fresh.has(t)?"⚡":""}{TF_NAME[t]}</span>)}
                    {!p.zoneTfs.length && <span style={{fontSize:9.5,color:"var(--t3)"}}>—</span>}
                  </div>
                </td>
                <td style={{padding:"6px 8px"}}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {p.nr.map(n=><span key={n.label} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,fontFamily:"var(--mono)",border:"1px solid var(--a2)",color:"var(--a2)"}}>{n.label}</span>)}
                    {!p.nr.length && <span style={{fontSize:9.5,color:"var(--t3)"}}>—</span>}
                  </div>
                </td>
                <td style={{padding:"6px 8px",fontFamily:"var(--mono)",fontWeight:700,color:"var(--acc)"}}>{p.score.toFixed(1)}</td>
              </tr>
            ))}
            {!vis.length && <tr><td colSpan={7} style={{padding:16,textAlign:"center",color:"var(--t3)"}}>No intraday picks match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length>15 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 15":`Show all ${shown.length}`}</button>}
    </FocusCard>
  );
}

// ─── OPPORTUNITIES — the next domino ──────────────────────────────────────────
const OPP_TF_ORDER = ['Y','Q','M','W','D'];
const OPP_BROKEN_W = { Y:3, Q:2.5, M:2, W:1.2, D:0.6 };
const OPP_APPROACH_W = { Y:3.5, Q:3.5, M:3, W:2, D:1 };
const OPP_NEAR_PCT = 5;
const OPP_TARGET_TFS = ['Q','M','W'];   // which timeframe can be the "next domino"
const CONV_META = { High:{c:"var(--long)",min:9}, Medium:{c:"var(--mixed)",min:6}, Low:{c:"var(--t2)",min:0} };
const convOf = sc => sc>=CONV_META.High.min ? "High" : sc>=CONV_META.Medium.min ? "Medium" : "Low";

function tfStatesFromZones(z, sgn) {
  const st = {};
  OPP_TF_ORDER.forEach(t => {
    const L = z[t]; if (!L || !L.pos || L.pos==="NO_DATA") { st[t] = { s:"nodata" }; return; }
    if (sgn > 0) {
      if (L.pos==="ABOVE_TOP") st[t] = { s:"broken", lvl:L.tz };
      else if (L.pos==="IN_TOP_BAND") st[t] = { s:"near", dist:Math.max(0,L.dTop||0), band:true, lvl:L.tz };
      else if (L.pos==="INSIDE" && L.dTop!=null && L.dTop>0 && L.dTop<=OPP_NEAR_PCT) st[t] = { s:"near", dist:L.dTop, lvl:L.tz };
      else st[t] = { s:"none", lvl:L.tz, dist:L.dTop };
    } else {
      if (L.pos==="BELOW_BOTTOM") st[t] = { s:"broken", lvl:L.bz };
      else if (L.pos==="IN_BOTTOM_BAND") st[t] = { s:"near", dist:Math.max(0,-(L.dBot||0)), band:true, lvl:L.bz };
      else if (L.pos==="INSIDE" && L.dBot!=null && L.dBot<0 && -L.dBot<=OPP_NEAR_PCT) st[t] = { s:"near", dist:-L.dBot, lvl:L.bz };
      else st[t] = { s:"none", lvl:L.bz, dist:L.dBot!=null ? -L.dBot : null };
    }
  });
  return st;
}

const OPP_SIG = {
  1: { broken:{ Q:['Daily_Close_Above_Quarterly_Zone'], M:['Daily_Close_Above_Monthly_Zone'], W:['Daily_Close_Above_Weekly_Zone_High'], D:['Daily_Close_Above_Daily_Zone_High'] },
       near:{ M:['Near_Monthly_Zone_Top'], D:['Daily_Close_Near_Daily_Zone_High'] }, nr:'Near High' },
  [-1]: { broken:{ Q:['Daily_Close_Below_Quarterly_Zone_Low'], M:['Daily_Close_Below_Monthly_Zone_Low'], W:['Daily_Close_Below_Weekly_Zone_Low'], D:['Daily_Close_Below_Daily_Zone_Low'] },
       near:{ M:['Near_Monthly_Zone_Low'], D:['Daily_Close_Near_Daily_Zone_Low'] }, nr:'Near Low' },
};

function tfStatesFromSignals(s, sgn) {
  const names = new Set(s.signals.map(g=>g.name));
  const def = OPP_SIG[sgn], st = {};
  OPP_TF_ORDER.forEach(t => {
    if ((def.broken[t]||[]).some(n=>names.has(n))) st[t] = { s:"broken" };
    else if ((def.near[t]||[]).some(n=>names.has(n))) st[t] = { s:"near", band:true };
    else st[t] = { s:"none" };
  });
  return st;
}

// NR building blocks per timeframe: which NR lengths broke out / are pressing the edge
const NR_BO_W = { D:1, W:1.5, M:2, Q:2.5, Y:3 };
function nrStatesFor(fm, sgn) {
  const st = {}; OPP_TF_ORDER.forEach(t=>{ st[t] = { bo:[], near:[] }; });
  if (!fm) return st;
  fm.signals.forEach(g => {
    if (!isNRName(g.name.toLowerCase())) return;
    const m = g.name.match(/_(\d+)[DWMQY]_/); const n = m ? +m[1] : 0;
    if ((sgn>0 && g.event==="BREAKOUT") || (sgn<0 && g.event==="BREAKDOWN")) st[g.tf].bo.push(n);
    else if (g.event==="NEAR" && g.dir===sgn) st[g.tf].near.push(n);
  });
  OPP_TF_ORDER.forEach(t=>{ st[t].bo.sort((a,b)=>a-b); st[t].near.sort((a,b)=>b-a); });
  return st;
}
const nrLab = (t, n) => `${t} NR${n||""}`;

// Best NR opportunity for one stock/direction:
//   DOMINO : a higher-TF NR already broke out, a lower-TF NR is pressing its edge
//   NESTED : a smaller NR broke out while price is still inside a BIGGER NR range pressing its edge
//            (bigger = higher timeframe, or same timeframe with a longer NR)
function bestNrOpportunity(nst) {
  let best = null;
  const consider = c => { if (!best || c.base > best.base) best = c; };
  OPP_TF_ORDER.forEach((tb, ib) => {                       // tb = timeframe pressing its edge (the next break)
    if (!nst[tb].near.length) return;
    const nearLen = nst[tb].near[0];                        // longest (biggest) range pressing the edge
    // DOMINO: higher TFs above tb have an NR breakout
    const hiBo = OPP_TF_ORDER.slice(0, ib).filter(t=>nst[t].bo.length);
    if (hiBo.length) consider({ type:"domino", target:tb, targetLen:nearLen, via:hiBo.map(t=>nrLab(t, nst[t].bo[0])),
      base: hiBo.reduce((a,t)=>a+OPP_BROKEN_W[t],0) + OPP_APPROACH_W[tb]*0.8 });
    // NESTED: a breakout on a LOWER tf, or on the SAME tf with a SHORTER length
    OPP_TF_ORDER.forEach((ta, ia) => {
      nst[ta].bo.forEach(len => {
        const inside = ia > ib || (ia === ib && len < nearLen);
        if (!inside) return;
        consider({ type:"nested", target:tb, targetLen:nearLen, via:[nrLab(ta, len)],
          base: NR_BO_W[ta] + (OPP_APPROACH_W[tb]||1)*0.8 + 1 });
      });
    });
  });
  return best;
}

function buildOpportunities(db, model) {
  const hasZL = (db.zoneLevels||[]).length > 0;
  const bySym = {}; model.list.forEach(s=>{ bySym[s.symbol]=s; });
  const secStr = {}; db.sectorAnalysis.forEach(s=>{ secStr[s.Sector]=s.Strength_Score; });
  const rp = {}; (db.returnPotential||[]).forEach(r=>{ rp[r.Symbol+"|"+r.Direction]=r; });
  const flags = {}; db.flat.forEach(r=>{ flags[r.Symbol]={ fno:r.Is_FNO==="Yes", n500:r.Is_Nifty_500==="Yes" }; });
  const zlBySym = {}; (db.zoneLevels||[]).forEach(z=>{ zlBySym[z.Symbol]=z; });
  const syms = new Set([...Object.keys(zlBySym), ...Object.keys(bySym)]);
  const out = [];

  syms.forEach(sym => {
    const fm = bySym[sym], zl = zlBySym[sym];
    const sector = zl?.Sector || fm?.sector || "Unknown", industry = zl?.Industry || fm?.industry || "Unknown";
    const price = zl?.Price ?? (fm && +fm.price) ?? null;
    const fno = zl?.Is_FNO==="Yes" || !!flags[sym]?.fno || !!fm?.isFNO;
    const n500 = zl?.Is_Nifty_500==="Yes" || !!flags[sym]?.n500 || !!fm?.isN500;

    [1,-1].forEach(sgn => {
      // ---------- ZONE path (unchanged logic) ----------
      let zone = null;
      const st = zl ? tfStatesFromZones(zl, sgn) : (fm ? tfStatesFromSignals(fm, sgn) : null);
      if (st) {
        const zst = {}; OPP_TF_ORDER.forEach(t=>{ zst[t] = { ...st[t] }; });
        let target = null;
        for (let i=1;i<OPP_TF_ORDER.length;i++) {
          const t = OPP_TF_ORDER[i];
          if (!OPP_TARGET_TFS.includes(t) || zst[t].s !== "near") continue;
          if (OPP_TF_ORDER.slice(0,i).some(a=>zst[a].s==="broken")) { target = t; break; }
        }
        if (target) {
          const ti = OPP_TF_ORDER.indexOf(target), tst = zst[target];
          const brokenAbove = OPP_TF_ORDER.slice(0,ti).filter(a=>zst[a].s==="broken");
          const prox = tst.band ? 1 : tst.dist==null ? 0.8 : tst.dist<=2 ? 0.8 : 0.5;
          zone = { st:zst, target, tst, brokenAbove, base: brokenAbove.reduce((a,t)=>a+OPP_BROKEN_W[t],0) + OPP_APPROACH_W[target]*prox };
        }
      }
      // ---------- NR path ----------
      const nst = nrStatesFor(fm, sgn);
      const nrBest = bestNrOpportunity(nst);
      const nr = nrBest ? { ...nrBest, st:nst } : null;
      if (!zone && !nr) return;

      // ---------- shared factors ----------
      const nrNearCount = OPP_TF_ORDER.reduce((a,t)=>a+nst[t].near.length,0);
      const ss = secStr[sector];
      const secScore = ss==null ? 0 : sgn>0 ? (ss>=70?2:ss>=55?1:ss<=35?-1:0) : (ss<=30?2:ss<=45?1:ss>=65?-1:0);
      const focusAdj = !fm ? 0 : fm.sgn===sgn && fm.dir!=="MIXED" ? fm.score/25 : fm.dir==="MIXED" ? 0 : -1;
      const shared = secScore + ((fno||n500)?1:0) + focusAdj;
      const zoneScore = zone ? zone.base + Math.min(2.5, nrNearCount*0.8) + shared : null;
      const nrScore = nr ? nr.base + Math.min(1.5, (nrNearCount-1)*0.5) + shared : null;
      const bothScore = zone && nr ? Math.max(zoneScore, nrScore) + 2 : null;   // +2 when zones AND NR agree

      // room after the break: nearest UNBROKEN W/M/Q/Y zone above (below for shorts) price
      let room = null, roomTf = null;
      if (zl && price && st) {
        const tgtLvl = zone ? zone.tst.dist || 0 : 0;
        OPP_TF_ORDER.forEach(t=>{
          if (t==="D" || (zone && t===zone.target) || st[t].s==="broken" || st[t].lvl==null) return;
          const d = sgn>0 ? (st[t].lvl/price-1)*100 : (1-st[t].lvl/price)*100;
          if (d>0 && d>tgtLvl && (room==null || d<room)) { room = d; roomTf = t; }
        });
      }

      const zoneReasons = zone ? [
        `${zone.brokenAbove.map(t=>TF_NAME[t]).join(" + ")} zone broken`,
        `${TF_NAME[zone.target]} zone ${zone.tst.band?"in the band":zone.tst.dist!=null?`${zone.tst.dist.toFixed(1)}% away`:"near"}`] : [];
      const nrReasons = nr ? [ nr.type==="domino"
        ? `${nr.via.join(" + ")} ${sgn>0?"broke out":"broke down"} → ${nrLab(nr.target, nr.targetLen)} ${sgn>0?"near high":"near low"}`
        : `${nr.via[0]} ${sgn>0?"broke out":"broke down"} inside bigger ${nrLab(nr.target, nr.targetLen)} (${sgn>0?"near high":"near low"})` ] : [];
      const extra = [];
      if (secScore>0) extra.push(`${sector} ${sgn>0?"strong":"weak"}`);
      if (secScore<0) extra.push(`against ${sector}`);
      if (fm && fm.sgn===sgn && fm.score>=42) extra.push(`focus ${Math.round(fm.score)}`);

      out.push({ sym, sector, industry, price, sgn, fno, n500, zone, nr, zoneScore, nrScore, bothScore,
                 room, roomTf, rp: rp[sym+"|"+(sgn>0?"LONG":"SHORT")] || null, zoneReasons, nrReasons, extra, fm });
    });
  });
  return { rows: out, hasZL };
}

// Ladder for zones (solid = broken, dashed = approaching) or for NR (solid = NR breakout, dashed = NR pressing edge)
function OppLadder({ st, target, sgn, kind="zone" }) {
  const c = sgn>0 ? "var(--long)" : "var(--short)";
  return (
    <div style={{display:"flex",gap:3,alignItems:"center"}}>
      <span style={{fontSize:7.5,fontWeight:700,color:"var(--t3)",width:14,fontFamily:"var(--mono)"}}>{kind==="zone"?"Z":"NR"}</span>
      {OPP_TF_ORDER.map(t=>{
        const x = st[t], isT = t===target;
        let broken, near, sub, tip;
        if (kind==="zone") {
          broken = x.s==="broken"; near = x.s==="near";
          sub = broken ? "✓" : near ? (x.dist!=null ? `${x.dist.toFixed(1)}%` : "near") : "";
          tip = `${TF_NAME[t]} zone: ${broken?"already broken":near?`approaching${x.dist!=null?` (${x.dist.toFixed(1)}% away)`:""}`:x.s==="nodata"?"no data":"not near"}`;
        } else {
          broken = x.bo.length>0; near = x.near.length>0;
          sub = broken && near ? `${sgn>0?"BO":"BD"}+${sgn>0?"HN":"LW"}` : broken ? (sgn>0?"BO":"BD") : near ? (sgn>0?"HN":"LW") : "";
          tip = `${TF_NAME[t]} NR: ${broken?`${sgn>0?"breakout":"breakdown"} NR${x.bo.join("/NR")}`:""}${broken&&near?" · ":""}${near?`${sgn>0?"near high":"near low"} NR${x.near.join("/NR")}`:""}${!broken&&!near?"no NR signal":""}`;
        }
        return (
          <div key={t} title={tip}
            style={{width:30,height:26,borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",
              border:`1.5px ${near&&!broken?"dashed":"solid"} ${broken||near?c:"var(--b1)"}`,background:"var(--s2)",boxShadow:isT?`0 0 0 2px var(--adim)`:"none"}}>
            {broken && <div style={{position:"absolute",inset:0,background:c,opacity:kind==="zone"?.45:.3}}/>}
            <span style={{position:"relative",fontSize:9.5,fontWeight:700,fontFamily:"var(--mono)",color:broken||near?"var(--t1)":"var(--t3)",lineHeight:1}}>{t}</span>
            <span style={{position:"relative",fontSize:7,fontFamily:"var(--mono)",color:broken?"var(--t1)":c,lineHeight:1.1}}>{sub}</span>
          </div>
        );
      })}
    </div>
  );
}

const OPP_SOURCES = [
  ["all",  "All sources",  "Zone OR NR opportunity"],
  ["zone", "Zones",        "Only zone-ladder opportunities"],
  ["nr",   "NR",           "Only NR opportunities (NR domino / NR inside a bigger NR)"],
  ["both", "Zones + NR",   "Only stocks where zones AND NR point to the same next break"],
];
const NR_TYPES = [["any","Any NR"],["nested","NR inside bigger NR"],["domino","NR domino"]];

function OpportunitiesSection({ db, model, open, lockDir=null }) {
  const [dir, setDir] = useLockable(lockDir, "L");
  const [src, setSrc] = useState("all");
  const [nrType, setNrType] = useState("any");
  const [conv, setConv] = useState(new Set(["High","Medium"]));
  const [fnoOnly, setFnoOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { rows: rawRows, hasZL } = useMemo(()=>buildOpportunities(db, model),[db, model]);

  // which rows / which score for a given source filter
  const viewFor = (srcKey) => rawRows.map(r=>{
    const nrOk = !!r.nr && (nrType==="any" || r.nr.type===nrType);
    const zOk = !!r.zone;
    let useZone, useNr, score;
    if (srcKey==="zone")      { if (!zOk) return null; useZone=true;  useNr=false; score=r.zoneScore; }
    else if (srcKey==="nr")   { if (!nrOk) return null; useZone=false; useNr=true;  score=r.nrScore; }
    else if (srcKey==="both") { if (!zOk || !nrOk) return null; useZone=true; useNr=true; score=r.bothScore; }
    else { if (!zOk && !nrOk) return null; useZone=zOk; useNr=nrOk; score = zOk&&nrOk ? r.bothScore : zOk ? r.zoneScore : r.nrScore; }
    return { ...r, score, conv:convOf(score), useZone, useNr };
  }).filter(Boolean);
  const inSide = r => (dir==="L"?r.sgn>0:r.sgn<0) && (!fnoOnly || r.fno);
  const view = useMemo(()=>viewFor(src).sort((a,b)=>b.score-a.score), [rawRows, src, nrType]);
  const srcCounts = useMemo(()=>Object.fromEntries(OPP_SOURCES.map(([k])=>[k, viewFor(k).filter(inSide).length])), [rawRows, nrType, dir, fnoOnly]);

  const sideRows = view.filter(inSide);
  const counts = { High:0, Medium:0, Low:0 }; sideRows.forEach(r=>{ counts[r.conv]++; });
  const shown = sideRows.filter(r=>conv.has(r.conv));
  const vis = showAll ? shown : shown.slice(0, 25);
  const toggleConv = k => setConv(prev=>{ const s=new Set(prev); s.has(k)&&s.size>1?s.delete(k):s.add(k); return s; });
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap",zIndex:1};
  const srcBadge = r => {
    const both = r.useZone && r.useNr;
    const lab = both ? "ZONE + NR" : r.useZone ? "ZONE" : "NR";
    const col = both ? "var(--acc)" : r.useZone ? "var(--ret)" : "var(--a2)";
    return <span style={{fontSize:8.5,fontWeight:700,padding:"1px 6px",borderRadius:3,border:`1px solid ${col}`,color:col,whiteSpace:"nowrap"}}>{lab}</span>;
  };

  return (
    <div style={{padding:"4px 22px 8px"}}>
      <SectionTitle icon="🔮" title="Opportunities — the next domino"
        sub={dir==="L" ? "A bigger zone or NR range already broke out; the next one is about to break. These are tomorrow's breakouts." : "A bigger zone or NR range already broke down; the next one is about to break. These are tomorrow's breakdowns."}
        right={<div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <Pill active={dir==="L"} color="var(--long)" onClick={()=>setDir("L")}>▲ Future breakouts</Pill>
          <Pill active={dir==="S"} color="var(--short)" onClick={()=>setDir("S")}>▼ Future breakdowns</Pill>
          <Pill active={fnoOnly} color="var(--long)" onClick={()=>setFnoOnly(v=>!v)}>FNO only</Pill>
        </div>}/>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700}}>Based on</span>
        {OPP_SOURCES.map(([k,l,tip])=><Pill key={k} title={tip} active={src===k} color={k==="nr"?"var(--a2)":k==="zone"?"var(--ret)":"var(--acc)"} onClick={()=>setSrc(k)}>{l} · {srcCounts[k]}</Pill>)}
        {src!=="zone" && <>
          <span style={{width:1,height:20,background:"var(--b2)",margin:"0 2px"}}/>
          <span style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700}}>NR type</span>
          {NR_TYPES.map(([k,l])=><Pill key={k} active={nrType===k} color="var(--a2)" onClick={()=>setNrType(k)}>{l}</Pill>)}
        </>}
      </div>

      {!hasZL && <div style={{fontSize:11,color:"var(--mixed)",background:"var(--mixedd)",border:"1px solid var(--mixed)",borderRadius:8,padding:"8px 12px",marginBottom:10}}>This file has no <strong>Zone_Levels</strong> sheet, so zone opportunities are read from signal names (no exact distances, no yearly zone). NR opportunities are complete. Load a file from the new scanner for the full zone view.</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:12}}>
        {["High","Medium","Low"].map(k=>{
          const on = conv.has(k), c = CONV_META[k].c;
          const syms = sideRows.filter(r=>r.conv===k).map(r=>r.sym);
          return (
            <div key={k} onClick={()=>toggleConv(k)} className="version-chip" style={{cursor:"pointer",background:"var(--s1)",border:`1px solid ${on?c:"var(--b1)"}`,borderRadius:10,padding:"10px 14px",opacity:on?1:.55,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:c}}>{k} conviction</div>
                <div style={{fontFamily:"var(--mono)",fontSize:24,fontWeight:700,color:"var(--t1)",lineHeight:1.1}}>{counts[k]}</div>
                <div style={{fontSize:9.5,color:"var(--t3)"}}>{k==="High"?`score ≥ ${CONV_META.High.min}`:k==="Medium"?`score ${CONV_META.Medium.min}–${CONV_META.High.min}`:`score < ${CONV_META.Medium.min}`} · click to {on?"hide":"show"}</div>
              </div>
              <ListCopy symbols={syms} compact/>
            </div>
          );
        })}
      </div>

      <FocusCard icon="🎯" title={`${shown.length} ${dir==="L"?"future breakouts":"future breakdowns"}`}
        sub={`Z ladder: solid = zone broken, dashed = approaching. NR ladder: solid = NR ${dir==="L"?"breakout":"breakdown"}, dashed = NR ${dir==="L"?"near high":"near low"}. Ringed box = the next break.`}
        right={<ListCopy symbols={shown.map(r=>r.sym)}/>}
        learn={<>
          <strong>Zone opportunity:</strong> a higher-timeframe zone is already broken and a lower timeframe (Q / M / W) is approaching its own zone — inside the band or within {OPP_NEAR_PCT}%.<br/>
          <strong>NR opportunity</strong>, two kinds:<br/>
          • <strong>NR inside bigger NR</strong> — a smaller NR range broke out while price is still inside a <em>bigger</em> NR range and pressing its {dir==="L"?"high":"low"}. Bigger = higher timeframe (W NR5 breakout inside M NR8) or the same timeframe with a longer range (W NR4 breakout inside W NR10). The bigger breakout is the next move.<br/>
          • <strong>NR domino</strong> — a higher-timeframe NR already broke out and a lower-timeframe NR is pressing its {dir==="L"?"high":"low"}.<br/><br/>
          <strong>Score</strong> = what already broke (Y 3 · Q 2.5 · M 2 · W 1.2) + weight of the next break × closeness + NR near-edge count + sector strength (−1…+2) + FNO / Nifty 500 (+1) + Focus Score ÷ 25. <strong>Zones + NR</strong> agreeing adds +2. High ≥ {CONV_META.High.min}, Medium ≥ {CONV_META.Medium.min}.
        </>}>
        <div style={{overflowX:"auto",maxHeight:600,overflowY:"auto"}} className="tower-scroll">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["#","Symbol","Source","Conviction","Ladder  Y·Q·M·W·D","Next break","Room after","Hidden return","Why","Score"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {vis.map((r,i)=>{
                const c = CONV_META[r.conv].c;
                return (
                  <tr key={r.sym+r.sgn} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"6px 8px",fontFamily:"var(--mono)",color:"var(--t3)"}}>{i+1}</td>
                    <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><FocusSym sym={r.sym} onOpen={open}/>{r.fno&&<span style={{fontSize:8.5,padding:"1px 4px",borderRadius:3,background:"var(--longd)",color:"var(--long)"}}>FNO</span>}</div>
                      <div style={{fontSize:8.5,color:sectorColor(r.sector)}}>{r.sector}{r.price?` · ₹${r.price}`:""}</div>
                    </td>
                    <td style={{padding:"6px 8px"}}>{srcBadge(r)}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,border:`1px solid ${c}`,color:c}}>{r.conv}</span></td>
                    <td style={{padding:"6px 8px"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {r.useZone && r.zone && <OppLadder st={r.zone.st} target={r.zone.target} sgn={r.sgn} kind="zone"/>}
                        {r.useNr && r.nr && <OppLadder st={r.nr.st} target={r.nr.target} sgn={r.sgn} kind="nr"/>}
                      </div>
                    </td>
                    <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                      {r.useZone && r.zone && <div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--t1)"}}>{TF_NAME[r.zone.target]} zone</div>
                        <div style={{fontSize:9.5,fontFamily:"var(--mono)",color:"var(--t2)"}}>{r.zone.tst.lvl!=null?`@ ${r.zone.tst.lvl}`:""}{r.zone.tst.band?" · in band":r.zone.tst.dist!=null?` · ${r.zone.tst.dist.toFixed(1)}% away`:""}</div>
                      </div>}
                      {r.useNr && r.nr && <div style={{marginTop:r.useZone&&r.zone?4:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--a2)"}}>{nrLab(r.nr.target, r.nr.targetLen)} {r.sgn>0?"high":"low"}</div>
                        <div style={{fontSize:9.5,color:"var(--t2)"}}>{r.nr.type==="nested"?`inside bigger range · ${r.nr.via[0]} broke`:`domino · ${r.nr.via.join(" + ")} broke`}</div>
                      </div>}
                    </td>
                    <td style={{padding:"6px 8px",fontFamily:"var(--mono)",whiteSpace:"nowrap"}}>{r.room!=null?<span style={{color:r.sgn>0?"var(--long)":"var(--short)",fontWeight:700}}>{r.sgn>0?"+":"−"}{r.room.toFixed(1)}% <span style={{fontSize:9,color:"var(--t3)",fontWeight:400}}>to {r.roomTf}</span></span>:<span style={{fontSize:9.5,color:r.zone&&r.zone.st.Y.s==="broken"?"var(--acc)":"var(--t3)"}}>{r.zone&&r.zone.st.Y.s==="broken"?"clear sky":"—"}</span>}</td>
                    <td style={{padding:"6px 8px",fontFamily:"var(--mono)",whiteSpace:"nowrap"}}>{r.rp&&r.rp.Best_Return_Pct!=null?<span title={`Entry ${r.rp.Entry_Monthly_Zone} · status ${r.rp.Status}`} style={{color:"var(--acc)",fontWeight:700}}>{r.rp.Best_Return_Pct.toFixed(0)}%</span>:<span style={{color:"var(--t3)"}}>—</span>}</td>
                    <td style={{padding:"6px 8px",fontSize:9.5,color:"var(--t2)",maxWidth:300}}>{[...(r.useZone?r.zoneReasons:[]), ...(r.useNr?r.nrReasons:[]), ...r.extra].join(" · ")}</td>
                    <td style={{padding:"6px 8px",fontFamily:"var(--mono)",fontWeight:700,color:c}}>{r.score.toFixed(1)}</td>
                  </tr>
                );
              })}
              {!vis.length && <tr><td colSpan={10} style={{padding:16,textAlign:"center",color:"var(--t3)"}}>No opportunities for this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        {shown.length>25 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 25":`Show all ${shown.length}`}</button>}
      </FocusCard>
    </div>
  );
}

// ─── HIDDEN RETURN — monthly breakout entry, quarterly / yearly zone exit ──────
// ─── OPPORTUNITY WITH RETURN EXPECTATIONS ─────────────────────────────────────
// Entry = zone breakout on the ENTRY timeframe, exits = the zones of the chosen EXIT timeframes.
// Calculated live from Zone_Levels, so any entry / exit combination can be picked (D for intraday).
const RE_TFS = ["D","W","M","Q","Y"];
const RE_TF_NAME = { D:"Daily", W:"Weekly", M:"Monthly", Q:"Quarterly", Y:"Yearly" };
const RE_STATUSES = ["Triggered","Near Entry","Waiting","Target hit"];
const RE_STATUS_C = { "Triggered":"var(--long)", "Near Entry":"var(--acc)", "Waiting":"var(--t2)", "Target hit":"var(--ret)" };

function buildReturnRows(zoneLevels, entryTf, exitTfs, dir, nearPct) {
  const sgn = dir==="LONG" ? 1 : -1, out = [];
  (zoneLevels||[]).forEach(z => {
    const E = z[entryTf], price = z.Price;
    if (!E || price==null) return;
    const entry = sgn>0 ? E.tz : E.bz, stop = sgn>0 ? E.tn : E.bn;
    if (entry==null || !entry) return;
    const targets = {}; let best = null, bestTf = null;
    exitTfs.forEach(t => {
      const T = z[t]; if (!T) return;
      const lvl = sgn>0 ? T.tz : T.bz;
      if (lvl==null || !(sgn>0 ? lvl>entry : lvl<entry)) return;
      const ret = sgn*(lvl/entry-1)*100, rem = sgn*(lvl/price-1)*100;
      targets[t] = { lvl, ret, rem, hit: sgn>0 ? price>=lvl : price<=lvl };
      if (best==null || ret>best) { best = ret; bestTf = t; }
    });
    if (best==null) return;
    const risk = stop!=null && stop!==entry ? Math.abs(entry-stop)/entry*100 : null;
    Object.values(targets).forEach(t => { t.rr = risk ? t.ret/risk : null; });
    const dist = sgn*(entry/price-1)*100;               // + = price still has to travel to the entry
    const beyond = sgn>0 ? price>=entry : price<=entry;
    const hits = Object.keys(targets).filter(t=>targets[t].hit);
    const status = hits.length ? "Target hit" : beyond ? "Triggered" : dist<=nearPct ? "Near Entry" : "Waiting";
    out.push({ Symbol:z.Symbol, Sector:z.Sector, Industry:z.Industry, Price:price, Is_FNO:z.Is_FNO,
               entry, stop, risk, dist, status, hits, targets, best, bestTf });
  });
  return out;
}

function ReturnExpectationsSection({ db, open, lockDir=null }) {
  const zl = db.zoneLevels || [];
  const [dir, setDir] = useLockable(lockDir, "LONG");
  const [entryTf, setEntryTf] = useState("W");
  const [exits, setExits] = useState(new Set(["M","Q","Y"]));
  const [rankTf, setRankTf] = useState("best");
  const [statuses, setStatuses] = useState(new Set(["Triggered","Near Entry"]));
  const [nearPct, setNearPct] = useState(3);
  const [minRR, setMinRR] = useState(0);
  const [fnoOnly, setFnoOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const exitTfs = RE_TFS.filter(t => exits.has(t) && t!==entryTf);
  const pickEntry = t => {
    setEntryTf(t);
    if (!RE_TFS.some(x=>exits.has(x) && x!==t)) setExits(new Set(RE_TFS.slice(RE_TFS.indexOf(t)+1)));
    if (rankTf===t) setRankTf("best");
  };
  const toggleExit = t => setExits(prev => { const n=new Set(prev); if (n.has(t)) { if ([...n].filter(x=>x!==entryTf).length>1) n.delete(t); } else n.add(t); return n; });
  const toggleStatus = st => setStatuses(prev => { const n=new Set(prev); n.has(st)&&n.size>1?n.delete(st):n.add(st); return n; });
  const rank = rankTf!=="best" && exitTfs.includes(rankTf) ? rankTf : "best";

  const all = useMemo(() => buildReturnRows(zl, entryTf, exitTfs, dir, nearPct).filter(r => !fnoOnly || r.Is_FNO==="Yes"),
                      [zl, entryTf, exitTfs.join(""), dir, nearPct, fnoOnly]);
  const metric = r => rank==="best" ? { ret:r.best, t:r.targets[r.bestTf], tf:r.bestTf } : r.targets[rank] ? { ret:r.targets[rank].ret, t:r.targets[rank], tf:rank } : null;
  const statusCount = {}; all.forEach(r => { statusCount[r.status]=(statusCount[r.status]||0)+1; });
  const rows = all.filter(r => statuses.has(r.status)).map(r => ({ r, m: metric(r) }))
                  .filter(({m}) => m && (minRR===0 || (m.t.rr!=null && m.t.rr>=minRR)))
                  .sort((a,b) => b.m.ret - a.m.ret);
  const vis = showAll ? rows : rows.slice(0, 25);
  const chart = rows.slice(0, 15);
  const maxRet = Math.max(1, ...chart.map(x=>x.m.ret));
  const c = dir==="LONG" ? "var(--long)" : "var(--short)";
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap",zIndex:1};
  const TD = {padding:"5px 8px",fontFamily:"var(--mono)",whiteSpace:"nowrap"};
  const Lbl = ({children}) => <span style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".6px",fontWeight:700}}>{children}</span>;
  const Sep = () => <span style={{width:1,height:20,background:"var(--b2)"}}/>;
  const title = "Opportunity with Return Expectations";

  if (!zl.length) return (
    <div style={{padding:"4px 22px 8px"}}>
      <SectionTitle icon="💰" title={title} sub="Enter on a zone breakout, exit at the zones of higher timeframes."/>
      <div style={{background:"var(--s1)",border:"1px dashed var(--b2)",borderRadius:12,padding:"22px",textAlign:"center",color:"var(--t2)",fontSize:12.5,lineHeight:1.7}}>
        This file has no <strong>Zone_Levels</strong> sheet.<br/>Run the new scanner and load its Excel to enable return expectations.
      </div>
    </div>
  );

  return (
    <div style={{padding:"4px 22px 8px"}}>
      <SectionTitle icon="💰" title={title}
        sub={`Enter on the ${RE_TF_NAME[entryTf].toUpperCase()} zone ${dir==="LONG"?"breakout":"breakdown"} → exit at the ${exitTfs.map(t=>RE_TF_NAME[t]).join(" / ")} zone${exitTfs.length>1?"s":""}.`}/>
      <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:10,padding:"9px 12px",marginBottom:12,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <Pill active={dir==="LONG"} color="var(--long)" onClick={()=>setDir("LONG")}>▲ Long</Pill>
          <Pill active={dir==="SHORT"} color="var(--short)" onClick={()=>setDir("SHORT")}>▼ Short</Pill>
          <Sep/><Lbl>Entry</Lbl>
          {["D","W","M","Q"].map(t=><Pill key={t} active={entryTf===t} onClick={()=>pickEntry(t)} title={`Entry = ${RE_TF_NAME[t]} zone ${dir==="LONG"?"top":"bottom"}`}>{RE_TF_NAME[t]}</Pill>)}
          <Sep/><Lbl>Exit at</Lbl>
          {RE_TFS.filter(t=>t!==entryTf).map(t=><Pill key={t} active={exits.has(t)} color="var(--ret)" onClick={()=>toggleExit(t)}>{exits.has(t)?"✓ ":""}{RE_TF_NAME[t]}</Pill>)}
          <Sep/><Lbl>Rank by</Lbl>
          <Pill active={rank==="best"} onClick={()=>setRankTf("best")}>Best exit</Pill>
          {exitTfs.map(t=><Pill key={t} active={rank===t} onClick={()=>setRankTf(t)}>{t}</Pill>)}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <Lbl>Status</Lbl>
          {RE_STATUSES.map(st=><Pill key={st} active={statuses.has(st)} color={RE_STATUS_C[st]} onClick={()=>toggleStatus(st)}>{st} · {statusCount[st]||0}</Pill>)}
          <Sep/><Lbl>Near entry within</Lbl>
          {[1,2,3,5].map(v=><Pill key={v} active={nearPct===v} onClick={()=>setNearPct(v)}>{v}%</Pill>)}
          <Sep/>
          {[0,2,3,5].map(v=><Pill key={v} active={minRR===v} onClick={()=>setMinRR(v)}>{v?`R:R ≥ ${v}`:"any R:R"}</Pill>)}
          <Pill active={fnoOnly} color="var(--long)" onClick={()=>setFnoOnly(v=>!v)}>FNO only</Pill>
        </div>
      </div>

      <EqRow height={440} cols="minmax(0,1fr) minmax(0,1.8fr)" min={320}>
        <FocusCard icon="📊" title={`Top ${chart.length} by return to the ${rank==="best"?"best":RE_TF_NAME[rank].toLowerCase()} exit`} sub="Bar = entry → exit. Faded part = already travelled. Ticks = the other chosen exits."
          learn={<><strong>Entry</strong> = the {RE_TF_NAME[entryTf].toLowerCase()} zone {dir==="LONG"?"top":"bottom"} (the breakout level). <strong>Stop</strong> = the other edge of that {RE_TF_NAME[entryTf].toLowerCase()} band. <strong>Exits</strong> = the {dir==="LONG"?"top":"bottom"} zone of each chosen timeframe, only where it lies beyond the entry. <strong>Return</strong> = entry → exit, <strong>R:R</strong> = return ÷ risk. <strong>Near Entry</strong> = price is within the chosen % of the entry. Pick <strong>Daily</strong> entry with a <strong>Weekly</strong> exit for intraday / short swing ideas. These are potential moves to zone levels, not backtested results.</>}>
          {chart.map(({r,m})=>{
            const done = m.t.rem!=null && m.ret ? Math.max(0, Math.min(1, 1 - m.t.rem/m.ret)) : 0;
            return (
              <div key={r.Symbol} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={{width:92,flexShrink:0}}><SymCell sym={r.Symbol}/></div>
                <div style={{flex:1,height:14,background:"var(--s3)",borderRadius:4,overflow:"hidden",position:"relative"}}>
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${m.ret/maxRet*100}%`,background:c,opacity:.85,borderRadius:4}}/>
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${m.ret/maxRet*100*done}%`,background:"var(--s1)",opacity:.55}}/>
                  {exitTfs.filter(t=>r.targets[t] && t!==m.tf).map(t=>(
                    <div key={t} title={`${RE_TF_NAME[t]} exit ${r.targets[t].ret.toFixed(1)}%`} style={{position:"absolute",top:0,bottom:0,left:`${Math.min(100,r.targets[t].ret/maxRet*100)}%`,width:2,background:"var(--t1)",opacity:.7}}/>
                  ))}
                </div>
                <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:c,width:62,textAlign:"right"}}>{m.ret.toFixed(0)}% <span style={{fontSize:9,color:"var(--t3)"}}>{m.tf}</span></span>
              </div>
            );
          })}
          {!chart.length && <div style={{color:"var(--t3)",fontSize:11}}>Nothing matches these filters.</div>}
        </FocusCard>

        <FocusCard icon="📋" title={`${rows.length} ${dir==="LONG"?"long":"short"} setups`} sub={`Entry ${RE_TF_NAME[entryTf]} · exits ${exitTfs.join(", ")} · sorted by ${rank==="best"?"best exit":RE_TF_NAME[rank]+" exit"}`} right={<ListCopy symbols={rows.map(x=>x.r.Symbol)}/>}>
          <div style={{overflow:"auto",flex:1}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>
                {["Symbol","Status","CMP",`Entry (${entryTf})`,"To entry","Stop","Risk"].map(h=><th key={h} style={TH}>{h}</th>)}
                {exitTfs.map(t=><th key={t} style={{...TH,color:rank===t?"var(--acc)":"var(--t3)"}}>{t} exit · ret</th>)}
                {["R:R","Left from CMP"].map(h=><th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {vis.map(({r,m})=>(
                  <tr key={r.Symbol} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}><SymCell sym={r.Symbol}/><div style={{fontSize:8.5,color:sectorColor(r.Sector)}}>{r.Sector}</div></td>
                    <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}><span style={{fontSize:9.5,fontWeight:700,color:RE_STATUS_C[r.status]}}>{r.status}{r.hits.length?` ${r.hits.join(",")}`:""}</span></td>
                    <td style={TD}>{r.Price}</td>
                    <td style={{...TD,fontWeight:700}}>{r.entry}</td>
                    <td style={{...TD,color:r.dist<=0?"var(--long)":"var(--t2)"}}>{r.dist<=0?"in":`${r.dist.toFixed(1)}%`}</td>
                    <td style={{...TD,color:"var(--short)"}}>{r.stop??"—"}</td>
                    <td style={TD}>{r.risk!=null?`${r.risk.toFixed(1)}%`:"—"}</td>
                    {exitTfs.map(t=>{ const x=r.targets[t]; return (
                      <td key={t} style={{...TD,color:m.tf===t?c:"var(--t1)",fontWeight:m.tf===t?700:400}}>{x?<>{x.lvl} <span style={{opacity:.8}}>· {x.ret.toFixed(1)}%</span></>:"—"}</td>
                    );})}
                    <td style={{...TD,color:"var(--acc)",fontWeight:700}}>{m.t.rr!=null?m.t.rr.toFixed(1):"—"}</td>
                    <td style={TD}>{m.t.rem!=null?`${m.t.rem.toFixed(1)}%`:"—"}</td>
                  </tr>
                ))}
                {!vis.length && <tr><td colSpan={9+exitTfs.length} style={{padding:16,textAlign:"center",color:"var(--t3)"}}>Nothing matches these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length>25 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 25":`Show all ${rows.length}`}</button>}
        </FocusCard>
      </EqRow>
    </div>
  );
}

// ─── ZONE BREAKOUT ANALYSER ───────────────────────────────────────────────────
// Stocks that broke a zone and are STILL CLOSE to the breakout level, so there is room left to trade.
// Long : price at/above the timeframe's top_zone, no more than `maxExt` % above it.
// Short: price at/below the bottom_zone, no more than `maxExt` % below it.
// Fresh = the previous close of that timeframe was still on the other side (the break happened this bar).
const ZB_TFS = ["D","W","M","Q","Y"];
const ZB_TF_LABEL = { D:"Daily · intraday", W:"Weekly", M:"Monthly", Q:"Quarterly", Y:"Yearly" };

function zoneBreakRows(zoneLevels, list, sgn, tfs, maxExt) {
  const bySym = {}; (list||[]).forEach(s => { bySym[s.symbol] = s; });
  const rows = [], extended = {};
  (zoneLevels||[]).forEach(z => {
    const price = z.Price; if (price==null || !price) return;
    const s = bySym[z.Symbol];
    const nrBreaks = s ? [...new Set(s.signals.filter(g => g.dir===sgn && (g.event==="BREAKOUT"||g.event==="BREAKDOWN"))
                      .map(g => { const m = g.name.match(/_(\d+)[DWMQY]_/); return `${g.tf} NR${m?m[1]:""}`; }))] : [];
    tfs.forEach(t => {
      const Z = z[t]; if (!Z) return;
      const lvl = sgn>0 ? Z.tz : Z.bz, edge = sgn>0 ? Z.tn : Z.bn;
      if (lvl==null || !lvl) return;
      const ext = sgn>0 ? (price/lvl-1)*100 : (1-price/lvl)*100;       // how far past the level, in %
      if (ext < 0) return;                                              // not broken
      if (ext > maxExt) { extended[t] = (extended[t]||0) + 1; return; } // ran too far — skipped
      const prev = z.prev ? z.prev[t] : null;
      const fresh = prev!=null && (sgn>0 ? prev < lvl : prev > lvl);
      const stop = edge!=null && edge!==lvl ? edge : null;
      const risk = stop!=null ? Math.abs(price-stop)/price*100 : null;
      // next zone in the way: nearest band edge beyond price on any timeframe
      let target = null, targetTf = null;
      ZB_TFS.forEach(u => {
        const U = z[u]; if (!U) return;
        const cand = sgn>0 ? [U.tn, U.tz] : [U.bn, U.bz];
        cand.forEach(v => {
          if (v==null) return;
          const beyond = sgn>0 ? v > price*1.002 : v < price*0.998;
          if (beyond && (target==null || (sgn>0 ? v<target : v>target))) { target = v; targetTf = u; }
        });
      });
      const room = target!=null ? Math.abs(target/price-1)*100 : null;
      const alsoBroken = ZB_TFS.filter(u => u!==t && z[u] && (sgn>0 ? (z[u].tz!=null && price>=z[u].tz) : (z[u].bz!=null && price<=z[u].bz)));
      rows.push({ z, s, t, sgn, lvl, ext, fresh, prev, stop, risk, target, targetTf, room,
                  rr: room!=null && risk ? room/risk : null, alsoBroken, nrBreaks,
                  chg: z.Change_Pct, confirmed: alsoBroken.length>0 || nrBreaks.length>0 });
    });
  });
  return { rows, extended };
}

function ZoneBreakoutAnalyser({ zoneLevels, list, open, lockDir=null }) {
  const [dir, setDir] = useLockable(lockDir ? (lockDir==="L"?"LONG":lockDir==="S"?"SHORT":lockDir) : null, "LONG");
  const [tfs, setTfs] = useState(new Set(ZB_TFS));
  const [maxExt, setMaxExt] = useState(3);
  const [freshOnly, setFreshOnly] = useState(false);
  const [confOnly, setConfOnly] = useState(false);
  const [sort, setSort] = useState("closest");
  const [showAll, setShowAll] = useState(false);
  const sgn = dir==="LONG" ? 1 : -1;
  const toggleTf = t => setTfs(prev => { const n=new Set(prev); n.has(t)&&n.size>1?n.delete(t):n.add(t); return n; });
  const { rows: all, extended } = useMemo(() => zoneBreakRows(zoneLevels, list, sgn, ZB_TFS, maxExt), [zoneLevels, list, sgn, maxExt]);
  const perTf = {}; ZB_TFS.forEach(t => { perTf[t] = { fresh:0, near:0 }; });
  all.forEach(r => { perTf[r.t][r.fresh?"fresh":"near"]++; });
  const tfRank = t => ZB_TFS.indexOf(t);
  const rows = all.filter(r => tfs.has(r.t) && (!freshOnly || r.fresh) && (!confOnly || r.confirmed))
    .sort((a,b) => sort==="closest" ? (b.fresh-a.fresh) || a.ext-b.ext
                 : sort==="rr" ? (b.rr??-1)-(a.rr??-1)
                 : tfRank(b.t)-tfRank(a.t) || a.ext-b.ext);
  const vis = showAll ? rows : rows.slice(0, 30);
  const c = sgn>0 ? "var(--long)" : "var(--short)";
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"5px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap",zIndex:1};
  const TD = {padding:"5px 8px",fontFamily:"var(--mono)",whiteSpace:"nowrap"};
  const Lbl = ({children}) => <span style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".6px",fontWeight:700}}>{children}</span>;
  const Sep = () => <span style={{width:1,height:20,background:"var(--b2)"}}/>;
  const nExt = Object.values(extended).reduce((a,b)=>a+b,0);

  return (
    <FocusCard icon="🚀" title="Zone Breakout Analyser — broke out, still near the level" style={{marginBottom:12,border:"1px solid var(--accborder)"}}
      sub={`Stocks that ${sgn>0?"broke above a top zone":"broke below a bottom zone"} and are within ${maxExt}% of the breakout level. ${nExt.toLocaleString()} breakouts that already ran further are left out.`}
      right={<ListCopy symbols={[...new Set(rows.map(r=>r.z.Symbol))]}/>}
      learn={<>A breakout is only worth taking while price is still <strong>near the level it broke</strong>: the stop (the other edge of that zone band) is close, so the risk is small, and the move has not happened yet. Once a stock runs far past the level, the easy part is gone, so those are left out (<strong>Max distance</strong>). <strong>Fresh</strong> = the break happened on this bar (the previous {sgn>0?"close was below":"close was above"} the level); <strong>Holding</strong> = broke earlier but is still close to the level. <strong>Daily</strong> is the intraday view. <strong>Next zone</strong> is the nearest zone edge of any timeframe in the way; <strong>R:R</strong> = room to it ÷ risk to the stop. <strong>Confirmed</strong> = another timeframe's zone is also broken, or an NR breakout agrees.</>}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
        {(!lockDir || dir==="LONG") && <Pill active={dir==="LONG"} color="var(--long)" onClick={()=>setDir("LONG")}>▲ Breakouts</Pill>}
        {(!lockDir || dir==="SHORT") && <Pill active={dir==="SHORT"} color="var(--short)" onClick={()=>setDir("SHORT")}>▼ Breakdowns</Pill>}
        <Sep/><Lbl>Timeframe</Lbl>
        {ZB_TFS.map(t=><Pill key={t} active={tfs.has(t)} onClick={()=>toggleTf(t)} title={ZB_TF_LABEL[t]}>{t==="D"?"D · intraday":t} · {perTf[t].fresh+perTf[t].near}</Pill>)}
        <Sep/><Lbl>Max distance from level</Lbl>
        {[1,2,3,5].map(v=><Pill key={v} active={maxExt===v} onClick={()=>setMaxExt(v)}>≤ {v}%</Pill>)}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        <Pill active={freshOnly} color="var(--acc)" onClick={()=>setFreshOnly(v=>!v)}>{freshOnly?"✓ ":""}Fresh break only</Pill>
        <Pill active={confOnly} color="var(--ret)" onClick={()=>setConfOnly(v=>!v)}>{confOnly?"✓ ":""}Confirmed only</Pill>
        <Sep/><Lbl>Sort</Lbl>
        {[["closest","Closest to level"],["rr","Best R:R"],["tf","Biggest timeframe"]].map(([k,l])=><Pill key={k} active={sort===k} onClick={()=>setSort(k)}>{l}</Pill>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:6,marginBottom:10}}>
        {ZB_TFS.map(t=>(
          <div key={t} onClick={()=>setTfs(new Set([t]))} title={`Show only ${ZB_TF_LABEL[t]}`} style={{cursor:"pointer",background:"var(--s2)",border:`1px solid ${tfs.size===1&&tfs.has(t)?c:"var(--b1)"}`,borderRadius:8,padding:"6px 9px"}}>
            <div style={{fontSize:10,color:"var(--t3)",fontWeight:700}}>{ZB_TF_LABEL[t]}</div>
            <div style={{display:"flex",gap:8,alignItems:"baseline",marginTop:2}}>
              <span style={{fontFamily:"var(--mono)",fontSize:15,fontWeight:700,color:c}}>{perTf[t].fresh}</span><span style={{fontSize:9.5,color:"var(--t3)"}}>fresh</span>
              <span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:"var(--t1)"}}>{perTf[t].near}</span><span style={{fontSize:9.5,color:"var(--t3)"}}>holding</span>
            </div>
            <div style={{fontSize:9,color:"var(--t3)"}}>{extended[t]||0} ran further</div>
          </div>
        ))}
      </div>
      <div style={{maxHeight:460,overflow:"auto"}} className="tower-scroll">
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["Symbol","TF","Status","Level","CMP","Past level","Stop","Risk","Next zone","Room","R:R","Confirmation","Today"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {vis.map(r=>(
              <tr key={r.z.Symbol+r.t} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}>{r.s ? <FocusSym sym={r.z.Symbol} onOpen={open}/> : <SymCell sym={r.z.Symbol}/>}<div style={{fontSize:8.5,color:sectorColor(r.z.Sector)}}>{r.z.Sector}{r.z.Is_FNO==="Yes"?" · FNO":""}</div></td>
                <td style={{...TD,fontWeight:700}}>{r.t}</td>
                <td style={{padding:"5px 8px"}}><span style={{fontSize:9.5,fontWeight:700,padding:"1px 6px",borderRadius:4,border:`1px solid ${r.fresh?c:"var(--b2)"}`,color:r.fresh?c:"var(--t2)",whiteSpace:"nowrap"}}>{r.fresh?"Fresh break":"Holding"}</span></td>
                <td style={{...TD,fontWeight:700}}>{r.lvl}</td>
                <td style={TD}>{r.z.Price}</td>
                <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:54,height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,r.ext/maxExt*100)}%`,background:c}}/></div>
                    <span style={{fontFamily:"var(--mono)",fontSize:10.5}}>{r.ext.toFixed(1)}%</span>
                  </div>
                </td>
                <td style={{...TD,color:"var(--short)"}}>{r.stop??"—"}</td>
                <td style={TD}>{r.risk!=null?`${r.risk.toFixed(1)}%`:"—"}</td>
                <td style={TD}>{r.target!=null?<>{Number(r.target.toFixed(2))} <span style={{color:"var(--t3)"}}>{r.targetTf}</span></>:<span style={{color:"var(--long)"}}>clear sky</span>}</td>
                <td style={TD}>{r.room!=null?`${r.room.toFixed(1)}%`:"—"}</td>
                <td style={{...TD,color:"var(--acc)",fontWeight:700}}>{r.rr!=null?(r.rr>=100?"99+":r.rr.toFixed(1)):"—"}</td>
                <td style={{padding:"5px 8px"}}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {r.alsoBroken.map(u=><span key={u} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:`1px solid ${c}`,color:c}}>{u} zone</span>)}
                    {r.nrBreaks.slice(0,3).map(n=><span key={n} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid var(--ret)",color:"var(--ret)"}}>{n}</span>)}
                    {!r.confirmed && <span style={{fontSize:9,color:"var(--t3)"}}>—</span>}
                  </div>
                </td>
                <td style={{...TD,color:r.chg>0?"var(--long)":r.chg<0?"var(--short)":"var(--t2)"}}>{r.chg!=null?`${r.chg>0?"+":""}${r.chg.toFixed(2)}%`:"—"}</td>
              </tr>
            ))}
            {!vis.length && <tr><td colSpan={13} style={{padding:16,textAlign:"center",color:"var(--t3)"}}>No breakout within {maxExt}% of its level for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length>30 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 30":`Show all ${rows.length}`}</button>}
    </FocusCard>
  );
}

// ─── NR TRAP — failed NR breakout / breakdown, price back at the other mother edge ─
const TRAP_TFS = ["Y","Q","M","W","D"];
function MotherBar({ r }) {
  const p = r.Position_In_Mother_Pct==null ? null : Math.max(0, Math.min(100, r.Position_In_Mother_Pct));
  const long = r.Trade==="LONG";
  return (
    <div title={`Mother ${r.Mother_Low} – ${r.Mother_High} · CMP at ${p!=null?p.toFixed(0):"?"}% of the range (0% = Low, 100% = High)`}
         style={{position:"relative",width:84,height:12,borderRadius:3,background:"var(--s3)",border:"1px solid var(--b2)"}}>
      <div style={{position:"absolute",top:0,bottom:0,left:long?0:"auto",right:long?"auto":0,width:"18%",background:long?"var(--long)":"var(--short)",opacity:.25}}/>
      {p!=null && <div style={{position:"absolute",top:-2,bottom:-2,left:`calc(${p}% - 1.5px)`,width:3,borderRadius:2,background:"var(--t1)"}}/>}
    </div>
  );
}

function NRTrapSection({ db, open, lockDir=null, embedded=false }) {
  const all = db.failedNR || [];
  const [trade, setTrade] = useLockable(lockDir, "LONG");
  const [tfs, setTfs] = useState(new Set(TRAP_TFS));
  const [minRR, setMinRR] = useState(0);
  const [fnoOnly, setFnoOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const toggleTf = t => setTfs(prev => { const n=new Set(prev); n.has(t)&&n.size>1?n.delete(t):n.add(t); return n; });
  const side = all.filter(r => r.Trade===trade && (!fnoOnly || r.Is_FNO==="Yes"));
  const tfCount = {}; side.forEach(r => { tfCount[r.Timeframe]=(tfCount[r.Timeframe]||0)+1; });
  const rows = side.filter(r => tfs.has(r.Timeframe) && (minRR===0 || (r.RR!=null && r.RR>=minRR)))
                   .sort((a,b) => TRAP_TFS.indexOf(a.Timeframe)-TRAP_TFS.indexOf(b.Timeframe) || (b.RR||0)-(a.RR||0));
  const vis = showAll ? rows : rows.slice(0, 30);
  const c = trade==="LONG" ? "var(--long)" : "var(--short)";
  const TH = {position:"sticky",top:0,background:"var(--s2)",borderBottom:"1px solid var(--b1)",padding:"6px 8px",fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:"var(--t3)",textAlign:"left",whiteSpace:"nowrap",zIndex:1};
  const TD = {padding:"5px 8px",fontFamily:"var(--mono)",whiteSpace:"nowrap"};
  const maxTf = Math.max(1, ...TRAP_TFS.map(t=>tfCount[t]||0));
  const title = "NR Trap — failed breakout, back at the other edge";

  if (!(db.has && db.has.failedNR) && !all.length) return (
    <div style={{padding:embedded?0:"4px 22px 8px"}}>
      <Anchor id="ct-trap"/>
      <SectionTitle icon="🪤" title={title} sub="The NR breakout failed and price is back at the opposite edge of the mother candle."/>
      <div style={{background:"var(--s1)",border:"1px dashed var(--b2)",borderRadius:12,padding:"22px",textAlign:"center",color:"var(--t2)",fontSize:12.5,lineHeight:1.7}}>
        This file has no <strong>Failed_NR</strong> sheet.<br/>Run the new scanner and load its Excel to see NR traps.
      </div>
    </div>
  );

  return (
    <div style={{padding:embedded?0:"4px 22px 8px"}}>
      <Anchor id="ct-trap"/>
      <SectionTitle icon="🪤" title={title}
        sub={trade==="LONG" ? "The NR breakout above the mother High failed and price fell back to the mother Low. Trapped buyers are out: buy at the Low, stop below it."
                            : "The NR breakdown below the mother Low failed and price came back to the mother High. Trapped sellers are out: sell at the High, stop above it."}
        right={<div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {(!lockDir || lockDir==="LONG") && <Pill active={trade==="LONG"} color="var(--long)" onClick={()=>setTrade("LONG")}>▲ Failed BO → buy at Low</Pill>}
          {(!lockDir || lockDir==="SHORT") && <Pill active={trade==="SHORT"} color="var(--short)" onClick={()=>setTrade("SHORT")}>▼ Failed BD → sell at High</Pill>}
          <span style={{width:1,height:20,background:"var(--b2)"}}/>
          {TRAP_TFS.map(t=><Pill key={t} active={tfs.has(t)} onClick={()=>toggleTf(t)}>{t} · {tfCount[t]||0}</Pill>)}
          <span style={{width:1,height:20,background:"var(--b2)"}}/>
          {[0,2,3,5].map(v=><Pill key={v} active={minRR===v} onClick={()=>setMinRR(v)}>{v?`R:R ≥ ${v}`:"any R:R"}</Pill>)}
          <Pill active={fnoOnly} color="var(--long)" onClick={()=>setFnoOnly(v=>!v)}>FNO only</Pill>
        </div>}/>

      <EqRow height={420} cols="minmax(0,.8fr) minmax(0,2.2fr)" min={300}>
        <FocusCard icon="🧭" title="How the trap forms" sub="Same mother candle rule as your NR scans."
          learn={<>Mother candle = N bars ago with a real body (Number 1.5). After it, one or more bars <strong>closed {trade==="LONG"?"above the mother High":"below the mother Low"}</strong> (the breakout that failed), the other bars' bodies stayed inside, and the latest close is back inside and <strong>near the mother {trade==="LONG"?"Low":"High"}</strong> (the same 1.9/2 near rule). <strong>Entry</strong> = CMP, <strong>Stop</strong> = mother {trade==="LONG"?"Low":"High"}, <strong>Target</strong> = mother {trade==="LONG"?"High":"Low"}. For each stock and timeframe the biggest mother candle is shown.</>}>
          <svg viewBox="0 0 230 124" style={{width:"100%",maxHeight:132,marginBottom:10}}>
            <rect x="20" y="30" width="176" height="60" fill="none" stroke="var(--b2)" strokeDasharray="4 3"/>
            <text x="199" y="33" fontSize="8" fill="var(--t3)">High</text>
            <text x="199" y="93" fontSize="8" fill="var(--t3)">Low</text>
            <rect x="26" y="30" width="12" height="60" rx="1" fill="var(--t2)" opacity=".45"/>
            <text x="18" y="22" fontSize="8" fill="var(--t3)">mother</text>
            {trade==="LONG" ? <>
              <polyline points="44,60 64,52 84,58 104,40 124,18 144,44 164,70 184,84" fill="none" stroke="var(--t2)" strokeWidth="2"/>
              <circle cx="124" cy="18" r="4" fill="none" stroke="var(--short)" strokeWidth="2"/><text x="132" y="16" fontSize="8" fill="var(--short)">failed BO</text>
              <circle cx="184" cy="84" r="4.5" fill="var(--long)"/><text x="146" y="110" fontSize="8.5" fill="var(--long)" fontWeight="700">buy at Low</text>
            </> : <>
              <polyline points="44,60 64,68 84,62 104,80 124,102 144,76 164,50 184,36" fill="none" stroke="var(--t2)" strokeWidth="2"/>
              <circle cx="124" cy="102" r="4" fill="none" stroke="var(--long)" strokeWidth="2"/><text x="132" y="114" fontSize="8" fill="var(--long)">failed BD</text>
              <circle cx="184" cy="36" r="4.5" fill="var(--short)"/><text x="146" y="22" fontSize="8.5" fill="var(--short)" fontWeight="700">sell at High</text>
            </>}
          </svg>
          <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".6px",fontWeight:700,marginBottom:6}}>Setups by timeframe</div>
          {TRAP_TFS.map(t=>(
            <div key={t} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <span style={{width:70,fontSize:11,color:"var(--t2)"}}>{RE_TF_NAME[t]}</span>
              <div style={{flex:1,height:10,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(tfCount[t]||0)/maxTf*100}%`,background:c,opacity:tfs.has(t)?.85:.3}}/></div>
              <span style={{width:30,textAlign:"right",fontFamily:"var(--mono)",fontSize:11}}>{tfCount[t]||0}</span>
            </div>
          ))}
        </FocusCard>

        <FocusCard icon="🪤" title={`${rows.length} ${trade==="LONG"?"buy-after-trap":"sell-after-trap"} setups`} sub="Bigger timeframes first, then best R:R." right={<ListCopy symbols={[...new Set(rows.map(r=>r.Symbol))]}/>}>
          <div style={{overflow:"auto",flex:1}} className="tower-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>{["Symbol","TF","Mother","Failed","CMP","Where in mother","Stop","Target","Risk","Reward","R:R"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {vis.map(r=>(
                  <tr key={r.Symbol+r.Timeframe} className="sec-row" style={{borderBottom:"1px solid var(--b1)"}}>
                    <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}><SymCell sym={r.Symbol}/><div style={{fontSize:8.5,color:sectorColor(r.Sector)}}>{r.Sector}</div></td>
                    <td style={{...TD,fontWeight:700}}>{r.Timeframe}</td>
                    <td style={TD}>{r.Mother_Bars_Ago} bars ago<div style={{fontSize:9,color:"var(--t3)"}}>{r.Mother_Low} – {r.Mother_High}</div></td>
                    <td style={TD}>{r.Failure_Bars_Ago} bar{r.Failure_Bars_Ago===1?"":"s"} ago<div style={{fontSize:9,color:trade==="LONG"?"var(--short)":"var(--long)"}}>closed {r.Failure_Close}</div></td>
                    <td style={{...TD,fontWeight:700}}>{r.Price}</td>
                    <td style={{padding:"5px 8px"}}><MotherBar r={r}/></td>
                    <td style={{...TD,color:"var(--short)"}}>{r.Stop}</td>
                    <td style={{...TD,color:"var(--long)"}}>{r.Target}</td>
                    <td style={TD}>{r.Risk_Pct!=null?`${r.Risk_Pct.toFixed(1)}%`:"—"}</td>
                    <td style={TD}>{r.Reward_Pct!=null?`${r.Reward_Pct.toFixed(1)}%`:"—"}</td>
                    <td style={{...TD,color:"var(--acc)",fontWeight:700}}>{r.RR!=null?(r.RR>=100?"99+":r.RR.toFixed(1)):"—"}</td>
                  </tr>
                ))}
                {!vis.length && <tr><td colSpan={11} style={{padding:16,textAlign:"center",color:"var(--t3)"}}>Nothing matches these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length>30 && <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:6,fontSize:10.5,color:"var(--acc)",alignSelf:"flex-start"}}>{showAll?"Show top 30":`Show all ${rows.length}`}</button>}
        </FocusCard>
      </EqRow>
    </div>
  );
}


export { mapDB, parseWorkbookFile, HyperplaneLogo, ThemeToggle, CSS, APP_NAME, FocusCard, Pill, SymCell, ListCopy,
         HealthBadge, HEALTH_C, HEALTH_LEVELS, sectorColor, SectionTitle, InfoTip, EqRow, CopyBtn, biasBadge, formatDateLabel };
