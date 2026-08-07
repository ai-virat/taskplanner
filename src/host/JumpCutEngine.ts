/**
 * JumpCutEngine
 * -------------
 * Computes fine-grained pause removal within a single talking-head item's
 * declared [start, end) window.
 *
 * Model: the Timeline JSON's talking_head `start`/`end` are absolute times
 * that apply identically to both the raw source footage and the output
 * sequence (the editor has not cut anything yet at JSON-authoring time --
 * the JSON's talking_head windows simply say "keep this whole span"). If
 * the raw clip additionally has "PAUSE" markers inside that span (placed
 * by the editor to flag dead air), this engine subtracts those ranges and
 * re-packs the remaining sub-ranges back-to-back, starting at the item's
 * original start, so the pauses disappear with no gap.
 *
 * This intentionally only tightens pacing *within* an item's own window --
 * it never shifts B-roll or later talking-head items, because their
 * absolute timestamps are an explicit editorial decision from the JSON,
 * not something this tool is allowed to renegotiate. The net effect is
 * that a talking-head item with pauses removed will end BEFORE its
 * declared `end`; TimelineBuilder logs exactly how much time that leaves
 * so the editor can see it and adjust the plan if needed.
 */

import type { MarkerInfo } from "./PremiereTypes.js";
import { Logger } from "../core/Logger.js";

const PAUSE_MARKER_NAME = "PAUSE";

/** One contiguous slice to place: source range == sequence range, until repacked. */
export interface KeepSegment {
  sourceInTicks: bigint;
  sourceOutTicks: bigint;
  sequenceStartTicks: bigint;
  sequenceEndTicks: bigint;
}

export class JumpCutEngine {
  constructor(private readonly logger: Logger = new Logger("JumpCutEngine")) {}

  /** Markers named "PAUSE" (case-insensitive) fully contained within [windowStart, windowEnd). */
  findPauseRanges(
    markers: MarkerInfo[],
    windowStartTicks: bigint,
    windowEndTicks: bigint
  ): MarkerInfo[] {
    return markers
      .filter((m) => m.name.trim().toUpperCase() === PAUSE_MARKER_NAME)
      .filter((m) => m.startTicks >= windowStartTicks && m.endTicks <= windowEndTicks)
      .filter((m) => m.endTicks > m.startTicks)
      .sort((a, b) => (a.startTicks < b.startTicks ? -1 : 1));
  }

  /**
   * Splits [windowStart, windowEnd) around the given pause ranges and
   * re-packs the surviving slices back-to-back starting at windowStart.
   * Throws if the pause ranges overlap each other (ambiguous input).
   */
  computeKeepSegments(
    windowStartTicks: bigint,
    windowEndTicks: bigint,
    pauses: MarkerInfo[]
  ): KeepSegment[] {
    this.assertNonOverlapping(pauses);

    const rawKeep: { start: bigint; end: bigint }[] = [];
    let cursor = windowStartTicks;
    for (const pause of pauses) {
      if (pause.startTicks > cursor) {
        rawKeep.push({ start: cursor, end: pause.startTicks });
      }
      cursor = pause.endTicks > cursor ? pause.endTicks : cursor;
    }
    if (cursor < windowEndTicks) {
      rawKeep.push({ start: cursor, end: windowEndTicks });
    }

    let outCursor = windowStartTicks;
    const segments: KeepSegment[] = [];
    for (const raw of rawKeep) {
      const duration = raw.end - raw.start;
      segments.push({
        sourceInTicks: raw.start,
        sourceOutTicks: raw.end,
        sequenceStartTicks: outCursor,
        sequenceEndTicks: outCursor + duration,
      });
      outCursor += duration;
    }

    if (pauses.length > 0) {
      const removedTicks = (windowEndTicks - windowStartTicks) - (outCursor - windowStartTicks);
      this.logger.info(
        `Removed ${pauses.length} pause(s) totaling ${removedTicks} ticks; ` +
          `item now ends ${removedTicks} ticks before its declared end`
      );
    }

    return segments;
  }

  private assertNonOverlapping(pauses: MarkerInfo[]): void {
    for (let i = 1; i < pauses.length; i++) {
      const prev = pauses[i - 1]!;
      const curr = pauses[i]!;
      if (curr.startTicks < prev.endTicks) {
        throw new Error(
          `Overlapping PAUSE markers: one ends at tick ${prev.endTicks}, the next starts at tick ${curr.startTicks}`
        );
      }
    }
  }
}
