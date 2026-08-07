/**
 * Standalone smoke test (no test framework) for TimelineParser.
 * Run with: npm run test:parser
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TimelineParser } from "../TimelineParser.js";
import { TimelineValidationError, MissingAssetError } from "../errors.js";
import { Logger } from "../Logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(__dirname, "../../../sample-data/example.timeline.json");

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

const quietLogger = new Logger("test", "error");
console.log("TimelineParser");

run("parses the bundled example.timeline.json end to end", () => {
  const raw = JSON.parse(readFileSync(samplePath, "utf-8"));
  const parser = new TimelineParser({
    logger: quietLogger,
    availableAssets: ["headline_01.png", "tweet_01.png", "report.pdf"],
  });
  const parsed = parser.parse(raw);

  assert.equal(parsed.items.length, 7);
  assert.equal(parsed.talkingHeadItems.length, 4);
  assert.equal(parsed.assetItems.length, 3);
  assert.equal(parsed.durationSeconds, 45);

  const headline = parsed.assetItems.find((n) => n.item.type === "headline")!;
  assert.equal(headline.startSeconds, 8);
  assert.equal(headline.endSeconds, 14);
  assert.equal(headline.durationSeconds, 6);
});

run("rejects a document missing the top-level timeline array", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  assert.throws(() => parser.parse({}), TimelineValidationError);
  assert.throws(() => parser.parse([]), TimelineValidationError);
});

run("rejects an unknown item type", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  assert.throws(
    () =>
      parser.parse({
        timeline: [{ type: "wipe_transition", start: "00:00:00", end: "00:00:01" }],
      }),
    TimelineValidationError
  );
});

run("rejects an asset item with no asset filename", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  assert.throws(
    () =>
      parser.parse({
        timeline: [
          { type: "talking_head", start: "00:00:00", end: "00:00:05" },
          { type: "headline", start: "00:00:05", end: "00:00:10" },
        ],
      }),
    TimelineValidationError
  );
});

run("rejects end <= start", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  assert.throws(
    () =>
      parser.parse({
        timeline: [{ type: "talking_head", start: "00:00:10", end: "00:00:05" }],
      }),
    TimelineValidationError
  );
});

run("rejects overlapping talking-head segments", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  assert.throws(
    () =>
      parser.parse({
        timeline: [
          { type: "talking_head", start: "00:00:00", end: "00:00:10" },
          { type: "talking_head", start: "00:00:05", end: "00:00:15" },
        ],
      }),
    TimelineValidationError
  );
});

run("allows asset items to overlap the talking-head lane (they sit on top of it)", () => {
  const parser = new TimelineParser({ logger: quietLogger });
  const parsed = parser.parse({
    timeline: [
      { type: "talking_head", start: "00:00:00", end: "00:00:10" },
      { type: "headline", asset: "headline_01.png", start: "00:00:02", end: "00:00:06" },
    ],
  });
  assert.equal(parsed.items.length, 2);
});

run("throws MissingAssetError when an asset is not in the imported folder", () => {
  const parser = new TimelineParser({
    logger: quietLogger,
    availableAssets: ["headline_02.png"],
  });
  assert.throws(
    () =>
      parser.parse({
        timeline: [
          { type: "talking_head", start: "00:00:00", end: "00:00:05" },
          { type: "headline", asset: "headline_01.png", start: "00:00:05", end: "00:00:10" },
        ],
      }),
    MissingAssetError
  );
});

run("resolves frame-based timecodes when a frameRate is supplied", () => {
  const parser = new TimelineParser({ logger: quietLogger, frameRate: 24 });
  const parsed = parser.parse({
    timeline: [{ type: "talking_head", start: "00:00:00:00", end: "00:00:01:12" }],
  });
  assert.equal(parsed.items[0]!.endSeconds, 1.5);
});

console.log("TimelineParser: all assertions passed\n");
