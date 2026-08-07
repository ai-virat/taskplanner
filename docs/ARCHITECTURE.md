# Architecture

## Design principles

1. **The extension never decides the story.** Every cut, animation, and
   timing decision comes from the Timeline JSON. The extension is an
   execution engine, not a generator.
2. **JSON-driven, no hardcoded values.** Colors, durations, easing, zoom
   targets, margins, etc. all come from either the Timeline JSON (per-item)
   or `ExtensionOptions` (global defaults, editable in the panel). See
   `src/types/config.types.ts`.
3. **Modular, layered, testable independently of Premiere.** The core
   engine, host-orchestration logic, and animation math all have zero
   dependency on Premiere actually being installed -- they're unit-tested
   with plain Node against `MockPremiereHost` (see `npm test`). Only
   `PremiereHost.ts` and the UI's click handlers touch the real UXP APIs.

## Layers

```
src/
  types/            Pure TypeScript contracts (Timeline JSON schema, options).
                     No logic, no I/O.
    uxp-shims.d.ts     Ambient types for the host-injected "premierepro"/"uxp"
                       modules -- see the caveat at the top of that file.

  core/              Host-independent engine.
    TimecodeUtils.ts    Timecode string <-> seconds <-> Premiere ticks.
    TimelineParser.ts   Validates raw JSON -> NormalizedTimelineItem[].
    TranscriptParser.ts .srt/.vtt/.txt -> cues (reference/preview only).
    BatchProcessor.ts   Runs multiple videos through one TimelineBuilder,
                        one sequence per job, isolating per-job failures.
    Logger.ts           Leveled logger shared by every layer.
    errors.ts           Typed error classes (TimelineValidationError, MissingAssetError).

  host/              Premiere UXP host bridge.
    IPremiereHost.ts    The full contract the rest of the app depends on.
    PremiereHost.ts     Real adapter -- the ONLY file allowed to
                        `require("premierepro")`.
    MockPremiereHost.ts In-memory test double implementing the same contract.
    JumpCutEngine.ts    Pure pause-removal math (PAUSE markers -> keep segments).
    TimelineBuilder.ts  Orchestrator: import -> place talking-head (+ jump
                        cuts/punch-in) -> place B-roll (+ animations/annotations).

  animations/        Reusable, JSON-configurable motion preset engine.
    types.ts            RevealPresetConfig / AnimationPlan / AnnotationPlan.
    RevealAnimation.ts  Shared fade/scale/position/rotation timing math.
    presets.ts          The 10 named Motion Presets (Headline/Tweet/Document/
                        Article/Map/Graph/Statistics/Comparison/Browser/Photo
                        Reveal) as editable RevealPresetConfig data.
    AnnotationAnimations.ts  Arrow / Circle / Highlight-bar keyframe math.
    TalkingHeadAnimations.ts Punch-in keyframe math.
    SafeZoom.ts          Bonus: auto-center + clamp a zoomTarget to the
                        asset/safe-margin bounds.
    AnimationEngine.ts   Ties the above together per asset item.

  ui/                UXP panel.
    state.ts            ExtensionOptions store (localStorage-persisted).
    PanelController.ts  DOM wiring only -- delegates everything else to
                        core/host/animations.
index.html            Panel markup, loads dist/ui/PanelController.js.
```

## Data flow

```
Timeline JSON (+ asset folder listing)
        |
        v
TimelineParser.parse()            <- src/core/TimelineParser.ts
        |
        v
ParsedTimeline                    <- normalized items, seconds + ticks resolved,
                                      asset references checked
        |
        v
TimelineBuilder.build()           <- src/host/TimelineBuilder.ts
   ├─ talking-head: JumpCutEngine computes keep-segments from PAUSE markers,
   │  each segment placed on track 0; punch-in keyframes applied if requested
   └─ B-roll: AnimationEngine resolves a preset + zoomTarget/arrows/circles/
      highlight into keyframes, placed on track 1 (+ annotation clips on
      track 2, if a graphics template is configured for that annotation kind)
        |
        v
IPremiereHost                     <- PremiereHost.ts applies it all to the
                                      real active sequence via the UXP API
        v
Professional Timeline (in Premiere)
```

## Why "ticks" and not frames

Premiere's UXP/ExtendScript scripting APIs position everything on a
sequence using a fixed-rate integer clock ("ticks"), not frame numbers, so
that edits remain accurate regardless of the sequence's frame rate/timebase.
`TimecodeUtils` is the single place that performs this conversion
(`PREMIERE_TICKS_PER_SECOND = 254_016_000_000`), so no other module
hardcodes the tick rate or does its own rounding.

## Honest limitations (read before running on a real project)

This was built and fully tested in a sandbox with **no Premiere Pro
instance available** -- everything host-independent (parsing, jump-cut
math, animation math, orchestration logic) is verified by `npm test` (63
assertions, `npm run build` clean under strict TypeScript), and the panel
UI was smoke-tested in a headless browser. What could **not** be verified
against real Premiere:

- **`src/types/uxp-shims.d.ts` and `src/host/PremiereHost.ts`**: Adobe's
  `premierepro` UXP module's exact method names/signatures are modeled
  from the published scripting guide, not verified against a running
  instance. `IPremiereHost` is the real contract the rest of the app is
  built against, so a mismatch here is an isolated fix in these two files.
- **`getSequenceFrameSize()`, `getAssetDimensions()`, `createSequence()`**
  in `PremiereHost.ts` are explicitly flagged (with a `logger.warn` or a
  thrown error) as needing their exact host API confirmed -- they don't
  silently pretend to work.
- **Arrow/circle/highlight-bar annotations** are placed as clips using a
  graphic template you configure in `ExtensionOptions.graphicsTemplates`
  (a `.mogrt`/Essential Graphics asset you author once) -- the extension
  computes correct growth/bounce/fade keyframes for it but does not
  generate vector graphics from nothing. An annotation with no template
  configured is skipped with a warning, not silently dropped or faked.

## Status

| Module | Contents | Status |
|---|---|---|
| 1 | Project scaffold, types, `TimecodeUtils`, `TimelineParser`, `Logger` | **Done**, tested |
| 2 | Premiere host bridge: `IPremiereHost`, `PremiereHost`, `MockPremiereHost`, `JumpCutEngine`, `TimelineBuilder` | **Done**, tested against `MockPremiereHost`; `PremiereHost`'s exact API calls need on-host verification (see above) |
| 3 | Animation preset engine: 10 Motion Presets, arrow/circle/highlight-bar math, punch-in, safe zoom | **Done**, tested |
| 4 | UXP panel UI (import buttons, Generate/Update Timeline, Options) | **Done**, smoke-tested in a headless browser |
| 5 | Bonus: batch processing (done), intelligent safe zoom (done, see `SafeZoom.ts`); OCR/auto-paragraph-detection (not built -- see README) | Partially done |
