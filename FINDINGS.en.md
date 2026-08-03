# Findings

[日本語](FINDINGS.md) · **English**

Per-browser reproduction is recorded separately in [BROWSER_SUPPORT.md](BROWSER_SUPPORT.md).

**What did not work is recorded as fully as what did.** This is what the repository
ultimately contains.

The record format is fixed.

- **Claim** — stated in one sentence
- **Evidence** — which experiment established it
- **Confidence** — `measured` / `spec-derived` / `hypothesis`
- **Effect** — what this finding actually changes

---

## F001 A CSS animation can be driven entirely from outside by assigning `currentTime`

- **Claim** — With `animation-play-state: paused`, assigning to `currentTime` on the objects returned by `element.getAnimations()` pins a CSS animation to any point of progress.
- **Evidence** — The clock in `lab/lab.js`. Confirmed by driving 18 experiments at identical phase simultaneously.
- **Confidence** — measured (Chromium)
- **Effect** — Comparison at identical phase, freezing at an arbitrary point, and expansion into still frames all arrive from one mechanism rather than three. It is the foundation for building any tool that compares animations.

## F002 `getAnimations()` returns empty immediately after DOM insertion

- **Claim** — Right after inserting an element, style resolution has not run and the CSS animations do not exist yet.
- **Evidence** — The initial implementation of `lab/strip.html`. Calling `getAnimations()` immediately after insertion returned zero, and every frame froze at the `from` state.
- **Confidence** — measured
- **Effect** — Code that touches animations right after creating them must wait two frames. It fails silently into "every frame looks the same", which is hard to notice.

## F003 `offset-path: path()` does not follow the size of its box

- **Claim** — `path()` coordinates are absolute, so where the reference box is small the element travels outside and disappears. Basic shapes (`ellipse()` / `circle()` / `rect()`) can be written in `%` and do follow.
- **Evidence** — `experiments/orbit`. A `path()` written for a 150px stage went completely off-screen in the 118px filmstrip. Switching to `ellipse(30% 26%)` worked in both.
- **Confidence** — measured
- **Effect** — `path()` cannot be used if a motion path is to be distributed as a reusable part. Check first whether the shape can be expressed with a basic shape.

## F004 ease-out curves finish in the first 30% of their duration

- **Claim** — With `cubic-bezier(0.22, 1, 0.36, 1)`, output reaches 78% at 25% of the time. Sampling frames at equal intervals makes the whole second half identical.
- **Evidence** — Comparison of even and front-weighted sampling in `lab/strip.html`.
- **Confidence** — measured
- **Effect** — When examining an animation as stills, sample densely in the first part rather than by real time. Put the other way: the felt duration of ease-out is far shorter than the stated one. A stated 600ms should be designed as roughly 200ms of felt time.

## F005 Elevation via `box-shadow` presumes a light base surface

- **Claim** — Expressing height with shadow alone depends on the underlying surface being light. On a dark background the shadow sinks into it and nothing appears to happen.
- **Evidence** — `experiments/lift`. Invisible on the dark stage; only legible once the stage was made light.
- **Confidence** — measured
- **Effect** — Expressing elevation in a dark theme requires something other than shadow — a lightness step on the surface, or a glowing edge. Distributing shadow as a general-purpose part is risky.

## F006 `skew` has no individual property, so it cannot compose with other transforms

- **Claim** — `translate` / `rotate` / `scale` exist as individual properties and can be driven simultaneously from separate animations, but `skew` occupies `transform` and therefore collides with any other transform.
- **Evidence** — `experiments/skew`. The CSS Transforms Level 2 specification.
- **Confidence** — spec-derived
- **Effect** — In a design that builds molecules from atoms, `skew` is the single atom that cannot compose. From L2 onward, combinations involving `skew` need separate handling.

## F007 Animating `letter-spacing` on centred text moves only one side

