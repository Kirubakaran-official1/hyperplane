// AI Portfolio report (PDF) — built in the customer's browser, so the stock list never leaves the device.
// Loaded only when "Download report" is clicked (separate chunk). Everything is drawn as vectors: cover page, branded
// header / footer, summary, gauge, colour groups, Trend map, stock-by-stock cards and a "how to read" page.
// It only draws the model prepared by PortfolioView (same numbers and words as the screen) — no analysis happens here.
import { jsPDF, GState } from "jspdf";
import { placeLabels } from "./labels.js";

const C = {
  ink: "#0F172A", sub: "#475569", mute: "#94A3B8", line: "#E2E8F0", panel: "#F7F9FC",
  navy: "#0A1020", navy2: "#121C33", navyLine: "#24324F",
  purple: "#8B5CF6", violet: "#A78BFA", cyan: "#22D3EE", indigo: "#6366F1", sky: "#E0F2FE",
  good: "#0EA371", mid: "#E8960C", bad: "#E5484D", side: "#8B97AD",
};
const BG = { good: "#E3F6EF", mid: "#FDF3E1", bad: "#FCE9EA", side: "#EEF1F5" };
const W = 210, H = 297, M = 16, TOP = 30, BOTTOM = 276;

// Standard PDF fonts only know Western characters: swap the app's typographic signs for plain ones.
const t = s => String(s ?? "").replace(/−/g, "-").replace(/[✦▲▼◆■ⓘ]/g, "").replace(/[^\x00-\xFF‹›·…–—‘’“”•]/g, "").trim();
const sgn = v => v == null ? "-" : v < 0 ? `-${Math.abs(v)}` : `${v}`;
const toneOf = v => v == null ? "side" : v < 0 ? "bad" : v >= 24 ? "good" : "side";
const mix = (a, b, k) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k)
  .toString(16).padStart(2, "0")).join("");

