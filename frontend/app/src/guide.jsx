// Docs tab of the customer edition (file kept as guide.jsx): how to use Hyperplane and how to think with it, in plain words.
// It explains what every part MEANS — never how anything is calculated (the method stays private).
import React, { useEffect, useRef, useState } from "react";

const Bars = ({ v, d = "up" }) => {
  const lit = Math.max(1, Math.min(5, Math.ceil(v / 20)));
  return <span className={`meter ${d}`}><span className="bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= lit ? "on" : ""}/>)}</span>{v}%</span>;
};
const Tag = ({ k, children }) => <span className={`dirtag ${k}`}>{children}</span>;
const Tip = ({ kind = "tip", title, children }) => (
  <div className={`g-note ${kind}`}><div className="g-note-t">{kind === "rule" ? "★ " : kind === "warn" ? "⚠ " : "💡 "}{title}</div><div>{children}</div></div>
);

function Quadrants() {
  const q = [
    ["Strong + Downtrend", "Strong selling in this group. Not a place to buy.", "q-sb"],
    ["Strong + Uptrend", "The leaders. Most buying, strong trend. Start your search here.", "q-good"],
    ["Weak + Downtrend", "The laggards. Weak and falling. Avoid for buying.", "q-bad"],
    ["Weak + Uptrend", "Getting better, but still weak. Watch — it may become a leader later.", "q-wb"],
  ];
  return (
    <div className="g-quad">
      <div className="g-quad-y">↑ stronger</div>
      <div className="g-quad-grid">{q.map(([t, d, c]) => <div key={t} className={`g-q ${c}`}><b>{t}</b><span>{d}</span></div>)}</div>
      <div className="g-quad-x">← more downtrend · more uptrend →</div>
    </div>
  );
}

