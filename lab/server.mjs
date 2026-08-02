// 開発用サーバー（依存ゼロ）。
// 静的配信に加えて、実験カタログの提供と評価結果の書き戻しだけを行う。
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 5757;
const VERDICTS = join(ROOT, 'verdicts.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** 各実験の meta.json をすべて読んで n 順に並べたカタログを返す。 */
async function catalog() {
  const dir = join(ROOT, 'experiments');
  const ids = await readdir(dir, { withFileTypes: true });
  const items = [];
  for (const e of ids) {
    if (!e.isDirectory()) continue;
    try {
      items.push(JSON.parse(await readFile(join(dir, e.name, 'meta.json'), 'utf8')));
    } catch {
      // meta.json を持たないディレクトリは無視する
    }
  }
  return items.sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === '/api/catalog') {
      return send(res, 200, JSON.stringify(await catalog()), MIME['.json']);
    }

    if (path === '/api/verdicts' && req.method === 'GET') {
      const body = await readFile(VERDICTS, 'utf8').catch(() => '{}');
      return send(res, 200, body, MIME['.json']);
    }

    if (path === '/api/verdicts' && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await writeFile(VERDICTS, JSON.stringify(data, null, 2) + '\n');
      return send(res, 200, '{"ok":true}', MIME['.json']);
    }

    // 静的ファイル。ROOT の外へは出さない。
    const rel = path === '/' ? '/lab/contact.html' : path;
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');

    const body = await readFile(file);
    return send(res, 200, body, MIME[extname(file)] ?? 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, 'not found');
    return send(res, 500, String(err));
  }
});

server.listen(PORT, () => {
  console.log(`css-animation-lab  →  http://localhost:${PORT}/`);
  console.log(`  一覧・評価        http://localhost:${PORT}/lab/contact.html`);
  console.log(`  フィルムストリップ http://localhost:${PORT}/lab/strip.html`);
});
