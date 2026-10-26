// Preview rendering: Markdown to HTML through the same pipeline the site uses — Astro's defaults
// (remark-gfm, smartypants) plus rehype-figures and rehype-toc.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import rehypeFigures from '../integrations/astro/rehype-figures.mjs';
import rehypeToc from '../integrations/astro/rehype-toc.mjs';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeFigures)
  .use(rehypeToc)
  .use(rehypeStringify);

// The frontmatter goes where Astro puts it, so an article's `toc: false` is seen here too
export const renderMarkdown = (md, frontmatter = {}) => String(processor.processSync({ value: md, data: { astro: { frontmatter } } }));