const SECTIONS = [
  { id: "welcome", t: "Welcome", body: <>
    <p><b>Hyperplane</b> shows you, in one screen, <b>which way Indian stocks are trending and how strong that trend is</b> — stock by
      stock, and also for every <b>sector</b> and <b>industry</b>. It helps you find good candidates quickly and avoid weak ones.</p>
    <p>The <b>Control Tower</b> is the main page — filters, summary tiles, sector and industry charts, and the full stock list.
      Click the <b>Hyperplane</b> logo (top left) to come back to it from anywhere. The menu under <b>your name</b> (top right) has:</p>
    <ul>
      <li><b>Account</b> — your details and how long your access lasts.</li>
      <li><b>Helpdesk</b> — ask us anything; our replies arrive there and on the 🔔 bell.</li>
      <li><b>Docs</b> — this page. Sections <b className="g-gold">9</b> and <b className="g-gold">10</b> are a must-read.</li>
      <li><b>Appearance</b> — switch between the dark and the light screen. Your choice is remembered on this device.</li>
      <li><b>Sign out</b>.</li>
    </ul>
    <p><b>Data as of</b> (top right) tells you when the data was taken. Trends change during the day, so always glance at it.</p>
    <Tip kind="warn" title="Hyperplane is a filter, not a buy / sell signal">It tells you where the strength is. It does not tell you
      what to buy, at what price, or when. Always check the chart yourself and decide your own entry, stop-loss and position size.</Tip>
  </> },

  { id: "quick", t: "Quick start in 5 steps", body: <>
    <ol className="g-steps">
      <li><b>Check the market mood.</b> Look at the tiles: are there many more <Tag k="up">▲ Uptrend</Tag> stocks than
        <Tag k="down">▼ Downtrend</Tag>? A strong market makes everything easier.</li>
      <li><b>Find the strong sectors.</b> In <i>Sector Strength Leaderboard</i>, look at the bubbles in the <b>top-right</b>
        (Strong + Uptrend). Click one or more to select them.</li>
      <li><b>Find the strong industries inside them.</b> The <i>Industry Bias Momentum</i> chart now shows only those sectors'
        industries. Again prefer the top-right ones and click them.</li>
      <li><b>Pick the stocks.</b> In <i>Master data</i>, keep <b>Trend = Up</b>, <b>Stock reliability = Strong</b>, and sort by
        <i>Strongest uptrend first</i>. Prefer stocks whose timeframe meters are green on the timeframes you care about.</li>
      <li><b>Confirm and copy.</b> Click a stock to open its card. Check that its sector and industry are strong too, then
        <b> Copy / TV</b> it into your TradingView watchlist and do your own chart check.</li>
    </ol>
  </> },

  { id: "words", t: "Key words explained", body: <>
    <h3>Trend — which way the stock is moving</h3>
    <div className="g-defs">
      <div><Tag k="up">▲ Uptrend</Tag><span>Price is moving up on that timeframe.</span></div>
      <div><Tag k="down">▼ Downtrend</Tag><span>Price is moving down on that timeframe.</span></div>
      <div><Tag k="side">◆ Sideways</Tag><span>No clear direction — price is going nowhere. There is no edge here.</span></div>
      <div><Tag k="bi">⇅ Bidirectional</Tag><span>Up on some timeframes and down on others. The picture is mixed — be careful.</span></div>
    </div>
    <h3>Trend strength — how strong and clean that trend is (0–100%)</h3>
    <p>Shown as a bar meter: more bars lit = stronger trend. Green = uptrend strength, red = downtrend strength, grey = sideways.</p>
    <p>Long bars run from <b>−100 to +100</b> with a <b>0 mark in the middle</b>: a bar to the <b>right</b> of 0 is an uptrend, to the <b>left</b> a downtrend; the longer the bar, the stronger the trend.</p>
    <div className="g-defs">
      <div><Bars v={88}/><span><b>81–100% · Strong</b> — a clear, powerful trend.</span></div>
      <div><Bars v={70}/><span><b>61–80% · Good</b> — a healthy trend.</span></div>
      <div><Bars v={45}/><span><b>31–60% · Average</b> — a trend, but not a convincing one yet.</span></div>
      <div><Bars v={27}/><span><b>24–30% · Weak</b> — only just a trend.</span></div>
      <div><Bars v={12} d="side"/><span><b>Below 24% · Sideways</b> — no clear trend.</span></div>
      <div><Bars v={85} d="down"/><span>Red = the same scale, but for a <b>down</b>trend (85% = a strong downtrend).</span></div>
    </div>
    <Tip kind="warn" title="Strength is NOT a price target">“84%” means the trend is very strong and clean right now. It does
      <b> not</b> mean the price will rise 84%, and it is not a probability. Price changes are shown separately, e.g. “+2.1% today”.</Tip>
    <h3>Timeframes — how far you are looking</h3>
    <table className="g-table"><tbody>
      <tr><td><b>Daily</b></td><td>Short term — the last days to a few weeks. For short-term traders.</td></tr>
      <tr><td><b>Weekly</b></td><td>The last few weeks to months. For swing traders.</td></tr>
      <tr><td><b>Monthly</b></td><td>Several months. For positional traders.</td></tr>
      <tr><td><b>Quarterly</b></td><td>About a year or more. For investors.</td></tr>
      <tr><td><b>Yearly</b></td><td>The long-term picture over years.</td></tr>
      <tr><td><b>Balanced · Swing · Investing</b></td><td>All five blended into one number for your trading style — Balanced: all equal ·
        Swing: Monthly &amp; Quarterly count most (D 10 · W 20 · M 30 · Q 30 · Y 10 %) · Investing: Quarterly &amp; Yearly count most (D 0 · W 5 · M 15 · Q 40 · Y 40 %).</td></tr>
    </tbody></table>
    <h3>Stock reliability</h3>
    <p>How healthy the stock's longer-term price history is. <b>Strong</b> = healthy, <b>Moderate</b> = the price is more than
      50% below its highest level, or lower than 5 years ago, <b>Weak</b> = more than 70% below its highest level (a huge fall,
      e.g. Vodafone Idea). Prefer <b>Strong</b>.</p>
    <p><b>🔥 Stretched</b> — the stock has run up <b>3× or more in about a year</b> (for example ₹100 → ₹1,000). A big winner,
      but prices this stretched often fall back sharply. It is shown with a 🔥 and is never called a “best case” —
      <b>don't chase it</b>; wait for it to cool down.</p>
    <h3>Sector and industry</h3>
    <p>A <b>sector</b> is a big group (for example Bank, IT, Healthcare). An <b>industry</b> is a smaller group inside it
      (for example Pharmaceuticals inside Healthcare). Stocks in the same group usually move together.</p>
    <h3>Other words</h3>
    <ul>
      <li><b>Market cap</b> — company size: Large, Mid, Small, Others.</li>
      <li><b>F&amp;O</b> — the stock also trades in Futures &amp; Options.</li>
      <li><b>Chart left ↔ right</b> — whether more of a group is in an uptrend (right) or a downtrend (left).</li>
    </ul>
  </> },

  { id: "filters", t: "The filter bar", body: <>
    <p>The filter bar at the top of the Control Tower narrows down what you see. Filters work together (all of them must match).</p>
    <table className="g-table"><tbody>
      <tr><td><b>Trading mode</b><span className="g-sub">Balanced · Swing · Investing</span></td>
        <td>Start here. Pick your <b>trading style</b> — it blends <b>all five timeframes</b> into one number, giving more weight to the
          ones that matter for how long you hold (see the table below). The whole page — list, tiles, charts and stock card — follows it.
          Picking a mode <b>clears the Timeframe</b> filter.</td></tr>
      <tr><td><b>Timeframe · one</b><span className="g-sub">D · W · M · Q · Y</span></td>
        <td>Pick a single timeframe to see <b>only that one</b> — for example <b>W</b> shows the weekly trend alone. The Trading mode
          switches off; clear the timeframes to go back to it.</td></tr>
      <tr><td><b>Timeframe · several</b><span className="g-sub">e.g. D + W</span></td>
        <td>Pick more than one. A stock counts as an uptrend <b>only if it is up on all of them</b> — a stricter check.</td></tr>
      <tr><td><b>Trend</b></td><td>All, ▲ Up, ▼ Down, ◆ Sideways or ⇅ Bidirectional on the chosen timeframe(s). Up / Down also sorts the list for you.</td></tr>
      <tr><td><b>Market cap</b></td><td>Large, Mid, Small, Others — pick one or more.</td></tr>
      <tr><td><b>Stock reliability</b></td><td>Strong, Moderate, Weak — pick one or more.</td></tr>
      <tr><td><b>Segment</b></td><td>F&amp;O only — just stocks that trade in futures &amp; options.</td></tr>
      <tr><td><b>Sector / Industry</b></td><td>Pick one or more from the list (or click bubbles in the charts). Removing a sector also removes its industries.</td></tr>
      <tr><td><b>✕ Reset</b></td><td>Clears every filter at once.</td></tr>
    </tbody></table>
    <h3>How much each timeframe counts in each style</h3>
    <table className="g-table g-weights"><thead><tr><th>Style</th><th>D</th><th>W</th><th>M</th><th>Q</th><th>Y</th><th>Best for</th></tr></thead><tbody>
      <tr><td><b>Balanced</b></td><td>20%</td><td>20%</td><td>20%</td><td>20%</td><td>20%</td><td>a general, all-round view</td></tr>
      <tr><td><b>Swing</b></td><td>10%</td><td>20%</td><td className="hi">30%</td><td className="hi">30%</td><td>10%</td><td>swing &amp; positional trades — weeks to months</td></tr>
      <tr><td><b>Investing</b></td><td>0%</td><td>5%</td><td>15%</td><td className="hi">40%</td><td className="hi">40%</td><td>holding for a year or more</td></tr>
    </tbody></table>
    <Tip title="Each filter has an ⓘ">Hover or tap the small ⓘ next to a name for a one-line reminder.</Tip>
  </> },

  { id: "tiles", t: "Summary tiles", body: <>
    <ul>
      <li><b>Stocks in view</b> — how many stocks match your filters.</li>
      <li><b>▲ Uptrend / ▼ Downtrend / ◆ Sideways / ⇅ Bidirectional</b> — how many of them are in each state (each stock is counted once). The thin bar shows the share.
        This is the <b>market mood</b>: many more uptrends than downtrends = a supportive market.</li>
      <li><b>Strongest / Weakest sector</b> — the sector at the top and at the bottom of the strength ranking.</li>
    </ul>
  </> },

  { id: "sectors", t: "Sector & industry charts", body: <>
    <p>Two charts sit side by side: <b>Sector Strength Leaderboard</b> (left) and <b>Industry Bias Momentum</b> (right).
      Each bubble is a group of stocks.</p>
    <ul>
      <li><b>Left ↔ right</b> = trend: further right = more of the group in an uptrend, further left = more in a downtrend.</li>
      <li><b>Down ↕ up</b> = strength (0–100): higher = stronger.</li>
      <li><b>Bubble size</b> = activity: bigger = more happening in that group.</li>
    </ul>
    <Quadrants/>
    <h3>Using the charts</h3>
    <ul>
      <li><b>Click a bubble</b> to select it (white ring); the other bubbles fade. Click more bubbles to select several. Click again to remove.</li>
      <li>Selecting sectors shows only <b>their</b> industries on the right chart, and filters the stock list below.</li>
      <li>Selecting industries filters the stock list to those industries.</li>
      <li><b>Bubble / List</b> switch: the list shows the ranking as bars, if you prefer numbers.</li>
      <li>The charts follow the <b>Timeframe</b> you picked — compare <i>D</i> with <i>M</i> to see short-term vs medium-term leaders.</li>
    </ul>
  </> },

  { id: "table", t: "Master data (the stock list)", body: <>
    <table className="g-table"><tbody>
      <tr><td><b>Stock</b></td><td>Symbol and name. <span className="fno">F&amp;O</span> = trades in F&amp;O. <b>⇅</b> = timeframes disagree.</td></tr>
      <tr><td><b>Sector · Industry</b></td><td>The groups the stock belongs to.</td></tr>
      <tr><td><b>Price</b></td><td>Last price and today's change in %. <b>This</b> is the price move.</td></tr>
      <tr><td><b>Trend</b></td><td>Uptrend, Downtrend, Sideways or Bidirectional for the timeframe(s) you picked.</td></tr>
      <tr><td><b>Trend strength</b></td><td>How strong that trend is, 0–100%, with a bar.</td></tr>
      <tr><td><b>Trend strength by timeframe</b></td><td>One meter per timeframe, Daily to Yearly — see at a glance where the stock is strong.</td></tr>
      <tr><td><b>Ticker copy</b></td><td><b>⎘</b> copies the symbol, <b>TV</b> copies it in TradingView format.</td></tr>
    </tbody></table>
    <ul>
      <li><b>Search</b> by symbol or name. The default sort, <b>Best uptrend first</b>, puts reliable, not-stretched uptrends at the
        top; you can also sort by pure strongest uptrend, strongest downtrend, biggest gain today or name.</li>
      <li><b>Ticker copy · N</b> (top right of the table) copies <b>every stock in your current list</b>: <i>Copy</i> gives
        <code>A,B,C</code>; <i>TV</i> gives <code>NSE:A,NSE:B,</code> — paste it into a TradingView watchlist.</li>
      <li>Click any row to open the <b>stock card</b>.</li>
    </ul>
  </> },

  { id: "card", t: "The stock card", body: <>
    <ul>
      <li><b>Header</b> — name, sector › industry, size, F&amp;O, <b>stock reliability</b>, price and today's change, and
        <b> Copy &lt;symbol&gt;</b> to copy just this stock.</li>
      <li><b>Overall trend</b> — the same meter as in the Simplified view: the stock (50%), its sector (25%) and its industry (25%)
        combined into one needle, with the number below the dial (e.g. “38% · Average uptrend”) and the three inputs underneath.
        On the downtrend side the number is red with a minus, e.g. “−24%”. Next to it: the <b>Direction</b> (one-directional up /
        down, or bidirectional), the verdict and a one-line summary of the stock.</li>
      <li><b>AI insights</b> — the stock, its <b>sector</b> and its <b>industry</b> read together, three short lines
        (<b>Good</b> · <b>Watch out</b> · <b>Focus</b>) and a verdict:
        <b> ✓ Best case</b> (all three strong), <b>⚠ Careful</b> (strong stock, weak group), <b>◐ Okay</b> (group only average),
        <b> 👁 Watch</b> (strong group, but the stock is weak or only average) or <b>✕ Avoid for buying</b>. Sector and industry use the same
        words on their strength: <b>Weak</b> 0–30% · <b>Average</b> 31–60% · <b>Good</b> 61–80% · <b>Strong</b> 81–100%. A group backs the stock
        when it is Good or Strong, and counts against it when it is Weak.</li>
      <li><b>Timeframe rows</b> — Daily to Yearly, each with a bar, “xx% strength” and Uptrend / Downtrend / Sideways.</li>
      <li><b>Sector &amp; industry strength</b> — how strong the stock's sector and industry are (0–100%) on every timeframe, and their
        rank: <b>#3/26</b> means 3rd strongest of 26 sectors. ▲ / ▼ = how many stocks in the group are rising / falling.</li>
      <li><b>Top 5 strongest in its industry</b> — the best stocks of the same industry. Click one to open it; the copy button copies those 5.</li>
    </ul>
    <Tip title="Read the card top-down">First: is the sector strong? Then: is the industry strong? Then: is the stock strong on
      the timeframes you trade? Three “yes” answers make a much better candidate than one.</Tip>
  </> },

  { id: "rules", t: "How to think — the golden rules", must: true, body: <>
    <p>Hyperplane is built around one idea: <b>trade with the tide, not against it</b>. These rules help you use it well.</p>
    <Tip kind="rule" title="1 · Go top-down: market → sector → industry → stock">A large part of a stock's move comes from its group. Choose the
      strong groups first, then the strong stocks inside them.</Tip>
    <Tip kind="rule" title="2 · Even a good stock in a weak sector or industry — avoid it">When its sector or industry is weak, money is
      usually leaving the whole group, and a good stock struggles against that current. Prefer strong stocks in strong industries in strong sectors.</Tip>
    <table className="g-table g-matrix"><thead><tr><th>Stock</th><th>Industry / sector</th><th>What to do</th></tr></thead><tbody>
      <tr><td><Tag k="up">Strong</Tag></td><td><Tag k="up">Strong</Tag></td><td><b>Best candidates</b> — focus here.</td></tr>
      <tr><td><Tag k="up">Strong</Tag></td><td><Tag k="down">Weak</Tag></td><td><b>Avoid or wait</b> — fighting its own group.</td></tr>
      <tr><td><Tag k="down">Weak</Tag></td><td><Tag k="up">Strong</Tag></td><td><b>Watch only</b> — a laggard; it may or may not catch up.</td></tr>
      <tr><td><Tag k="down">Weak</Tag></td><td><Tag k="down">Weak</Tag></td><td><b>Avoid</b> for buying.</td></tr>
    </tbody></table>
    <Tip kind="rule" title="3 · Let the timeframes agree">The best trends are up on your timeframe <b>and</b> on the bigger ones. Up on Daily
      but down on Monthly / Yearly is often just a bounce inside a downtrend. <b>Bidirectional</b> = the timeframes disagree — wait for them to line up.</Tip>
    <Tip kind="rule" title="4 · Use the timeframe that matches how long you hold">Short-term trades → Daily and Weekly. Swing → Weekly and
      Monthly. Investing → Monthly, Quarterly and Yearly.</Tip>
    <Tip kind="rule" title="5 · Prefer Strong reliability">Weak-reliability stocks can gap and swing wildly even in a good trend.</Tip>
    <Tip kind="rule" title="6 · Sideways means no edge">If the trend is sideways on your timeframe, skip it — there are better candidates.</Tip>
    <Tip kind="rule" title="7 · Respect the market mood">When downtrends far outnumber uptrends in the tiles, be pickier and trade smaller.</Tip>
    <Tip kind="rule" title="8 · Strength is not a target — don't chase">A very strong trend is a reason to look, not a reason to buy at any price.
      A stock marked <b>🔥 Stretched</b> (3× or more in a year) can fall sharply at any time. Plan your entry on the chart.</Tip>
    <Tip kind="rule" title="9 · Always manage risk">Decide your stop-loss and position size before you enter. Hyperplane shows where the strength
      is — your plan protects your capital.</Tip>
  </> },

  { id: "example", t: "Examples — finding ideas in 2 minutes", must: true, body: <>
    <h3>A swing trader (holds for weeks)</h3>
    <ol className="g-steps">
      <li>Trading mode: pick <b>Swing</b>. Trend: <b>▲ Up</b>. Stock reliability: <b>Strong</b>.</li>
      <li>In the sector chart, click the 2–3 bubbles highest and furthest right.</li>
      <li>In the industry chart, click the strongest industries of those sectors.</li>
      <li>The list now shows strong stocks, in strong industries, in strong sectors, weighted for swing trading (Monthly and Quarterly count most).</li>
      <li>Open the top few cards, check the sector &amp; industry ranks, then <b>Ticker copy · N → TV</b> and paste into TradingView.</li>
    </ol>
    <h3>An investor (holds for months or years)</h3>
    <ol className="g-steps">
      <li>Trading mode: <b>Investing</b>. Trend: <b>▲ Up</b>. Market cap: <b>Large</b> and <b>Mid</b>. Reliability: <b>Strong</b>.</li>
      <li>Use the <b>Investing</b> mode in the Trading mode filter — it gives Quarterly and Yearly the most weight.</li>
      <li>Shortlist stocks that are not <b>⇅ Bidirectional</b>, then study the businesses.</li>
    </ol>
    <h3>Spotting what to avoid</h3>
    <ul>
      <li>Trend: <b>▼ Down</b> shows the weakest stocks — check before buying anything on that list.</li>
      <li>Bubbles in the bottom-left (Weak + Downtrend) are groups to stay away from for buying.</li>
    </ul>
  </> },

  { id: "simple", t: "Simplified view (AI Mode) & the overall trend meter", body: <>
    <p>Switch to <b>Simplified view (AI Mode)</b> at the top of the page. Type a company name or ticker, pick it from the list, and the page shows:</p>
    <ul>
      <li><b>Trading mode</b> — Balanced, Swing or Investing. It is the same setting as the Research view; changing it in one changes both.</li>
      <li><b>Hyperplane AI summary</b> — one verdict and a short paragraph in plain words, then four tiles:
        <b> Stock trend strength</b>, <b>Sector strength</b>, <b>Industry strength</b> (all in %, on a bar from −100 to +100: right of 0 = uptrend / bullish, left of 0 = downtrend / bearish — for the sector and industry the side is the same as in the bubble chart) and <b>Historical reliability</b>{" "}
        (High = Strong, Medium = Moderate, Low = Weak reliability).</li>
      <li><b>Overall trend meter</b> — the stock, its sector and its industry combined into one needle (how it is worked out is below).</li>
    </ul>
    <Tip kind="warn" title="Percentages are trend strength, not price moves">“−49%” means a fairly strong <b>down</b>trend — it does not mean the
      price fell 49%. Anything on the downtrend side is shown in red with a minus sign.</Tip>

    <h3>How the overall trend meter is calculated</h3>
    <p><b>Step 1 — put the three parts on one scale</b>, from −100 (strong downtrend) to +100 (strong uptrend):</p>
    <table className="g-table"><tbody>
      <tr><td><b>Stock</b></td><td>The stock's trend strength as it is — already on this scale (e.g. −49 for a downtrend, +62 for an uptrend).</td></tr>
      <tr><td><b>Sector</b></td><td>Sector strength is 0–100%, where <b>50% is neutral</b>. It becomes <b>(sector − 50) × 2</b>:
        50% → 0 · 75% → +50 · 100% → +100 · 25% → −50 · 0% → −100.</td></tr>
      <tr><td><b>Industry</b></td><td>Same as the sector: <b>(industry − 50) × 2</b>.</td></tr>
    </tbody></table>
    <p><b>Step 2 — combine them with fixed weights:</b> <b>Stock 50%</b> · <b>Sector 25%</b> · <b>Industry 25%</b>.
      In other words: overall = 0.5 × stock + 0.25 × sector + 0.25 × industry. The stock counts most because it is what you
      trade; its groups adjust the picture. If the sector or industry has no data, its share goes to the parts that do.</p>
    <p><b>Step 3 — read the needle</b> with the same cut-offs used everywhere in Hyperplane:</p>
    <table className="g-table"><tbody>
      <tr><td><b>+81 to +100</b></td><td>Strong uptrend</td></tr>
      <tr><td><b>+61 to +80</b></td><td>Good uptrend</td></tr>
      <tr><td><b>+31 to +60</b></td><td>Average uptrend</td></tr>
      <tr><td><b>+24 to +30</b></td><td>Weak uptrend</td></tr>
      <tr><td><b>−23 to +23</b></td><td>Sideways — no clear direction (the number still shows which way it leans)</td></tr>
      <tr><td><b>−24 to −30</b></td><td>Weak downtrend</td></tr>
      <tr><td><b>−31 to −60</b></td><td>Average downtrend</td></tr>
      <tr><td><b>−61 to −80</b></td><td>Good downtrend</td></tr>
      <tr><td><b>−81 to −100</b></td><td>Strong downtrend</td></tr>
    </tbody></table>
    <h3>Worked example — Indian Oil (IOC), Balanced mode</h3>
    <table className="g-table"><tbody>
      <tr><td><b>Stock</b></td><td>−49% → <b>−49</b></td></tr>
      <tr><td><b>Sector</b> (Energy)</td><td>52% → (52 − 50) × 2 = <b>+4</b></td></tr>
      <tr><td><b>Industry</b> (Refineries)</td><td>49% → (49 − 50) × 2 = <b>−2</b></td></tr>
      <tr><td><b>Overall</b></td><td>0.5 × (−49) + 0.25 × (+4) + 0.25 × (−2) = −24.5 + 1 − 0.5 = <b>−24% · Weak downtrend</b> (just past the sideways line)</td></tr>
    </tbody></table>
    <p>The stock's average downtrend carries half the weight; its average sector and industry soften it, so the overall picture is a
      weak downtrend. The three inputs are always listed under the meter, so you can check the sum yourself (they are shown rounded, so your own sum may differ by 1).</p>
    <Tip title="Trading mode changes the inputs">The stock, sector and industry numbers follow your trading mode, so the needle moves when
      you switch between Balanced, Swing and Investing.</Tip>
  </> },

  { id: "portfolio", t: "AI Portfolio · Hyperplane AI by QuantFriday", body: <>
    <p>Open <b>AI Portfolio Analyser</b> at the top. Add the stocks you own one by one. No quantities are needed, and you can add as many as
      you like. When your list is ready, press <b>Analyse my portfolio</b>. You can add more stocks or edit the list at any time.</p>
    <p><b>Private to you:</b> your stock list is visible only to you, the account holder. It is never visible to other users or to
      the admin, as per SEBI norms. We take the privacy of your investments seriously.</p>
    <h3>What you see</h3>
    <ul>
      <li><b>Hyperplane AI summary</b>: a few short lines about your whole portfolio.</li>
      <li><b>Current strength of the portfolio</b>: one meter for all your stocks together. Right of 0 is moving up, left of 0 is moving down.</li>
      <li>Four coloured boxes with your stocks: <b style={{ color: "var(--short)" }}>Look at first</b>,
        <b style={{ color: "var(--mixed)" }}> Keep an eye on</b>, <b style={{ color: "var(--long)" }}>Doing well</b> and
        <b> Recently listed</b> (less than 3 years of yearly data, so no view yet).</li>
      <li>Next to the coloured boxes, a <b>Trend map</b> with one dot per stock (quarterly trend left to right, yearly trend bottom
        to top). Click a dot to open that stock's card.</li>
      <li><b>Holdings</b>: one card per stock with its status, strength, monthly, quarterly and yearly strength (0% is shown as
        Sideways), its reliability and the reasons in plain words, always open. Show one colour at a time, or sort
        weakest first or best first. To remove a stock, use <b>Edit list</b>.</li>
      <li><b>Download report</b>: a PDF with a cover page, the summary, the gauge, the colour groups, the Trend map and every stock
        with its reasons. It is made on your own device; your list is not sent anywhere to make it.</li>
    </ul>
    <h3>How the strength and colours are decided</h3>
    <p>Hyperplane AI uses <b>only the stock's own data</b>. For the month, the quarter and the year it looks at two things:</p>
    <ul>
      <li><b>The trend</b>: is it going up, flat or going down, and for how long? For example, "going down for the last 3
        quarters" or "turned up this month".</li>
      <li><b>How strong today's price is</b> for this month, quarter and year: very strong, holding up well, weak or very weak.</li>
    </ul>
    <p>These give a strength for each period and one <b>stock strength</b> from −100% to +100%. The quarter counts most, then the
      year, then the month. Daily and weekly moves are left out. The sector and industry are shown on each card for reference only
      (see its ⓘ); they are never used in the strength and never change a colour.</p>
    <table className="g-table"><tbody>
      <tr><td><b>Doing well</b></td><td>Stock strength +24% or more, and the quarterly view is not negative.</td></tr>
      <tr><td><b>Keep an eye on</b></td><td>Stock strength between −24% and +24% (moving sideways), or strong but with a negative
        quarter. Also any stock that went up more than 3 times in a year.</td></tr>
      <tr><td><b>Look at first</b></td><td>Stock strength −24% or lower. Also any stock with low reliability (it once fell more than
        70% from its highest price), whatever its strength.</td></tr>
      <tr><td><b>Recently listed</b></td><td>Less than 3 years of yearly data. No view is given.</td></tr>
    </tbody></table>
    <Tip kind="warn" title="Information, not advice">Hyperplane AI is built on Hyperplane's own quant algorithms (fixed rules on our
      data), with no outside AI service. It describes the trend; it does not tell you to buy or sell. Decide with your own research or a
      SEBI-registered adviser.</Tip>
  </> },

  { id: "helpdesk", t: "Helpdesk & notifications", body: <>
    <ol className="g-steps">
      <li>Open the menu under <b>your name</b> (top right) → <b>Helpdesk</b>, and press <b>New query</b>.</li>
      <li>Write a short <b>Subject</b> and choose a <b>Severity</b>: <b>High</b> = something is broken or blocking you,
        <b> Medium</b> = something is not working as expected, <b>Low</b> = a question or a suggestion.</li>
      <li>Describe the issue. You can <b>paste or drop screenshots</b> right into the text (images only — other files are not allowed).</li>
      <li>Press <b>Send</b>. Our replies appear in the conversation, with a red number on the <b>🔔 bell</b> and a red dot on your name. Click the bell to jump straight to the reply.</li>
      <li>When your question is solved, press <b>Close query</b>. Need more help later? Just raise a new one.</li>
    </ol>
  </> },

  { id: "faq", t: "Questions people ask", body: <>
    <dl className="g-faq">
      <dt>How often is the data updated?</dt><dd>Several times on trading days. The time is always shown as <b>Data as of</b> at the top.</dd>
      <dt>Why can't I find a stock?</dt><dd>Check your filters (press <b>Reset</b>). Indices and ETFs are not listed — only stocks.</dd>
      <dt>Why is a stock strong on Daily but weak on Yearly?</dt><dd>Different timeframes look at different periods. A short-term rise can happen inside a long-term fall — see golden rule 3.</dd>
      <dt>What does “—” mean?</dt><dd>Not enough data for that timeframe yet (for example a recently listed stock).</dd>
      <dt>What is the Simplified view?</dt><dd>Switch at the top between <b>Research view</b> (this full page) and <b>Simplified view (AI Mode)</b>. In the Simplified view you type a company name, pick it from the list, and read it in plain words: an <b>overall trend meter</b> (down ← sideways → up; see <b>Simplified view &amp; the overall trend meter</b> above for how it is worked out), and a <b>Hyperplane AI summary</b>: one overall verdict plus four tiles — the stock, its sector and its industry (each as a percentage), and the stock's historical reliability (High / Medium / Low). Hyperplane AI is built on our own quant algorithms (fixed rules on the same data) — no outside AI service.</dd>
      <dt>Can I look at an earlier day?</dt><dd>When it is available, click <b>Data as of</b> at the top, pick a date, then <b>Day open</b> or <b>Day end</b>. The button turns yellow and says <b>Viewing</b> while you look at a past day — open it again and press <b>↺ Latest data</b> to return.</dd>
      <dt>Do the bubble charts follow my filters?</dt><dd>They follow the <b>Timeframe</b> and they filter the list when you click them. They always show the whole market, so you can compare every group.</dd>
      <dt>Is this a recommendation?</dt><dd>No. It is trend information for education — see below.</dd>
    </dl>
  </> },
];

