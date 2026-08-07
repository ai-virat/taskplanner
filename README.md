# AI Documentary Editor

A Premiere Pro UXP extension that automates the repetitive editing work in
talking-head documentary videos (Vox / Johnny Harris / Dhruv Rathee / Nitish
Rajput style): jump cuts on the talking head, and JSON-driven B-roll motion
graphics (headlines, tweets, documents, screenshots, maps, graphs).

**The extension executes a predefined edit plan. It does not decide the
story, the cuts, or the pacing** -- those come from the Timeline JSON you
provide (typically produced upstream from your transcript + asset review).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full module
breakdown, data flow, and (important) the **honest limitations** section
covering what could and couldn't be verified without a real Premiere
instance.

## What's built

All 5 modules from the spec:

1. **Core timeline engine** -- Timeline JSON schema types, timecode/tick
   conversion, a validating `TimelineParser` (structural checks, overlap
   detection, asset-reference cross-checking), and an `.srt`/`.vtt`/`.txt`
   `TranscriptParser`.
2. **Premiere host bridge** -- `IPremiereHost` contract with a real UXP
   adapter (`PremiereHost`) and an in-memory test double
   (`MockPremiereHost`); `JumpCutEngine` for marker-based pause removal;
   `TimelineBuilder` orchestrating the full build (import, place
   talking-head clips with jump cuts/punch-in, place B-roll with
   animations/annotations).
3. **Animation preset engine** -- a shared reveal-animation math core
   parameterized into the 10 named Motion Presets from the spec
   (Headline/Tweet/Document/Article/Map/Graph/Statistics/Comparison/
   Browser/Photo Reveal), plus arrow/circle/highlight-bar annotation math,
   talking-head punch-in, and a bonus "intelligent safe zoom" auto-center.
4. **Panel UI** -- the actual "AI Documentary Editor" panel (Import Video /
   Transcript / Assets / JSON, Generate Timeline, Generate Animations,
   Update Timeline, Options), smoke-tested in a headless browser.