- **Claim** — `letter-spacing` also adds space after the last character. On centred text this pushes only the trailing side, so the last character appears pinned while only the first one moves.
- **Evidence** — `experiments/track`. Measured the left edge of each character in "Aa". Before the fix, `a` never moved from 937.5px while `A` moved 8.2px. Cancelling the trailing space with an equal negative margin gave `A` +4.5px and `a` −4.5px — symmetrical.
- **Confidence** — measured
- **Effect** — A letter-spacing effect written with the intent of "opening from the centre" will always skew. Cancelling it requires referencing the animating value, so the value must be typed as a `<length>` via `@property` and referenced from both `letter-spacing` and `margin-inline-end`. An example of a seemingly simple effect that demands a typed custom property.

## F008 Stagger can be written in pure CSS without numbering the markup

- **Claim** — `animation-delay: calc((sibling-index() - 1) * 110ms)` produces a sequence. No `--i` on each element.
- **Evidence** — Compared the computed `animation-delay` of `experiments/stagger-index` and `experiments/stagger-head`. The former (CSS only) and the latter (hand-written `--i`) both gave exactly `0s / 0.11s / 0.22s / 0.33s / 0.44s`. `CSS.supports()` also returns true.
- **Confidence** — measured (Chromium)
- **Effect** — Stagger becomes distributable as a reusable part. Previously it required either `nth-child` rules per element count or the generator filling in `--i`, which was the main reason stagger could not be made into a library. Being able to write it independently of element count means the L3 orchestration patterns can be shipped as they are.
- **Browser measurement (2026-08-02)** — Supported in Safari 26.5, unsupported in Firefox 153. Where unsupported the whole `calc()` becomes invalid and the delay falls to 0 (everything at once), so the degradation is quiet and easy to miss.

## F009 The difference between simultaneous, lagged and split easing is perceptible

- **Claim** — Given the same two motions (position and opacity), whether they run together, with a lag, or under separate easings is visibly distinguishable.
- **Evidence** — Verdicts on `experiments/sim` / `lag` / `split-ease` placed side by side.
- **Confidence** — measured (human verdict)
- **Effect** — Not only "what moves" but "how they are layered" stands as an independent design axis. Organising the layering patterns yields more than enumerating combinations of atoms.

## F010 The boundary between "one mass" and "individuals" in stagger sits near 150ms (provisional)

- **Claim** — In a five-element sequence, individuals begin to read separately at an interval of 150ms. At 110ms and below it reads as one mass.
- **Evidence** — Verdicts on `experiments/stagger-head` (110ms) / `stagger-dense` (45ms) / `stagger-sparse` (150ms).
- **Confidence** — **provisional**. Whether the boundary is the absolute interval or the overlap ratio (interval divided by duration) has not been separated.
- **Progress** — A follow-up with duration fixed at 400ms (`gap-40` / `gap-80` / `gap-120` / `gap-150`) again put 150ms (ratio 0.38) at "just barely individual". But that follow-up only changed the duration from 380ms to 400ms, so absolute value and ratio still cannot be separated. Only a design that **fixes the interval and varies the duration widely** can distinguish them. The same mistake was made twice.
- **What is known** — 110–120ms reads as one mass; it switches to individual at 150ms. Across durations of 380–520ms this boundary does not move.

## F011 Moving parent and child in opposite directions does not by itself produce depth

- **Claim** — A parent rising while its contents move down does not read as parallax on its own; it merely looks misaligned. Depth requires cues beyond motion.
- **Evidence** — Verdict on `experiments/counter`: "doesn't look like depth", "I think it's the card's material".
- **Confidence** — measured (human verdict)
- **Effect** — Parallax cannot be distributed as a motion pattern. It only works together with cues that say "there is an object here" — a face, an edge, a shadow, contents. There is a region where motion design and material design cannot be separated.
- **Follow-up** — Adding shadow, perspective, depth of field or card material — none produced depth. However, that follow-up was contaminated by F012 and cannot be treated as a conclusion.

## F012 The appearance of the subject itself contaminates the verdict

