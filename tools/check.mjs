import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const failures = new Set(), references = new Set(), texts = new Map();
const skip = new Set(['.git', 'node_modules', '.local', '.cache']);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const fail = (file, message) => failures.add(`${relative(file)}: ${message}`);
const inside = file => {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};
const decodeHTML = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(x[\da-f]+|\d+);/gi, (_, number) => String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number)));
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith('.env')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
async function text(file) {
  if (!texts.has(file)) texts.set(file, await readFile(file, 'utf8'));
  return texts.get(file);
}
async function reference(source, raw, { fragment = false } = {}) {
  const value = decodeHTML(raw.trim());
  if (!value || /^(?:https?:|mailto:|tel:|data:|blob:)/i.test(value) || value.startsWith('//')) return;
  if (/^[a-z][\w+.-]*:/i.test(value)) { fail(source, `Unsupported resource URL ${value}`); return; }
  if (value.startsWith('/') && !value.startsWith('//')) fail(source, `Root-absolute URL breaks project-path hosting: ${value}`);
  const [pathnameAndQuery, hash] = value.split('#', 2);
  const pathname = pathnameAndQuery.split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { fail(source, `Malformed resource URL ${value}`); return; }
  const target = pathname ? path.resolve(value.startsWith('/') ? root : path.dirname(source), decoded.replace(/^\/+/, '')) : source;
  if (!inside(target)) { fail(source, `Resource escapes this repository: ${value}`); return; }
  let file = target;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
    if (!(await stat(file)).isFile() || !inside(await realpath(file))) throw new Error('Not a local file');
    references.add(relative(file));
  } catch { fail(source, `Missing local resource: ${value}`); return; }
  if (fragment && hash && /\.(?:html?|svg)$/i.test(file)) {
    let id;
    try { id = decodeURIComponent(hash); } catch { fail(source, `Malformed fragment ${value}`); return; }
    const ids = [...(await text(file)).matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map(match => decodeHTML(match[2]));
    if (!ids.includes(id)) fail(source, `Missing fragment target: ${value}`);
  }
}
function checkSyntax(file, source, inline = false) {
  const result = spawnSync(process.execPath, inline ? ['--check', '--input-type=module'] : ['--check', file],
    { encoding: 'utf8', input: inline ? source : undefined, maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) fail(file, `${inline ? 'Inline script' : 'JavaScript'} syntax check failed: ${(result.stderr || result.error?.message || 'unknown error').trim()}`);
}
async function checkJavaScript(file, source) {
  if (/(?:firebase(?:io)?\.com|firebasedatabase\.app|gstatic\.com\/firebase|(?:from|import\s*\()[^\n;]*["']firebase|["'`]\.?\/?api\/)/i.test(source))
    fail(file, 'Runtime still contains a Firebase or API backend reference.');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) await reference(file, match[1]);
    else if (!/^(?:https?:|node:)/.test(match[1])) fail(file, `Browser import needs an unavailable package: ${match[1]}`);
  }
  for (const match of source.matchAll(/["'`]((?:\.{0,2}\/)?(?:assets|audio|font|funyamora|icons|still)\/[^"'`\r\n]+)["'`]/g)) {
    if (!match[1].includes('${')) await reference(file, match[1]);
  }
}

const files = await walk(root);
let htmlCount = 0, cssCount = 0, jsCount = 0, inlineCount = 0;
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!['.html', '.css', '.js', '.mjs', '.cjs'].includes(extension)) continue;
  const source = await text(file);
  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    jsCount++; checkSyntax(file, source);
    if (!relative(file).startsWith('tools/')) await checkJavaScript(file, source);
  } else if (extension === '.css') {
    cssCount++;
    for (const match of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
      const value = (match[1] ?? match[2] ?? match[3]).trim();
      if (!value.startsWith('#')) await reference(file, value);
    }
  } else {
    htmlCount++;
    const markup = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    for (const tag of markup.matchAll(/<[^>]+>/g)) {
      for (const attribute of tag[0].matchAll(/\s(?:src|href|data-animated|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
        await reference(file, attribute[1] ?? attribute[2] ?? attribute[3], { fragment: true });
    }
    for (const script of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(script[1]);
      if (src) await reference(file, src[2]);
      else if (script[2].trim() && !/type\s*=\s*["']application\//i.test(script[1])) {
        inlineCount++; checkSyntax(file, script[2], true); await checkJavaScript(file, script[2]);
      }
    }
    if (path.basename(file) === 'index.html') {
      const pages = [...markup.matchAll(/<section\b[^>]*>/gi)].filter(match => /\bclass\s*=\s*["'][^"']*\bpage\b/.test(match[0]));
      if (pages.length !== 1 || !/\bid\s*=\s*["']welcome["']/.test(pages[0]?.[0] || '')) fail(file, 'Expected exactly one route section: #welcome.');
      if (/<section\b[^>]*\bid\s*=\s*["'](?:about|socials|gallery|settings|profile)["']/i.test(markup)) fail(file, 'A page outside this Welcome export is still rendered.');
    }
  }
}
if (!htmlCount || !files.includes(path.join(root, 'index.html'))) fail(path.join(root, 'index.html'), 'Entry page is missing.');
if (failures.size) {
  console.error(`Check failed (${failures.size} issue${failures.size === 1 ? '' : 's'}):\n${[...failures].map(message => `- ${message}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlCount} HTML, ${cssCount} CSS, ${jsCount} JavaScript files and ${inlineCount} inline script${inlineCount === 1 ? '' : 's'}.`);
  console.log(`${references.size} local resource targets resolve; Welcome is the only route; runtime has no Firebase/API references.`);
  console.log('Static checks passed. Run npm start for browser and interaction checks.');
}
