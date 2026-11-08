// Preview rendering: Markdown to HTML through the same pipeline the site uses — Astro's defaults
// (remark-gfm, smartypants) plus rehype-figures, and rehype-toc when config.json says the site has it.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import rehypeFigures from '../integrations/astro/rehype-figures.mjs';
import rehypeToc from '../integrations/astro/rehype-toc.mjs';

const pipeline = (toc) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeFigures)
    .use(toc ? [[rehypeToc, toc]] : [])
    .use(rehypeStringify);
const processors = new Map(); // by the toc options, which are config.json's and so seldom change

/**
 * `toc` is config.json's `toc`: rehype-toc's options, or nothing for a site without it. The
 * frontmatter goes where Astro puts it, so an article's `toc: false` is seen here too.
 */
export function renderMarkdown(md, frontmatter = {}, toc) {
  const key = toc ? JSON.stringify(toc) : '';
  if (!processors.has(key)) processors.set(key, pipeline(toc));
  return String(processors.get(key).processSync({ value: md, data: { astro: { frontmatter } } }));
}
