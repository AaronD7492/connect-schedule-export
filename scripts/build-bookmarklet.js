/**
 * Builds the bookmarklets and writes them into the GitHub Pages install page.
 *
 *   npm run build
 *
 * Outputs:
 *   dist/connect-schedule-export.js   readable bundle (for review)
 *   dist/bookmarklet.txt              the javascript: link
 *   dist/probe-bookmarklet.txt        the live-page diagnostic link
 *   docs/index.html                   install page, generated from docs/template.html
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const SIZE_WARNING_BYTES = 30 * 1024;

async function bundle(entry, { minify }) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari14'],
    minify,
    legalComments: 'none',
    write: false,
  });
  return result.outputFiles[0].text.trim();
}

function toBookmarklet(code) {
  // encodeURIComponent keeps the link safe to paste on any browser, including phones.
  return 'javascript:' + encodeURIComponent(code);
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

await mkdir(path.join(root, 'dist'), { recursive: true });

const readable = await bundle('src/bookmarklet.js', { minify: false });
const minified = await bundle('src/bookmarklet.js', { minify: true });
const probe = await bundle('tools/probe.js', { minify: true });

const link = toBookmarklet(minified);
const probeLink = toBookmarklet(probe);

await writeFile(path.join(root, 'dist/connect-schedule-export.js'), readable + '\n');
await writeFile(path.join(root, 'dist/bookmarklet.txt'), link + '\n');
await writeFile(path.join(root, 'dist/probe-bookmarklet.txt'), probeLink + '\n');

const template = await readFile(path.join(root, 'docs/template.html'), 'utf8');
const page = template
  .replaceAll('{{BOOKMARKLET}}', escapeHtml(link))
  .replaceAll('{{PROBE_BOOKMARKLET}}', escapeHtml(probeLink))
  .replaceAll('{{VERSION}}', pkg.version);
await writeFile(path.join(root, 'docs/index.html'), page);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Bookmarklet: ${kb(link.length)} (minified code ${kb(minified.length)})`);
console.log(`Probe:       ${kb(probeLink.length)}`);
if (link.length > SIZE_WARNING_BYTES) {
  console.warn(`Warning: bookmarklet is over ${kb(SIZE_WARNING_BYTES)}; check it still saves on iPhone Safari.`);
}
console.log('Wrote dist/ and docs/index.html');
