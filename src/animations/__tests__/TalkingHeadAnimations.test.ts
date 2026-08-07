/**
 * Run with: npm run test:talkinghead
 */
import assert from "node:assert/strict";
import { computePunchInKeyframes } from "../TalkingHeadAnimations.js";
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

console.log("TalkingHeadAnimations");

run("eases from 100% to the target scale and holds (no exit keyframe)", () => {
  const keyframes = computePunchInKeyframes(secondsToTicks(20), secondsToTicks(30), 115, 1);
  assert.equal(keyframes.length, 2);
  assert.equal(keyframes[0]!.value, 100);
  assert.equal(keyframes[0]!.timeTicks, secondsToTicks(20));
  assert.equal(keyframes[1]!.value, 115);
  assert.ok(keyframes[1]!.timeTicks > keyframes[0]!.timeTicks);
  assert.ok(keyframes[1]!.timeTicks <= secondsToTicks(30));
});

run("clamps the ease duration to half the segment on very short segments", () => {
  const keyframes = computePunchInKeyframes(secondsToTicks(0), secondsToTicks(0.4), 120, 1);
  const easeEnd = keyframes[1]!.timeTicks;
  assert.ok(easeEnd <= secondsToTicks(0.2));
});

run("rejects endTicks <= startTicks", () => {
  assert.throws(() => computePunchInKeyframes(secondsToTicks(5), secondsToTicks(5), 110, 1));
});

console.log("TalkingHeadAnimations: all assertions passed\n");
