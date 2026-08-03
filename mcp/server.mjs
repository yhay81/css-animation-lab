#!/usr/bin/env node
/**
 * css-animation-lab の MCP サーバー（stdio / 依存ゼロ）。
 *
 * AI が CSS アニメーションを扱うとき、足りないのは書く力ではなく
 * 「書いたものが本当に動いているか」を確かめる手段のほうだった。
 * ここで配るのは 4 つ。
 *
 *   check_css        書いた CSS を実際に動かして検査する
 *   search_catalog   211 件の実験から、作れるものを引く
 *   search_findings  効いたこと・効かなかったことを、確度つきで引く
 *   get_patterns     型ごとの性格（注意度・由来・反復耐性）
 *
 * SDK は使っていない。JSON-RPC over stdio は数十行で書けるし、
 * 「何もインストールしなくていい」ことがこの道具の性質だから。
 */
import { createInterface } from 'node:readline';
import {
  checkCss, searchCatalog, searchFindings, loadPatterns, loadCatalog,
} from '../index.mjs';

const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'check_css',
    description:
      'CSS アニメーションを検査する。書き方の誤り（静的）に加え、runtime: true なら '
      + 'headless Chrome で実際に動かし、「アニメーションが生成されていない」「描画が変わらない」'
      + '「1 周の継ぎ目で飛ぶ」といった、コードを読んでも分からない問題を捕まえる。'
      + '合成 / paint / layout の負荷分類も返す。CSS アニメーションを書いたら必ず通すこと。',
    inputSchema: {
      type: 'object',
      properties: {
        css: { type: 'string', description: '検査する CSS。@keyframes と規則をそのまま渡す。' },
        markup: {
          type: 'string',
          description:
            '被写体の HTML。省略すると正方形の被写体ひとつになる。'
            + '複数要素や SVG を動かす CSS では渡したほうが正確に測れる。',
        },
        runtime: {
          type: 'boolean',
          description: '実際にブラウザで動かすか。既定 true。Chrome が無い環境では静的検査だけになる。',
        },
      },
      required: ['css'],
    },
  },
  {
    name: 'search_catalog',
    description:
      'CSS アニメーションの実験カタログを引く。用途（ローディング、モーダル登場など）、'
      + '技法（filter合成、offset-path など）、名称のどれからでも当たる。'
      + '「CSS だけで何ができるか」を調べるときに使う。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用途・技法・名称。日本語で引く。' },
        layer: {
          type: 'string',
          enum: ['L0', 'L2', 'L3', 'L4', 'T', 'E'],
          description: 'L0=原子 / L2=合成 / L3=stagger / L4=レシピ / T=技法 / E=他領域由来',
        },
        limit: { type: 'number', description: '件数（既定 20）' },
      },
    },
  },
  {
    name: 'search_findings',
    description:
      'CSS アニメーションの知見を引く。1 件ごとに「主張・根拠・確度・効き方」を持ち、'
      + '確度は 実測 / 仕様から確定 / 仮説 のいずれか。'
      + '効かなかったことも同じだけ記録してあるので、罠を踏む前に引くと効く。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'プロパティ名や現象。例: offset-path, 継ぎ目, ease-out' },
      },
    },
  },
  {
    name: 'get_patterns',
    description:
      '動きの型ごとの性格を返す。注意度・由来を示すか・反復耐性の 3 軸で、優劣は書いていない。'
      + '「この場面にどの動きを選ぶか」を決めるときに使う。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const text = (value) => ({
  content: [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
});

/** 検査の結果は、そのまま直せる形で返す。件数だけ返しても直せない。 */
async function runCheck({ css, markup, runtime = true }) {
  try {
    const result = await checkCss(css, {
      id: 'css',
      markup: markup ?? null,
      runtime,
    });
    const fails = result.findings.filter((f) => f.sev === 'fail');
    return text({
      verdict: fails.length ? 'needs-fix' : 'clean',
      findings: result.findings,
      cost: result.runtime?.cost ?? null,
      animatedProperties: result.runtime?.properties ?? null,
      animationCount: result.runtime?.animationCount ?? null,
      cycleMs: result.runtime?.cycleMs ?? null,
      note: result.runtime
        ? null
        : '静的検査のみ。runtime: true にすると、実際に動かして「何も起きていない」ことまで見る。',
    });
  } catch (error) {
    // Chrome が無いだけで全部を落とさない。静的検査は返す。
    const fallback = await checkCss(css, { id: 'css', markup: markup ?? null, runtime: false });
    return text({
      verdict: fallback.findings.some((f) => f.sev === 'fail') ? 'needs-fix' : 'clean-static-only',
      findings: fallback.findings,
      runtimeError: error.message,
      note: '実行時の検査は行えなかった。上記は静的検査のみの結果。',
    });
  }
}

const HANDLERS = {
  check_css: runCheck,
  search_catalog: async ({ query = '', layer, limit = 20 }) =>
    text(await searchCatalog(query, { layer, limit })),
  search_findings: async ({ query = '' }) => {
    const hits = await searchFindings(query);
    return text(hits.map(({ markdown, ...rest }) => rest));
  },
  get_patterns: async () => text(await loadPatterns()),
};

/* ───────────────────────── JSON-RPC ───────────────────────── */

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

async function handle(request) {
  const { id, method, params } = request;
  // 通知（id なし）には応えない。応えると相手側が困る。
  const reply = (result) => { if (id !== undefined) send({ jsonrpc: '2.0', id, result }); };

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'css-animation-lab', version: '0.1.0' },
      });
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const handler = HANDLERS[params?.name];
      if (!handler) {
        return reply({ content: [{ type: 'text', text: `知らないツール: ${params?.name}` }], isError: true });
      }
      try {
        return reply(await handler(params.arguments ?? {}));
      } catch (error) {
        return reply({ content: [{ type: 'text', text: `失敗: ${error.message}` }], isError: true });
      }
    }
    case 'ping':
      return reply({});
    default:
      if (id !== undefined) {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未実装のメソッド: ${method}` } });
      }
  }
}

// カタログを先に読んでおく。最初の呼び出しだけ遅い、という挙動を避ける。
await loadCatalog().catch(() => {});

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON として読めない' } });
    continue;
  }
  await handle(request);
}