- **Claim** — The default subject (a rounded square with a diagonal gradient) reads as a swelling object. The meaning that appearance carries leaks into the evaluation of the motion.
- **Evidence** — The observation made when four different depth cues all failed: "the card itself is coloured like it's swelling, so none of them read as depth". No depth expression works on top of an object already trying to come forward.
- **Confidence** — measured (human verdict)
- **Effect** — The substrate must be treated as an axis independent of motion. The `b` key now cycles gradient / flat / paper / outline. From here on, any verdict involving material must be taken over several substrates. **Every verdict taken before this must be read as a gradient-substrate verdict.**

## F034 On a face flipped by `rotateY(180deg)`, asymmetric values are mirrored

- **Claim** — Values written on a flipped face must describe not the shape you want on screen but the shape that results after mirroring. Corner radii, shadow direction, gradient direction and asymmetric padding are all affected.
- **Evidence** — `experiments/page-turn`. Writing the same `border-radius: 4px 8px 8px 4px` on both faces gave the back face a swap: 8px at the bound edge and 4px on the outside. At the instant of the flip the rounding jumps to the opposite side. Writing the pre-mirrored `8px 4px 4px 8px` on the back face made them match on screen.
- **Confidence** — measured
- **Effect** — It never occurs on faces with only symmetric values (uniform radius, centre-symmetric shadow), so design proceeds without noticing. It surfaces only once an asymmetric decoration is added.

## F033 Rotation is decided not by "angle" but by "the axis, and what waits where it lands"

- **Claim** — A rotating motion does not work by matching angle to appearance. Where the axis sits and what is waiting at the end of the turn must both be designed.
- **Evidence** — Three experiments broke for the same reason. `experiments/page-turn` placed the leaf and the "revealed page" on the same side, so the turning leaf covered the page it should have revealed (measurement showed the final leaf exactly overlapping the next page). `experiments/rig-chain` spaced the joints with `margin`, which collapsed and stacked all five levels at the same position. `experiments/origami` opened into a shape that overflowed the stage.
- **Confidence** — measured
- **Effect** — When building 3D motion, place **both** the static start and the static end first, then fill the gap with rotation. Starting from the angle leaves the end state undesigned.

## F032 Choose how to create individual variation according to the expression

- **Claim** — There are two ways to differentiate multiple elements, and the expression decides which is available. Where **phase difference is the substance of the expression** (waves, formations, crowds, flows), use negative delays. Where **simultaneity is the substance** (freezing, impact, en-masse reveal), avoid delay and differentiate by amplitude or distance instead.
- **Evidence** — `experiments/time-stop`. Carrying over "create variation with negative delays", which worked in other experiments, shifted each element's frozen interval to a different moment, and measurement showed supporting elements still moving during the freeze (at t=450 only the fifth was 12px off; at t=600 all of them diverged). Dropping the delay and using three different vertical amplitudes gave exactly matching positions at three points during the freeze.
- **Confidence** — measured
- **Effect** — Must be remembered together with F021 (negative delay requires `infinite`). Negative delay is powerful but **cannot be used by any expression that requires a shared time axis**.

## F031 `pathLength` stops working when combined with `non-scaling-stroke`

- **Claim** — Length normalisation via `pathLength` is nullified by `vector-effect="non-scaling-stroke"`. Dash lengths are interpreted in device coordinates, so the value written in `stroke-dasharray` no longer matches the drawn length.
- **Evidence** — `experiments/eye-path`. With `pathLength="100"` and `stroke-dasharray: 100`, `getTotalLength()` returned 153 and the on-screen length was about 296px. `dasharray: 100px` was treated as device coordinates and only a third of the line was drawn. Removing `non-scaling-stroke` drew the full length correctly.
- **Confidence** — measured (Chromium)
- **Effect** — **What matters more is why `non-scaling-stroke` was added in the first place.** Two coordinate systems (SVG and HTML) were reconciled by stretching with `preserveAspectRatio: none`; the stretching distorted the stroke, which was compensated with `non-scaling-stroke`, which broke the dashes. **A chain where each fix causes the next defect** — the correct repair was to undo the first decision (mixing coordinate systems). Put both the dots and the boxes inside the SVG and neither stretching nor compensation is needed.

