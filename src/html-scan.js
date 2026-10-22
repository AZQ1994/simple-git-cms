// Does an article's HTML close everything it opens?
//
// The body is Markdown plus HTML, and whatever the editor has no node for is kept exactly as the
// file wrote it. That is the right thing to do with markup — and it is also how one line changes a
// whole page: `<div style="color: red">aaaaaa` with no closing tag wraps everything after it on
// the site, not just the rest of the article. Markdown cannot see that, because it ends a block of
// HTML at the first blank line and never looks past it. So this looks at the body as a whole:
// one pass, one stack, and what is left over is what is wrong.
//
// Nothing here edits anything. It says what is unbalanced; the editor decides what to do about it.

/** Elements that never have a closing tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Elements whose contents are not markup — a `<` in them is a less-than sign. */
const OPAQUE = new Set(['script', 'style', 'pre', 'textarea']);

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
/** Code is the file quoting something, not markup. Blanked out, keeping every offset. */
// `$` is no use here: these are matched with `m`, where it means the end of a line
const END = '(?![\\s\\S])';
const CODE = new RegExp(`\`\`\`[\\s\\S]*?(?:\`\`\`|${END})|~~~[\\s\\S]*?(?:~~~|${END})|\`+[^\`\\n]*\`+`, 'gm');
const withoutCode = (text) => text.replace(CODE, (m) => m.replace(/[^\n]/g, ' '));

/**
 * Walk one run of text, keeping a stack of the elements it leaves open.
 * @param {string} text The run, with code already taken out.
 * @param {{tag: string, at: number, len: number, mark: unknown}[]} stack From one run to the next.
 * @param {unknown} mark Whatever the caller wants back for tags opened in this run.
 * @returns {{tag: string, at: number, len: number, mark: unknown}[]} Closers that closed nothing.
 */
export function trackHtml(text, stack = [], mark = null) {
  const strays = [];
  const tags = new RegExp(TAG.source, 'g');
  for (let m = tags.exec(text); m; m = tags.exec(text)) {
    const [, closing, name, , selfClosing] = m;
    if (!name) continue; // a comment
    const tag = name.toLowerCase();
    if (VOID.has(tag) || selfClosing) continue;
    if (!closing) {
      if (OPAQUE.has(tag)) {
        // Skip to the end of it, since what is inside is not markup
        const end = new RegExp(`</${tag}\\s*>`, 'i').exec(text.slice(tags.lastIndex));
        if (end) {
          tags.lastIndex += end.index + end[0].length;
          continue;
        }
      }
      stack.push({ tag, at: m.index, len: m[0].length, mark });
      continue;
    }
    const open = stack.findLastIndex((o) => o.tag === tag);
    if (open < 0) strays.push({ tag, at: m.index, len: m[0].length, mark });
    // A browser closes whatever was left open inside this element, so this does too
    else stack.length = open;
  }
  return strays;
}

/**
 * What is unbalanced in an article's body, in the order it appears.
 * @returns {{kind: 'unclosed'|'stray', tag: string, line: number}[]}
 */
export function htmlProblems(markdown) {
  const text = withoutCode(markdown ?? '');
  const stack = [];
  const strays = trackHtml(text, stack);
  const line = (at) => text.slice(0, at).split('\n').length;
  return [...stack.map((o) => ({ ...o, kind: 'unclosed' })), ...strays.map((o) => ({ ...o, kind: 'stray' }))]
    .sort((a, b) => a.at - b.at)
    .map(({ kind, tag, at }) => ({ kind, tag, line: line(at) }));
}
