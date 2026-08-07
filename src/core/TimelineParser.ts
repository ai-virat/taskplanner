/**
 * TimelineParser
 * ---------------
 * Parses and validates the raw Timeline JSON (the predefined edit plan) into
 * a normalized, type-safe, time-resolved structure the rest of the extension
 * can consume without re-checking invariants.
 *
 * This module performs NO creative decision-making: it only validates
 * structure, resolves timecodes to seconds/ticks, and cross-checks asset
 * references. The edit plan itself always comes from the input JSON.
 */

import {
  AssetTimelineItem,
  TalkingHeadItem,
  TimelineDocument,
  TimelineItem,
  isAssetItem,
  isTalkingHeadItem,
} from "../types/timeline.types.js";
import { parseTimecodeToSeconds, secondsToTicks } from "./TimecodeUtils.js";
import { TimelineValidationError, MissingAssetError } from "./errors.js";
import { Logger } from "./Logger.js";

const VALID_TYPES = new Set([
  "talking_head",
  "headline",
  "tweet",
  "document",
  "screenshot",
  "map",
  "graph",
  "photo",
  "statistics",
  "comparison",
  "browser",
  "article",
]);

/** A timeline item with its timecodes resolved to seconds and Premiere ticks. */
export interface NormalizedTimelineItem<
  T extends TimelineItem = TimelineItem
> {
  index: number;
  item: T;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  startTicks: bigint;
  endTicks: bigint;
}

export interface ParsedTimeline {
  items: NormalizedTimelineItem[];
  talkingHeadItems: NormalizedTimelineItem<TalkingHeadItem>[];
  assetItems: NormalizedTimelineItem<AssetTimelineItem>[];
  durationSeconds: number;
}

export interface TimelineParserOptions {
  /** Required only if any item uses frame-based ("HH:MM:SS:FF") timecodes. */
  frameRate?: number;
  /** Filenames available in the imported asset folder, for reference validation. */
  availableAssets?: string[];
  logger?: Logger;
}

export class TimelineParser {
  private readonly logger: Logger;

  constructor(private readonly options: TimelineParserOptions = {}) {
    this.logger = options.logger ?? new Logger("TimelineParser");
  }

  /**
   * Parses and validates a raw JSON value (already `JSON.parse`d) against
   * the Timeline JSON schema. Throws `TimelineValidationError` /
   * `MissingAssetError` on the first problem found.
   */
  parse(raw: unknown): ParsedTimeline {
    const doc = this.assertDocumentShape(raw);

    if (doc.timeline.length === 0) {
      throw new TimelineValidationError("timeline array must contain at least one item");
    }

    const items: NormalizedTimelineItem[] = doc.timeline.map((item, index) =>
      this.normalizeItem(item, index)
    );

    this.validateNoOverlaps(items, isTalkingHeadItem, "talking_head");
    this.validateNoOverlaps(items, isAssetItem, "asset");
    this.validateChronologicalOrder(items);

    if (this.options.availableAssets) {
      this.validateAssetReferences(items, this.options.availableAssets);
    }

    const talkingHeadItems = items.filter(
      (n): n is NormalizedTimelineItem<TalkingHeadItem> => isTalkingHeadItem(n.item)
    );
    const assetItems = items.filter(
      (n): n is NormalizedTimelineItem<AssetTimelineItem> => isAssetItem(n.item)
    );

    const durationSeconds = items.reduce(
      (max, n) => Math.max(max, n.endSeconds),
      0
    );

    this.logger.info(
      `Parsed ${items.length} timeline items (${talkingHeadItems.length} talking-head, ${assetItems.length} asset) spanning ${durationSeconds.toFixed(2)}s`
    );

    return { items, talkingHeadItems, assetItems, durationSeconds };
  }

  // ---------------------------------------------------------------------
  // Structural validation
  // ---------------------------------------------------------------------

