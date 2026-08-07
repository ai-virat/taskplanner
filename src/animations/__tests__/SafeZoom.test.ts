/**
 * Run with: npm run test:safezoom
 */
import assert from "node:assert/strict";
import { computeSafeZoom } from "../SafeZoom.js";
import { DEFAULT_EXTENSION_OPTIONS } from "../../types/config.types.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

console.log("SafeZoom");

run("centers the target point with no clamping when there's plenty of room", () => {
  const result = computeSafeZoom({
    assetWidthPx: 4000,
    assetHeightPx: 3000,
    frameWidthPx: 1920,
    frameHeightPx: 1080,
    target: { x: 2000, y: 1500, scale: 150 },
    safeMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  assert.equal(result.positionX, 0); // target is already at the asset's center
  assert.equal(result.positionY, 0);
  assert.equal(result.clamped, false);
});

run("bumps scale up to avoid letterboxing when the requested scale is too low", () => {
  const result = computeSafeZoom({
    assetWidthPx: 1000,
    assetHeightPx: 1000,
    frameWidthPx: 1920,
    frameHeightPx: 1080,
    target: { x: 500, y: 500, scale: 50 }, // way too zoomed out for a 1000x1000 asset on a 1920x1080 frame
    safeMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  assert.ok(result.scale > 50);
  assert.equal(result.clamped, true);
});

run("clamps position so the visible crop never exceeds the asset bounds", () => {
  const result = computeSafeZoom({
    assetWidthPx: 2000,
    assetHeightPx: 1500,
    frameWidthPx: 1920,
    frameHeightPx: 1080,
    target: { x: 1950, y: 1490, scale: 300 }, // target near the far corner, zoomed in a lot
    safeMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  assert.equal(result.clamped, true);
  // position should be clamped, not simply centered exactly on the (near-corner) target
  const naivePositionX = 1000 - 1950;
  assert.notEqual(result.positionX, naivePositionX);
});

run("larger safe margins require a higher minimum scale", () => {
  const noMargins = computeSafeZoom({
    assetWidthPx: 3000,
    assetHeightPx: 2000,
    frameWidthPx: 1920,
    frameHeightPx: 1080,
    target: { x: 1500, y: 1000, scale: 100 },
    safeMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const withMargins = computeSafeZoom({
    assetWidthPx: 3000,
    assetHeightPx: 2000,
    frameWidthPx: 1920,
    frameHeightPx: 1080,
    target: { x: 1500, y: 1000, scale: 100 },
    safeMargins: DEFAULT_EXTENSION_OPTIONS.safeMargins,
  });
  assert.ok(withMargins.scale >= noMargins.scale);
});

run("rejects non-positive dimensions/scale", () => {
  const base = {
    assetWidthPx: 100,
    assetHeightPx: 100,
    frameWidthPx: 100,
    frameHeightPx: 100,
    target: { x: 50, y: 50, scale: 100 },
    safeMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  };
  assert.throws(() => computeSafeZoom({ ...base, assetWidthPx: 0 }));
  assert.throws(() => computeSafeZoom({ ...base, target: { x: 50, y: 50, scale: 0 } }));
});

console.log("SafeZoom: all assertions passed\n");