## F030 `scroll-state` container queries parse but are never evaluated

- **Claim** — `container-type: scroll-state` and `@container scroll-state(...)` are accepted syntactically, yet the contents never apply even when the condition holds.
- **Evidence** — Confirmed with a minimal reproduction. Inside a scroll container, an element with `position: sticky; top: 0; container-type: scroll-state`, with rules changing a child's appearance under both `scroll-state(stuck: top)` and `scroll-state(scrollable: top)`. The element was genuinely stuck (1px from the top) and there was 100px of scroll, yet neither the child's height nor its background changed. The rules appear in `CSSStyleSheet.cssRules`, and `CSS.supports('container-type','scroll-state')` returns `true`. `@container style()` works in the same document, so it is `scroll-state` alone that is inert, not container queries as a whole.
- **Confidence** — measured (Chromium), with the caveat below
- **Effect** — The same "declaration accepted but ineffective" shape as F023 (`::marker`) and F028 (`d`) — the fourth of its kind. **Parsing and functioning must be treated as separate things.** For now, changing a heading on stickiness is realistically done with `animation-timeline: scroll()` and an explicit range.
- **Caveat** — Rendering is stopped in this measurement environment, and scroll-driven animations also report `currentTime` as `null` there. The possibility that the inertness of `scroll-state` is a side effect of stopped rendering has not been excluded. Re-confirmation in a normally rendering browser is needed.

## F029 An element larger than its container is not centred by `place-items: center`

- **Claim** — Grid centring does not apply when the element is larger than the container. It is placed with its top-left corner coinciding with the container's top-left.
- **Evidence** — `experiments/god-rays`. A 260px element in a 115px container with `place-items: center` gave a measured centre offset of **(72, 71)px** — exactly the value expected if the element's top-left aligns with the container's top-left. `speed-lines` (260px) and `impact-frame` (150px) were in the same state.
- **Confidence** — measured (Chromium)
- **Effect** — Expressions that **deliberately overflow the frame** — speed lines, light shafts, ripples — almost always meet this condition. Worse, it still looks correctly centred while the container is wide enough, so **it only breaks once the viewport narrows**. A defect that is noticed late.
- **Workaround** — `position: absolute` with `left/top: 50%` and a negative `margin` of half the size. `translate: -50% -50%` also centres it, but `translate` is often needed for the motion itself and the two would contend. `margin` does not collide with the motion.

## F028 `d` only works on `<path>` — and computed values cannot tell you whether it worked

- **Claim** — The CSS `d` property is `<path>`-only. Specified on `<circle>` or `<rect>` it appears in the computed value but changes nothing about the rendering.
- **Evidence** — `experiments/boil`. Animating `d: path(...)` across three states on a `<circle>`, `getComputedStyle(el).d` returned three different path strings. But measuring points on the outline with `getPointAtLength` gave a **maximum movement of 0px** across the three states. Switching to `<path>` produced 8.4px of movement (2.8× the stroke width).
- **Confidence** — measured (Chromium)
- **Effect** — The same shape as F023 (`::marker`). **A declaration being accepted does not mean it takes effect.** Each SVG shape element has its own geometry properties (`r` / `cx` / `width`); only `<path>` accepts `d`. If a shape is to be interpolated, write it as a `<path>` from the start.
- **Lesson for verification** — Here I judged "the computed value changes across three states, therefore it is moving" — and was **wrong**. A computed value shows only that a style was applied, not that it reached the rendering. Style verification must use **measured shape or position**, not computed values. APIs that return geometry — `getBBox()`, `getPointAtLength()` — or measuring the element's rectangle are the correct instruments.

## F027 `overflow: hidden` hijacks `scroll(nearest)`