export default function Guide({ disclaimer }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const refs = useRef({});
  useEffect(() => {
    const io = new IntersectionObserver(es => {
      const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id.replace("g-", ""));
    }, { rootMargin: "-80px 0px -65% 0px" });
    Object.values(refs.current).forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const go = id => { const el = refs.current[id]; if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className="guide">
      <aside className="g-toc">
        <div className="g-toc-t">Docs</div>
        {SECTIONS.map((s, i) => <button key={s.id} type="button" className={`${active === s.id ? "on" : ""} ${s.must ? "must" : ""}`} onClick={() => go(s.id)} title={s.must ? "Must read" : undefined}><span>{i + 1}</span>{s.t}</button>)}
      </aside>
      <article className="g-body">
        <header className="g-hero">
          <div className="g-hero-k">Hyperplane docs</div>
          <h1>Find strong stocks in strong sectors — in minutes</h1>
          <p>Everything on the screen explained in simple words, plus the rules that make it work.</p>
        </header>
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={`g-${s.id}`} ref={el => { refs.current[s.id] = el; }} className={`g-sec ${s.must ? "must" : ""}`}>
            <h2><span>{i + 1}</span>{s.t}{s.must && <em className="g-must">★ Must read</em>}</h2>
            {s.body}
          </section>
        ))}
        <section className="g-sec g-disc"><h2>Disclaimer</h2><p>{disclaimer}</p></section>
      </article>
    </div>
  );
}

