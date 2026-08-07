/**
 * Run with: npm run test:animation-engine
 */
import assert from "node:assert/strict";
import { AnimationEngine } from "../AnimationEngine.js";
import { TimelineParser, type NormalizedTimelineItem } from "../../core/TimelineParser.js";
import { DEFAULT_EXTENSION_OPTIONS } from "../../types/config.types.js";
import type { AssetTimelineItem } from "../../types/timeline.types.js";
import { Logger } from "../../core/Logger.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

const parser = new TimelineParser({ logger: new Logger("test", "error") });
const engine = new AnimationEngine();

function headlineItem(overrides: Record<string, unknown> = {}): NormalizedTimelineItem<AssetTimelineItem> {
  const parsed = parser.parse({
    timeline: [
      { type: "talking_head", start: "00:00:00", end: "00:00:08" },
      {
        type: "headline",
        asset: "headline_01.png",
        start: "00:00:08",
        end: "00:00:14",
        ...overrides,
      },
    ],
  });
  return parsed.assetItems[0]!;
}

console.log("AnimationEngine");

run("resolves the type default preset when no explicit preset is given", () => {
  const { presetName, warnings } = engine.resolve(headlineItem(), DEFAULT_EXTENSION_OPTIONS);
  assert.equal(presetName, "headline_reveal");
  assert.equal(warnings.length, 0);
});

run("falls back with a warning for an unknown explicit preset name", () => {
  const { presetName, warnings } = engine.resolve(
    headlineItem({ preset: "does_not_exist" }),
    DEFAULT_EXTENSION_OPTIONS
  );
  assert.equal(presetName, "headline_reveal");
  assert.equal(warnings.length, 1);
});

run("without a zoomTarget, uses options.defaultZoom and no pan", () => {
  const { plan } = engine.resolve(headlineItem(), DEFAULT_EXTENSION_OPTIONS);
  const scaleKeyframes = plan.baseKeyframes.filter((k) => k.property === "scale");
  assert.equal(scaleKeyframes[scaleKeyframes.length - 1]!.value, DEFAULT_EXTENSION_OPTIONS.defaultZoom);
});

run("with a zoomTarget but no pixel dimensions, uses the target directly and warns", () => {
  const { plan, warnings } = engine.resolve(
    headlineItem({ zoomTarget: { x: 1450, y: 620, scale: 165 } }),
    DEFAULT_EXTENSION_OPTIONS
  );
  const scaleKeyframes = plan.baseKeyframes.filter((k) => k.property === "scale");
  assert.equal(scaleKeyframes[scaleKeyframes.length - 1]!.value, 165);
  assert.ok(warnings.some((w) => w.includes("safe-zoom clamping skipped")));
});

run("with pixel dimensions, applies safe-zoom clamping", () => {
  const { plan } = engine.resolve(
    headlineItem({ zoomTarget: { x: 100, y: 100, scale: 100 } }), // tiny asset corner, low scale
    DEFAULT_EXTENSION_OPTIONS,
    { assetDimensionsPx: { width: 200, height: 200 }, frameDimensionsPx: { width: 1920, height: 1080 } }
  );
  const scaleKeyframes = plan.baseKeyframes.filter((k) => k.property === "scale");
  // A 200x200 asset can't fill a 1920x1080 frame at 100% -- expect the engine to have bumped scale up.
  assert.ok(scaleKeyframes[scaleKeyframes.length - 1]!.value > 100);
});

run("quick_cut return transition removes the trailing fade-out", () => {
  const { plan } = engine.resolve(
    headlineItem({ returnTransition: "quick_cut" }),
    DEFAULT_EXTENSION_OPTIONS
  );
  const opacity = plan.baseKeyframes.filter((k) => k.property === "opacity");
  // Last two opacity keyframes should both be 100 (no fade to 0) since fadeOutSeconds was zeroed.
  assert.equal(opacity[opacity.length - 1]!.value, 100);
});

run("fade return transition (default) keeps the trailing fade-out to 0", () => {
  const { plan } = engine.resolve(headlineItem(), DEFAULT_EXTENSION_OPTIONS);
  const opacity = plan.baseKeyframes.filter((k) => k.property === "opacity");
  assert.equal(opacity[opacity.length - 1]!.value, 0);
});

run("arrows/circles/highlight produce one annotation each", () => {
  const { plan } = engine.resolve(
    headlineItem({
      arrows: [{ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
      circles: [{ x: 5, y: 5, radius: 20 }],
      highlight: { coordinates: { x: 0, y: 0, width: 100, height: 20 } },
    }),
    DEFAULT_EXTENSION_OPTIONS
  );
  const kinds = plan.annotations.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ["arrow", "circle", "highlightBar"]);
});

run("string highlight (no coordinates) is skipped with a warning, not an error", () => {
  const { plan, warnings } = engine.resolve(
    headlineItem({ highlight: "Government announces..." }),
    DEFAULT_EXTENSION_OPTIONS
  );
  assert.equal(plan.annotations.length, 0);
  assert.equal(warnings.length, 0); // plain string highlight is a normal, expected case, not a warning
});

console.log("AnimationEngine: all assertions passed\n");