export function downloadReport(m) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const op = v => doc.setGState(new GState({ opacity: v }));
  const font = (size, style = "normal", color = C.ink) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);
  const wrap = (s, w) => doc.splitTextToSize(t(s), w);
  const lh = size => size * 0.3528 * 1.38;                       // line height in mm for a font size in pt
  const poly = (pts, fill) => {
    doc.setFillColor(fill);
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true);
  };
  const gradLine = (x0, x1, y, w, from = C.purple, to = C.cyan) => {
    const n = 48; doc.setLineWidth(w); doc.setLineCap("butt");
    for (let i = 0; i < n; i++) { doc.setDrawColor(mix(from, to, i / (n - 1))); doc.line(x0 + (x1 - x0) * i / n, y, x0 + (x1 - x0) * (i + 1) / n + 0.2, y); }
  };
  const logo = (x, y, s) => {                                    // the app's mark, scaled to s mm
    const k = s / 64;
    doc.setFillColor("#0D1B33"); doc.setDrawColor("#1F3A5F"); doc.setLineWidth(0.25);
    doc.roundedRect(x + 1.5 * k, y + 1.5 * k, 61 * k, 61 * k, 16 * k, 16 * k, "FD");
    poly([[7, 37], [35, 27], [57, 34], [29, 45]].map(([a, b]) => [x + a * k, y + b * k]), "#3B82F6");
    poly([[7, 37], [21, 32], [43, 39], [29, 45]].map(([a, b]) => [x + a * k, y + b * k]), C.cyan);
    doc.setDrawColor("#E0F2FE"); doc.setLineWidth(3.6 * k); doc.setLineCap("round"); doc.setLineJoin("round");
    doc.line(x + 32 * k, y + 36 * k, x + 32 * k, y + 12 * k);
    doc.lines([[5.5 * k, -7 * k], [5.5 * k, 7 * k]], x + 26.5 * k, y + 17 * k, [1, 1], "S", false);
  };
  const dot = (x, y, r, color) => { doc.setFillColor(color); doc.circle(x, y, r, "F"); };
  const badge = (x, y, label, tone, h = 6.4) => {                // coloured status badge, returns its width
    font(8.5, "bold", C[tone]); const w = doc.getTextWidth(t(label)) + 9;
    doc.setFillColor(BG[tone]); doc.setDrawColor(mix(BG[tone], C[tone], 0.35)); doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 1.6, 1.6, "FD"); dot(x + 3.2, y + h / 2, 0.95, C[tone]);
    text(label, x + 5.4, y + h / 2 + 1.1); return w;
  };
  const chip = (x, y, label, tone = null, h = 6.4) => {          // neutral chip with an optional coloured dot
    font(8, "normal", C.sub); const w = doc.getTextWidth(t(label)) + (tone ? 9 : 6);
    doc.setDrawColor(C.line); doc.setFillColor("#FFFFFF"); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 1.6, 1.6, "FD");
    if (tone) dot(x + 3.1, y + h / 2, 0.85, C[tone]);
    text(label, x + (tone ? 5.3 : 3), y + h / 2 + 1.05); return w;
  };
  const heading = (y, title, sub) => {
    font(16, "bold", C.ink); text(title, M, y + 6);
    gradLine(M, M + 22, y + 9.5, 1.1);
    if (sub) { font(9, "normal", C.sub); text(sub, M, y + 15); return y + 21; }
    return y + 15;
  };
  let y = TOP;
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = h => { if (y + h > BOTTOM) newPage(); };

  // ── 1. cover ──────────────────────────────────────────────────────────────────────────────────────────────
  doc.setFillColor(C.navy); doc.rect(0, 0, W, H, "F");
  [[176, 40, C.purple], [30, 238, C.cyan], [200, 250, C.indigo]].forEach(([cx, cy, col]) => {
    for (const [r, o] of [[95, 0.05], [70, 0.06], [48, 0.07], [28, 0.08]]) { op(o); dot(cx, cy, r, col); }
  });
  op(0.07); poly([[-10, 205], [120, 160], [230, 192], [100, 240]], C.cyan); op(1);
  logo(M + 2, 20, 17);
  font(22, "bold", "#FFFFFF"); text("Hyperplane", M + 23, 29.5);
  font(10, "normal", "#A5B4FC"); text("by QuantFriday", M + 23.5, 35.5);
  gradLine(M + 2, W - M - 2, 50, 0.6);
  font(10, "bold", C.cyan); doc.setCharSpace(1.2); text("HYPERPLANE AI  ·  PORTFOLIO ANALYSER", M + 2, 92); doc.setCharSpace(0);
  font(40, "bold", "#FFFFFF"); text("AI Portfolio", M + 2, 112);
  font(40, "bold", C.violet); text("Report", M + 2, 128);
  font(12.5, "normal", "#CBD5E1"); wrap("A clear, long-term view of the stocks you hold, prepared by Hyperplane AI.", 150)
    .forEach((l, i) => text(l, M + 2, 142 + i * 6.2));
  doc.setFillColor(C.navy2); doc.setDrawColor(C.navyLine); doc.setLineWidth(0.4); doc.roundedRect(M + 2, 160, W - 2 * M - 4, 44, 3, 3, "FD");
  [["Prepared for", m.customer || "You"], ["Data as of", m.asOf], ["Report date", m.generated], ["Stocks analysed", String(m.total)]].forEach(([k, v], i) => {
    const x = M + 10 + (i % 2) * 86, yy = 172 + Math.floor(i / 2) * 19;
    font(7.5, "bold", "#7C8DB5"); doc.setCharSpace(0.6); text(k.toUpperCase(), x, yy); doc.setCharSpace(0);
    font(12, "bold", "#FFFFFF"); text(v, x, yy + 6.5);
  });
  let cx = M + 2;
  m.cats.forEach(c => {
    font(9.5, "bold", "#FFFFFF"); const label = `${c.count}  ${c.label}`, w = doc.getTextWidth(t(label)) + 11;
    op(0.22); doc.setFillColor(C[c.tone]); doc.roundedRect(cx, 214, w, 9, 2, 2, "F"); op(1);
    doc.setDrawColor(C[c.tone]); doc.setLineWidth(0.35); doc.roundedRect(cx, 214, w, 9, 2, 2, "S");
    dot(cx + 3.8, 218.5, 1.2, C[c.tone]); font(9.5, "bold", "#FFFFFF"); text(label, cx + 6.6, 220); cx += w + 4;
  });
  font(8.5, "normal", "#94A3B8");
  wrap(`Private to you. This report was made on your own device for ${m.customer || "you"}, the account holder. Your stock list is never visible to other users or to the admin, as per SEBI norms.`, W - 2 * M - 4)
    .forEach((l, i) => text(l, M + 2, 256 + i * 4.4));
  font(8, "normal", "#64748B"); text("For education only. Not investment advice. Please do your own research or consult a SEBI-registered adviser.", M + 2, 270);
  gradLine(M + 2, W - M - 2, 278, 0.4);
  font(8, "bold", "#7C8DB5"); text("Hyperplane by QuantFriday", M + 2, 285); text("Built on Hyperplane's own quant algorithms", W - M - 2, 285, { align: "right" });

  // ── 2. overview: AI summary | gauge, spread bar ─────────────────────────────────────────────────────────────
  newPage();
  y = heading(y, "Portfolio overview", `Hyperplane AI summary of your ${m.total} stock${m.total === 1 ? "" : "s"}.`);
  const sumW = 104, lx = M + 6, rx = M + sumW + 10;
  font(10, "normal"); const bullets = m.lines.map(([tone, s]) => [tone, wrap(s, sumW - 10)]);
  const textH = 16 + bullets.reduce((a, [, ls]) => a + ls.length * lh(9.5) + 2.2, 0);
  const panelH = Math.max(textH + 8, 86);
  doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(M, y, W - 2 * M, panelH, 3, 3, "FD");
  doc.setFillColor(C[m.tone]); doc.rect(M, y + 3, 1.4, panelH - 6, "F");
  font(7.5, "bold", C.mute); doc.setCharSpace(0.6); text("HYPERPLANE AI SUMMARY", lx, y + 8); doc.setCharSpace(0);
  font(13, "bold", C[m.tone]); text(m.title, lx, y + 15);
  let by = y + 22;
  bullets.forEach(([tone, ls]) => {
    dot(lx + 1, by - 1.1, 0.9, tone === "info" ? C.indigo : C[tone]);
    font(9.5, "normal", C.ink); ls.forEach((l, i) => text(l, lx + 4, by + i * lh(9.5))); by += ls.length * lh(9.5) + 2.2;
  });
  doc.setDrawColor(C.line); doc.line(rx - 4, y + 6, rx - 4, y + panelH - 6);
  const gW = W - M - rx, gcx = rx + gW / 2;
  font(7, "bold", C.mute); doc.setCharSpace(0.15); text("CURRENT STRENGTH OF THE PORTFOLIO", gcx, y + 8, { align: "center" }); doc.setCharSpace(0);
  const gy = y + 42, gr = 23;
  m.zones.forEach(([a, b, col]) => {
    const ang = v => Math.PI * (1 - (v + 100) / 200), pts = [];
    for (let i = 0; i <= 14; i++) { const v = a + 0.8 + (b - a - 1.6) * i / 14; pts.push([gcx + (gr + 3) * Math.cos(ang(v)), gy - (gr + 3) * Math.sin(ang(v))]); }
    for (let i = 14; i >= 0; i--) { const v = a + 0.8 + (b - a - 1.6) * i / 14; pts.push([gcx + (gr - 3) * Math.cos(ang(v)), gy - (gr - 3) * Math.sin(ang(v))]); }
    if (m.avg == null) op(0.3); poly(pts, col); op(1);
  });
  if (m.avg != null) {
    const a = Math.PI * (1 - (Math.max(-100, Math.min(100, m.avg)) + 100) / 200);
    doc.setDrawColor(C.ink); doc.setLineWidth(1.1); doc.setLineCap("round");
    doc.line(gcx, gy, gcx + (gr - 6.5) * Math.cos(a), gy - (gr - 6.5) * Math.sin(a));
  }
  dot(gcx, gy, 1.9, C.ink);
  font(7, "normal", C.mute); text("Down", gcx - gr, gy + 6, { align: "center" }); text("Up", gcx + gr, gy + 6, { align: "center" });
  font(22, "bold", C[toneOf(m.avg)]); text(m.avg == null ? "No data" : `${sgn(m.avg)}%`, gcx, gy + 17, { align: "center" });
  font(10, "bold", C[toneOf(m.avg)]); text(m.avgWord, gcx, gy + 23.5, { align: "center" });
  y += panelH + 8;

  ensure(30);
  font(7.5, "bold", C.mute); doc.setCharSpace(0.6); text("HOW YOUR STOCKS ARE SPREAD", M, y + 3); doc.setCharSpace(0);
  y += 6;
  const live = m.cats.filter(c => c.count), totalN = live.reduce((a, c) => a + c.count, 0) || 1;
  let bx = M; const bw = W - 2 * M;
  live.forEach(c => {
    const w = bw * c.count / totalN - (live.length > 1 ? 0.8 : 0);
    doc.setFillColor(C[c.tone]); doc.roundedRect(bx, y, Math.max(w, 2), 8, 1.2, 1.2, "F");
    if (w > 7) { font(8.5, "bold", "#FFFFFF"); text(String(c.count), bx + w / 2, y + 5.6, { align: "center" }); }
    bx += w + 0.8;
  });
  y += 13;
  m.cats.forEach((c, i) => {
    const x = M + i * (bw / 4); dot(x + 1.3, y - 1.1, 1.3, C[c.tone]);
    font(9, "normal", C.sub); text(c.label, x + 4, y); font(9, "bold", C.ink); text(String(c.count), x + 4 + doc.getTextWidth(t(c.label)) + 2.5, y);
  });
  y += 10;
  ensure(62);
  font(7.5, "bold", C.mute); doc.setCharSpace(0.6); text("KEY NUMBERS", M, y + 3); doc.setCharSpace(0);
  y += 6;
  const kw = (W - 2 * M - 8) / 3;
  m.keys.forEach(([label, value, note, tone], i) => {
    const x = M + (i % 3) * (kw + 4), yy = y + Math.floor(i / 3) * 26;
    doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(x, yy, kw, 22, 2.2, 2.2, "FD");
    doc.setFillColor(C[tone]); doc.roundedRect(x, yy + 4, 1.2, 14, 0.6, 0.6, "F");
    font(7, "bold", C.mute); doc.setCharSpace(0.4); text(label.toUpperCase(), x + 5, yy + 6.5); doc.setCharSpace(0);
    font(16, "bold", C[tone]); text(value, x + 5, yy + 14.5);
    font(7.5, "normal", C.sub); text(note, x + 5, yy + 19);
  });
  y += 2 * 26 + 4;

  // ── 3. colour groups (2 x 2) ───────────────────────────────────────────────────────────────────────────────
  const gw = (W - 2 * M - 6) / 2, rowH = 5.6, MAXI = 10;
  const boxH = c => 25 + Math.max(1, Math.min(c.items.length, MAXI) + (c.items.length > MAXI ? 1 : 0)) * rowH;
  for (let r = 0; r < 2; r++) {
    const pair = m.cats.slice(r * 2, r * 2 + 2), h = Math.max(...pair.map(boxH));
    if (r === 0) { ensure(h + 24); y = heading(y, "Your stocks by colour", "Red first, then amber, then green. Grey stocks are too new for a view."); }
    else ensure(h + 4);
    pair.forEach((c, i) => {
      const x = M + i * (gw + 6);
      doc.setFillColor("#FFFFFF"); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(x, y, gw, h, 2.5, 2.5, "FD");
      doc.setFillColor(C[c.tone]); doc.roundedRect(x, y, gw, 1.8, 1, 1, "F"); doc.rect(x, y + 0.9, gw, 0.9, "F");
      dot(x + 5, y + 8.2, 1.4, C[c.tone]); font(11, "bold", C.ink); text(c.label, x + 8.5, y + 9.4);
      font(9, "bold", C.sub); const cw = doc.getTextWidth(String(c.count)) + 5;
      doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.roundedRect(x + gw - cw - 4, y + 4.8, cw, 6, 3, 3, "FD"); text(String(c.count), x + gw - cw / 2 - 4, y + 9, { align: "center" });
      font(7.5, "normal", C.mute); wrap(c.desc, gw - 10).slice(0, 2).forEach((l, k) => text(l, x + 5, y + 15.5 + k * 3.4));
      let iy = y + 25;
      if (!c.items.length) { font(8.5, "normal", C.mute); text("None right now", x + 5, iy); }
      c.items.slice(0, MAXI).forEach(it => {
        font(7.5, "bold"); const tkw = doc.getTextWidth(t(it.s));
        font(8.5, "normal", C.ink); let name = t(it.n); const room = gw - 10 - 16 - tkw - 4;
        while (doc.getTextWidth(name + "...") > room && name.length > 4) name = name.slice(0, -1);
        text(name === t(it.n) ? name : name.trim() + "...", x + 5, iy);
        font(7.5, "bold", C.indigo); text(it.s, x + gw - 21, iy, { align: "right" });
        font(8.5, "bold", it.v == null ? C.sub : C[toneOf(it.v)]); text(it.v == null ? it.extra : `${sgn(it.v)}%`, x + gw - 5, iy, { align: "right" });
        doc.setDrawColor(C.line); doc.setLineWidth(0.2); doc.line(x + 5, iy + 2, x + gw - 5, iy + 2); iy += rowH;
      });
      if (c.items.length > MAXI) { font(8, "normal", C.mute); text(`+ ${c.items.length - MAXI} more, see the stock details`, x + 5, iy); }
    });
    y += h + 6;
  }

  // ── 4. Trend map ────────────────────────────────────────────────────────────────────────────────────────────
  ensure(112);
  y = heading(y, "Trend map", "One dot per stock. Further right: stronger quarterly trend. Higher up: stronger yearly trend.");
  const px0 = M + 12, px1 = W - M - 2, py0 = y + 7, py1 = y + 78;
  const X = v => px0 + (v + 100) / 200 * (px1 - px0), Y = v => py0 + (100 - v) / 200 * (py1 - py0);
  [["Rising", "good", 1, 1], ["Cooling off", "mid", -1, 1], ["Recovering", "mid", 1, -1], ["Falling", "bad", -1, -1]].forEach(([lbl, tone, sx, sy]) => {
    doc.setFillColor(BG[tone]); doc.rect(sx > 0 ? X(0) : X(-100), sy > 0 ? Y(100) : Y(0), X(0) - X(-100), Y(0) - Y(100), "F");
    font(9, "bold", C[tone]); text(lbl, sx > 0 ? X(100) : X(-100), sy > 0 ? Y(100) - 2.2 : Y(-100) + 5, { align: sx > 0 ? "right" : "left" });
  });
  doc.setDrawColor("#CBD5E1"); doc.setLineWidth(0.3); doc.line(X(0), Y(100), X(0), Y(-100)); doc.line(X(-100), Y(0), X(100), Y(0));
  font(7, "normal", C.mute); text("+100", px0 - 1.5, Y(100) + 2.5, { align: "right" }); text("-100", px0 - 1.5, Y(-100), { align: "right" }); text("0", X(0), Y(-100) + 5, { align: "center" });
  font(7.5, "bold", C.sub); text("Quarterly trend  >", X(0), py1 + 10, { align: "center" });
  text("Yearly trend  >", px0 - 7, Y(0), { angle: 90, align: "center" });
  const dots = [...m.dots].sort((a, b) => a.rank - b.rank).map(d => ({ ...d, x: X(d.q), y: Y(d.y) }));
  const tags = placeLabels(dots.map(d => ({ key: d.s, x: d.x, y: d.y, label: d.s })), { box: [X(-100), Y(100), X(100), Y(-100)], u: 0.3, charW: 1.5 });
  dots.forEach(d => { doc.setDrawColor("#FFFFFF"); doc.setLineWidth(0.5); doc.setFillColor(C[d.tone]); doc.circle(d.x, d.y, 1.8, "FD"); });
  font(6.5, "bold", C.ink);
  dots.forEach(d => { const g = tags[d.s]; if (g) text(d.s, g[1], g[2], { align: g[0] === "start" ? "left" : g[0] === "end" ? "right" : "center" }); });
  y = py1 + 15;
  font(8, "normal", C.sub);
  wrap(`Dot colours match the colour groups.${m.hidden ? ` ${m.hidden} stock${m.hidden === 1 ? " is" : "s are"} not shown: recently listed or no yearly view yet.` : ""}`, W - 2 * M).forEach(l => { text(l, M, y); y += 4; });
  y += 4;

  // ── 5. stock by stock ───────────────────────────────────────────────────────────────────────────────────────
  ensure(80);
  y = heading(y, "Stock by stock", "Look-at-first stocks come first. Each stock with its strength and the reasons in plain words.");
  const RW = 90, rX = W - M - RW - 4, LW = rX - M - 10;
  m.stocks.forEach(st => {
    font(8.8, "normal"); const why = st.why.map(w => wrap(w, RW - 5));
    font(7.5, "normal"); const ref = wrap(st.ref, RW);
    const rightH = why.reduce((a, ls) => a + ls.length * lh(8.8) + 1.6, 0) + 4 + ref.length * lh(7.5);
    const h = 27 + Math.max(st.isNew ? 22 : 44, rightH) + 5;
    ensure(h + 4);
    doc.setFillColor("#FFFFFF"); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(M, y, W - 2 * M, h, 2.5, 2.5, "FD");
    doc.setFillColor(C[st.tone]); doc.rect(M, y + 2.5, 1.4, h - 5, "F");
    font(12, "bold", C.ink); let name = t(st.n); while (doc.getTextWidth(name) > 120 && name.length > 4) name = name.slice(0, -2);
    text(name, M + 6, y + 8);
    const nw = doc.getTextWidth(name); font(8, "bold", C.indigo); const tw = doc.getTextWidth(t(st.s)) + 5;
    doc.setFillColor("#EEF2FF"); doc.setDrawColor("#C7D2FE"); doc.roundedRect(M + 8 + nw, y + 3.6, tw, 5.6, 1.3, 1.3, "FD"); text(st.s, M + 8 + nw + tw / 2, y + 7.4, { align: "center" });
    font(8, "normal", C.sub); text(`${st.sec}  ›  ${st.ind}`, M + 6, y + 13.6);
    let tx = M + 6; tx += badge(tx, y + 16.5, st.label, st.tone) + 2;
    st.chips.forEach(([label, tone]) => { tx += chip(tx, y + 16.5, label, tone) + 2; });
    const cy0 = y + 28;
    if (st.isNew) {
      doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.roundedRect(M + 6, cy0, LW, 16, 2, 2, "FD");
      font(9, "bold", C.sub); text("Recently listed", M + 10, cy0 + 6.5); font(8, "normal", C.mute); text("No view yet", M + 10, cy0 + 11.5);
    } else {
      font(7, "bold", C.mute); doc.setCharSpace(0.5); text("STOCK STRENGTH", M + 6, cy0 + 1); doc.setCharSpace(0);
      font(18, "bold", C[toneOf(st.v)]); text(`${sgn(st.v)}%`, M + 6, cy0 + 9.5);
      const vw = doc.getTextWidth(`${sgn(st.v)}%`); font(9, "bold", C[toneOf(st.v)]); text(st.word, M + 9 + vw, cy0 + 9);
      const barY = cy0 + 13, bx0 = M + 6, bw0 = LW, mid = bx0 + bw0 / 2;
      doc.setFillColor(C.line); doc.roundedRect(bx0, barY, bw0, 2.4, 1.2, 1.2, "F");
      const fw = bw0 / 2 * Math.min(100, Math.abs(st.v)) / 100;
      doc.setFillColor(C[toneOf(st.v)]); doc.rect(st.v < 0 ? mid - fw : mid, barY, fw, 2.4, "F");
      doc.setDrawColor(C.ink); doc.setLineWidth(0.4); doc.line(mid, barY - 1, mid, barY + 3.4);
      font(6, "normal", C.mute); text("-100", bx0, barY + 6); text("0", mid, barY + 6, { align: "center" }); text("+100", bx0 + bw0, barY + 6, { align: "right" });
      const boxW = (LW - 4) / 3;
      st.tfs.forEach((f, i) => {
        const x = M + 6 + i * (boxW + 2), yy = cy0 + 22;
        doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.setLineWidth(0.25); doc.roundedRect(x, yy, boxW, 17, 1.6, 1.6, "FD");
        font(6.3, "bold", C.mute); doc.setCharSpace(0.4); text(f.label.toUpperCase(), x + 2.5, yy + 4.2); doc.setCharSpace(0);
        font(11, "bold", f.v == null ? C.mute : C[toneOf(f.v)]); text(f.v == null ? "No data" : f.v === 0 ? "Sideways" : `${sgn(f.v)}%`, x + 2.5, yy + 10);
        font(5.9, "normal", C.sub); if (f.v != null && f.v !== 0) text(f.word, x + 2.5, yy + 14.4);
        else if (f.v == null && f.note) text(f.note, x + 2.5, yy + 14.4);
      });
    }
    let ry = cy0 + 1.5;
    why.forEach(ls => { dot(rX + 1, ry - 1, 0.7, C.mute); font(8.8, "normal", C.ink); ls.forEach((l, i) => text(l, rX + 4, ry + i * lh(8.8))); ry += ls.length * lh(8.8) + 1.6; });
    ry += 1.5; doc.setDrawColor(C.line); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(rX, ry - 2.5, rX + RW, ry - 2.5); doc.setLineDashPattern([], 0);
    font(7.5, "normal", C.mute); ref.forEach((l, i) => text(l, rX, ry + 1 + i * lh(7.5)));
    y += h + 4;
  });

  // ── 6. how to read ──────────────────────────────────────────────────────────────────────────────────────────
  newPage();
  y = heading(y, "How to read this report", "Plain-word guide to the colours, the strength and the notes on each stock.");
  m.cats.forEach(c => {
    const ls = (font(9, "normal"), wrap(c.long, W - 2 * M - 52));
    const h = Math.max(11, ls.length * lh(9) + 5);
    doc.setFillColor(C.panel); doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.roundedRect(M, y, W - 2 * M, h, 2, 2, "FD");
    badge(M + 4, y + h / 2 - 3.2, c.label, c.tone);
    font(9, "normal", C.ink); ls.forEach((l, i) => text(l, M + 48, y + h / 2 - (ls.length - 1) * lh(9) / 2 + 1.2 + i * lh(9)));
    y += h + 2.5;
  });
  y += 3;
  m.guide.forEach(([title, body]) => {
    font(9, "normal"); const ls = wrap(body, W - 2 * M);
    ensure(8 + ls.length * lh(9));
    font(10, "bold", C.ink); text(title, M, y + 4); y += 7;
    font(9, "normal", C.sub); ls.forEach(l => { text(l, M, y + 1); y += lh(9); }); y += 2.6;
  });
  ensure(28); y += 1;
  font(9, "normal"); const disc = wrap("For education only. This report describes the trend of each stock using Hyperplane's own quant algorithms. It is not investment advice and not a recommendation to buy or sell any security. Please do your own research or consult a SEBI-registered adviser before investing.", W - 2 * M - 12);
  const dh = disc.length * lh(9) + 13;
  doc.setFillColor("#FFF8EC"); doc.setDrawColor("#F6D9A4"); doc.roundedRect(M, y, W - 2 * M, dh, 2.5, 2.5, "FD");
  font(9.5, "bold", "#9A5B00"); text("Information, not advice", M + 6, y + 6.5);
  font(9, "normal", "#6B4A12"); disc.forEach((l, i) => text(l, M + 6, y + 12 + i * lh(9)));

  // ── header + footer on every page after the cover ──────────────────────────────────────────────────────────
  const n = doc.getNumberOfPages();
  for (let p = 2; p <= n; p++) {
    doc.setPage(p);
    logo(M, 8.5, 9.5);
    font(11, "bold", C.ink); text("Hyperplane", M + 12, 13.2); font(7.5, "normal", C.sub); text("by QuantFriday", M + 12, 17.4);
    font(10, "bold", C.ink); text("AI Portfolio Report", W - M, 13.2, { align: "right" });
    font(7.5, "normal", C.sub); text(`${m.customer ? `${m.customer}  ·  ` : ""}Data as of ${m.asOf}`, W - M, 17.4, { align: "right" });
    gradLine(M, W - M, 21.5, 0.7);
    doc.setDrawColor(C.line); doc.setLineWidth(0.3); doc.line(M, 283, W - M, 283);
    font(7.5, "normal", C.mute); text("Hyperplane by QuantFriday  ·  Private to the account holder  ·  For education only, not investment advice", M, 288.5);
    font(7.5, "bold", C.sub); text(`Page ${p} of ${n}`, W - M, 288.5, { align: "right" });
  }
  doc.save(m.file);
}
