# 送られた判定

`verdicts/<名前>.json` を 1 人 1 ファイルとして置く。ファイル名がそのまま判定者の名前になる。

形式はリポジトリ直下の [verdicts.json](../verdicts.json) と同じ version 2。
公開サイトの「判定を書き出す」から落としたものをそのまま置ける。

```json
{
  "version": 2,
  "defaultState": "pass",
  "marks": {
    "fade": {
      "state": "star",
      "context": { "easing": "linear", "substrate": "gradient", "cycleMs": 1000, "hold": false },
      "updatedAt": "2026-08-03T00:00:00.000Z"
    }
  },
  "settings": { "easing": "linear", "substrate": "gradient", "cycleMs": 1000, "hold": false },
  "updatedAt": "2026-08-03T00:00:00.000Z"
}
```

`npm run validate` は、ここに置かれたファイルもカタログと同じ規則で検査する。
`npm run export` が全員のぶんを突き合わせて `dist/consensus.json` を作る。

見ているのは多数決ではなく、**意見が割れた実験**のほう。
送り方は [CONTRIBUTING.md](../CONTRIBUTING.md) にある。
