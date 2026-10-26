// A table of contents for long articles:
// - every h2 and h3 gets an id to link to (one it already has is kept)
// - with at least `minHeadings` of them, a <nav class="toc"> listing them goes at the top of the body
// An article turns it off with `toc: false` in its frontmatter. `insert: false` only adds the ids,
// for a site that lists the headings itself — Astro's render() hands them over as `headings`.
const isHeading = (n) => n.type === 'element' && (n.tagName === 'h2' || n.tagName === 'h3');
const el = (tagName, properties, children) => ({ type: 'element', tagName, properties, children });

const textOf = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join(''));

// The same ids GitHub (and Astro, through github-slugger) give a heading: lower case, punctuation
// dropped, spaces as hyphens. Letters of any script stay, so 第一章 links as #第一章
const slugify = (text) => text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');

function collect(node, out) {
  for (const child of node.children ?? []) {
    if (isHeading(child)) out.push(child);
    else collect(child, out);
  }
  return out;
}

export default function rehypeToc({ minHeadings = 3, insert = true, title = '' } = {}) {
  return (tree, file) => {
    const headings = collect(tree, []);
    const used = new Set(headings.map((h) => h.properties?.id).filter(Boolean));
    for (const h of headings) {
      h.properties ??= {};
      if (h.properties.id) continue;
      const base = slugify(textOf(h)) || 'section';
      let id = base;
      for (let i = 1; used.has(id); i++) id = `${base}-${i}`;
      used.add(id);
      h.properties.id = id;
    }

    if (!insert || headings.length < minHeadings || file?.data?.astro?.frontmatter?.toc === false) return;
    // h3s nest under the h2 before them; one before any h2 sits at the top level
    const top = [];
    let last = null;
    for (const h of headings) {
      const item = el('li', {}, [el('a', { href: `#${h.properties.id}` }, [{ type: 'text', value: textOf(h).trim() }])]);
      if (h.tagName === 'h3' && last) {
        if (last.children.length < 2) last.children.push(el('ol', {}, []));
        last.children[1].children.push(item);
      } else {
        top.push(item);
        if (h.tagName === 'h2') last = item;
      }
    }
    const nav = el('nav', { className: ['toc'], ariaLabel: title || 'Contents' }, [
      ...(title ? [el('p', { className: ['toc-title'] }, [{ type: 'text', value: title }])] : []),
      el('ol', {}, top),
    ]);
    tree.children.unshift(nav);
  };
}
