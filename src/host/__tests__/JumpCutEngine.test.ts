/**
 * Run with: npm run test:jumpcut
 */
import assert from "node:assert/strict";
import { JumpCutEngine } from "../JumpCutEngine.js";
import { Logger } from "../../core/Logger.js";
import { secondsToTicks } from "../../core/TimecodeUtils.js";
import type { MarkerInfo } from "../PremiereTypes.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

function pauseMarker(startSeconds: number, endSeconds: number): MarkerInfo {
  return {
    name: "PAUSE",
    comment: "",
    startTicks: secondsToTicks(startSeconds),
    endTicks: secondsToTicks(endSeconds),
  };
}

const engine = new JumpCutEngine(new Logger("test", "error"));
console.log("JumpCutEngine");

run("findPauseRanges only matches markers named PAUSE fully inside the window", () => {
  const markers: MarkerInfo[] = [
    pauseMarker(2, 3),
    { name: "NOTE", comment: "", startTicks: secondsToTicks(4), endTicks: secondsToTicks(5) },
    pauseMarker(9, 11), // partially outside window [0,10)
  ];
  const found = engine.findPauseRanges(markers, secondsToTicks(0), secondsToTicks(10));
  assert.equal(found.length, 1);
  assert.equal(found[0]!.startTicks, secondsToTicks(2));
});

run("computeKeepSegments with no pauses returns a single full-window segment", () => {
  const segments = engine.computeKeepSegments(secondsToTicks(0), secondsToTicks(8), []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]!.sourceInTicks, secondsToTicks(0));
  assert.equal(segments[0]!.sourceOutTicks, secondsToTicks(8));
  assert.equal(segments[0]!.sequenceStartTicks, secondsToTicks(0));
  assert.equal(segments[0]!.sequenceEndTicks, secondsToTicks(8));
});

run("computeKeepSegments removes a middle pause and closes the gap", () => {
  const pauses = [pauseMarker(3, 4)];
  const segments = engine.computeKeepSegments(secondsToTicks(0), secondsToTicks(8), pauses);
  assert.equal(segments.length, 2);
  // First kept slice: source [0,3) placed at sequence [0,3).
  assert.equal(segments[0]!.sourceInTicks, secondsToTicks(0));
  assert.equal(segments[0]!.sourceOutTicks, secondsToTicks(3));
  assert.equal(segments[0]!.sequenceStartTicks, secondsToTicks(0));
  assert.equal(segments[0]!.sequenceEndTicks, secondsToTicks(3));
  // Second kept slice: source [4,8) but placed immediately after the first, at sequence [3,7).
  assert.equal(segments[1]!.sourceInTicks, secondsToTicks(4));
  assert.equal(segments[1]!.sourceOutTicks, secondsToTicks(8));
  assert.equal(segments[1]!.sequenceStartTicks, secondsToTicks(3));
  assert.equal(segments[1]!.sequenceEndTicks, secondsToTicks(7));
});

run("computeKeepSegments handles a pause touching the window start", () => {
  const pauses = [pauseMarker(0, 2)];
  const segments = engine.computeKeepSegments(secondsToTicks(0), secondsToTicks(5), pauses);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]!.sourceInTicks, secondsToTicks(2));
  assert.equal(segments[0]!.sequenceStartTicks, secondsToTicks(0));
  assert.equal(segments[0]!.sequenceEndTicks, secondsToTicks(3));
});

run("computeKeepSegments throws on overlapping pause markers", () => {
  const pauses = [pauseMarker(2, 4), pauseMarker(3, 5)];
  assert.throws(() => engine.computeKeepSegments(secondsToTicks(0), secondsToTicks(8), pauses));
});

console.log("JumpCutEngine: all assertions passed\n");
