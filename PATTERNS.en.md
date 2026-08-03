# Motion types and their character

[日本語](PATTERNS.md) · **English**

You cannot write "use this motion for modals." At all three layers the answer came back
as "it depends on the use" (F013 and F015 in [FINDINGS.en.md](FINDINGS.en.md)). What
decides is not the kind of UI component, but the properties of the moment it appears in.

So this table **states no ranking**. It describes the character of each type and leaves
the choice to whoever is using it.

## The axes of the decision

| Axis | In plain terms | How to check it |
|---|---|---|
| **Attention cost** | Scanning a grid, which one does your eye land on first | Look at a grid for a few seconds and name what you saw first |
| **Origin** | Whether the motion tells you where the thing came from | Whether it has direction. Determined by mechanism, so it needs no judgment call |
| **Repetition tolerance** | Whether it grates when the same motion recurs | Play the grid on repeat with no pause and watch for a few seconds |

Use it like this. Types with high attention cost go on things that appear rarely. Types
with low repetition tolerance cannot go on things that appear many times per session.
Types that reveal origin go where you want the source to be legible.

**Repetition tolerance multiplies with a property of the moment.** A heading is seen once,
so it can afford a type with low repetition tolerance. The same type on a toast is too
much. That is most likely why `head-chars` was supported while `toast-pop` never became
decisive.

## Character of each type

The confidence column says whether a verdict backs it (**judged**) or whether it is
derived from the mechanism (**proposed**).

| Type | Attention | Origin | Repetition | Confidence |
|---|---|---|---|---|
| `fade` opacity only, in place | low | no | high | proposed |
| `rise` / `slide` directional movement | medium | **yes** | medium | proposed |
| `pop` enter by scaling up | medium | no | medium | proposed |
| `shrink` enter by scaling down | medium | no | medium | judged (peer of `pop`, different use) |
| `wipe` / `mask-sweep` reveal | medium | no | high | proposed |
| `blur` releasing a blur | medium | no | low | proposed (also expensive) |
| `overshoot` past the mark, then settle | **high** | no | **low** | proposed |
| `spin` rotation | depends on amount | no | depends on amount | judged ("both are right") |
| `stagger` sequential | medium | shows order | medium | judged (changes with interval) |
| `counter` parent and child in opposite directions | — | — | — | judged (**meaningless on its own**) |

## Composition patterns

The differences are perceptible but carry no ranking (F009). Use them as differences in
character.

| Type | Effect |
|---|---|
| `sim` position and opacity together | Plain. The baseline |
| `lag` opacity first, position trailing | Arrival gets heavier. Reads as composed |
| `split-ease` position decelerates, opacity is linear | Motion stays smooth while presence rises evenly |
| `add` additive composition | Not a character but a mechanism. Lets two animations on the same property add instead of the later one winning |

## Stagger interval

The verdicts were taken at 0.9× speed, so these are stated in **real time**.

| Real-time interval | How it reads |
|---|---|
| up to ~108ms | reads as one mass |
| around 135ms | just begins to separate into individuals |

Across durations of 340–470ms this boundary did not move. Whether the absolute interval
or the overlap ratio is what matters has not been separated (F010). For practical use —
**around 100ms to read as one mass, 140ms or more to make them countable one by one** —
this is enough as it stands.

## Choices that settled

| Question | Conclusion | Why |
|---|---|---|
| How to open a list's height | **`grid-template-rows: 0fr → 1fr`** | Visually indistinguishable, and works in more browsers than `interpolate-size` |
| How a heading enters | **per-character sequencing** (`sibling-index()`) | Supported by verdicts. Headings are not repeated, so low repetition tolerance costs nothing |

## Choices that did not settle

| Question | State |
|---|---|
| How a modal opens | No winner. Opening in place = low attention, no origin; lifting from below = medium attention, has origin. Choose by character |
| How a toast appears | No winner. From the side = suits repetition; springing from below = suits rare notifications. Choose by character |

These are not treated as "we could not decide." They are treated as a result:
**no single correct answer exists**.

## Coverage of these verdicts

This table is not a summary of all 211 experiments. The verdict data is currently empty
and 194 experiments remain undecided. A type is added here as **judged** only when the
conditions of the evaluation remain in [verdicts.json](verdicts.json) and the comparison
set and reasoning can be explained.

In the grid, judging happens by filtering on layer, drive mode, prediction, verdict, and
index axis, then deciding within a small set that shares a use or a technique. Results
from grading all 211 at once in absolute terms are not used as evidence for this table.
