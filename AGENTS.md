# このリポジトリで作業するとき

読む相手はコーディングエージェント。利用者向けの入口は [llms.txt](llms.txt) のほう。

## 何を大事にしている場所か

CSS アニメーションを**作る**ことではなく、**判断できる形にする**ことを扱っている。
だから次の 2 つは、他の何より優先される。

1. **効かなかったことを消さない。** [FINDINGS.md](FINDINGS.md) の価値は否定形の記録にある。
   「試したが駄目だった」を消して整理すると、この場所は普通のスニペット集になる。
2. **確度を偽らない。** 知見には `実測` / `仕様から確定` / `仮説` のいずれかが必ず付く。
   確かめていないものを `実測` と書かない。カタログの `predicted` は著者の事前予測であって
   判定ではない。`predicted: good` を「検証済み」として扱わない。

## 依存パッケージを増やさない

`package.json` の `dependencies` は空のまま保つ。Node と標準ブラウザ機能だけで動くことが
この道具の性質そのもので、「検査するために何かをインストールする」必要が出た時点で
使われなくなる。headless Chrome も、npm から入れるのではなく既にある実体を借りている
（[scripts/chrome.mjs](scripts/chrome.mjs)）。

## 検査は 1 か所にしか書かない

同じ規則をブラウザと Node の両方に書くと、必ず片方が古くなる。

- [scripts/checks/static.mjs](scripts/checks/static.mjs) — DOM を使わない。Node からもブラウザからも動く。
- [scripts/checks/runtime.mjs](scripts/checks/runtime.mjs) — ブラウザ専用。実際に生成されたアニメーションを見る。

呼ぶ側は 3 つある。[lab/verify.html](lab/verify.html)（カタログ全件）、
[bin/csslab.mjs](bin/csslab.mjs)（任意の CSS）、[mcp/server.mjs](mcp/server.mjs)（AI から）。
検査を足すときは規則をモジュールに書き、[test/static-checks.test.mjs](test/static-checks.test.mjs)
に「壊れた入力で発火すること」の試験を必ず添える。無指摘のカタログだけでは、
検査が常に空を返していても気づけない。

## 実験を足す

`experiments/<id>/` に `meta.json` と `anim.css` の 2 つを置く。
`anim.css` の通常セレクタは `[data-exp="<id>"]` の下へ閉じる。

必須の軸は層で変わる。全層で `driver`、L 層は `target` / `timing` / `orchestration` / `structure`、
T・E 層は `technique` / `use`、E 層はさらに `origin`。

## パスを絶対で書かない

`lab/` のクライアントは開発サーバー（`/`）でも GitHub Pages のサブパス
（`/css-animation-lab/`）でも動く必要がある。参照は
[lab/lab.js](lab/lab.js) の `API` と `asset()` を通す。`/api/...` と直接書くと後者で全滅する。

## 判定を代わりに付けない

`verdicts.json` の判定は人間が動きを見て決めるもの。
`predicted` から機械的に埋めると、この場所が持っている唯一の希少な情報が失われる。
判定を増やしたいなら、判定する人を増やす方向で考える（[CONTRIBUTING.md](CONTRIBUTING.md)）。

## 出す前に通すもの

```bash
npm test        # 検査規則・サーバー・CLI
npm run validate  # メタデータと CSS の整合
npm run export    # catalog.json と dist/ の再生成（差分が出たらコミットする）
```

CI は `npm run export` 後の差分の有無まで見るので、`catalog.json` を手で書き換えない。
