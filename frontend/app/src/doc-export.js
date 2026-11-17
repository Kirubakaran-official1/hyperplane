// Every report as PDF, Word and Markdown (round 23c, owner 2026-11-17: "bring the option to download everything as Word + Markdown — so 3 options").
// Loaded only when a download starts (its own chunk; the docx / jsPDF libraries load inside it). A page describes its report ONCE as a small
// document model — the same numbers and words it shows — and this file writes it:
//   { file, title, subtitle, meta: [[label, value]], blocks: [block…] }
//   block: { h: "Heading", sub } · { h2: "Smaller heading" } · { p: "text" } · { ul: ["point", …] } · { kv: [[label, value, note]] }
//          · { table: { head: [...], rows: [[...]], num: [column indexes that are numbers] } } · { note: "small grey text" } · { pb: true }
// Word = docx (the Planner's library), Markdown = plain text, PDF = jsPDF with the standard fonts (only for a page without its own designed PDF —
// the AI Portfolio / ETF basket / SIP reports keep theirs).
const DISCLAIMER = "For education only. Hyperplane shows trend information; it is not investment advice or a recommendation to buy or sell any security. "
  + "Please do your own research or consult a SEBI-registered adviser before investing.";
const PRIVACY = "Private to you: made on your own device for the account holder; never visible to other users or to the admin, as per SEBI norms.";