export const GUIDE_CSS = `
.guide{display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px;margin-top:16px;align-items:start}
.g-toc{position:sticky;top:12px;display:flex;flex-direction:column;gap:2px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px}
.g-toc-t{font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:var(--t3);padding:2px 8px 8px}
.g-toc button{display:flex;align-items:center;gap:9px;text-align:left;padding:7px 8px;border:0;border-radius:7px;background:none;color:var(--t2);font-size:12.5px;font-weight:600}
.g-toc button span{width:20px;height:20px;border-radius:6px;background:var(--s2);border:1px solid var(--b2);font:700 10.5px/18px var(--mono);text-align:center;flex-shrink:0}
.g-toc button:hover{color:var(--t1);background:var(--s2)}.g-toc button.on{color:var(--acc);background:var(--adim)}.g-toc button.on span{border-color:var(--acc);color:var(--acc)}
.g-toc button.must span,.g-sec.must h2 span{border:1.5px solid #f5b301;color:#f5b301;background:rgba(245,179,1,.12);box-shadow:0 0 0 2px rgba(245,179,1,.12)}
.g-toc button.must{color:var(--t1)}.g-sec.must{border-color:rgba(245,179,1,.45);box-shadow:inset 3px 0 0 #f5b301}
.g-must{margin-left:auto;font:700 10.5px var(--sans);font-style:normal;letter-spacing:.6px;text-transform:uppercase;color:#f5b301;border:1px solid rgba(245,179,1,.5);background:rgba(245,179,1,.1);padding:2px 9px;border-radius:999px}
.g-gold{display:inline-block;min-width:20px;text-align:center;border:1.5px solid #f5b301;color:#f5b301;border-radius:6px;font:700 11px/17px var(--mono)}
.g-body{min-width:0;display:flex;flex-direction:column;gap:14px}
.g-hero{padding:22px 24px;border-radius:12px;border:1px solid var(--b1);background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(99,102,241,.06) 60%,transparent)}
.g-hero-k{font:700 10.5px var(--mono);letter-spacing:1.5px;text-transform:uppercase;color:var(--acc)}
.g-hero h1{margin:6px 0 4px;font-size:22px;line-height:1.25;color:var(--t1)}.g-hero p{margin:0;color:var(--t2);font-size:13.5px}
.g-sec{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:18px 22px;scroll-margin-top:12px;font-size:13.5px;line-height:1.7;color:var(--t1)}
.g-sec h2{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:17px}
.g-sec h2 span{width:26px;height:26px;border-radius:8px;background:var(--adim);border:1px solid var(--accb);color:var(--acc);font:700 12px/24px var(--mono);text-align:center}
.g-sec h3{margin:16px 0 6px;font-size:13.5px;color:var(--acc)}
.g-sec p{margin:0 0 8px}.g-sec ul,.g-sec ol{margin:0 0 8px;padding-left:20px}.g-sec li{margin-bottom:5px}
.g-sec code{font:12px var(--mono);background:var(--s2);border:1px solid var(--b2);border-radius:4px;padding:0 5px}
.g-sec .dirtag{margin:0 3px;vertical-align:middle}
.g-steps{counter-reset:s;list-style:none;padding-left:0!important}.g-steps li{counter-increment:s;position:relative;padding-left:36px;margin-bottom:9px}
.g-steps li:before{content:counter(s);position:absolute;left:0;top:1px;width:24px;height:24px;border-radius:50%;background:var(--acc);color:var(--on-acc);font:700 12px/24px var(--mono);text-align:center}
.g-defs{display:flex;flex-direction:column;gap:8px;margin:6px 0 10px}.g-defs>div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;align-items:center}
.g-table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:13px}.g-table td,.g-table th{padding:8px 10px;border-bottom:1px solid var(--b1);vertical-align:top;text-align:left}
.g-table td:first-child{width:190px;white-space:nowrap}.g-table th{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3)}
.g-matrix td:first-child,.g-matrix td:nth-child(2){width:130px}
.g-sub{display:block;font-size:11px;font-weight:500;color:var(--t3);margin-top:2px}
.g-weights td,.g-weights th{text-align:center}.g-weights td:first-child,.g-weights th:first-child,.g-weights td:last-child,.g-weights th:last-child{text-align:left}
.g-weights td:first-child{width:110px}.g-weights td.hi{color:var(--acc);font-weight:700;background:var(--adim)}
.g-note{border:1px solid var(--b2);border-left:3px solid var(--acc);border-radius:9px;padding:10px 14px;margin:10px 0;background:var(--s2)}
.g-note-t{font-weight:700;margin-bottom:2px;color:var(--t1)}.g-note.warn{border-left-color:var(--mixed)}.g-note.rule{border-left-color:var(--long)}
.g-quad{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;gap:6px 8px;margin:12px 0}
.g-quad-y{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;color:var(--t3);text-align:center}
.g-quad-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.g-quad-x{grid-column:2;text-align:center;font-size:11px;color:var(--t3)}
.g-q{border-radius:9px;padding:10px 12px;border:1px solid var(--b2);display:flex;flex-direction:column;gap:3px;font-size:12.5px;line-height:1.5}
.g-q b{font-size:12px;text-transform:uppercase;letter-spacing:.6px}.g-q span{color:var(--t2)}
.q-good{background:var(--longd);border-color:rgba(0,200,150,.4)}.q-good b{color:var(--long)}
.q-sb{background:var(--mixedd);border-color:rgba(255,170,0,.35)}.q-sb b{color:var(--mixed)}
.q-bad{background:var(--shortd);border-color:rgba(255,68,84,.35)}.q-bad b{color:var(--short)}
.q-wb{background:rgba(162,89,255,.08);border-color:rgba(162,89,255,.35)}.q-wb b{color:#a259ff}
.g-faq dt{font-weight:700;margin-top:10px}.g-faq dd{margin:2px 0 0;color:var(--t2)}
.g-disc p{color:var(--t2);font-size:12.5px}
@media (max-width:900px){.guide{grid-template-columns:1fr}.g-toc{position:static;flex-direction:row;flex-wrap:wrap}.g-toc-t{width:100%}
  .g-defs>div{grid-template-columns:1fr;gap:4px}.g-table td:first-child{white-space:normal;width:auto}.g-sec{padding:16px}}
`;
