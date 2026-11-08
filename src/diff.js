// What changed between two versions of a text, line by line: for a translation whose source has
// changed since, the lines to look at. Plain functions over strings, so test/diff.test.mjs can
// check the cases.

/** Beyond this many lines on either side the table would be too big to be worth it; the whole
 * of both is shown as removed and added instead. An article is a few hundred lines at most. */
const MAX_LINES = 3000;

/**
 * The lines of `before` and `after`, each marked: ' ' the same in both, '-' only before, '+' only
 * after. A longest common subsequence, so a line moved counts as removed and added.
 * @param {string} before
 * @param {string} after
 * @returns {{ op: ' ' | '-' | '+', text: string }[]}
 */
export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [...a.map((text) => ({ op: '-', text })), ...b.map((text) => ({ op: '+', text }))];
  }
  // lcs[i][j]: how many lines a[i..] and b[j..] have in common, in a flat array
  const w = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push({ op: '-', text: a[i++] });
    else out.push({ op: '+', text: b[j++] });
  }
  while (i < a.length) out.push({ op: '-', text: a[i++] });
  while (j < b.length) out.push({ op: '+', text: b[j++] });
  return out;
}

/**
 * Only the changes, each with `context` unchanged lines around it — lines with something on them;
 * Markdown puts a blank line between paragraphs, which says nothing about where a change is. A run
 * of unchanged lines that is left out becomes one `{ op: '…' }`.
 * @param {{ op: string, text: string }[]} diff From lineDiff.
 * @param {number} [context]
 */
export function changesOnly(diff, context = 1) {
  const keep = diff.map((d) => d.op !== ' ');
  const around = (i, step) => {
    for (let k = i + step, left = context; left > 0 && k >= 0 && k < diff.length && diff[k].op === ' '; k += step) {
      keep[k] = true;
      if (diff[k].text.trim()) left--;
    }
  };
  diff.forEach((d, i) => {
    if (d.op === ' ') return;
    around(i, -1);
    around(i, 1);
  });
  const out = [];
  diff.forEach((d, i) => {
    if (keep[i]) out.push(d);
    else if (out.at(-1)?.op !== '…') out.push({ op: '…', text: '' });
  });
  return out;
}
