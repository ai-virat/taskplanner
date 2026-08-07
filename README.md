# AI Documentary Editor

A Premiere Pro UXP extension that automates the repetitive editing work in
talking-head documentary videos (Vox / Johnny Harris / Dhruv Rathee / Nitish
Rajput style): jump cuts on the talking head, and JSON-driven B-roll motion
graphics (headlines, tweets, documents, screenshots, maps, graphs).

**The extension executes a predefined edit plan. It does not decide the
story, the cuts, or the pacing** -- those come from the Timeline JSON you
provide (typically produced upstream from your transcript + asset review).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full module
breakdown and design principles.

## What's in this delivery (Module 1 of 4-5)

This is the first increment of an intentionally incremental build (see
`docs/ARCHITECTURE.md` for the full roadmap). It ships the **core timeline
engine** -- the part everything else depends on -- fully working, tested,
and with zero Premiere dependency so it can be verified right now, without
Premiere installed:

- `src/types/timeline.types.ts` -- the Timeline JSON schema as TypeScript types
  (`talking_head`, `headline`, `tweet`, `document`, `screenshot`, `map`,
  `graph`, `photo`, `statistics`, `comparison`, `browser`, `article`, plus
  `zoomTarget`, `highlight`, `arrow`, `circle` configs).
- `src/types/config.types.ts` -- global, editable options (animation speed,
  highlight color, arrow style, transition style, default zoom, safe
  margins, motion blur) matching the "Options" section of the planned UI.
- `src/core/TimecodeUtils.ts` -- `"HH:MM:SS"` / `"HH:MM:SS.mmm"` /
  `"HH:MM:SS:FF"` parsing, plus conversion to/from Premiere's internal
  "ticks" clock.
- `src/core/TimelineParser.ts` -- validates a raw Timeline JSON document:
  required fields, valid item types, `end > start`, no overlapping
  talking-head segments, no overlapping B-roll segments, and (optionally)
  that every referenced `asset` filename actually exists in your imported
  asset folder. Produces a normalized, time-resolved structure ready for
  the animation/host-bridge layers.
- `src/core/Logger.ts`, `src/core/errors.ts` -- shared logging and typed
  errors (`TimelineValidationError`, `MissingAssetError`).
- `manifest.json` -- a real UXP plugin manifest targeting Premiere Pro
  (`PPRO`), so the project is already loadable in the UXP Developer Tool
  once the panel UI (module 4) lands.
- `sample-data/example.timeline.json` -- the schema example from the spec,
  extended with jump cuts, a punch-in, a document with an arrow, and mixed
  `fade` / `quick_cut` return transitions.
- Tests for both `TimecodeUtils` and `TimelineParser` (framework-free,
  runnable with plain Node via `tsx`).

## Coming next

- **Module 2 -- Premiere host bridge**: talks to the real Premiere UXP API
  to import media, place talking-head clips, execute jump cuts, remove
  pauses at markers, apply punch-ins, and cut back to the talking head at
  the exact JSON timestamps.
- **Module 3 -- Animation preset engine**: the reusable, configurable
  motion presets (Headline/Tweet/Document/Article/Map/Graph/Statistics/
  Comparison/Browser/Photo Reveal, highlight bars, arrows, circles),
  each a pure function producing a keyframe plan the host bridge applies.
- **Module 4 -- Panel UI**: the actual "AI Documentary Editor" panel
  (Import Video / Transcript / Assets / JSON, Generate Timeline, Generate
  Animations, Update Timeline, Options).
- **Module 5 (bonus, optional)**: OCR headline detection, auto paragraph
  bounds, auto-arrow generation, intelligent safe-zoom, batch processing.

## Project structure

```
.
├── manifest.json              UXP plugin manifest (host: Premiere Pro)
├── index.html                 Panel entry point (placeholder until module 4)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                Library barrel export
│   ├── types/
│   │   ├── timeline.types.ts   Timeline JSON schema
│   │   └── config.types.ts     Global extension options
│   ├── core/
│   │   ├── TimecodeUtils.ts
│   │   ├── TimelineParser.ts
│   │   ├── Logger.ts
│   │   ├── errors.ts
│   │   └── __tests__/
│   ├── host/                   (module 2, empty for now)
│   ├── animations/
│   │   └── presets/             (module 3, empty for now)
│   └── ui/                     (module 4, empty for now)
├── sample-data/
│   └── example.timeline.json
├── icons/                       (drop a 48x48 + 23x23 PNG here before loading in Premiere)
└── docs/
    └── ARCHITECTURE.md
```

## Installation

### Prerequisites

- Node.js 18+
- Adobe Premiere Pro 2024 (24.x) or later, for eventual on-host testing
- [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) (UDT), for loading the panel into Premiere once module 4 ships

### Set up and verify this module

```bash
npm install
npm run build      # compiles src/ -> dist/ with tsc, strict mode, zero errors
npm test           # runs the TimecodeUtils + TimelineParser test suites
```

Expected output ends with:

```
TimecodeUtils: all assertions passed
TimelineParser: all assertions passed
```

### Try the parser against the sample plan

```ts
import { readFileSync } from "node:fs";
import { TimelineParser } from "./src/core/TimelineParser.js";

const raw = JSON.parse(readFileSync("sample-data/example.timeline.json", "utf-8"));
const parser = new TimelineParser({
  availableAssets: ["headline_01.png", "tweet_01.png", "report.pdf"],
});
const parsed = parser.parse(raw);

console.log(parsed.durationSeconds);     // 45
console.log(parsed.talkingHeadItems.length); // 4
console.log(parsed.assetItems.length);       // 3
```

### Loading in Premiere (once module 4 ships)

1. Add a 48x48 and 23x23 PNG under `icons/` (referenced by `manifest.json`).
2. Open the UXP Developer Tool -> "Add Plugin" -> select this project's
   `manifest.json`.
3. Load the plugin against your running Premiere Pro instance.
4. The "AI Documentary Editor" panel will appear under `Window > Extensions`.

## Notes on the Timeline JSON contract

The extension is deliberately "dumb" about story: it only executes what's
in the JSON. See `sample-data/example.timeline.json` for a worked example
and `src/types/timeline.types.ts` for the full schema, including per-item
overrides for highlight color, zoom target, arrows, circles, and return
transition (`fade` vs `quick_cut`).