- **Claim** — `overflow: hidden` creates a scroll container. If an intermediate element has it, `scroll(nearest)` picks that one up. That element never scrolls, so no progress is produced and nothing moves.
- **Evidence** — `experiments/scroll-marquee`. The outer scroll container was intended, but the band carrying `overflow: hidden` was selected as the nearest one. The timeline's source resolved to `.band` and `currentTime` was permanently invalid. Switching to a named timeline (`scroll-timeline: --smq` / `animation-timeline: --smq`) made the source the intended element.
- **Confidence** — measured
- **Effect** — An `overflow: hidden` placed to clip overflow breaks a scroll-driven animation that looks unrelated to it. **No error, no warning — it simply does not move.** In structures with clipping on intermediate elements, avoid `scroll(nearest)` and name the timeline explicitly. If clipping is the only goal, `overflow: clip` creates no scroll container and also avoids it.
- **Note on measurement** — Where rendering is stopped, even a correctly working scroll-driven animation reports `currentTime` as `null`. Diagnose by the **timeline's source**, not by progress.

## F026 Sticky only stops within the range of its own parent

- **Claim** — To stack stuck headings, the headings must be laid directly under the scroll container. Putting them in per-section containers makes each heading flow away with its section.
- **Evidence** — `experiments/sticky-stack`. With sections wrapped in `div`s, the first heading flowed to `y = -20` during scrolling and disappeared. Removing the wrappers and laying headings and body text under the same parent kept all three at `0 / 22 / 44px`.
- **Confidence** — measured
- **Effect** — The look of "headings staying at the top" only holds together with a structural constraint. Wrapping sections for decoration breaks it, so if wrapping is necessary, move the sticky element to a different level.
- **Concurrent error** — `:nth-of-type()` was used for the level numbering, but it counts **position among elements of the same type** and is not narrowed by class. Both headings and body text were `div`s, so it never matched from the second heading on. Deriving from ordinal position is less error-prone with `sibling-index()`.

## F025 Subtrees under `content-visibility: auto` are missed by `getAnimations({subtree:true})`

- **Claim** — A subtree whose rendering is skipped is excluded from the traversal of `getAnimations({subtree: true})`. Querying the element directly still returns its animations, so what disappears is the traversal, not the animation.
- **Evidence** — `experiments/content-vis`. With `content-visibility: auto` on 5 of 10 items, `getAnimations({subtree:true})` from the parent returned only 5. Calling `getAnimations()` on each element directly showed all 10 had one each.
- **Confidence** — measured (Chromium)
- **Effect** — When writing a tool that traverses and controls animations, **a miss does not raise an exception**. This research environment's clock is also driven by subtree traversal, so an experiment using `content-visibility` in a long list may be out of the clock's reach. To include skipped parts, elements must be walked individually.

## F024 `::first-letter` loses the declaration entirely (a different failure from `::marker`)

- **Claim** — Writing `animation-name` on `::first-letter` produces a computed value of `none`. The declaration itself is not accepted.
- **Evidence** — `experiments/first-letter`. `getComputedStyle(p, '::first-letter').animationName` is `none`, whereas `::marker` retains the same declaration as a computed value (F023).
- **Confidence** — measured (Chromium)
- **Effect** — **The same wish to animate a pseudo-element fails in two different ways.** `::marker` keeps the declaration but generates no animation; `::first-letter` erases the declaration. The former is more confusing precisely because the declaration is visible in devtools. The workaround is the same for both: replace or wrap with a real element. Pseudo-elements are usable for appearance but cannot be relied on as animation targets.

## F023 Animations do not work on `::marker` (though the declaration is accepted)

- **Claim** — Specifying `animation-name` on `::marker` applies as a computed value, but no animation is generated. No error, no warning — it simply does not move.
- **Evidence** — `experiments/marker-anim`. `getComputedStyle(li, '::marker').animationName` returns `exp-marker-anim`, yet not a single `::marker` animation appears in `getAnimations({subtree:true})`. The `::before` in the same cell generates three.
- **Confidence** — measured (Chromium)
- **Effect** — Animating a list marker requires `list-style: none` and a hand-placed `::before`. Because the declaration is accepted, the cause of "I wrote it and it doesn't move" is hard to reach. A declaration being accepted does not mean it moves.

## F022 `animation-iteration-composite: accumulate` is unusable

