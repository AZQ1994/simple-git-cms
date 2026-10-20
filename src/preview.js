// 预览：把 Markdown 按网站相同的流程转成 HTML（Astro 默认的 remark-gfm、smartypants，加上 rehype-figures）
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import rehypeFigures from '../integrations/astro/rehype-figures.mjs';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeFigures)
  .use(rehypeStringify);

export const renderMarkdown = (md) => String(processor.processSync(md));
