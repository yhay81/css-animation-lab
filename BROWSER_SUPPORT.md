# ブラウザ実測

`lab/verify.html` を各ブラウザで実行した結果は [browser-support.json](browser-support.json) に保存する。
これは仕様上の対応表ではなく、同じ 211 実験を同じ測定コードで通した実測スナップショットである。

## 2026-08-02

| ブラウザ | 要修正 | 実行時未検証 | 問題なし | 主な非対応 |
|---|---:|---:|---:|---|
| Chromium 150 | 0 | 29 | 182 | — |
| Safari 26.5 | 5 | 29 | 177 | `interpolate-size`, `corner-shape`, `scroll-state`, CSS `d` |
| Firefox 153 | 6 | 29 | 176 | scroll/view timeline, `interpolate-size`, `sibling-index()`, `corner-shape`, `scroll-state` |

Safari の失敗は `at-function`、`attr-param`、`boil`、`corner-shape`、`if-branch`。
Firefox の失敗は `at-function`、`attr-param`、`container-style-q`、`corner-shape`、`if-branch`、`inherit-drive`。

`CSS.supports()` が真でも動作するとは限らない。`scroll-state` のように構文だけ受理される場合があるため、
機能チップと実験の実測結果は別々に記録する。

## 更新手順

1. `npm start` を実行する。
2. 対象ブラウザで `http://127.0.0.1:5757/lab/verify.html` を開く。
3. 検証完了後に「結果JSON」を押す。
4. 結果を `browser-support.json` の対応する run と統合する。

ブラウザ更新後は既存 run を上書きせず、バージョンを変えて追加する。
