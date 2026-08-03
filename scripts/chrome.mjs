/**
 * headless Chrome を起動して DevTools Protocol で話す。依存パッケージは使わない。
 *
 * Puppeteer を入れれば 3 行で済むが、この道具の要点は
 * 「CSS を検証するために何もインストールしなくていい」ことにある。
 * Node 22 には WebSocket が標準で入っているので、CDP は素で喋れる。
 */
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/** 探す順。環境変数が最優先。見つかった最初のものを使う。 */
const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];

const exists = async (file) => {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

async function fromPath(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, name);
    if (await exists(file)) return file;
  }
  return null;
}

/** Chrome の実体を探す。見つからないときは、何をすればいいかまで書いて投げる。 */
export async function findChrome() {
  if (process.env.CHROME_PATH) {
    if (await exists(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH が指す実行ファイルがない: ${process.env.CHROME_PATH}`);
  }
  for (const file of CANDIDATES[process.platform] ?? []) {
    if (await exists(file)) return file;
  }
  for (const name of ON_PATH) {
    const file = await fromPath(name);
    if (file) return file;
  }
  throw new Error(
    '実行時の検査には Chrome / Chromium が要ります。見つかりませんでした。\n'
    + 'インストールするか、CHROME_PATH で実体を指してください。\n'
    + '  CHROME_PATH="/path/to/chrome" npx css-animation-lab check --runtime anim.css',
  );
}

/**
 * DevTools Protocol の接続。
 * 1 本の WebSocket に、ブラウザ宛とページ宛（sessionId 付き）の両方が流れる。
 */
class Connection {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #handlers = new Map();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => this.#receive(JSON.parse(event.data)));
    ws.addEventListener('close', () => {
      for (const { reject } of this.#pending.values()) reject(new Error('DevTools 接続が閉じた'));
      this.#pending.clear();
    });
  }

  static async open(url, timeoutMs = 20_000) {
    if (typeof WebSocket !== 'function') {
      throw new Error('この Node には WebSocket がありません。Node 22 以上を使ってください。');
    }
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools への接続がタイムアウトした')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('DevTools へ接続できない')); }, { once: true });
    });
    return new Connection(ws);
  }

  #receive(message) {
    if (message.id !== undefined) {
      const entry = this.#pending.get(message.id);
      if (!entry) return;
      this.#pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    for (const handler of this.#handlers.get(message.method) ?? []) handler(message.params, message.sessionId);
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.#ws.send(JSON.stringify(payload));
    });
  }

  on(method, handler) {
    if (!this.#handlers.has(method)) this.#handlers.set(method, []);
    this.#handlers.get(method).push(handler);
  }

  close() {
    try { this.#ws.close(); } catch { /* すでに閉じている */ }
  }
}

/**
 * Chrome を起動して 1 枚のページに繋いだ状態を返す。
 * `evaluate` はそのページで式を評価し、値をそのまま持ち帰る。
 */
export async function launch({ width = 1200, height = 900, timeoutMs = 30_000 } = {}) {
  const bin = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), 'csslab-chrome-'));
  const child = spawn(bin, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    // 窓が隠れている扱いになると requestAnimationFrame が来ず、測定が止まる。
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // 起動先のポートは stderr にしか出ない。
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome の起動がタイムアウトした')), timeoutMs);
    const done = (fn, value) => { clearTimeout(timer); child.stderr.off('data', onData); fn(value); };
    const onData = (chunk) => {
      buffer += chunk;
      const hit = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (hit) done(resolve, hit[1]);
    };
    child.stderr.on('data', onData);
    child.once('error', (error) => done(reject, error));
    child.once('exit', (code) => done(reject, new Error(`Chrome が起動前に終了した（code ${code}）\n${buffer.slice(-500)}`)));
  });

  const connection = await Connection.open(wsUrl);
  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
  await connection.send('Page.enable', {}, sessionId);
  await connection.send('Runtime.enable', {}, sessionId);

  const page = {
    connection,
    sessionId,
    send: (method, params) => connection.send(method, params, sessionId),

    /** 読み込み完了まで待って移動する。 */
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const handler = (_params, session) => { if (session === sessionId) resolve(); };
        connection.on('Page.loadEventFired', handler);
      });
      await connection.send('Page.navigate', { url }, sessionId);
      await loaded;
    },

    /** ページの中で式を評価する。Promise は解決を待ち、値はそのまま返す。 */
    async evaluate(expression) {
      const result = await connection.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId);
      if (result.exceptionDetails) {
        const text = result.exceptionDetails.exception?.description
          ?? result.exceptionDetails.text;
        throw new Error(`ページ内で例外: ${text}`);
      }
      return result.result.value;
    },

    async close() {
      connection.close();
      child.kill();
      // プロファイルは毎回捨てる。前回の状態が測定に混ざらないようにする。
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };

  return page;
}
