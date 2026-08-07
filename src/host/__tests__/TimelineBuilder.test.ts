/**
 * Run with: npm run test:builder
 *
 * End-to-end (but Premiere-free) test: parses a Timeline JSON, then runs it
 * through TimelineBuilder against MockPremiereHost, and asserts on exactly
 * what would have been placed on a real sequence.
 */
import assert from "node:assert/strict";
import { TimelineParser } from "../../core/TimelineParser.js";
import { TimelineBuilder, TALKING_HEAD_TRACK, ASSET_TRACK } from "../TimelineBuilder.js";
import { MockPremiereHost } from "../MockPremiereHost.js";
import { DEFAULT_EXTENSION_OPTIONS } from "../../types/config.types.js";
import { Logger } from "../../core/Logger.js";
import { secondsToTicks } from "../../core/TimecodeUtils.js";
import type { MarkerInfo } from "../PremiereTypes.js";

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

const SAMPLE = {
  timeline: [
    { type: "talking_head", start: "00:00:00", end: "00:00:08" },
    {
      type: "headline",
      asset: "headline_01.png",
      start: "00:00:08",
      end: "00:00:14",
      zoomTarget: { x: 1450, y: 620, scale: 165 },
    },
    { type: "talking_head", start: "00:00:14", end: "00:00:15" },
    { type: "tweet", asset: "tweet_01.png", start: "00:00:15", end: "00:00:20", returnTransition: "quick_cut" },
    { type: "talking_head", start: "00:00:20", end: "00:00:30", punchIn: { enabled: true, scale: 112 } },
  ],
};

async function main() {
  console.log("TimelineBuilder");

  await run("places one clip per talking-head + asset item on the right tracks", async () => {
    const parsed = parser.parse(SAMPLE);
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host);

    const result = await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: DEFAULT_EXTENSION_OPTIONS,
    });

    assert.equal(result.placedTalkingHeadClips, 3);
    assert.equal(result.placedAssetClips, 2);
    assert.equal(result.pausesRemoved, 0);

    const talkingHeadClips = host.activeClips().filter((c) => c.trackIndex === TALKING_HEAD_TRACK);
    const assetClips = host.activeClips().filter((c) => c.trackIndex === ASSET_TRACK);
    assert.equal(talkingHeadClips.length, 3);
    assert.equal(assetClips.length, 2);
  });

  await run("applies punch-in keyframes only to the item that requested them", async () => {
    const parsed = parser.parse(SAMPLE);
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host);
    await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: DEFAULT_EXTENSION_OPTIONS,
    });

    const talkingHeadClips = host.activeClips().filter((c) => c.trackIndex === TALKING_HEAD_TRACK);
    const withKeyframes = talkingHeadClips.filter((c) => c.keyframes.length > 0);
    assert.equal(withKeyframes.length, 1);
    assert.ok(withKeyframes[0]!.keyframes.some((k) => k.property === "scale" && k.value === 112));
  });

  await run("quick_cut asset items end with opacity still at 100 (no fade)", async () => {
    const parsed = parser.parse(SAMPLE);
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host);
    await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: DEFAULT_EXTENSION_OPTIONS,
    });

    const tweetClip = host.activeClips().find((c) => c.projectItem.name === "tweet_01.png")!;
    const opacityKeyframes = tweetClip.keyframes.filter((k) => k.property === "opacity");
    assert.equal(opacityKeyframes[opacityKeyframes.length - 1]!.value, 100);
  });

  await run("removes a pause marker inside a talking-head window and reports the shortfall", async () => {
    const parsed = parser.parse({
      timeline: [{ type: "talking_head", start: "00:00:00", end: "00:00:10" }],
    });
    const markers: MarkerInfo[] = [
      { name: "PAUSE", comment: "", startTicks: secondsToTicks(4), endTicks: secondsToTicks(6) },
    ];
    const host = new MockPremiereHost(markers);
    const builder = new TimelineBuilder(host);

    const result = await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: DEFAULT_EXTENSION_OPTIONS,
    });

    assert.equal(result.pausesRemoved, 1);
    assert.equal(result.warnings.length, 1);
    const clips = host.activeClips().filter((c) => c.trackIndex === TALKING_HEAD_TRACK);
    assert.equal(clips.length, 2); // the 10s window split into two kept slices around the pause
    const totalPlaced = clips.reduce(
      (sum, c) => sum + Number(c.sequenceEndTicks - c.sequenceStartTicks),
      0
    );
    assert.equal(totalPlaced, Number(secondsToTicks(8))); // 10s window minus the 2s pause
  });

  await run("throws MissingAssetError when a referenced asset file was never imported", async () => {
    const parsed = parser.parse({
      timeline: [
        { type: "talking_head", start: "00:00:00", end: "00:00:05" },
        { type: "headline", asset: "missing.png", start: "00:00:05", end: "00:00:10" },
      ],
    });
    const host = new MockPremiereHost();
    // Sabotage: pretend importAssets silently drops the headline asset.
    const originalImport = host.importAssets.bind(host);
    host.importAssets = async (paths: string[]) => originalImport(paths.filter((p) => !p.includes("missing.png")));

    const builder = new TimelineBuilder(host);
    await assert.rejects(() =>
      builder.build({
        parsed,
        talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
        assetFolderAbsolutePath: "/assets",
        options: DEFAULT_EXTENSION_OPTIONS,
      })
    );
  });

  await run("warns and skips annotations when no graphics template is configured", async () => {
    const parsed = parser.parse({
      timeline: [
        { type: "talking_head", start: "00:00:00", end: "00:00:05" },
        {
          type: "document",
          asset: "report.pdf",
          start: "00:00:05",
          end: "00:00:12",
          arrows: [{ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }],
        },
      ],
    });
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host);
    const result = await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: DEFAULT_EXTENSION_OPTIONS, // graphicsTemplates: {} by default
    });
    assert.equal(result.skippedAnnotations, 1);
    assert.equal(result.placedAnnotationClips, 0);
    assert.ok(result.warnings.some((w) => w.includes("no graphicsTemplates.arrow configured")));
  });

  await run("places an arrow annotation clip when a template is configured", async () => {
    const parsed = parser.parse({
      timeline: [
        { type: "talking_head", start: "00:00:00", end: "00:00:05" },
        {
          type: "document",
          asset: "report.pdf",
          start: "00:00:05",
          end: "00:00:12",
          arrows: [{ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }],
        },
      ],
    });
    const host = new MockPremiereHost();
    const builder = new TimelineBuilder(host);
    const result = await builder.build({
      parsed,
      talkingHeadVideoAbsolutePath: "/videos/interview.mp4",
      assetFolderAbsolutePath: "/assets",
      options: { ...DEFAULT_EXTENSION_OPTIONS, graphicsTemplates: { arrow: "/templates/arrow.mogrt" } },
    });
    assert.equal(result.skippedAnnotations, 0);
    assert.equal(result.placedAnnotationClips, 1);
  });

  console.log("TimelineBuilder: all assertions passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
