/**
 * Run with: npm run test:reveal
 */
import assert from "node:assert/strict";
import { computeRevealKeyframes } from "../RevealAnimation.js";
import { HEADLINE_REVEAL, TWEET_REVEAL } from "../presets.js";
import { secondsToTicks } from "../../core/TimecodeUtils.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

console.log("RevealAnimation");

run("produces opacity fade-in/hold/fade-out and scale-to-target keyframes", () => {
  const keyframes = computeRevealKeyframes({
    startTicks: secondsToTicks(8),
    endTicks: secondsToTicks(14),
    targetScale: 165,
    targetPositionX: 100,
    targetPositionY: -50,
    config: HEADLINE_REVEAL,
    animationSpeed: 1,
  });

  const opacity = keyframes.filter((k) => k.property === "opacity");
  assert.equal(opacity.length, 4);
  assert.equal(opacity[0]!.value, 0);
  assert.equal(opacity[0]!.timeTicks, secondsToTicks(8));
  assert.equal(opacity[3]!.value, 0);
  assert.equal(opacity[3]!.timeTicks, secondsToTicks(14));

  const scale = keyframes.filter((k) => k.property === "scale");
  assert.equal(scale[0]!.value, HEADLINE_REVEAL.startScale);
  assert.equal(scale[scale.length - 1]!.value, 165);

  const positionX = keyframes.filter((k) => k.property === "positionX");
  assert.ok(positionX.every((k) => k.value === 100));
});

run("bounce presets add an overshoot scale keyframe above the target", () => {
  const keyframes = computeRevealKeyframes({
    startTicks: secondsToTicks(0),
    endTicks: secondsToTicks(5),
    targetScale: 100,
    targetPositionX: 0,
    targetPositionY: 0,
    config: TWEET_REVEAL,
    animationSpeed: 1,
  });
  const scaleValues = keyframes.filter((k) => k.property === "scale").map((k) => k.value);
  assert.equal(scaleValues.length, 3);
  assert.ok(scaleValues[1]! > 100, `expected an overshoot above 100, got ${scaleValues[1]}`);
});

run("slide offset shifts the starting positionY away from the target", () => {
  const keyframes = computeRevealKeyframes({
    startTicks: secondsToTicks(0),
    endTicks: secondsToTicks(5),
    targetScale: 100,
    targetPositionX: 0,
    targetPositionY: 200,
    config: TWEET_REVEAL, // slideOffsetPx = 60
    animationSpeed: 1,
  });
  const positionY = keyframes.filter((k) => k.property === "positionY");
  assert.equal(positionY[0]!.value, 200 + TWEET_REVEAL.slideOffsetPx);
  assert.equal(positionY[positionY.length - 1]!.value, 200);
});

run("clamps requested durations so they never exceed the item's own duration", () => {
  // HEADLINE_REVEAL wants fadeIn 0.35 + moveIn 0.6 + fadeOut 0.3 = 1.25s -- give it only 1s total.
  const keyframes = computeRevealKeyframes({
    startTicks: secondsToTicks(0),
    endTicks: secondsToTicks(1),
    targetScale: 120,
    targetPositionX: 0,
    targetPositionY: 0,
    config: HEADLINE_REVEAL,
    animationSpeed: 1,
  });
  const opacity = keyframes.filter((k) => k.property === "opacity");
  // Fade-out start must not be before fade-in end, and everything must stay inside [0, 1s].
  const fadeInEnd = opacity[1]!.timeTicks;
  const fadeOutStart = opacity[2]!.timeTicks;
  assert.ok(fadeOutStart >= fadeInEnd);
  assert.ok(opacity[3]!.timeTicks === secondsToTicks(1));
});

run("higher animationSpeed shortens the fade-in duration", () => {
  const slow = computeRevealKeyframes({
    startTicks: secondsToTicks(0),
    endTicks: secondsToTicks(10),
    targetScale: 100,
    targetPositionX: 0,
    targetPositionY: 0,
    config: HEADLINE_REVEAL,
    animationSpeed: 1,
  });
  const fast = computeRevealKeyframes({
    startTicks: secondsToTicks(0),
    endTicks: secondsToTicks(10),
    targetScale: 100,
    targetPositionX: 0,
    targetPositionY: 0,
    config: HEADLINE_REVEAL,
    animationSpeed: 2,
  });
  const slowFadeInEnd = slow.filter((k) => k.property === "opacity")[1]!.timeTicks;
  const fastFadeInEnd = fast.filter((k) => k.property === "opacity")[1]!.timeTicks;
  assert.ok(fastFadeInEnd < slowFadeInEnd);
});

run("rejects endTicks <= startTicks", () => {
  assert.throws(() =>
    computeRevealKeyframes({
      startTicks: secondsToTicks(5),
      endTicks: secondsToTicks(5),
      targetScale: 100,
      targetPositionX: 0,
      targetPositionY: 0,
      config: HEADLINE_REVEAL,
      animationSpeed: 1,
    })
  );
});

console.log("RevealAnimation: all assertions passed\n");
