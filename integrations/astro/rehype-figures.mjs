// 文章正文里的图片排版（与编辑器一致）：
// - 一段里只有一张图且带说明（Markdown 的 title）→ <figure> + <figcaption>
// - 一段里有多张图 → 并排的 .gallery
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
    if (child.type === 'element' && child.tagName === 'p' && child.children.length && child.children.every((c) => isImg(c) || isBlank(c))) {
      const imgs = child.children.filter(isImg);
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
