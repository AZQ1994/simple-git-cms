// Image layout in article bodies, matching what the editor shows:
// - a paragraph holding one image with a caption (Markdown's title) -> <figure> + <figcaption>
// - a paragraph holding several images -> a side-by-side .gallery
const isImg = (n) => n.type === 'element' && n.tagName === 'img';
const isBlank = (n) => n.type === 'text' && !n.value.trim();

function figure(img) {
  const title = img.properties?.title;
  if (title) delete img.properties.title;
  return {
    type: 'element',
    tagName: 'figure',
    properties: {},
    children: title ? [img, { type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: String(title) }] }] : [img],
  };
}

function walk(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    const imgs = child.type === 'element' && child.tagName === 'p' ? child.children.filter(isImg) : [];
    // Only paragraphs that are nothing but images (and whitespace); a paragraph holding only
    // whitespace, such as &nbsp;, is left alone
    if (imgs.length && child.children.every((c) => isImg(c) || isBlank(c))) {
      if (imgs.length > 1) {
        return { type: 'element', tagName: 'div', properties: { className: ['gallery', `cols-${Math.min(imgs.length, 3)}`] }, children: imgs.map(figure) };
      }
      if (imgs[0].properties?.title) return figure(imgs[0]);
    }
    walk(child);
    return child;
  });
}

export default function rehypeFigures() {
  return (tree) => walk(tree);
}
