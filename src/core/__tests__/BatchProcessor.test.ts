/**
 * Run with: npm run test:batch
 */
import assert from "node:assert/strict";
import { BatchProcessor } from "../BatchProcessor.js";
import { TimelineParser } from "../TimelineParser.js";
import { TimelineBuilder } from "../../host/TimelineBuilder.js";
import { MockPremiereHost } from "../../host/MockPremiereHost.js";
import { DEFAULT_EXTENSION_OPTIONS } from "../../types/config.types.js";
import { Logger } from "../Logger.js";

function run(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok - ${name}`))
    .catch((err) => {
      console.error(`  FAIL - ${name}`);
      throw err;
    });
}

const quietLogger = new Logger("test", "error");
const parser = new TimelineParser({ logger: quietLogger });

function simpleTimeline() {
  return parser.parse({
    timeline: [{ type: "talking_head", start: "00:00:00", end: "00:00:05" }],
  });
}

async function main() {
  console.log("BatchProcessor");

  await run("creates one sequence per job and reports success for each", async () => {
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host, undefined, undefined, quietLogger);
    const batch = new BatchProcessor(host, builder, quietLogger);

    const results = await batch.run(
      [
        {
          name: "episode-1",
          parsed: simpleTimeline(),
          talkingHeadVideoAbsolutePath: "/videos/ep1.mp4",
          assetFolderAbsolutePath: "/assets/ep1",
        },
        {
          name: "episode-2",
          parsed: simpleTimeline(),
          talkingHeadVideoAbsolutePath: "/videos/ep2.mp4",
          assetFolderAbsolutePath: "/assets/ep2",
        },
      ],
      DEFAULT_EXTENSION_OPTIONS
    );

    assert.equal(host.createdSequences.length, 2);
    assert.deepEqual(host.createdSequences, ["episode-1", "episode-2"]);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.success));
  });

  await run("one job failing does not stop the rest of the batch", async () => {
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host, undefined, undefined, quietLogger);
    const batch = new BatchProcessor(host, builder, quietLogger);

    const brokenTimeline = parser.parse({
      timeline: [
        { type: "talking_head", start: "00:00:00", end: "00:00:05" },
        { type: "headline", asset: "missing.png", start: "00:00:05", end: "00:00:08" },
      ],
    });
    const originalImport = host.importAssets.bind(host);
    host.importAssets = async (paths: string[]) => originalImport(paths.filter((p) => !p.includes("missing.png")));

    const results = await batch.run(
      [
        {
          name: "broken-episode",
          parsed: brokenTimeline,
          talkingHeadVideoAbsolutePath: "/videos/broken.mp4",
          assetFolderAbsolutePath: "/assets/broken",
        },
        {
          name: "good-episode",
          parsed: simpleTimeline(),
          talkingHeadVideoAbsolutePath: "/videos/good.mp4",
          assetFolderAbsolutePath: "/assets/good",
        },
      ],
      DEFAULT_EXTENSION_OPTIONS
    );

    assert.equal(results.length, 2);
    assert.equal(results[0]!.success, false);
    assert.ok(results[0]!.error);
    assert.equal(results[1]!.success, true);
  });

  console.log("BatchProcessor: all assertions passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
