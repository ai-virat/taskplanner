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
   engine (types, timecode math, JSON validation) has zero dependency on
   the UXP/Premiere host APIs, so it's unit-testable with plain Node (see
   `npm test`). Only the host-bridge and UI layers touch Premiere.

## Layers

```
src/
  types/            Pure TypeScript contracts (Timeline JSON schema, options).
                     No logic, no I/O.

  core/              Host-independent engine.
    TimecodeUtils.ts   Timecode string <-> seconds <-> Premiere ticks.
    TimelineParser.ts  Validates raw JSON -> NormalizedTimelineItem[].
    Logger.ts          Leveled logger shared by every layer.
    errors.ts          Typed error classes (TimelineValidationError, MissingAssetError).

  host/  (module 2)  Premiere UXP host bridge. Wraps the Premiere Pro UXP
                     scripting API (project/sequence/track/clip/keyframe
                     operations). This is the ONLY layer allowed to call
                     into `require("premierepro")`.

  animations/  (module 3)
    presets/          One file per reusable motion preset (HeadlineReveal,
                       TweetReveal, DocumentReveal, ArrowAnnotation,
                       CircleAnnotation, HighlightBar, ...). Each preset is a
                       pure function: (NormalizedTimelineItem, ExtensionOptions)
                       -> a declarative list of keyframe operations, which the
                       host bridge then applies. Presets do not call the
                       Premiere API directly -- this keeps them unit-testable
                       and reusable/editable independent of the host.

  ui/  (module 4)    UXP panel (index.html + panel controller). Talks only
                     to core/ and host/, never re-implements validation or
                     animation logic itself.
```

## Data flow

```
Timeline JSON (+ asset folder listing)
        |
        v
TimelineParser.parse()          <- src/core/TimelineParser.ts
        |
        v
ParsedTimeline                  <- normalized items, seconds + ticks resolved,
                                    asset references checked
        |
        v
Animation preset resolution     <- module 3: per-item type -> preset -> keyframe plan
        |
        v
Premiere host bridge            <- module 2: applies clips/keyframes/markers
        |                            to the active sequence via the UXP API
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

## Status

| Module | Contents | Status |
|---|---|---|
| 1 | Project scaffold, types, `TimecodeUtils`, `TimelineParser`, `Logger` | **Done** (this delivery) |
| 2 | Premiere host bridge (import media, place clips, jump cuts, pause removal, punch-in, markers) | Planned |
| 3 | Animation preset engine (headline/tweet/document/screenshot/arrow/circle/highlight-bar presets) | Planned |
| 4 | UXP panel UI (import buttons, Generate/Update Timeline, Options) | Planned |
| 5 | Bonus: OCR headline detection, auto paragraph bounds, auto-arrow generation, batch processing | Planned, optional |
