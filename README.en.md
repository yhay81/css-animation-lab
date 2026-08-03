# css-animation-lab

**English** · [日本語](README.md)

A research environment for CSS animation: 211 catalogued experiments, findings recorded
with explicit confidence levels, and a zero-dependency verifier that runs the CSS in a
real browser. No build step, no npm dependencies — Node.js and a browser.

**Live site → <https://cssanime.yhay81.com/>**

## The problem this addresses

Writing a CSS animation is cheap. Knowing whether it works is not.

An animation can be syntactically perfect, pass every linter, survive code review, and
still produce **nothing at all**. A misspelled `@keyframes` name. A property that changes
its computed value but never reaches paint. A `clip-path: polygon()` whose vertices are
collinear, silently erasing the element. None of these raise an error. You find out by
watching, and watching does not scale.

Now that models generate CSS animation fluently, the bottleneck has moved. It is no
longer generation. It is the human time spent looking at motion and deciding.

## What you get

| Artifact | Contents |
|---|---|
| [catalog.json](catalog.json) | All 211 experiments, indexed by axis, machine-readable |
| [FINDINGS.md](FINDINGS.md) | 34 findings — what worked *and what didn't*, with confidence levels |
| [PATTERNS.md](PATTERNS.md) | The character of each motion type (attention cost, origin, repetition tolerance) |
| `csslab` CLI | Verify arbitrary CSS. Zero dependencies |
| [mcp/server.mjs](mcp/server.mjs) | The same verification, exposed to AI over MCP |
| [dist/adopted.css](dist/adopted.css) | CSS generated from experiments marked `star` by a human |
| [llms.txt](llms.txt) | Entry point for models |

Per-browser measurements live in [BROWSER_SUPPORT.md](BROWSER_SUPPORT.md) and
[browser-support.json](browser-support.json) — measured, not copied from support tables.

## Verify your own CSS

```bash
npx css-animation-lab check anim.css --runtime
```

`--runtime` drives headless Chrome over the DevTools Protocol. It adds no npm dependency —
it borrows an installed Chrome/Chromium, or the one at `$CHROME_PATH`. Exit code is 1 when
any `fail`-level finding exists, so it drops into CI unchanged.

```
anim.css
  fail    no motion
          not a single animation was generated
          → a declaration can parse and still not produce an animation. Pseudo-elements especially.
  cost    layout (height, width)
  cycle   1000ms / 1 animation
```

Other commands:

```bash
csslab strip anim.css --frames 9      # expand motion into still frames
csslab catalog "loading"              # search 211 experiments by use or technique
csslab findings "offset-path"         # look up findings, with confidence
csslab patterns                       # the character of each motion type
```

Programmatic use:

```js
import { checkCss, searchCatalog, searchFindings } from 'css-animation-lab';
const { findings, runtime } = await checkCss(css, { runtime: true });
// findings: [{ sev: 'fail'|'warn', rule, msg, why }]
// runtime:  { cost: 'compositor'|'paint'|'layout'|'unknown', properties, animationCount, cycleMs }
```

## Use it from an AI

The MCP server exposes `check_css`, `search_catalog`, `search_findings` and
`get_patterns`. It has no SDK dependency — JSON-RPC over stdio is a few dozen lines.

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

For Claude Code, copy [.claude/skills/css-animation](.claude/skills/css-animation/SKILL.md)
into your own project.

## What the checks catch

Every rule comes from a bug that was actually hit here — the kind that breaks silently.

**Static (8 rules, no browser needed).** Runs anywhere, including in Node:

- a class name colliding with the harness's own layout names
- `sibling-index()` inside an unregistered custom property, read across elements
- `d:` applied to something that is not a `<path>` — computes, never paints
- a property written both statically and in `@keyframes`; the animation eats the static value
- `clip-path: polygon()` with zero area — the element silently disappears
- `pathLength` combined with `non-scaling-stroke` — dash lengths stop matching what you wrote
- asymmetric `border-radius` on a face flipped 180°
- nested same-class elements spaced with `margin` — margins collapse, the parent moves instead

**Runtime (7 rules, real browser).** Requires actually running the animation:

- no animation was generated at all
- the rendered output is identical at every sampled point
- a visible jump at the loop boundary where the author intended seamlessness
- an element larger than its grid container being centred — centring silently fails
- a stagger whose last element does not finish within one cycle
- an element following `offset-path` drifting off the drawn line
- nested same-class elements sitting at identical positions

Runtime checks also classify cost as **compositor / paint / layout** from the animated
properties. This is a conservative classification from property names; it does not
guarantee what DevTools will report for actual layer assignment.

The rules themselves live in [scripts/checks/](scripts/checks/) and are called by three
callers — the browser page ([lab/verify.html](lab/verify.html)), the CLI, and the MCP
server. Written once, so one of them cannot go stale.

## Where this stands

| | Count |
|---|---:|
| Experiments | 211 |
| `keyframes`-driven | 182 |
| `state`-driven | 8 |
| `scroll`-driven | 13 |
| `interactive`-driven | 8 |
| Findings | 34 |
| Check rules | 8 static, 7 runtime |
| Judged by a human | 0 |

Machine verification on Chromium 150 reports nothing against all 182 keyframes-driven
experiments. The remaining 29 need state changes, scrolling, or pointer input, so they
are shown as **not verified at runtime** rather than folded into "clean".