5. **Bonus** -- batch processing across multiple videos (`BatchProcessor`,
   one sequence per job, per-job failure isolation) and intelligent safe
   zoom. OCR/auto-paragraph-detection was **not** built -- see
   [Scope decisions](#scope-decisions-read-this) below for why.

**Test coverage**: `npm test` runs 63 assertions across 10 framework-free
Node test files (core parsing, jump-cut math, animation math, and the full
`TimelineBuilder` orchestration against `MockPremiereHost`). `npm run
build` is clean under strict TypeScript.

## Scope decisions (read this)

This was built in a sandbox with **no Premiere Pro instance available**.
Everything host-independent is real, tested code. Two things could not be:

- **`src/host/PremiereHost.ts`'s exact Adobe UXP API calls.** Adobe's
  `premierepro` module surface is modeled from the published scripting
  guide, not verified against a running instance. `IPremiereHost` is the
  real contract the rest of the app is built and tested against, so a
  signature mismatch here is an isolated fix in that one file (and
  `src/types/uxp-shims.d.ts`). Three methods that needed a genuinely
  uncertain API call are explicitly flagged with a `logger.warn` (frame
  size, asset dimensions -- default to 1080p rather than fail) or a
  thrown, actionable error (`createSequence` -- fails loudly rather than
  silently reusing the wrong sequence).
- **Arrow/circle/highlight-bar rendering.** The extension computes correct
  growth/bounce/fade/position keyframes for these, but doesn't generate
  vector graphics from nothing -- it drives an editor-authored graphic
  template (`.mogrt`/Essential Graphics asset) that you configure once via
  `ExtensionOptions.graphicsTemplates`. This matches how these reusable
  annotations are actually made in real editing workflows; an annotation
  with no template configured is skipped with a clear warning, not
  silently dropped.
- **OCR / auto-paragraph-detection (bonus, spec marked optional)**: not
  implemented. It would need a real image-processing dependency (e.g.
  tesseract.js) and real screenshots to validate against, neither of which
  could be meaningfully verified here -- rather than ship an unverified
  integration, this was left out. The rest of the bonus list (batch
  processing, intelligent safe zoom, dynamic easing via `animationSpeed`)
  is implemented and tested.

## Project structure

```
.
├── manifest.json              UXP plugin manifest (host: Premiere Pro)
├── index.html                 Panel markup, loads dist/ui/PanelController.js
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                Library barrel export
│   ├── types/
│   │   ├── timeline.types.ts   Timeline JSON schema
│   │   ├── config.types.ts     Global extension options
│   │   └── uxp-shims.d.ts      Ambient types for the "premierepro"/"uxp" host modules
│   ├── core/
│   │   ├── TimecodeUtils.ts
│   │   ├── TimelineParser.ts
│   │   ├── TranscriptParser.ts
│   │   ├── BatchProcessor.ts
│   │   ├── Logger.ts
│   │   ├── errors.ts
│   │   └── __tests__/
│   ├── host/
│   │   ├── IPremiereHost.ts
│   │   ├── PremiereHost.ts
│   │   ├── MockPremiereHost.ts
│   │   ├── JumpCutEngine.ts
│   │   ├── TimelineBuilder.ts
│   │   ├── PremiereTypes.ts
│   │   └── __tests__/
│   ├── animations/
│   │   ├── RevealAnimation.ts
│   │   ├── presets.ts
│   │   ├── AnnotationAnimations.ts
│   │   ├── TalkingHeadAnimations.ts
│   │   ├── SafeZoom.ts
│   │   ├── AnimationEngine.ts
│   │   ├── types.ts
│   │   └── __tests__/
│   └── ui/
│       ├── state.ts
│       └── PanelController.ts
├── sample-data/
│   └── example.timeline.json
├── icons/                       (drop a 48x48 + 23x23 PNG here before loading in Premiere)
└── docs/
    └── ARCHITECTURE.md
```

## Installation

### Prerequisites

- Node.js 18+
- Adobe Premiere Pro 2024 (24.x) or later
- [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) (UDT), for loading the panel into Premiere

### Set up and verify

```bash
npm install
npm run build      # compiles src/ -> dist/ with tsc, strict mode, zero errors
npm test           # runs all 10 test suites (63 assertions)
```

### Try the parser + builder against the sample plan (no Premiere needed)

```ts
import { readFileSync } from "node:fs";
import { TimelineParser } from "./src/core/TimelineParser.js";
import { TimelineBuilder } from "./src/host/TimelineBuilder.js";
import { MockPremiereHost } from "./src/host/MockPremiereHost.js";
import { DEFAULT_EXTENSION_OPTIONS } from "./src/types/config.types.js";

const raw = JSON.parse(readFileSync("sample-data/example.timeline.json", "utf-8"));
const parsed = new TimelineParser({
  availableAssets: ["headline_01.png", "tweet_01.png", "report.pdf"],
}).parse(raw);

const host = new MockPremiereHost();
const result = await new TimelineBuilder(host).build({
  parsed,
  talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
  assetFolderAbsolutePath: "/assets",
  options: DEFAULT_EXTENSION_OPTIONS,
});

console.log(result); // placedTalkingHeadClips, placedAssetClips, warnings, ...
console.log(host.activeClips()); // exactly what would have been placed on a real sequence
```

### Loading in Premiere

1. Add a 48x48 and 23x23 PNG under `icons/` (referenced by `manifest.json`).
2. Open the UXP Developer Tool -> "Add Plugin" -> select this project's
   `manifest.json`.
3. Load the plugin against your running Premiere Pro instance.
4. The "AI Documentary Editor" panel appears under `Window > Extensions`.
5. Import your talking-head video, transcript (optional, reference-only),
   asset folder, and Timeline JSON, then click **Generate Timeline**.
6. If you want arrow/circle/highlight-bar annotations rendered, author
   those as `.mogrt` graphics once and point
   `ExtensionOptions.graphicsTemplates` at them (via the panel's future
   template-path fields, or directly in `src/ui/state.ts`'s defaults).
7. **Before trusting output on a real project**, sanity-check
   `PremiereHost.ts` against your Premiere version -- see "Scope
   decisions" above. If a method name doesn't match, the fix is isolated
   to that one file.

## Notes on the Timeline JSON contract

The extension is deliberately "dumb" about story: it only executes what's
in the JSON. See `sample-data/example.timeline.json` for a worked example
and `src/types/timeline.types.ts` for the full schema, including per-item
overrides for highlight color, zoom target, arrows, circles, and return
transition (`fade` vs `quick_cut`).