  private assertDocumentShape(raw: unknown): TimelineDocument {
    if (typeof raw !== "object" || raw === null) {
      throw new TimelineValidationError("root value must be a JSON object");
    }
    const candidate = raw as Record<string, unknown>;
    if (!Array.isArray(candidate.timeline)) {
      throw new TimelineValidationError('root object must contain a "timeline" array');
    }
    return { timeline: candidate.timeline as TimelineItem[] };
  }

  private normalizeItem(rawItem: unknown, index: number): NormalizedTimelineItem {
    if (typeof rawItem !== "object" || rawItem === null) {
      throw new TimelineValidationError("item must be an object", index);
    }
    const item = rawItem as Record<string, unknown>;

    if (typeof item.type !== "string" || !VALID_TYPES.has(item.type)) {
      throw new TimelineValidationError(
        `unknown or missing "type" (got ${JSON.stringify(item.type)})`,
        index,
        "type"
      );
    }
    if (typeof item.start !== "string") {
      throw new TimelineValidationError('"start" must be a timecode string', index, "start");
    }
    if (typeof item.end !== "string") {
      throw new TimelineValidationError('"end" must be a timecode string', index, "end");
    }
    if (item.type !== "talking_head") {
      if (typeof item.asset !== "string" || item.asset.trim() === "") {
        throw new TimelineValidationError(
          `"asset" is required for type "${item.type}"`,
          index,
          "asset"
        );
      }
    }

    const startSeconds = this.safeParseTimecode(item.start, index, "start");
    const endSeconds = this.safeParseTimecode(item.end, index, "end");

    if (endSeconds <= startSeconds) {
      throw new TimelineValidationError(
        `"end" (${item.end}) must be after "start" (${item.start})`,
        index
      );
    }

    return {
      index,
      item: item as unknown as TimelineItem,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      startTicks: secondsToTicks(startSeconds),
      endTicks: secondsToTicks(endSeconds),
    };
  }

  private safeParseTimecode(value: string, index: number, field: string): number {
    try {
      return parseTimecodeToSeconds(value, this.options.frameRate);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new TimelineValidationError(reason, index, field);
    }
  }

  // ---------------------------------------------------------------------
  // Semantic validation
  // ---------------------------------------------------------------------

  /** Same-lane items (all talking-head, or all asset/B-roll) must not overlap in time. */
  private validateNoOverlaps(
    items: NormalizedTimelineItem[],
    predicate: (item: TimelineItem) => boolean,
    laneLabel: string
  ): void {
    const lane = items
      .filter((n) => predicate(n.item))
      .sort((a, b) => a.startSeconds - b.startSeconds);

    for (let i = 1; i < lane.length; i++) {
      const prev = lane[i - 1]!;
      const curr = lane[i]!;
      if (curr.startSeconds < prev.endSeconds) {
        throw new TimelineValidationError(
          `${laneLabel} item overlaps with the previous ${laneLabel} item ` +
            `(item #${prev.index} ends at ${prev.endSeconds}s, item #${curr.index} starts at ${curr.startSeconds}s)`,
          curr.index
        );
      }
    }
  }

  /** Warns (does not throw) if items are not authored in chronological order, since that's usually a mistake. */
  private validateChronologicalOrder(items: NormalizedTimelineItem[]): void {
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!;
      const curr = items[i]!;
      if (curr.startSeconds < prev.startSeconds) {
        this.logger.warn(
          `item #${curr.index} (${curr.item.type}, starts ${curr.item.start}) appears after ` +
            `item #${prev.index} (starts ${prev.item.start}) but starts earlier -- ` +
            `double-check the JSON was authored in timeline order`
        );
      }
    }
  }

  private validateAssetReferences(
    items: NormalizedTimelineItem[],
    availableAssets: string[]
  ): void {
    const available = new Set(availableAssets.map((a) => a.toLowerCase()));
    for (const { item, index } of items) {
      if (isAssetItem(item) && !available.has(item.asset.toLowerCase())) {
        throw new MissingAssetError(item.asset, index);
      }
    }
  }
}
