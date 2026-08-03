# css-animation-lab

[English](README.en.md) · **日本語**

CSS アニメーションの表現範囲を、実験・機械検証・比較評価の反復で体系化する研究環境。
依存パッケージやビルド工程を持たず、Node.js とブラウザだけで動く。

**公開サイト → <https://yhay81.github.io/css-animation-lab/>**

## この場所が扱っている問題

CSS アニメーションは、生成するより**判断するほうが高くつく**。書けば動くが、
動いたものが良いかどうかは見るまで分からない。しかも構文が正しく、レビューを通り、
それでも**何も起きていない**ことがある。誤った `@keyframes` 名、描画に届かないプロパティ、
頂点が一直線の `clip-path` — どれもエラーにならない。

AI が大量に書けるようになったいま、詰まるのは生成側ではなく、
人間が動きを見て判断する時間のほうになった。ここはそこを扱う。

## 成果物

| 成果物 | 中身 |
|---|---|
| [catalog.json](catalog.json) | 全211実験を軸で索引した機械可読カタログ |
| [FINDINGS.md](FINDINGS.md) | 効いたこと・効かなかったことの記録（34件、確度つき） |
| [PATTERNS.md](PATTERNS.md) | 型ごとの性格（注意度・由来・反復耐性） |
| `csslab` CLI | 任意の CSS を検査する道具（依存ゼロ） |
| [mcp/server.mjs](mcp/server.mjs) | 同じ検査を AI から呼ぶための MCP サーバー |
| [dist/adopted.css](dist/adopted.css) | `star` 判定された実験から生成する採用CSS |
| [llms.txt](llms.txt) | AI に渡すための入口 |

ブラウザ別の実測は [BROWSER_SUPPORT.md](BROWSER_SUPPORT.md) と
[browser-support.json](browser-support.json) に保存する。

## 自分の CSS を検査する

```bash
npx css-animation-lab check anim.css --runtime
```

`--runtime` は headless Chrome で実際に動かす。npm の依存は増えない（既にある Chrome を借りる。
`CHROME_PATH` で指定もできる）。「要修正」が 1 件でもあれば終了コードは 1 になるので、
CI にそのまま置ける。

```
anim.css
  要修正  動きが無い
          アニメーションが 1 本も生成されていない
          → 指定が通っていても生成されないことがある。擬似要素などは特に。
  負荷  layout（height, width）
  1周   1000ms / アニメーション 1 本
```

他のコマンド:

```bash
csslab strip anim.css --frames 9      # 動きを静止画の連番に展開する
csslab catalog "ローディング"          # 211件から用途・技法で引く
csslab findings "offset-path"         # 知見を確度つきで引く
csslab patterns                       # 型ごとの性格
```

プログラムからは:

```js
import { checkCss, searchCatalog, searchFindings } from 'css-animation-lab';
const { findings, runtime } = await checkCss(css, { runtime: true });
```

## AI から使う

MCP サーバーが `check_css` / `search_catalog` / `search_findings` / `get_patterns` を配る。
SDK 依存は無い。

```json
{
  "mcpServers": {
    "css-animation-lab": {
      "command": "npx",
      "args": ["-y", "css-animation-lab", "--mcp"]
    }
  }
}
```

Claude Code なら [.claude/skills/css-animation](.claude/skills/css-animation/SKILL.md) を
自分のプロジェクトへ写せばそのまま使える。

## 現在地

| 項目 | 件数 |
|---|---:|
| 実験 | 211 |
| `keyframes` 駆動 | 182 |
| `state` 駆動 | 8 |
| `scroll` 駆動 | 13 |
| `interactive` 駆動 | 8 |
| 知見 | 34 |
| 検査規則 | 静的8・実行時7 |
| 人手判定済み | 0 |

機械検証は Chromium 150 で、`keyframes` 駆動182件すべてに指摘なし。
残り29件は状態・スクロール・操作が必要なため、「問題なし」ではなく**実行時未検証**として分けて表示する。

**人手判定はまだ 0 件で、`dist/adopted.css` は空。** これは意図的に埋めていない。
211 件を 1 人で見るのは無理で、仮に見切っても 1 人の好みにしかならないため、
判定は分担して集める方向にしてある（[CONTRIBUTING.md](CONTRIBUTING.md)）。

## 手元で起動する

Node.js 22 以上を使う。

```bash
npm start
```

- <http://127.0.0.1:5757/lab/contact.html> — 一覧、絞り込み、比較、評価
- <http://127.0.0.1:5757/lab/strip.html> — 動きを静止画の連番に展開
- <http://127.0.0.1:5757/lab/verify.html> — 静的・実行時検証、負荷分類、ブラウザ機能表

サーバーは既定で `127.0.0.1` にだけbindする。評価結果を書き込むため、公開用サーバーとしては使わない。
公開サイトは同じ画面を読み取り専用で配信していて、判定はブラウザの中にだけ残る。

## 評価の考え方

生成量ではなく、人間が動きを見て判断する時間が希少資源になる。評価は3層に分ける。

| 層 | 判定内容 | 担当 |
|---|---|---|
| 機械検証 | ファイル整合性、動きの有無、意図との不一致、負荷候補 | スクリプト |
| フィルムストリップ | 軌跡、行き過ぎ、到達の早さ | 静止画として読む |
| 感性 | 気持ちよさ、上品さ、場面との相性 | 人間 |

