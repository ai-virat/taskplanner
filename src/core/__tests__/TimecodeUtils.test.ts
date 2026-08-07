/**
 * Standalone smoke test (no test framework) for TimecodeUtils.
 * Run with: npm run test:timecode
 */
import assert from "node:assert/strict";
import {
  parseTimecodeToSeconds,
  secondsToTicks,
  ticksToSeconds,
  formatSecondsToTimecode,
  PREMIERE_TICKS_PER_SECOND,
  TimecodeParseError,
} from "../TimecodeUtils.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

console.log("TimecodeUtils");

run("parses whole-second HH:MM:SS", () => {
  assert.equal(parseTimecodeToSeconds("00:00:08"), 8);
  assert.equal(parseTimecodeToSeconds("01:02:03"), 3723);
});

run("parses fractional HH:MM:SS.mmm", () => {
  assert.equal(parseTimecodeToSeconds("00:00:01.500"), 1.5);
  assert.equal(parseTimecodeToSeconds("00:00:00.010"), 0.01);
});

run("parses frame-based HH:MM:SS:FF given a frame rate", () => {
  assert.equal(parseTimecodeToSeconds("00:00:01:12", 24), 1.5);
});

run("rejects frame-based timecode without a frame rate", () => {
  assert.throws(() => parseTimecodeToSeconds("00:00:01:12"), TimecodeParseError);
});

run("rejects out-of-range minutes/seconds", () => {
  assert.throws(() => parseTimecodeToSeconds("00:60:00"), TimecodeParseError);
  assert.throws(() => parseTimecodeToSeconds("00:00:60"), TimecodeParseError);
});

run("rejects garbage input", () => {
  assert.throws(() => parseTimecodeToSeconds("not-a-timecode"), TimecodeParseError);
});

run("seconds <-> ticks round-trip", () => {
  const ticks = secondsToTicks(10);
  assert.equal(ticks, 10n * PREMIERE_TICKS_PER_SECOND);
  assert.equal(ticksToSeconds(ticks), 10);
});

run("formats seconds back to timecode", () => {
  assert.equal(formatSecondsToTimecode(3723.5), "01:02:03.500");
});

console.log("TimecodeUtils: all assertions passed\n");
