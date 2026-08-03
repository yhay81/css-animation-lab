// 開発用サーバー（依存ゼロ）。
// 静的配信、実験カタログ、評価結果の安全な書き戻しだけを行う。
import { createServer } from 'node:http';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCatalog, normalizeVerdicts, validateVerdicts } from '../scripts/catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_VERDICTS = join(ROOT, 'verdicts.json');
const MAX_JSON_BYTES = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function localHost(value) {
  try {
    const hostname = new URL(`http://${value}`).hostname;
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

function assertLocalRequest(req) {
  if (!localHost(req.headers.host ?? '')) throw new HttpError(403, 'local requests only');
  const origin = req.headers.origin;
  if (!origin) return;
  let parsed;
  try { parsed = new URL(origin); } catch { throw new HttpError(403, 'invalid origin'); }
  if (!localHost(parsed.host) || parsed.host !== req.headers.host) {
    throw new HttpError(403, 'cross-origin request denied');
  }
}

export function safeStaticPath(root, pathname) {
  const requestPath = pathname === '/' ? 'lab/contact.html' : pathname.replace(/^\/+/, '');
  const file = join(root, requestPath);
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new HttpError(403, 'forbidden');
  return file;
}

async function readJsonBody(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'content-type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'request body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

async function writeJsonAtomic(file, value) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temp = join(dirname(file), `.${basename(file)}.${suffix}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

export function createLabServer({ root = ROOT, verdictsFile = DEFAULT_VERDICTS } = {}) {
  return createServer(async (req, res) => {
    try {
      assertLocalRequest(req);
      const url = new URL(req.url, 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { throw new HttpError(400, 'invalid path encoding'); }

      // 公開サイトは判定を書き戻せない。クライアントが保存先を選べるように状態を伝える。
      if (pathname === '/api/config.json') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
        const body = JSON.stringify({ readonly: false, source: 'dev-server' });
        return send(res, 200, req.method === 'HEAD' ? '' : body, MIME['.json']);
      }

      if (pathname === '/api/catalog.json') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
        const { items, errors } = await loadCatalog(root);
        if (errors.length) throw new Error(errors.join('\n'));
        return send(res, 200, req.method === 'HEAD' ? '' : JSON.stringify(items), MIME['.json']);
      }

      if (pathname === '/api/styles.css' || pathname === '/api/sources.json') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
        const { items, errors } = await loadCatalog(root, { readCss: true });
        if (errors.length) throw new Error(errors.join('\n'));
        if (pathname === '/api/sources.json') {
          const sources = Object.fromEntries(items.map((item) => [item.id, item.css]));
          return send(res, 200, req.method === 'HEAD' ? '' : JSON.stringify(sources), MIME['.json']);
        }
        const css = items.map((item) => `/* ${item.id} */\n${item.css}`).join('\n');
        return send(res, 200, req.method === 'HEAD' ? '' : css, MIME['.css']);
      }

      if (pathname === '/api/verdicts.json') {
        if (req.method === 'GET' || req.method === 'HEAD') {
          const body = await readFile(verdictsFile, 'utf8').catch(() => '{}');
          return send(res, 200, req.method === 'HEAD' ? '' : body, MIME['.json']);
        }
        if (req.method === 'POST') {
          const { items, errors } = await loadCatalog(root);
          if (errors.length) throw new Error(errors.join('\n'));
          const raw = await readJsonBody(req);
          const verdictErrors = validateVerdicts(raw, new Set(items.map((item) => item.id)));
          if (verdictErrors.length) throw new HttpError(400, verdictErrors.join('\n'));
          const data = normalizeVerdicts(raw);
          data.updatedAt = new Date().toISOString();
          await writeJsonAtomic(verdictsFile, data);
          return send(res, 200, JSON.stringify({ ok: true, updatedAt: data.updatedAt }), MIME['.json']);
        }
        throw new HttpError(405, 'method not allowed');
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
      const file = safeStaticPath(root, pathname);
      const body = await readFile(file);
      return send(res, 200, req.method === 'HEAD' ? '' : body, MIME[extname(file)] ?? 'application/octet-stream');
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return send(res, 404, 'not found');
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(`[server] ${req.method} ${req.url}\n${error.stack ?? error}`);
      return send(res, status, status === 500 ? 'internal server error' : error.message);
    }
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT) || 5757;
  const host = process.env.HOST || '127.0.0.1';
  const server = createLabServer();
  server.listen(port, host, () => {
    console.log(`css-animation-lab  →  http://${host}:${port}/`);
    console.log(`  一覧・評価        http://${host}:${port}/lab/contact.html`);
    console.log(`  フィルムストリップ http://${host}:${port}/lab/strip.html`);
    console.log(`  検証              http://${host}:${port}/lab/verify.html`);
  });
}