評価画面はID・名称・用途・技法の検索と、層・駆動・予測・判定・索引軸の絞り込みを持つ。
`predicted: bad` は未操作でも採用扱いにせず、予測NGとして表示する。

### 判定キー

| キー | 動作 |
|---|---|
| `←` `↑` `↓` `→` | 表示中の実験を移動 |
| `p` | 採用 |
| `x` | 却下 |
| `f` | 気になる |
| `s` | 手本にする |
| `z` | 明示判定を取り消す |
| `n` | 次の要判断へ |
| `t` | バッチの既定を採用／却下で反転 |
| `Enter` | 拡大／解除 |
| `Space` | 再生／停止 |
| `,` `.` | コマ送り |
| `r` | 頭出し |
| `e` | イージング送り |
| `b` | 被写体送り |

ポインター操作では、セル右上の判定ボタンを使う。

### 判定データ

[verdicts.json](verdicts.json) はversion 2形式で、明示判定ごとに以下を保存する。

- 判定状態
- イージング
- 被写体
- 1周の実時間
- 溜めの有無
- ブラウザとviewport
- 判定時刻

手元のサーバーでは、入力検証後に一時ファイルから原子的に置き換える。失敗時は評価画面に
「保存失敗」と表示され、そのボタンから再試行できる。
公開サイトでは書き戻せないため、判定は端末内にだけ保存され、書き出してPRで送る形になる。
送られたものは [verdicts/](verdicts/) に置かれ、`dist/consensus.json` に集計される。

## 実験の階層

| 層 | 内容 | 件数 |
|---|---|---:|
| L0 | 1プロパティ・1運動の原子 | 18 |
| L1 | イージング比較 | 一括切替として実装 |
| L2 | 合成の型 | 15 |
| L3 | staggerの間隔と順序 | 9 |
| L4 | 用途を固定したレシピ | 8 |
| T | CSS能力の組み合わせを試す技法 | 108 |
| E | 漫画・映像・光学など他領域由来の表現 | 53 |

T/E層では運動名より、`axes.technique` と `axes.use` を主な索引にする。
E層はさらに `axes.origin` で由来を記録する。

## 駆動方式

| mode | 時計 | 確認方法 |
|---|---|---|
| 未指定（`keyframes`） | 共通時計 | 再生、スクラブ、コマ送り、静止画化 |
| `state` | 実時間 | 1.8秒ごとの状態切替 |
| `scroll` | スクロール位置 | 各セル内をスクロール |
| `interactive` | ユーザー操作 | ポインター、チェック、入力など |

時計外の3方式は評価画面でバッジを表示し、フィルムストリップからは除外する。

## 実験を追加する

`experiments/<id>/` に2ファイルを置く。

```text
experiments/<id>/meta.json
experiments/<id>/anim.css
```

`anim.css` の通常セレクタは `[data-exp="<id>"]` の下へ閉じる。
カタログの1周は1000msだが、個別アニメーションはその中で早く完了させたり、複数回繰り返したりできる。
したがって `animation-duration` は必要な実験だけが明示する。スクロール駆動では `auto` も使う。

メタデータの必須軸は層によって異なる。

- 全層: `driver`
- L層: `target`, `timing`, `orchestration`, `structure`
- T/E層: `technique`, `use`
- E層: `origin`

## 検証

```bash
npm test
npm run validate
```

`npm run validate` は以下を検査する。

- `meta.json` と `anim.css` の1対1対応
- JSONと必須メタデータ
- ID・番号の重複
- `data-exp` のスコープ
- 判定データの状態と参照ID（`verdicts/` の送られたものも含む）

検査規則そのものは [scripts/checks/](scripts/checks/) にあり、
ブラウザ（[lab/verify.html](lab/verify.html)）・CLI・MCP の 3 経路が同じものを呼ぶ。
静的検査は DOM を使わないので Node からも動く。

| 種別 | 見るもの |
|---|---|
| 静的（8規則） | 名前衝突、未登録変数、`d`の適用先、静的値の食い合い、面積ゼロの切り抜き、破線の座標系、裏面の非対称、余白の相殺 |
| 実行時（7規則） | 動きの有無、描画の変化、繰り返しの継ぎ目、はみ出しの中央寄せ、1周への収まり、経路からのずれ、入れ子の重なり |

実行時検査は、アニメーションしたプロパティを「合成候補」「paint候補」「layout候補」に分類する。
これはプロパティからの保守的な分類であり、DevToolsの実レイヤ割当を保証するものではない。

## export

```bash
npm run export
```

次を決定的に再生成する。

- `catalog.json`
- `dist/adopted.css`
- `dist/manifest.json`
- `dist/consensus.json`

`dist/adopted.css` に入るのは、`verdicts.json` で明示的に `star` と判定された実験だけ。
多数決では決めない。平均的で無難なものだけが残るため。

GitHub Actionsではテスト、検証、export後の差分有無まで確認し、
main への push で公開サイトを組み直す。

## 仕組み

実験CSSはサーバーが1本へ束ねて配信する（公開サイトではビルド時に同じものを吐く）。
各要素のCSSアニメーションは一時停止され、
`document.getAnimations()` で得た `CSSAnimation` の `currentTime` を共通時計から更新する。
これにより、同位相比較、任意時点への固定、フィルムストリップを同じ仕組みで実現している。

CLI もこの仕組みをそのまま使う。headless Chrome を CDP で駆動し、
任意の CSS をカタログと同じ土俵（`lab/common.css`）に載せて測る。

## ライセンス

MIT