function save(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const str = v => v == null ? "" : String(v);

// ── Markdown
const mdCell = v => str(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
function mdOf(m) {
  const out = [`# ${m.title}`, ""];
  if (m.subtitle) out.push(`_${m.subtitle}_`, "");
  if (m.meta && m.meta.length) out.push(...m.meta.map(([k, v]) => `- **${k}:** ${str(v)}`), "");
  for (const b of m.blocks) {
    if (b.h) out.push(`## ${b.h}`, "", ...(b.sub ? [`_${b.sub}_`, ""] : []));
    else if (b.h2) out.push(`### ${b.h2}`, "");
    else if (b.p) out.push(str(b.p), "");
    else if (b.note) out.push(`> ${str(b.note)}`, "");
    else if (b.ul) out.push(...b.ul.filter(Boolean).map(x => `- ${str(x)}`), "");
    else if (b.kv) out.push("| | | |", "|---|---|---|", ...b.kv.map(r => `| **${mdCell(r[0])}** | ${mdCell(r[1])} | ${mdCell(r[2])} |`), "");
    else if (b.table && b.table.rows.length) {
      const t = b.table, al = t.head.map((_, i) => (t.num || []).includes(i) ? "---:" : "---");
      out.push(`| ${t.head.map(mdCell).join(" | ")} |`, `| ${al.join(" | ")} |`, ...t.rows.map(r => `| ${r.map(mdCell).join(" | ")} |`), "");
    }
  }
  out.push("---", "", `_${PRIVACY}_`, "", `_${DISCLAIMER}_`, "", "Hyperplane by QuantFriday");
  return out.join("\n");
}

// ── Word
async function docxOf(m) {
  const D = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, Header, Footer, PageNumber, LevelFormat } = D;
  const cell = (v, o = {}) => new TableCell({ shading: o.head ? { type: ShadingType.CLEAR, color: "auto", fill: "ECEFF4" } : undefined,
    children: [new Paragraph({ alignment: o.num ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 }, children: [new TextRun({ text: str(v), bold: !!o.head || !!o.bold, size: 19 })] })] });
  const table = (head, rows, num = []) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    ...(head ? [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { head: true, num: num.includes(i) })) })] : []),
    ...rows.map(r => new TableRow({ children: r.map((v, i) => cell(v, { num: num.includes(i), bold: !head && i === 0 })) }))] });
  const kids = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(m.title)] })];
  if (m.subtitle) kids.push(new Paragraph({ children: [new TextRun({ text: m.subtitle, color: "555555" })], spacing: { after: 160 } }));
  if (m.meta && m.meta.length) kids.push(table(null, m.meta.map(([k, v]) => [k, str(v)])), new Paragraph(""));
  for (const b of m.blocks) {
    if (b.pb) { kids.push(new Paragraph({ pageBreakBefore: true, children: [] })); continue; }
    if (b.h) { kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.h)] }));
      if (b.sub) kids.push(new Paragraph({ children: [new TextRun({ text: b.sub, color: "666666", size: 19 })], spacing: { after: 120 } })); }
    else if (b.h2) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.h2)] }));
    else if (b.p) kids.push(new Paragraph({ children: [new TextRun(str(b.p))], spacing: { after: 120 } }));
    else if (b.note) kids.push(new Paragraph({ children: [new TextRun({ text: str(b.note), color: "666666", size: 18, italics: true })], spacing: { after: 120 } }));
    else if (b.ul) b.ul.filter(Boolean).forEach(x => kids.push(new Paragraph({ numbering: { reference: "hp-bullet", level: 0 }, spacing: { after: 40 }, children: [new TextRun(str(x))] })));
    else if (b.kv) kids.push(table(null, b.kv.map(r => [r[0], str(r[1]), str(r[2] || "")])), new Paragraph(""));
    else if (b.table && b.table.rows.length) kids.push(table(b.table.head, b.table.rows.map(r => r.map(str)), b.table.num || []), new Paragraph(""));
  }
  kids.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: PRIVACY, color: "666666", size: 17 })] }),
    new Paragraph({ children: [new TextRun({ text: DISCLAIMER, color: "8A5A00", size: 17 })] }));
  const doc = new Document({
    creator: "Hyperplane by QuantFriday", title: m.title,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    numbering: { config: [{ reference: "hp-bullet", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
    sections: [{
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Hyperplane · ${m.title}`, color: "888888", size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: "Hyperplane by QuantFriday · For education only · Page ", color: "888888", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: "888888", size: 16 })] })] }) },
      children: kids }],
  });
  return Packer.toBlob(doc);
}

// ── PDF (a plain, clean layout for the pages without their own designed report): standard fonts, so ₹ → Rs and other signs → plain text
const LAT = { "₹": "Rs ", "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " ", "−": "-", "→": "->", "←": "<-", "✓": "v", "×": "x",
  "▲": "^", "▼": "v", "◆": "-", "≥": ">=", "≤": "<=", "·": "-", "›": ">" };
const lat = s => str(s).replace(/[^\u0000-ÿ]/g, c => LAT[c] !== undefined ? LAT[c] : "?");
async function pdfOf(m) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" }), W = 210, H = 297, M = 16, BOT = H - 18;
  let y = 20;
  const font = (s, st = "normal", c = "#0F1B2D") => { doc.setFont("helvetica", st); doc.setFontSize(s); doc.setTextColor(c); };
  const wrap = (t, w) => doc.splitTextToSize(lat(t), w);
  const need = h => { if (y + h > BOT) { doc.addPage(); y = 20; } };
  const lines = (t, w, s, st, c, x = M, lh = s * 0.45) => { font(s, st, c); wrap(t, w).forEach(l => { need(lh); doc.text(l, x, y); y += lh; }); };
  font(20, "bold"); doc.text(lat(m.title), M, y); y += 8;
  if (m.subtitle) { lines(m.subtitle, W - 2 * M, 10.5, "normal", "#475569"); y += 2; }
  (m.meta || []).forEach(([k, v]) => { font(9, "bold", "#64748B"); doc.text(lat(k), M, y); font(9.5, "normal"); doc.text(lat(v), M + 42, y); y += 5; });
  y += 3;
  const table = (head, rows, num = []) => {
    const n = (head || rows[0] || []).length; if (!n) return;
    // each column as wide as its longest text (measured); when they don't fit, only the widest give way — short columns never wrap mid-word
    font(8.2, "bold");
    const nat = Array.from({ length: n }, (_, i) => Math.min(80, Math.max(...[head ? head[i] : "", ...rows.map(r => r[i])].map(v => doc.getTextWidth(lat(v)))) + 3));
    const avail = W - 2 * M, sum = a => a.reduce((x, v) => x + v, 0);
    let cap = Math.max(...nat);
    while (sum(nat.map(x => Math.min(x, cap))) > avail && cap > 8) cap -= 0.5;
    const fit = nat.map(x => Math.min(x, cap)), cw = fit.map(x => x * avail / sum(fit));
    const row = (r, bold, fill) => {
      font(8.2, bold ? "bold" : "normal", bold ? "#334155" : "#0F1B2D");
      const cells = r.map((v, i) => doc.splitTextToSize(lat(v), cw[i] - 2)), h = Math.max(...cells.map(c => c.length)) * 3.6 + 2.4;
      need(h); if (fill) { doc.setFillColor(fill); doc.rect(M, y - 3.6, W - 2 * M, h, "F"); }
      let x = M; cells.forEach((c, i) => { c.forEach((l, k) => doc.text(l, num.includes(i) ? x + cw[i] - 1 : x + 1, y + k * 3.6, { align: num.includes(i) ? "right" : "left" })); x += cw[i]; });
      y += h; doc.setDrawColor("#E2E8F0"); doc.setLineWidth(0.2); doc.line(M, y - 3.4, W - M, y - 3.4);
    };
    if (head) row(head, true, "#EEF2F7");
    rows.forEach(r => row(r, false));
    y += 3;
  };
  for (const b of m.blocks) {
    if (b.pb) { doc.addPage(); y = 20; continue; }
    if (b.h) { need(14); y += 3; font(14, "bold"); doc.text(lat(b.h), M, y); y += 6; if (b.sub) lines(b.sub, W - 2 * M, 9, "normal", "#64748B"); y += 1; }
    else if (b.h2) { need(10); y += 1; font(11, "bold"); doc.text(lat(b.h2), M, y); y += 5.5; }
    else if (b.p) { lines(b.p, W - 2 * M, 9.8, "normal"); y += 2; }
    else if (b.note) { lines(b.note, W - 2 * M, 8.5, "italic", "#64748B"); y += 2; }
    else if (b.ul) { b.ul.filter(Boolean).forEach(x => { font(9.8); need(5); doc.text("-", M + 1, y); lines(x, W - 2 * M - 6, 9.8, "normal", "#0F1B2D", M + 5); y += 0.8; }); y += 2; }
    else if (b.kv) table(null, b.kv.map(r => [r[0], str(r[1]), str(r[2] || "")]));
    else if (b.table && b.table.rows.length) table(b.table.head, b.table.rows, b.table.num || []);
  }
  y += 4; lines(PRIVACY, W - 2 * M, 8, "normal", "#64748B"); y += 1; lines(DISCLAIMER, W - 2 * M, 8, "normal", "#9A5B00");
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); font(7.5, "normal", "#94A3B8"); doc.text(lat(`Hyperplane by QuantFriday · ${m.title}`), M, H - 9); doc.text(`Page ${p} of ${n}`, W - M, H - 9, { align: "right" }); }
  return doc.output("blob");
}

export async function downloadDoc(m, fmt) {
  if (fmt === "md") return save(new Blob([mdOf(m)], { type: "text/markdown;charset=utf-8" }), `${m.file}.md`);
  if (fmt === "docx") return save(await docxOf(m), `${m.file}.docx`);
  return save(await pdfOf(m), `${m.file}.pdf`);
}

// ── the reports' document models ──
const sg = v => v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`;
const rs = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const rs2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const rsShort = v => v == null ? "—" : v >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : rs(v);

// the AI Portfolio Analyser / ETF basket report (report.js's model — the same model as the designed PDF)
export function docFromReport(m) {
  const N1 = m.noun || "stock", N2 = m.nouns || "stocks", Cap = x => x[0].toUpperCase() + x.slice(1);
  const blocks = [
    { h: "Overview", sub: `Hyperplane AI summary of your ${m.total} ${m.total === 1 ? N1 : N2}.` },
    { h2: m.title }, { ul: m.lines.map(([, s]) => s) },
    { kv: [[`Current strength of the ${m.noun ? "basket" : "portfolio"}`, m.avg == null ? "No data" : `${sg(m.avg)}%`, m.avgWord]] },
    { h2: "Key numbers" }, { kv: m.keys.map(([k, v, note]) => [k, v, note]) },
    { h: `Your ${N2} by colour`, sub: `Red first, then amber, then green. Grey ${N2} are too new for a view.` },
    ...m.cats.flatMap(c => [{ h2: `${c.label} · ${c.count}` }, { note: c.desc },
      c.items.length ? { table: { head: [Cap(N1), "Ticker", "Strength"], rows: c.items.map(it => [it.n, it.s, it.v == null ? it.extra : `${sg(it.v)}%`]), num: [2] } } : { p: "None right now." }]),
    { h: `${Cap(N1)} by ${N1}`, sub: `Look-at-first ${N2} come first. Each ${N1} with its strength and the reasons in plain words.` },
    ...m.stocks.flatMap(st => [{ h2: `${st.n} (${st.s})` },
      { p: [`${st.sec} › ${st.ind}`, st.label, ...st.chips.map(c => c[0])].filter(Boolean).join(" · ") },
      st.isNew ? { p: "Recently listed: no view yet." } : { kv: [[`${Cap(N1)} strength`, `${sg(st.v)}%`, st.word], ...st.tfs.map(f => [`${f.label} strength`, f.v == null ? "No data" : sg(f.v), f.v == null ? (f.note || "") : f.word])] },
      { ul: st.why }, st.ref ? { note: st.ref } : null].filter(Boolean)),
    ...(m.swaps && m.swaps.length ? [{ h: "Suggested swaps", sub: `${m.swaps.length} ${m.swaps.length === 1 ? N1 : N2} whose long-term regime turned down, each with better ${N2} from the same sector.` },
      { table: { head: ["Regime turned down", "Strength", "Better choice", "Strength", "Why"], num: [1, 3],
        rows: m.swaps.map(it => { const a = (it.alts || (it.alt ? [it.alt] : []))[0]; return [`${it.s}${it.n ? ` · ${it.n}` : ""}`, sg(it.st), a ? `${a.s}${a.n ? ` · ${a.n}` : ""}` : "No better stock today", a ? sg(a.st) : "", a ? (a.why || "") : ""]; }) } }] : []),
    { h: "How to read this report" },
    { table: { head: ["Colour group", "What it means"], rows: m.cats.map(c => [c.label, c.long || c.desc]) } },
    ...m.guide.flatMap(([t, body]) => [{ h2: t }, { p: body }]),
  ];
  return { file: m.file.replace(/\.pdf$/i, ""), title: m.header || "AI Portfolio Report", subtitle: m.tagline || "A clear, long-term view of the stocks you hold, prepared by Hyperplane AI.",
    meta: [["Prepared for", m.customer || "You"], ["Data as of", m.asOf], ["Report date", m.generated], [`${Cap(N2)} analysed`, String(m.total)]], blocks };
}

// an AI ETF SIP / AI Momentum SIP / basket SIP result (the SIP page's own numbers; sim = the growth simulator's rows on screen)
export function docFromSip(r, { isStock, rate = 0, step = 0, rows = [] }) {
  const w = r.freq === "quarter" ? "quarter" : "month", hs = r.holdings || [], end = rows[rows.length - 1] || {};
  const REL = { S: "High", M: "Medium", W: "Low" }, ROLE = r.basket ? { core: "Broad market", theme: "Sector / theme", diversifier: "Diversifier", commodity: "Gold / silver" }
    : { core: "Core index", theme: "Theme", diversifier: "Diversifier", commodity: "Gold / silver" };
  const acc = key => { const m = {}, tot = hs.reduce((a, h) => a + h.amt, 0) || 1; hs.forEach(h => { const k = key(h); if (k) m[k] = (m[k] || 0) + h.amt; });
    return Object.entries(m).map(([k, v]) => [k, `${(v / tot * 100).toFixed(1)}%`]).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1])); };
  const product = isStock ? "AI Momentum SIP" : r.basket ? "ETF basket SIP" : "AI ETF SIP";
  const blocks = [
    { h: "Plan overview", sub: `${rs(r.amount)} a ${w} · ${hs.length} ${isStock ? "stocks" : "ETFs"} · ${r.years_plan}-year plan` },
    { kv: [[`Each ${w}`, rs(r.invested), r.over ? `+${rs(r.over)} over` : `of ${rs(r.amount)}`], [isStock ? "Stocks" : "ETFs", String(hs.length), ""],
      isStock ? ["Average strength", sg(r.st_avg), ""] : ["Split", `${r.sleeves.index}% equity · ${r.sleeves.commodity}% gold`, "by money"],
      [`Put in, ${r.years_plan} years`, rsShort(end.put), step ? `+${step}% step-up a year` : "same amount each time"],
      [rate ? `At ${rate}% a year` : "Without growth", rsShort(end.val), "an illustration, never a forecast"]] },
    isStock ? { note: "Higher risk. Single stocks move much more than ETFs and can fall sharply. Invest only money you can keep for years." } : null,
    r.over_note ? { note: r.over_note } : null,
    { h2: "Hyperplane AI summary" }, { ul: [...(r.summary || []).map(([, s]) => s), ...(r.notes || [])] },
    { h2: isStock ? "By market cap" : "Where the money goes" }, { table: { head: ["Part", "Share"], rows: isStock ? acc(h => `${h.cap} cap`) : acc(h => h.sleeve === "commodity" ? "Gold & silver" : h.role === "core" ? (r.basket ? "Broad market" : "Core index") : (r.basket ? "Sectors, themes & others" : "Strongest ETFs")), num: [1] } },
    { h2: isStock ? "By sector" : "By market" }, { table: { head: [isStock ? "Sector" : "Market", "Share"], rows: (isStock ? acc(h => h.sec) : acc(h => h.grp)).slice(0, 12), num: [1] } },
    { h: `${isStock ? "Stocks" : "ETFs"} to buy each ${w}`, sub: "The money each instalment stays the same; the units follow the price." },
    { table: { head: ["Ticker", "Name", isStock ? "Reliability" : "Role", "Strength", `Qty each ${w}`, "Price", `₹ per ${w}`, "Size"], num: [3, 5, 6, 7],
      rows: hs.map(h => [h.s, h.n !== h.s ? h.n : h.grp, h.kind === "stock" ? `${REL[h.rel] || "—"}${h.rs != null ? ` · ${h.rs}` : ""}` : ROLE[h.role] || "ETF", sg(h.st),
        h.every > 1 ? `1 every ${h.every} ${w}s` : `${h.units} ${h.kind === "etf" ? "unit" : "share"}${h.units === 1 ? "" : "s"}`, rs2(h.p), rs(h.amt), `${h.w}%`]) } },
    rows.length ? { h: "Growth simulator", sub: `${r.years_plan} years · ${step ? `+${step}% step-up a year` : "same amount each time"} · ${rate ? `${rate}% assumed growth a year` : "no growth assumed"} — an illustration, never a forecast` } : null,
    rows.length ? { table: { head: ["Year", `Each ${w}`, "Put in", rate ? `At ${rate}%` : "Value"], rows: rows.map(x => [String(x.y), rs(x.each), rsShort(x.put), rsShort(x.val)]), num: [1, 2, 3] } } : null,
    { h: "How to buy this SIP", sub: "Recommended: Zerodha Kite — zero brokerage on equity delivery." },
    { ul: ["Open Kite (app or kite.zerodha.com) and sign in.", "Search the ticker (NSE) and tap Buy.", "Choose SIP (Create SIP) instead of a one-time order.",
      `Set the amount (or quantity) shown above and the frequency: ${w === "month" ? "monthly" : "quarterly"}.`, "Confirm. Repeat for each holding, or add them to a basket.",
      `Each ${w}, Hyperplane AI re-checks the plan: open My portfolios → Momentum check.`] },
  ].filter(Boolean);
  return { file: `Hyperplane-${isStock ? "Momentum-SIP" : r.basket ? "ETF-Basket-SIP" : "SIP"}-${new Date().toISOString().slice(0, 10)}`, title: `${product} · Plan Report`,
    subtitle: `${rs(r.amount)} every ${w}, prepared by Hyperplane AI.`,
    meta: [["Data as of", r.as_of ? new Date(r.as_of).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—"],
      ["Report date", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })], ["How often", w === "month" ? "Monthly" : "Quarterly"],
      ["Risk", isStock ? "Higher risk · stocks only" : "Reliable · ETFs only"]], blocks };
}

// the AI Portfolio Builder's result (its own numbers; names = the page's segment names)
export function docFromBuilder(res, { asOf, names = {}, rel = {}, vStatus = {} }) {
  const picks = res.picks || [], L = p => p.liq || {};
  const blocks = [
    { h: "Overview" },
    { kv: [["Amount", rs(res.amount), ""], ["Invested in stocks", rs(res.invested), `${(100 - res.cash_pct).toFixed(1)}% of the amount`],
      ["Cash kept", rs(res.cash), `${res.cash_pct}%`], ["Stocks", String(res.stocks), res.stocks < res.count ? `of the ${res.count} you asked for` : "as you asked"],
      ["Average strength", sg(res.avg_st), "long-term, −100 to +100"]] },
    { h2: "Where the money goes" },
    { table: { head: ["Segment", "Share", "You chose", "Stocks", "Amount"], num: [1, 2, 3, 4],
      rows: (res.by_cap || []).map(r => [r.k === "Cash" ? "Cash (safety)" : names[r.k] || r.k, `${r.pct.toFixed(1)}%`, `${r.target}%`, r.k === "Cash" ? "—" : String(r.n), rs(r.amt)]) } },
    { h2: "Sectors" },
    { table: { head: ["Sector", "Share", "Stocks"], num: [1, 2], rows: (res.by_sec || []).map(r => [r.k, `${r.pct.toFixed(1)}%`, String(r.n)]) } },
    { h: "Holdings", sub: "Whole shares at the last price. Strength = the long-term trend from −100 to +100." },
    { table: { head: ["Stock", "Ticker", "Cap", "Sector", "Price", "Qty", "Amount", "Weight", "Strength", "Reliability"], num: [4, 5, 6, 7, 8],
      rows: picks.map(p => [p.n, p.s, `${p.cap}`, p.sec, rs2(p.p), String(p.qty), rs(p.amt), `${p.w}%`, sg(p.st), rel[p.h] ? rel[p.h][0] : ""]) } },
    res.volume ? { h: "Volume check", sub: "How easily each stock can be bought and sold at your size." } : null,
    res.volume ? { table: { head: ["Ticker", "Trading", "₹ traded a day", "Days to buy", "Days to sell in a hurry", "Check"], num: [2, 3, 4],
      rows: picks.map(p => [p.s, L(p).grade_word || "Not known", L(p).value != null ? rsShort(L(p).value) : "", str(L(p).days ?? ""), str(L(p).exit_days ?? ""), vStatus[L(p).status] || ""]) } } : null,
    res.plan ? { h: "Buying plan", sub: `${res.plan.total_days} day${res.plan.total_days === 1 ? "" : "s"} — big buys spread so the price is not pushed` } : null,
    res.plan ? { table: { head: ["Day", "Ticker", "Shares", "Amount"], num: [2, 3], rows: res.plan.days.flatMap(d => d.buys.map(b => [String(d.day), b.s, String(b.qty), rs(b.amt)])) } } : null,
  ].filter(Boolean);
  return { file: `Hyperplane-Portfolio-Builder-${new Date().toISOString().slice(0, 10)}`, title: "AI Portfolio Builder · Model Portfolio",
    subtitle: `${rs(res.amount)} · ${res.stocks} stocks, prepared by Hyperplane AI.`,
    meta: [["Data as of", asOf || "—"], ["Report date", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]], blocks };
}