**No human verdicts exist yet, and `dist/adopted.css` is empty.** That is deliberate.
Looking at 211 animations is beyond one person, and even a complete pass by one person
would only record one person's taste. The judgment is meant to be shared — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally

Node.js 22 or newer.

```bash
npm start
```

- <http://127.0.0.1:5757/lab/contact.html> — grid, filtering, comparison, judging
- <http://127.0.0.1:5757/lab/strip.html> — motion expanded into still frames
- <http://127.0.0.1:5757/lab/verify.html> — static and runtime verification, cost, feature matrix

The server binds to `127.0.0.1` only. It writes verdicts to disk, so it is not meant to
face the network. The public site serves the same screens read-only; verdicts stay in
the browser.

## How judgment is divided

Volume of generation is not the scarce resource. Human time spent watching motion is.
So the evaluation is split into three layers.

| Layer | What it decides | Who |
|---|---|---|
| Machine verification | File integrity, whether it moves, mismatch with stated intent, cost | scripts |
| Filmstrip | Trajectory, overshoot, how early it arrives | read as still frames |
| Taste | Whether it feels good, whether it fits the moment | humans |

`predicted: bad` is never silently treated as accepted; it is shown as a predicted
rejection. `predicted` is the author's prior guess, not a verdict.

### Judging keys

| Key | Action |
|---|---|
| `←` `↑` `↓` `→` | Move between experiments |
| `p` | Accept |
| `x` | Reject |
| `f` | Flag (undecided but interesting) |
| `s` | Star (use as a reference) |
| `z` | Clear the explicit verdict |
| `n` | Jump to the next undecided one |
| `t` | Flip the batch default between accept and reject |
| `Enter` | Zoom / unzoom |
| `Space` | Play / pause |
| `,` `.` | Step frames |
| `r` | Rewind |
| `e` | Cycle easing |
| `b` | Cycle subject |

### Verdict data

[verdicts.json](verdicts.json) is version 2. Each explicit verdict stores the state,
easing, subject, real-time cycle length, whether a hold was applied, browser and
viewport, and a timestamp. The same motion judged under different conditions is a
different data point, and that is worth more than a single collapsed answer.

Locally the file is replaced atomically from a temporary file after validation. On the
public site there is nothing to write back to, so verdicts stay in the browser and are
exported as JSON for a pull request. Submitted files land in [verdicts/](verdicts/) and
are aggregated into `dist/consensus.json`.

## Catalog layers

| Layer | Contents | Count |
|---|---|---:|
| L0 | One property, one motion — the atoms | 18 |
| L1 | Easing comparison | implemented as a global switch |
| L2 | Composition patterns | 15 |
| L3 | Stagger interval and ordering | 9 |
| L4 | Recipes fixed to a use case | 8 |
| T | Techniques combining CSS capabilities | 108 |
| E | Expression borrowed from comics, film, optics | 53 |

For T and E, index by `axes.technique` and `axes.use` rather than by motion name.
E additionally records `axes.origin`.

## Drive modes

| mode | Clock | How it is checked |
|---|---|---|
| unset (`keyframes`) | shared clock | play, scrub, step, freeze to stills |
| `state` | real time | state flips every 1.8s |
| `scroll` | scroll position | scroll inside each cell |
| `interactive` | user input | pointer, checkbox, text entry |

The three off-clock modes are badged in the grid and excluded from the filmstrip.

## Adding an experiment

Two files under `experiments/<id>/`:

```text
experiments/<id>/meta.json
experiments/<id>/anim.css
```

Ordinary selectors in `anim.css` must be scoped under `[data-exp="<id>"]`. The catalog
cycle is 1000ms, but an individual animation may finish earlier or repeat within it — so
`animation-duration` is stated only where it matters. Scroll-driven ones may use `auto`.

Required axes depend on the layer: `driver` for all; `target` / `timing` /
`orchestration` / `structure` for L; `technique` / `use` for T and E; `origin` for E.

## Verification

```bash
npm test
npm run validate
npm run export
```

`npm run validate` checks the one-to-one correspondence between `meta.json` and
`anim.css`, required metadata, duplicate ids and numbers, `data-exp` scoping, and verdict
states and referenced ids — including submitted files under `verdicts/`.

`npm run export` deterministically regenerates `catalog.json`, `dist/adopted.css`,
`dist/manifest.json` and `dist/consensus.json`. Only experiments explicitly marked `star`
in `verdicts.json` enter `adopted.css`. Adoption is not decided by majority vote — that
would leave only the safe and the average.

CI runs tests, validation, and checks that export produces no diff. A push to `main`
rebuilds the public site and deploys it to Cloudflare Workers
([wrangler.toml](wrangler.toml), [.github/workflows/cloudflare.yml](.github/workflows/cloudflare.yml)).
The Worker carries no script of its own — it serves static assets only.

## How it works

Experiment CSS is bundled into one stylesheet by the server (the static build emits the
same file). Every CSS animation is set to `animation-play-state: paused`, and progress
comes from assigning `currentTime` on the `CSSAnimation` objects returned by
`document.getAnimations()`, driven from a single shared clock.

That one mechanism gives all three things at once: comparison at identical phase,
freezing at an arbitrary point, and expansion into still frames.

The CLI uses the same mechanism. It drives headless Chrome over CDP and places arbitrary
CSS on the same footing as the catalog (`lab/common.css`), so a result measured here and
a result measured there mean the same thing.

## License

MIT
