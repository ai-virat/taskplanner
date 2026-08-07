/**
 * Run with: npm run test:annotations
 */
import assert from "node:assert/strict";
import {
  computeArrowAnnotation,
  computeCircleAnnotation,
  computeHighlightBarAnnotation,
} from "../AnnotationAnimations.js";
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

console.log("AnnotationAnimations");

run("circle annotation scales 0 -> 100 and centers on the given point", () => {
  const plan = computeCircleAnnotation(
    secondsToTicks(0),
    secondsToTicks(3),
    { x: 500, y: 300, radius: 80 },
    1
  );
  const scale = plan.keyframes.filter((k) => k.property === "scale");
  assert.equal(scale[0]!.value, 0);
  assert.equal(scale[scale.length - 1]!.value, 100);
  const positionX = plan.keyframes.find((k) => k.property === "positionX");
  assert.equal(positionX!.value, 500);
});

run("circle annotation respects an explicit bounce: false override", () => {
  const plan = computeCircleAnnotation(
    secondsToTicks(0),
    secondsToTicks(3),
    { x: 0, y: 0, radius: 10, bounce: false },
    1
  );
  const scaleValues = plan.keyframes.filter((k) => k.property === "scale").map((k) => k.value);
  assert.equal(scaleValues.length, 2, "no overshoot keyframe should be present when bounce is false");
});

run("arrow annotation anchors position at the tail point", () => {
  const plan = computeArrowAnnotation(
    secondsToTicks(30),
    secondsToTicks(38),
    { from: { x: 200, y: 400 }, to: { x: 420, y: 460 } },
    1
  );
  const positionX = plan.keyframes.find((k) => k.property === "positionX");
  const positionY = plan.keyframes.find((k) => k.property === "positionY");
  assert.equal(positionX!.value, 200);
  assert.equal(positionY!.value, 400);
});

run("highlight bar requires coordinates", () => {
  assert.throws(() =>
    computeHighlightBarAnnotation(secondsToTicks(0), secondsToTicks(2), { text: "no coords" }, 1)
  );
});

run("highlight bar grows then fades, anchored at the rectangle's left edge / vertical center", () => {
  const plan = computeHighlightBarAnnotation(
    secondsToTicks(30),
    secondsToTicks(38),
    { coordinates: { x: 200, y: 400, width: 300, height: 60 } },
    1
  );
  const scale = plan.keyframes.filter((k) => k.property === "scale");
  assert.equal(scale[0]!.value, 0);
  assert.equal(scale[1]!.value, 100);

  const positionX = plan.keyframes.find((k) => k.property === "positionX");
  const positionY = plan.keyframes.find((k) => k.property === "positionY");
  assert.equal(positionX!.value, 200);
  assert.equal(positionY!.value, 400 + 30); // y + height/2

  const opacity = plan.keyframes.filter((k) => k.property === "opacity");
  assert.equal(opacity[0]!.value, 0);
  assert.equal(opacity[opacity.length - 1]!.value, 0);
  assert.equal(opacity[opacity.length - 1]!.timeTicks, secondsToTicks(38));
});

console.log("AnnotationAnimations: all assertions passed\n");
