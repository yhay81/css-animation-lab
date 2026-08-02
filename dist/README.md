# 採用CSS

`adopted.css` と `manifest.json` は `npm run export` で生成する。
対象は [verdicts.json](../verdicts.json) で明示的に `star` と判定された実験だけ。

実験CSSは `[data-exp="<id>"]` でスコープされている。利用時は次のどちらかを選ぶ。

1. 対象要素を同じ `data-exp` を持つコンテナへ入れる。
2. CSSをコピーし、プロダクト側のコンポーネントセレクタへ置き換える。

実験の `meta.json` にある `markup`、`axes`、`note` も合わせて確認する。
CSSだけを抜き出すと、文脈や必要なDOM構造を失う場合がある。

プロダクトへ入れるときは、用途に合わせて停止状態を用意する。

```css
@media (prefers-reduced-motion: reduce) {
  .your-component,
  .your-component::before,
  .your-component::after {
    animation: none;
    transition: none;
  }
}
```

ラボ本体では動きを比較する目的があるため、実験アニメーション自体は
`prefers-reduced-motion` で一律停止しない。
