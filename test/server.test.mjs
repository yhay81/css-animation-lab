import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLabServer, safeStaticPath } from '../lab/server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function rawRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: { host: `127.0.0.1:${port}`, ...options.headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('safeStaticPath rejects traversal after URL decoding', () => {
  assert.throws(() => safeStaticPath(ROOT, '/../css-animation-lab-evil/secret'), /forbidden/);
  assert.equal(safeStaticPath(ROOT, '/lab/contact.html'), join(ROOT, 'lab/contact.html'));
});

test('server validates and atomically stores verdicts', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'css-animation-lab-test-'));
  const verdictsFile = join(temp, 'verdicts.json');
  await writeFile(verdictsFile, '{}\n');
  t.after(async () => {
    const resolved = fileURLToPath(pathToFileURL(temp));
    assert.ok(resolved.startsWith(tmpdir()));
    await rm(resolved, { recursive: true });
  });

  const server = createLabServer({ root: ROOT, verdictsFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const catalog = await rawRequest(port, '/api/catalog.json');
  assert.equal(catalog.status, 200);
  assert.equal(JSON.parse(catalog.body).length, 211);

  const styles = await rawRequest(port, '/api/styles.css');
  assert.equal(styles.status, 200);
  assert.match(styles.body, /\[data-exp="fade"\]/);

  // 開発サーバーは書き戻せる。公開サイトとの違いをクライアントがここで知る。
  const config = await rawRequest(port, '/api/config.json');
  assert.equal(config.status, 200);
  assert.equal(JSON.parse(config.body).readonly, false);

  const rejected = await rawRequest(port, '/api/verdicts.json', { method: 'POST', body: '{}' });
  assert.equal(rejected.status, 415);

  const payload = JSON.stringify({
    version: 2,
    defaultState: 'pass',
    marks: {
      fade: {
        state: 'star',
        context: {
          easing: 'linear',
          substrate: 'gradient',
          cycleMs: 1000,
          hold: false,
        },
      },
    },
  });
  const saved = await rawRequest(port, '/api/verdicts.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  assert.equal(saved.status, 200);
  const stored = JSON.parse(await readFile(verdictsFile, 'utf8'));
  assert.equal(stored.version, 2);
  assert.equal(stored.marks.fade.state, 'star');

  const traversal = await rawRequest(port, '/%2e%2e%2fcss-animation-lab-evil/secret');
  assert.equal(traversal.status, 403);
});
