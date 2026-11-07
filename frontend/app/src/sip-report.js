// SIP plan report (PDF) for both SIP apps — built in the customer's browser from the plan on screen. Loaded only when
// "PDF" is clicked (separate chunk). Owner 2026-11-06 round 6: "a better front page, then the data, like the AI
// Portfolio report": the same brand as report.js — a navy cover, then pages with the Hyperplane header / footer:
// overview (key numbers, AI summary, where the money goes, trend spread), the holdings by group, the growth simulator
// at the rate the customer picked (an illustration, never a forecast), how to buy, and the disclaimer.
import { jsPDF, GState } from "jspdf";

const C = {
  ink: "#0F172A", sub: "#475569", mute: "#94A3B8", line: "#E2E8F0", panel: "#F7F9FC", navy: "#0A1020",
  purple: "#8B5CF6", violet: "#A78BFA", cyan: "#22D3EE", indigo: "#6366F1", acc: "#0E7490",
  good: "#0EA371", mid: "#E8960C", bad: "#E5484D", side: "#8B97AD", gold: "#D4A72C",
};
const BG = { good: "#E3F6EF", mid: "#FDF3E1", bad: "#FCE9EA", side: "#EEF1F5" };
const W = 210, H = 297, M = 16, TOP = 30, BOTTOM = 276;
const GROUP_COL = { core: "#0E7490", extra: "#8B5CF6", metal: C.gold, Large: "#1E3A8A", Mid: "#2563EB", Small: "#60A5FA" };
const t = s => String(s ?? "").replace(/−/g, "-").replace(/₹/g, "Rs ").replace(/×/g, "x").replace(/[✦▲▼◆■ⓘ]/g, "").replace(/[^\x00-\xFF‹›·…–—‘’“”•]/g, "").trim();
const inr = v => v == null ? "-" : `Rs ${Math.round(v).toLocaleString("en-IN")}`;
const inrShort = v => v == null ? "-" : v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `Rs ${(v / 1e5).toFixed(2)} L` : inr(v);
const sgn = v => v == null ? "-" : v > 0 ? `+${v}` : `${v}`;
const toneOf = v => v == null ? "side" : v < 0 ? "bad" : v >= 24 ? "good" : "side";
const mix = (a, b, k) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k)
  .toString(16).padStart(2, "0")).join("");
const ROLE = { core: "Core index", theme: "Theme", diversifier: "Diversifier", commodity: "Gold / silver" };
const REL = { S: "High", M: "Medium", W: "Low" };

// the same sums as the page's simulator (apps/sip.jsx): instalments at the start of each period, an assumed yearly rate
const simulate = (inst, perYear, years, stepup, rate) => {
  const g = Math.pow(1 + rate / 100, 1 / perYear) - 1;
  let put = 0, val = 0; const rows = [];
  for (let y = 1; y <= years; y++) {
    const each = inst * Math.pow(1 + stepup / 100, y - 1);
    for (let i = 0; i < perYear; i++) { put += each; val = (val + each) * (1 + g); }
    rows.push({ y, each, put, val });
  }
  return rows;
};