- **Claim** — The declaration that accumulates onto the previous result on each iteration is unsupported in Chromium. It is ignored and every iteration returns to the initial value.
- **Evidence** — `experiments/iter-accumulate`. `CSS.supports('animation-iteration-composite', 'accumulate')` is false. Repeating 90° four times to reach 360° does not work; it just bounces 90° four times.
- **Confidence** — measured (Chromium)
- **Effect** — There is currently no way to state "the amount per iteration" and "the time per iteration" separately. The total must be written directly into the keyframes, so changing only the speed means touching the angle declaration. The experiment is kept as a negative result, with the working alternative placed beside it.

## F021 Shifting phase with negative delays requires `animation-iteration-count: infinite`

- **Claim** — Giving each element a negative delay to shift its phase does not work while the iteration count stays at 1. Elements with larger delays reach the end sooner and stop there under `fill-mode`. In a closed motion the end and the start are the same position, so they pile up at a single point in the order they stop.
- **Evidence** — `experiments/orbit-train`. Eight elements offset by 1/8 of a period each "did not flow evenly but gathered at one point". `gooey`, `ripple`, `pulse-badge` and `wave-text` collapsed at the end for the same reason. Adding `animation-iteration-count: infinite` makes the phase wrap modulo the period and keeps the spacing even all the way round.
- **Confidence** — measured
- **Effect** — "Give the same animation progressively negative delays and a formation appears" is powerful but **unusable without infinite repetition**. Conversely, a positive-delay sequence is correct with a single iteration — the two require different settings. This asymmetry is easy to miss.

## F017 A seamless flow needs enough copies for "container width plus one period"

- **Claim** — A flow built by repeating content and moving it by one period is not satisfied by two copies. After moving one period the tail does not reach the viewport and a gap opens on the right.
- **Evidence** — `experiments/marquee`. With a 230px container, a 200px period and two copies (400px total), moving 200px shows the window 200–430px while the content ends at 400px, leaving a 30px gap. Four copies (800px total) moved 25% (one period) resolved it.
- **Confidence** — measured
- **Effect** — The requirement is **total copy width − one period ≥ container width**. The widely circulated "two copies and -50%" only holds when one period is at least the container width. For variable widths, either add copies or make the period at least as wide as the container.

## F018 Adding rotation destroys softness

- **Claim** — Adding rotation to a motion that deforms an outline turns the contents too, so it reads as a rotating solid rather than a soft mass.
- **Evidence** — `experiments/blob`. The version animating the eight `border-radius` values alongside `rotate: 360deg` was judged "not liquid". Removing the rotation and substituting a non-uniform `scale` produced softness.
- **Confidence** — measured (human verdict)
- **Effect** — When the deformation is what should be seen, do not rotate the element itself. If rotation is unavoidable, the contents must be counter-rotated to cancel it. Also, deforming `border-radius` alone stops at "soft mass" and **does not read as liquid**. Liquidity comes only from `gooey`'s merging (blur then high contrast).

## F019 A symmetric shape can be slowed without breaking the seam

- **Claim** — If a rotating element has n-fold symmetry, one cycle can be 360°/n and it still joins seamlessly. The speed can be divided by n.
- **Evidence** — `experiments/liquid`. A square with a uniform 44% corner radius has 4-fold symmetry. `rotate: 360deg` was judged "too fast", so it was changed to `90deg`, giving a quarter of the speed with no visible seam.
- **Confidence** — measured
- **Effect** — A way to tune speed inside a fixed-duration mechanism. Conversely, rotating an asymmetric shape requires a full turn and the speed is dictated by the cycle length.
- **What sets the amplitude** — The size of the wave is set by two things. **The smaller the corner radius**, the longer the straight sections of the edge and the greater the height difference when rotating. **The smaller the mass relative to the window**, the stronger the curvature within the visible range. Enlarging the mass flattens it toward a horizontal line and the wave disappears. Additionally, overlaying a counter-rotating second layer makes the phases interfere and removes the monotony of a simple rise and fall. The counter-rotation also holds its seam at −90° given 4-fold symmetry.

