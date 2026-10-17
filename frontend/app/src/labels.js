// Ticker labels around chart dots without overlaps — used by the Trend map on screen and in the PDF report.
// dots: [{ key, x, y, label }] in priority order (first placed first). u = size of one screen pixel in the caller's units,
// charW = width of one label character in the same units. A label goes right, left, above or below its dot, whichever
// stays inside `box` ([x0, y0, x1, y1]) and overlaps no dot and no other label; otherwise it is left out (hover / none).
// Returns { key: [anchor, textX, textY] }.
export function placeLabels(dots, { box, u = 1, charW = 6.5, dotR = 8 }) {
  const taken = dots.map(d => [d.x - dotR * u, d.y - dotR * u, d.x + dotR * u, d.y + dotR * u]);
  const inside = b => b[0] >= box[0] + 2 * u && b[2] <= box[2] - 2 * u && b[1] >= box[1] && b[3] <= box[3];
  const free = b => !taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const out = {};
  for (const { key, x, y, label } of dots) {
    const w = label.length * charW + 2 * u, g = 10 * u;
    const pick = [
      ["start", x + g, y + 3.5 * u, [x + g, y - 6 * u, x + g + w, y + 6 * u]],
      ["end", x - g, y + 3.5 * u, [x - g - w, y - 6 * u, x - g, y + 6 * u]],
      ["middle", x, y - 11 * u, [x - w / 2, y - 21 * u, x + w / 2, y - 9 * u]],
      ["middle", x, y + 20 * u, [x - w / 2, y + 9 * u, x + w / 2, y + 21 * u]],
    ].find(o => inside(o[3]) && free(o[3]));
    if (pick) { taken.push(pick[3]); out[key] = pick.slice(0, 3); }
  }
  return out;
}
