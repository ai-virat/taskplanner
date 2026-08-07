/**
 * Run with: npm run test:transcript
 */
import assert from "node:assert/strict";
import { detectTranscriptFormat, parseTranscript } from "../TranscriptParser.js";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

console.log("TranscriptParser");

run("detects format from extension, case-insensitively", () => {
  assert.equal(detectTranscriptFormat("interview.SRT"), "srt");
  assert.equal(detectTranscriptFormat("interview.vtt"), "vtt");
  assert.equal(detectTranscriptFormat("notes.txt"), "txt");
  assert.throws(() => detectTranscriptFormat("interview.docx"));
});

run("parses SRT cues with comma-decimal timestamps", () => {
  const srt = [
    "1",
    "00:00:00,000 --> 00:00:04,000",
    "Hello world.",
    "",
    "2",
    "00:00:04,500 --> 00:00:08,250",
    "Second line",
    "across two words.",
    "",
  ].join("\n");
  const cues = parseTranscript(srt, "srt");
  assert.equal(cues.length, 2);
  assert.equal(cues[0]!.text, "Hello world.");
  assert.equal(cues[0]!.startSeconds, 0);
  assert.equal(cues[0]!.endSeconds, 4);
  assert.equal(cues[1]!.text, "Second line across two words.");
  assert.equal(cues[1]!.endSeconds, 8.25);
});

run("parses VTT cues, skipping the WEBVTT header", () => {
  const vtt = ["WEBVTT", "", "00:00:00.000 --> 00:00:04.000", "Hello world.", ""].join("\n");
  const cues = parseTranscript(vtt, "vtt");
  assert.equal(cues.length, 1);
  assert.equal(cues[0]!.text, "Hello world.");
  assert.equal(cues[0]!.startSeconds, 0);
  assert.equal(cues[0]!.endSeconds, 4);
});

run("parses plain TXT as untimed lines", () => {
  const cues = parseTranscript("Line one.\n\nLine two.\n", "txt");
  assert.equal(cues.length, 2);
  assert.equal(cues[0]!.startSeconds, undefined);
  assert.equal(cues[1]!.text, "Line two.");
});

run("skips malformed SRT blocks without a timing line", () => {
  const srt = ["not a real block", "", "1", "00:00:00,000 --> 00:00:01,000", "Real cue.", ""].join("\n");
  const cues = parseTranscript(srt, "srt");
  assert.equal(cues.length, 1);
  assert.equal(cues[0]!.text, "Real cue.");
});

console.log("TranscriptParser: all assertions passed\n");