## F020 "What is happening" does not come across without context

- **Claim** — Even when the motion itself is correct, it is not read as the intended phenomenon without surrounding cues.
- **Evidence** — `experiments/mask-hole`. The technique punches a hole in a cover and moves it, but with a plain gradient underneath and the cover the same colour as the background, it was judged "just a circle moving". Laying contents underneath (numbered tiles) and adding seams to the cover so it reads as a sheet made it legible as a hole.
- **Confidence** — measured (human verdict)
- **Effect** — A continuation of F012 (the substrate contaminates the verdict). An experiment that demonstrates a technique must be designed together with **the minimum scene that shows what the technique is doing**. Some techniques do not work on a bare square.

## F015 Fixing the use case down to a UI component still does not settle the answer

- **Claim** — Narrowing the scene to "modal" or "toast" still does not produce a ranking. What decides is not the kind of component but the **attention cost, origin and repetition tolerance** the scene carries.
- **Evidence** — "It depends on the use" came back at all three levels: atoms (rotation amount of `spin`), composition (lag amount of `lag`), recipes (modal, toast). In every case the difference was perceptible yet no ranking emerged. Only the heading's `head-chars` drew clear support — explicable by the fact that headings are not seen repeatedly, so a type with low repetition tolerance is affordable.
- **Confidence** — measured (human verdict)
- **Effect** — The shape of the deliverable has to change. A "use this type for this purpose" table cannot be written in principle. What can be written are **character tags per type**, with the choice left to the caller. [PATTERNS.en.md](PATTERNS.en.md) was rewritten in that form. Shipped as a library or as MCP, what should be returned is not "the one correct answer" but "a list filterable by character".

## F016 Opening a list's height is settled in favour of grid-template-rows

- **Claim** — `grid-template-rows: 0fr → 1fr` and `interpolate-size: allow-keywords` with `height: auto` are visually indistinguishable. Given no difference, take the one with broader support.
- **Evidence** — Comparative verdict on `experiments/list-grid` and `experiments/list-size`: "no difference". Both end at 0px → 20px.
- **Confidence** — measured
- **Effect** — The practical answer to the long-standing "you cannot transition to `height: auto`" is settled on one option. `interpolate-size` reads more directly, but that alone is not a reason to choose it.

## F014 `document.getAnimations()` also returns CSSTransition

- **Claim** — The return value of `document.getAnimations()` mixes `CSSAnimation` and `CSSTransition`. Assigning `currentTime` without distinguishing them fast-forwards transitions to the assigned time and they finish instantly.
- **Evidence** — Every L4 recipe was in a state of "changing instantly". Measurement showed that of 112 objects, 100 were `CSSAnimation` and 12 were `CSSTransition`. The clock was assigning 1000ms every frame to transitions of 200–380ms. Only `CSSAnimation` has `animationName`, which distinguishes them.
- **Confidence** — measured
- **Effect** — Any tool that drives animations from outside must handle the two separately. A transition, which has no time axis, must not be driven on a time axis.
- **Lesson for verification** — This bug slipped past a verification that "disabled the transition and read the computed value at the end state". **An end state being correct does not guarantee that the path to it is correct.** Verifying motion requires values at intermediate times, or a way to actually look at it.

## F013 Comparison without a fixed use case does not work

- **Claim** — Asking "is A or B better" without a use case produces no answer. It produces only "it depends on the use".
- **Evidence** — Repeated twice. Rotation amount of `spin` ("at this level it depends on the use; both are right") and lag amount of `lag` ("I don't know. It depends on the use, surely"). In both, the difference was perceptible yet no ranking emerged.
- **Confidence** — measured (human verdict)
- **Effect** — Experiment designs that try to rank types in isolation are wrong. **Fix the use case first (modal, list, toast, heading) and compare types within it.** Rather than climbing the ladder of abstraction from the bottom, put the use case first and pull the types it needs. The question put to a judge must be not "which is better" but "which of these suits this use".