export function downloadSipReport(r, rate = 0, step = 0) {
  const isStock = r.app === "msip";
  const product = isStock ? "AI Momentum SIP Builder" : "AI ETF SIP Builder";
  const word = r.freq === "quarter" ? "quarter" : "month";
  const asOf = r.as_of ? new Date(r.as_of).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const op = v => doc.setGState(new GState({ opacity: v }));
  const font = (size, style = "normal", color = C.ink) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);
  const wrap = (s, w) => doc.splitTextToSize(t(s), w);
  const lh = size => size * 0.3528 * 1.38;
  const dot = (x, y, rr, color) => { doc.setFillColor(color); doc.circle(x, y, rr, "F"); };
  const poly = (pts, fill) => { doc.setFillColor(fill); doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true); };
  const gradLine = (x0, x1, y, w, from = C.purple, to = C.cyan) => {
    const n = 48; doc.setLineWidth(w); doc.setLineCap("butt");
    for (let i = 0; i < n; i++) { doc.setDrawColor(mix(from, to, i / (n - 1))); doc.line(x0 + (x1 - x0) * i / n, y, x0 + (x1 - x0) * (i + 1) / n + 0.2, y); }
  };
  const logo = (x, y, s) => {
    const k = s / 64;
    doc.setFillColor("#0D1B33"); doc.setDrawColor("#1F3A5F"); doc.setLineWidth(0.25);
    doc.roundedRect(x + 1.5 * k, y + 1.5 * k, 61 * k, 61 * k, 16 * k, 16 * k, "FD");
    poly([[7, 37], [35, 27], [57, 34], [29, 45]].map(([a, b]) => [x + a * k, y + b * k]), "#3B82F6");
    poly([[7, 37], [21, 32], [43, 39], [29, 45]].map(([a, b]) => [x + a * k, y + b * k]), C.cyan);
    doc.setDrawColor("#E0F2FE"); doc.setLineWidth(3.6 * k); doc.setLineCap("round"); doc.setLineJoin("round");
    doc.line(x + 32 * k, y + 36 * k, x + 32 * k, y + 12 * k);
    doc.lines([[5.5 * k, -7 * k], [5.5 * k, 7 * k]], x + 26.5 * k, y + 17 * k, [1, 1], "S", false);
  };
  const badge = (x, y, label, tone, h = 6.2) => {
    font(8.3, "bold", C[tone]); const w = doc.getTextWidth(t(label)) + 9;
    doc.setFillColor(BG[tone]); doc.setDrawColor(mix(BG[tone], C[tone], 0.35)); doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 1.6, 1.6, "FD"); dot(x + 3.2, y + h / 2, 0.95, C[tone]);
    text(label, x + 5.4, y + h / 2 + 1.1); return w;
  };
  const heading = (yy, title, sub) => {
    font(16, "bold", C.ink); text(title, M, yy + 6);
    gradLine(M, M + 22, yy + 9.5, 1.1);
    if (sub) { font(9, "normal", C.sub); text(sub, M, yy + 15); return yy + 21; }
    return yy + 15;
  };
  let y = TOP;
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = h => { if (y + h > BOTTOM) newPage(); };
  const sim = simulate(r.invested, r.per_year, r.years_plan, step, rate), end = sim[sim.length - 1];
  const hs = r.holdings || [];
  const etfs = hs.filter(h => h.kind === "etf"), stocks = hs.filter(h => h.kind === "stock");

  // ── 1. cover ──────────────────────────────────────────────────────────────────────────────────────────────
  doc.setFillColor(C.navy); doc.rect(0, 0, W, H, "F");
  [[176, 40, C.purple], [30, 238, C.cyan], [200, 250, isStock ? C.bad : C.good]].forEach(([cx, cy, col]) => {
    for (const [rr, o] of [[95, 0.05], [70, 0.06], [48, 0.07], [28, 0.08]]) { op(o); dot(cx, cy, rr, col); }
  });
  op(0.07); poly([[-10, 205], [120, 160], [230, 192], [100, 240]], C.cyan); op(1);
  logo(M + 2, 20, 17);
  font(22, "bold", "#FFFFFF"); text("Hyperplane", M + 23, 29.5);
  font(10, "normal", "#A5B4FC"); text("by QuantFriday", M + 23.5, 35.5);
  gradLine(M + 2, W - M - 2, 50, 0.6);
  font(10, "bold", C.cyan); doc.setCharSpace(1.2); text(`HYPERPLANE AI  ·  ${product.toUpperCase()}`, M + 2, 92); doc.setCharSpace(0);
  font(40, "bold", "#FFFFFF"); text(isStock ? "Momentum SIP" : "Your SIP", M + 2, 112);
  font(40, "bold", C.violet); text("Plan Report", M + 2, 128);
  font(12.5, "normal", "#CBD5E1");
  wrap(isStock ? "A monthly plan in momentum stocks, spread across many sectors, prepared by Hyperplane AI."
    : "A steady monthly plan in ETFs: the core Nifty markets, a little gold and the strongest ETFs today, prepared by Hyperplane AI.", 160)
    .forEach((l, i) => text(l, M + 2, 142 + i * 6.2));
  // the plan in four numbers
  const cov = [[`Each ${word}`, inr(r.invested)], [isStock ? "Stocks" : "ETFs", String(hs.length)], [`Put in, ${r.years_plan} years`, inrShort(end.put)],
    [rate ? `At ${rate}% a year` : "Without growth", inrShort(end.val)]];
  cov.forEach(([k, v], i) => {
    const x = M + 2 + i * 44.5, yy = 168;
    op(0.08); doc.setFillColor("#FFFFFF"); doc.roundedRect(x, yy, 41.5, 22, 2.5, 2.5, "F"); op(1);
    doc.setDrawColor("#2B3A5C"); doc.setLineWidth(0.3); doc.roundedRect(x, yy, 41.5, 22, 2.5, 2.5, "S");
    font(7, "bold", "#94A3B8"); doc.setCharSpace(0.4); text(k.toUpperCase(), x + 3.5, yy + 7); doc.setCharSpace(0);
    font(13, "bold", "#FFFFFF"); text(v, x + 3.5, yy + 16);
  });
  // the risk level
  const tag = isStock ? ["HIGHER RISK  ·  STOCKS ONLY", C.bad] : ["RELIABLE  ·  ETFs ONLY", C.good];
  font(9, "bold", tag[1]); const tw = doc.getTextWidth(tag[0]) + 12;
  op(0.16); doc.setFillColor(tag[1]); doc.roundedRect(M + 2, 199, tw, 8, 4, 4, "F"); op(1);
  dot(M + 6, 203, 1.1, tag[1]); text(tag[0], M + 9, 204.3);
  [["Prepared for", "You"], ["Data as of", asOf], ["Report date", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
   ["How often", word === "month" ? "Monthly" : "Quarterly"]].forEach(([k, v], i) => {
    const x = M + 2 + (i % 2) * 88, yy = 226 + Math.floor(i / 2) * 14;
    font(7.5, "bold", "#64748B"); doc.setCharSpace(0.5); text(k.toUpperCase(), x, yy); doc.setCharSpace(0);
    font(11, "bold", "#E2E8F0"); text(v, x, yy + 6);
  });
  font(8, "normal", "#64748B");
  wrap("For education only. Not investment advice. Growth figures are an illustration with the rate you picked, never a forecast.", W - 2 * M - 4)
    .forEach((l, i) => text(l, M + 2, 268 + i * 4.2));

  // ── 2. overview ───────────────────────────────────────────────────────────────────────────────────────────
  newPage();
  y = heading(y, "Plan overview", `${inr(r.amount)} a ${word} · ${hs.length} ${isStock ? "stocks" : "ETFs"} · ${r.years_plan}-year plan`);
  const kp = isStock
    ? [[`Each ${word}`, inr(r.invested), r.over ? `+${inr(r.over)} over` : `of ${inr(r.amount)}`, "side"],
       ["Stocks", String(stocks.length), `across ${new Set(stocks.map(h => h.sec)).size} sectors`, "side"],
       ["Average strength", sgn(r.st_avg), r.st_avg >= 24 ? "Uptrend" : "Sideways", toneOf(r.st_avg)],
       [`Put in, ${r.years_plan} years`, inrShort(end.put), step ? `+${step}% a year` : "same amount each time", "side"]]
    : [[`Each ${word}`, inr(r.invested), r.over ? `+${inr(r.over)} over` : `of ${inr(r.amount)}`, "side"],
       ["ETFs picked", String(etfs.length), r.inputs && r.inputs.opts && r.inputs.opts.count ? `of ${r.inputs.opts.count} asked` : "", "side"],
       ["Split", `${r.sleeves.index}% / ${r.sleeves.commodity}%`, "equity / gold", "side"],
       [`Put in, ${r.years_plan} years`, inrShort(end.put), step ? `+${step}% a year` : "same amount each time", "side"]];
  const kw = (W - 2 * M - 9) / 4;
  kp.forEach(([k, v, s, tone], i) => {
    const x = M + i * (kw + 3);
    doc.setFillColor("#FFFFFF"); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(x, y, kw, 22, 2.2, 2.2, "FD");
    doc.setFillColor(i ? C.line : C.acc); doc.rect(x + 2, y, kw - 4, 0.9, "F");
    font(6.8, "bold", C.mute); doc.setCharSpace(0.4); text(k.toUpperCase(), x + 3.5, y + 6); doc.setCharSpace(0);
    font(14, "bold", tone === "side" ? C.ink : C[tone]); text(v, x + 3.5, y + 13.5);
    font(7.5, "normal", C.sub); text(s, x + 3.5, y + 18.5);
  });
  y += 29;
  if (isStock) {
    doc.setFillColor(BG.bad); doc.setDrawColor(mix(BG.bad, C.bad, 0.35)); doc.roundedRect(M, y, W - 2 * M, 13, 2, 2, "FD");
    font(8.8, "bold", C.bad); text("Higher risk.", M + 4, y + 5.4);
    font(8.5, "normal", C.ink); wrap("Single stocks move much more than ETFs and can fall sharply. Invest only money you can keep for years.", W - 2 * M - 30)
      .forEach((l, i) => text(l, M + 24, y + 5.4 + i * 4.2));
    y += 18;
  }
  if (r.over_note) { font(8.8, "normal", C.purple); wrap(r.over_note, W - 2 * M).forEach(l => { text(l, M, y); y += 4.4; }); y += 2; }
  // AI summary panel
  font(9.5, "normal");
  const pts = [...(r.summary || []).map(([tone, s]) => [tone, s]), ...(r.notes || []).map(s => ["mid", s])].map(([tone, s]) => [tone, wrap(s, W - 2 * M - 16)]);
  const ph = pts.reduce((a, [, ls]) => a + ls.length * lh(9.5) + 2, 0) + 14;
  ensure(ph + 4);
  doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.roundedRect(M, y, W - 2 * M, ph, 2.5, 2.5, "FD");
  doc.setFillColor(C.purple); doc.rect(M, y + 2.5, 1.3, ph - 5, "F");
  font(7.5, "bold", C.purple); doc.setCharSpace(0.6); text("HYPERPLANE AI SUMMARY", M + 6, y + 7); doc.setCharSpace(0);
  let py = y + 13;
  pts.forEach(([tone, ls]) => {
    dot(M + 7.5, py - 1.2, 0.9, tone === "good" ? C.good : tone === "bad" ? C.bad : tone === "info" ? C.acc : C.mid);
    font(9.5, "normal", C.ink); ls.forEach((l, i) => text(l, M + 11, py + i * lh(9.5))); py += ls.length * lh(9.5) + 2;
  });
  y += ph + 7;
  // where the money goes (two bar lists side by side)
  const acc = key => { const m = {}, tot = hs.reduce((a, h) => a + h.amt, 0) || 1; hs.forEach(h => { const k = key(h); if (k) m[k] = (m[k] || 0) + h.amt; });
    return Object.entries(m).map(([k, v]) => [k, v / tot * 100]).sort((a, b) => b[1] - a[1]); };
  const lists = isStock ? [["By market cap", acc(h => `${h.cap} cap`)], ["By sector", acc(h => h.sec).slice(0, 10)]]
    : [["By role", acc(h => h.sleeve === "commodity" ? "Gold & silver" : h.role === "core" ? "Core index" : "Strongest ETFs")], ["By market", acc(h => h.grp).slice(0, 10)]];
  const lw = (W - 2 * M - 8) / 2, rows = Math.max(...lists.map(([, l]) => l.length));
  ensure(14 + rows * 6.4);
  lists.forEach(([title, list], j) => {
    const x = M + j * (lw + 8); let yy = y;
    font(7.5, "bold", C.mute); doc.setCharSpace(0.5); text(title.toUpperCase(), x, yy); doc.setCharSpace(0); yy += 5;
    list.forEach(([k, v]) => {
      font(8.5, "normal", C.ink); let nm = t(k); while (doc.getTextWidth(nm) > 34 && nm.length > 4) nm = nm.slice(0, -2); text(nm, x, yy + 3);
      doc.setFillColor(C.line); doc.roundedRect(x + 37, yy + 0.6, lw - 52, 3, 1.5, 1.5, "F");
      doc.setFillColor(j ? C.purple : C.acc); doc.roundedRect(x + 37, yy + 0.6, Math.max(1.5, (lw - 52) * v / 100), 3, 1.5, 1.5, "F");
      font(8.5, "bold", C.ink); text(`${v.toFixed(1)}%`, x + lw, yy + 3, { align: "right" }); yy += 6.4;
    });
  });
  y += 8 + rows * 6.4;

  // ── 3. holdings by group ──────────────────────────────────────────────────────────────────────────────────
  newPage();
  y = heading(y, isStock ? "Stocks to buy each " + word : "ETFs to buy each " + word, "Grouped like the app. The money each instalment stays the same; the units follow the price.");
  const groups = isStock
    ? ["Large", "Mid", "Small"].map(k => ({ k, label: `${k} cap`, rows: stocks.filter(h => h.cap === k) }))
    : [{ k: "core", label: "Core index · Nifty large, mid and small", rows: etfs.filter(h => h.role === "core") },
       { k: "extra", label: "Strongest ETFs today", rows: etfs.filter(h => h.role === "theme" || h.role === "diversifier") },
       { k: "metal", label: "Gold & silver", rows: etfs.filter(h => h.sleeve === "commodity") }];
  const X = { n: M + 3, r: M + 66, s: M + 92, q: M + 110, p: M + 158, a: W - M - 3 };
  const thead = () => {
    doc.setFillColor(C.panel); doc.rect(M, y - 4.5, W - 2 * M, 7, "F");
    font(7, "bold", C.mute); doc.setCharSpace(0.3);
    [["HOLDING", X.n], [isStock ? "RELIABILITY" : "ROLE", X.r], ["STRENGTH", X.s], ["QTY EACH", X.q]].forEach(([l, x]) => text(l, x, y));
    text("PRICE", X.p, y, { align: "right" }); text(`RS / ${word.toUpperCase()}`, X.a, y, { align: "right" }); doc.setCharSpace(0);
    y += 6;
  };
  thead();
  groups.filter(g => g.rows.length).forEach(g => {
    const amt = g.rows.reduce((a, h) => a + h.amt, 0);
    if (y + 16 > BOTTOM) { newPage(); thead(); }
    const col = GROUP_COL[g.k] || C.acc;
    doc.setFillColor(mix("#FFFFFF", col, 0.08)); doc.rect(M, y - 4, W - 2 * M, 7.5, "F"); doc.setFillColor(col); doc.rect(M, y - 4, 1.2, 7.5, "F");
    font(9, "bold", C.ink); text(g.label, X.n, y + 0.8);
    font(8, "normal", C.sub); text(`${g.rows.length} holding${g.rows.length === 1 ? "" : "s"}  ·  ${inr(amt)} a ${word}  ·  ${(amt / r.invested * 100).toFixed(1)}%`, X.a, y + 0.8, { align: "right" });
    y += 8.5;
    g.rows.forEach(h => {
      if (y + 9 > BOTTOM) { newPage(); thead(); }
      font(9.5, "bold", C.acc); text(h.s, X.n, y);
      font(7.2, "normal", C.sub); let nm = t(h.n !== h.s ? h.n : h.grp); if (h.kind === "stock" && h.sec) nm += ` · ${t(h.sec)}`;
      while (doc.getTextWidth(nm) > 58 && nm.length > 4) nm = nm.slice(0, -2); text(nm, X.n, y + 3.8);
      font(8.3, "normal", C.ink); text(h.kind === "stock" ? `${REL[h.rel] || "-"}${h.rs != null ? ` · ${h.rs}` : ""}` : ROLE[h.role] || "ETF", X.r, y + 1.5);
      font(9.5, "bold", C[toneOf(h.st)] || C.sub); text(sgn(h.st), X.s, y + 1.5);
      font(8.5, "normal", C.ink); text(h.every > 1 ? `1 every ${h.every} ${word}s` : `${h.units} ${h.kind === "etf" ? "unit" : "share"}${h.units === 1 ? "" : "s"}`, X.q, y + 1.5);
      text(`Rs ${(+h.p).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, X.p, y + 1.5, { align: "right" });
      font(9.5, "bold", C.ink); text(inr(h.amt), X.a, y + 1.5, { align: "right" });
      y += 6.4; doc.setDrawColor(C.line); doc.setLineWidth(0.2); doc.line(M, y - 1.2, W - M, y - 1.2); y += 1.6;
    });
    y += 2;
  });
  font(8, "normal", C.sub);
  wrap(isStock ? "Each stock gets the same money every instalment; a costly share is bought every few instalments. Hyperplane AI re-checks every stock after each update; a stock whose long-term regime turns down is flagged for a swap."
    : "Core index ETFs are kept whatever the trend; a theme leaves only in a long-term downtrend. Prices change daily; the money each instalment stays the same.", W - 2 * M)
    .forEach(l => { ensure(5); text(l, M, y + 2); y += lh(8); });

  // ── 4. growth simulator ───────────────────────────────────────────────────────────────────────────────────
  newPage();
  y = heading(y, "Growth simulator", `${r.years_plan} years · ${step ? `+${step}% step-up a year` : "same amount each time"} · ${rate ? `${rate}% assumed growth a year` : "no growth assumed"} — an illustration, not a forecast`);
  // chart: put in vs value, one bar pair per year
  const ch = 62, cx0 = M + 14, cw = W - 2 * M - 16, maxV = Math.max(...sim.map(s => Math.max(s.put, s.val))) || 1;
  doc.setDrawColor(C.line); doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) { const yy = y + ch - ch * i / 4; doc.line(cx0, yy, cx0 + cw, yy); font(6.5, "normal", C.mute); text(inrShort(maxV * i / 4).replace("Rs ", ""), cx0 - 2, yy + 1, { align: "right" }); }
  const bw = cw / sim.length;
  sim.forEach((s, i) => {
    const x = cx0 + i * bw, w = Math.max(0.6, bw * 0.36);
    doc.setFillColor(C.line); const hp = ch * s.put / maxV; doc.rect(x + bw * 0.12, y + ch - hp, w, hp, "F");
    doc.setFillColor(C.purple); const hv = ch * s.val / maxV; doc.rect(x + bw * 0.12 + w + 0.3, y + ch - hv, w, hv, "F");
    if (sim.length <= 15 || (i + 1) % 5 === 0) { font(6.5, "normal", C.mute); text(String(s.y), x + bw / 2, y + ch + 4, { align: "center" }); }
  });
  y += ch + 9;
  dot(M + 15, y - 1, 1.2, C.line); font(8, "normal", C.sub); text("You put in", M + 18, y);
  dot(M + 45, y - 1, 1.2, C.purple); text(rate ? `Value at ${rate}% a year` : "Value (no growth)", M + 48, y);
  y += 7;
  doc.setFillColor(C.panel); doc.rect(M, y - 4.5, W - 2 * M, 7, "F");
  font(7, "bold", C.mute); [["YEAR", M + 3], [`EACH ${word.toUpperCase()}`, M + 40]].forEach(([l, x]) => text(l, x, y));
  text("TOTAL PUT IN", M + 125, y, { align: "right" }); text(rate ? `AT ${rate}%` : "VALUE", W - M - 3, y, { align: "right" }); y += 6;
  sim.forEach(row => {
    ensure(6);
    font(9, "normal", C.ink); text(String(row.y), M + 3, y); text(inr(row.each), M + 40, y); text(inr(row.put), M + 125, y, { align: "right" });
    font(9, "bold", C.ink); text(inr(row.val), W - M - 3, y, { align: "right" }); y += 5.4;
  });

  // ── 5. how to buy + disclaimer ────────────────────────────────────────────────────────────────────────────
  ensure(80); y += 6;
  y = heading(y, "How to buy this SIP", "Recommended: Zerodha Kite — zero brokerage on equity delivery (stocks and ETFs held, not traded).");
  ["Open Kite (app or kite.zerodha.com) and sign in.", "Search each ticker above (NSE) and tap Buy.", "Choose SIP (Create SIP) instead of a one-time order.",
   `Set the amount (or quantity) shown and the frequency: ${word === "month" ? "monthly" : "quarterly"}. Pick a start date.`,
   "Confirm. Repeat for each holding, or add them to a basket and create one basket SIP.",
   `Each ${word}, open My portfolios in ${product} to see Hyperplane AI's check and follow any change.`].forEach((s, i) => {
    ensure(8);
    doc.setFillColor(BG.side); doc.circle(M + 3, y - 1.2, 2.6, "F"); font(8, "bold", C.acc); text(String(i + 1), M + 3, y, { align: "center" });
    font(9.2, "normal", C.ink); wrap(s, W - 2 * M - 10).forEach((l, j) => text(l, M + 8, y + j * lh(9.2))); y += 7;
  });
  ensure(30); y += 4;
  font(9, "normal"); const disc = wrap("For education only. This plan describes trends using Hyperplane's own quant algorithms. It is not investment advice and not a recommendation to buy or sell any security. Growth figures are an illustration with the rate you picked, never a forecast. Please do your own research or consult a SEBI-registered adviser before investing.", W - 2 * M - 12);
  const dh = disc.length * lh(9) + 13;
  doc.setFillColor("#FFF8EC"); doc.setDrawColor("#F6D9A4"); doc.roundedRect(M, y, W - 2 * M, dh, 2.5, 2.5, "FD");
  font(9.5, "bold", "#9A5B00"); text("Information, not advice", M + 6, y + 6.5);
  font(9, "normal", "#6B4A12"); disc.forEach((l, i) => text(l, M + 6, y + 12 + i * lh(9)));

  // ── header + footer on every page after the cover ─────────────────────────────────────────────────────────
  const n = doc.getNumberOfPages();
  for (let p = 2; p <= n; p++) {
    doc.setPage(p);
    logo(M, 8.5, 9.5);
    font(11, "bold", C.ink); text("Hyperplane", M + 12, 13.2); font(7.5, "normal", C.sub); text("by QuantFriday", M + 12, 17.4);
    font(10, "bold", C.ink); text(`${product} · Plan Report`, W - M, 13.2, { align: "right" });
    font(7.5, "normal", C.sub); text(`${inr(r.amount)} a ${word}  ·  Data as of ${asOf}`, W - M, 17.4, { align: "right" });
    gradLine(M, W - M, 21.5, 0.7);
    doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.line(M, 283, W - M, 283);
    font(7.5, "normal", C.mute); text("Hyperplane by QuantFriday  ·  Private to the account holder  ·  For education only, not investment advice", M, 288.5);
    font(7.5, "bold", C.sub); text(`Page ${p} of ${n}`, W - M, 288.5, { align: "right" });
  }
  doc.save(`Hyperplane-${isStock ? "Momentum-SIP" : "SIP"}-Plan-${new Date().toISOString().slice(0, 10)}.pdf`);
}
