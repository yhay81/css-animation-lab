/**
 * 複数人の判定を突き合わせる。
 *
 * 211 件を 1 人で見るのは無理で、見られたとしてもそれは 1 人の好みにしかならない。
 * ここでやるのは多数決ではなく、**割れているところを見つけること**。
 *
 * 全員が同じ判定を付けた実験は、もう見なくていい。
 * 割れた実験のほうに、まだ言語化されていない基準が埋まっている。
 * PATTERNS.md の 3 軸（注意度・由来・反復耐性）は、そうやって割れを追って出てきたもの。
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { normalizeVerdicts, VERDICT_STATES } from './catalog.mjs';

/**
 * verdicts/ 以下の判定をすべて読む。
 * ファイル名がそのまま判定者の名前になる（verdicts/alice.json → alice）。
 */
export async function loadContributions(root) {
  const dir = join(root, 'verdicts');
  let names;
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch {
    return []; // まだ誰も送っていない
  }

  const contributions = [];
  for (const name of names.sort()) {
    const raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    contributions.push({
      by: basename(name, '.json'),
      verdicts: normalizeVerdicts(raw),
    });
  }
  return contributions;
}

/**
 * 実験ごとに、誰がどう判定したかを畳む。
 *
 * @param {Array<{by: string, verdicts: object}>} contributions
 * @param {Array<{id: string}>} items カタログ。判定が付いていない実験も並べる。
 */
export function tally(contributions, items) {
  const rows = [];
  for (const item of items) {
    const votes = [];
    for (const { by, verdicts } of contributions) {
      const state = verdicts.marks[item.id]?.state;
      if (state && VERDICT_STATES.has(state)) votes.push({ by, state });
    }
    if (!votes.length) continue;

    const counts = {};
    for (const { state } of votes) counts[state] = (counts[state] ?? 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topState, topCount] = ranked[0];

    rows.push({
      id: item.id,
      title: item.title,
      votes: votes.length,
      counts,
      // 全員一致なら 1。割れているほど小さくなる。
      agreement: Number((topCount / votes.length).toFixed(3)),
      majority: topState,
      // 意見が割れた実験。ここに基準が埋まっている。
      contested: ranked.length > 1 && topCount / votes.length < 0.75,
      by: votes,
    });
  }
  return rows.sort((a, b) => a.agreement - b.agreement || b.votes - a.votes);
}

/** 全体の要約。何件見られていて、どこが割れているか。 */
export function summarize(rows, items, contributions) {
  const contested = rows.filter((row) => row.contested);
  return {
    contributors: contributions.map((c) => c.by),
    experiments: items.length,
    judged: rows.length,
    unjudged: items.length - rows.length,
    multiplyJudged: rows.filter((row) => row.votes > 1).length,
    contested: contested.length,
    unanimous: rows.filter((row) => row.votes > 1 && row.agreement === 1).length,
  };
}
