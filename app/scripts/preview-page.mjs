// Turns the logo-free build (dist-neutral/index.html) into a page body for a claude.ai preview:
// the viewer adds its own <html>/<head>, so only the title, styles, script and root element are kept.
// Usage: npm run build:preview  ->  dist-neutral/preview.html
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist-neutral/index.html', import.meta.url), 'utf8');
const head = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>'))
  .replace(/<meta charset="UTF-8" \/>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>'));
const out = `${head.trim()}\n${body.trim()}\n`;
if (out.includes('�')) throw new Error('replacement character in the build');
if (/efeso/i.test(out)) throw new Error('the neutral build still contains the brand name');
writeFileSync(new URL('../dist-neutral/preview.html', import.meta.url), out);
console.log(`dist-neutral/preview.html: ${(out.length / 1024).toFixed(0)} KB`);
