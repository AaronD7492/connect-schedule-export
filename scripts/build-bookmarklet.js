/**
 * Builds the bookmarklets and the install page.
 *
 *   npm run build                         stable build into docs/ (local preview)
 *   CHANNEL=dev OUT_DIR=site/dev npm run build
 *
 * Environment:
 *   CHANNEL   "stable" (default) or "dev". Dev builds get a warning banner,
 *             "(dev)" in the bookmark name and a "-dev" version.
 *   OUT_DIR   folder for index.html, relative to the current directory (default: docs).
 *   GITHUB_SHA  set automatically in GitHub Actions; its first 7 characters
 *             are added to dev version numbers.
 *
 * Outputs:
 *   dist/connect-schedule-export.js   readable bundle (for review)
 *   dist/bookmarklet.txt              the javascript: link
 *   dist/probe-bookmarklet.txt        the live-page diagnostic link
 *   <OUT_DIR>/index.html              install page, generated from docs/template.html
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const SIZE_WARNING_BYTES = 30 * 1024;

const channel = (process.env.CHANNEL || 'stable').toLowerCase();
if (!['stable', 'dev'].includes(channel)) {
  throw new Error(`CHANNEL must be "stable" or "dev", got "${channel}"`);
}
const isDev = channel === 'dev';
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const version = isDev ? `${pkg.version}-dev${sha ? '.' + sha : ''}` : pkg.version;
const outDir = path.resolve(process.cwd(), process.env.OUT_DIR || path.join(root, 'docs'));

async function bundle(entry, { minify }) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari14'],
    minify,
    legalComments: 'none',
    write: false,
    define: { __VERSION__: JSON.stringify(version) },
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
await mkdir(outDir, { recursive: true });

const readable = await bundle('src/bookmarklet.js', { minify: false });
const minified = await bundle('src/bookmarklet.js', { minify: true });
const probe = await bundle('tools/probe.js', { minify: true });

const link = toBookmarklet(minified);
const probeLink = toBookmarklet(probe);

await writeFile(path.join(root, 'dist/connect-schedule-export.js'), readable + '\n');
await writeFile(path.join(root, 'dist/bookmarklet.txt'), link + '\n');
await writeFile(path.join(root, 'dist/probe-bookmarklet.txt'), probeLink + '\n');

const banner = isDev
  ? '<div class="banner"><strong>Development build.</strong> This version is being worked on and may not work. ' +
    'For the tested version, use the <a href="../">stable install page</a>.</div>'
  : '';

const template = await readFile(path.join(root, 'docs/template.html'), 'utf8');
const page = template
  .replaceAll('{{BOOKMARKLET}}', escapeHtml(link))
  .replaceAll('{{PROBE_BOOKMARKLET}}', escapeHtml(probeLink))
  .replaceAll('{{VERSION}}', escapeHtml(version))
  .replaceAll('{{BOOKMARK_NAME}}', isDev ? 'Export schedule (dev)' : 'Export schedule')
  .replaceAll('{{TITLE_SUFFIX}}', isDev ? ' (dev)' : '')
  .replaceAll('{{CHANNEL_BANNER}}', banner);
await writeFile(path.join(outDir, 'index.html'), page);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Channel:     ${channel} (v${version})`);
console.log(`Bookmarklet: ${kb(link.length)} (minified code ${kb(minified.length)})`);
console.log(`Probe:       ${kb(probeLink.length)}`);
if (link.length > SIZE_WARNING_BYTES) {
  console.warn(`Warning: bookmarklet is over ${kb(SIZE_WARNING_BYTES)}; check it still saves on iPhone Safari.`);
}
console.log(`Wrote dist/ and ${path.relative(process.cwd(), path.join(outDir, 'index.html')) || 'index.html'}`);
