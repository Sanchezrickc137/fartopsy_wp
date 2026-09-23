import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
function normalizeBase(value) {
  const base = `/${String(value).replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  if (!/^\/[\w/-]*$/.test(base) || base.includes('//')) throw new Error('BASE_PATH must contain only path segments, letters, digits, hyphens, or underscores.');
  return base;
}

/** Read-only local preview; supports the root URL and a GitHub Pages project path. */
export function createStaticServer({ root = repository, basePath = '/fartopsy-welcome/' } = {}) {
  root = path.resolve(root);
  const base = normalizeBase(basePath);
  const realRoot = realpath(root);
  return http.createServer(async (request, response) => {
    const head = request.method === 'HEAD';
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    function reply(status, message, headers = {}) {
      const body = `${message}\n`;
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...headers });
      response.end(head ? undefined : body);
    }
    if (!['GET', 'HEAD'].includes(request.method)) { reply(405, 'Only GET and HEAD are supported.', { Allow: 'GET, HEAD' }); return; }
    try {
      // Inspect the raw path before URL normalization can remove traversal segments.
      const raw = (request.url || '/').split('?')[0];
      let pathname;
      try { pathname = decodeURIComponent(raw); }
      catch { reply(400, 'Malformed URL.'); return; }
      if (!pathname.startsWith('/') || /[\\\0:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
        reply(403, 'This path is not available.'); return;
      }
      if (base !== '/' && pathname === base.slice(0, -1)) {
        const query = (request.url || '').includes('?') ? `?${request.url.split('?').slice(1).join('?')}` : '';
        response.writeHead(308, { Location: base + query }); response.end(); return;
      }
      if (base !== '/' && pathname.startsWith(base)) pathname = '/' + pathname.slice(base.length);
      let file = path.resolve(root, `.${pathname}`);
      if (!inside(root, file)) { reply(403, 'This path is not available.'); return; }
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          const target = (request.url || '/').split('?')[0] + '/';
          response.writeHead(308, { Location: target }); response.end(); return;
        }
        file = path.join(file, 'index.html'); info = await stat(file);
      }
      if (!info.isFile() || !inside(await realRoot, await realpath(file))) { reply(403, 'This path is not available.'); return; }
      let start = 0, end = info.size - 1, status = 200;
      if (request.headers.range && info.size) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { reply(416, 'Invalid byte range.', { 'Content-Range': `bytes */${info.size}` }); return; }
        if (match[1]) { start = Number(match[1]); end = match[2] ? Number(match[2]) : end; }
        else { start = Math.max(0, info.size - Number(match[2])); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= info.size || end < start) {
          reply(416, 'Invalid byte range.', { 'Content-Range': `bytes */${info.size}` }); return;
        }
        end = Math.min(end, info.size - 1); status = 206;
      }
      const headers = { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size ? end - start + 1 : 0, 'Accept-Ranges': 'bytes' };
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      response.writeHead(status, headers);
      if (head || !info.size) { response.end(); return; }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (response.headersSent) response.destroy();
      else reply(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'File not found.' : 'Unable to read this file.');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4181);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const basePath = normalizeBase(process.env.BASE_PATH ?? '/fartopsy-welcome/');
  const server = createStaticServer({ basePath });
  server.on('error', error => { console.error(`Preview server: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Welcome preview: http://localhost:${port}/`);
    if (basePath !== '/') console.log(`GitHub Pages path: http://localhost:${port}${basePath}`);
    console.log('Read-only static files. Press Ctrl+C to stop.');
  });
}
