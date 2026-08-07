/**
 * The full surface the rest of the extension needs from Premiere Pro.
 *
 * Two implementations exist:
 *   - PremiereHost      (src/host/PremiereHost.ts)      -- real UXP adapter
 *   - MockPremiereHost  (src/host/MockPremiereHost.ts)  -- in-memory test double
 *
 * Everything above this interface (TimelineBuilder, JumpCutEngine, the
 * animation preset engine) is written and tested against this contract
 * only, so it never depends on Premiere actually being installed.
 */

import type { ClipRef, KeyframeOp, MarkerInfo, ProjectItemRef } from "./PremiereTypes.js";

export interface IPremiereHost {
  /** Imports each absolute file path into the project bin. Returns a ref keyed by the original path. */
  importAssets(absolutePaths: string[]): Promise<Map<string, ProjectItemRef>>;

  /**
   * Places `projectItem` on `trackIndex`, using the [sourceInTicks, sourceOutTicks)
   * portion of its media, positioned at `sequenceStartTicks` on the timeline.
   * The placed duration is always `sourceOutTicks - sourceInTicks`.
   */
  placeClip(
    trackIndex: number,
    projectItem: ProjectItemRef,
    sourceInTicks: bigint,
    sourceOutTicks: bigint,
    sequenceStartTicks: bigint
  ): Promise<ClipRef>;

  /** Adjusts just the tail of an already-placed clip to a new sequence end time (used by incremental "Update Timeline" runs). */
  setClipSequenceEnd(clip: ClipRef, newSequenceEndTicks: bigint): Promise<void>;

  /** Removes a clip from its track entirely (used for pause/jump-cut removal). */
  removeClip(clip: ClipRef): Promise<void>;

  /** Writes a batch of keyframes (scale/position/opacity/rotation) onto a clip's effect stack. */
  applyKeyframes(clip: ClipRef, keyframes: KeyframeOp[]): Promise<void>;

  /** All markers currently on the active sequence, sorted by start time. */
  getSequenceMarkers(): Promise<MarkerInfo[]>;

  /** The active sequence's frame rate (frames/sec), needed to resolve "HH:MM:SS:FF" timecodes. */
  getSequenceFrameRate(): Promise<number>;

  /** The active sequence's frame size in pixels, needed for safe-zoom clamping (see animations/SafeZoom.ts). */
  getSequenceFrameSize(): Promise<{ width: number; height: number }>;

  /** Pixel dimensions of an imported asset (image/still), needed for safe-zoom clamping. */
  getAssetDimensions(projectItem: ProjectItemRef): Promise<{ width: number; height: number }>;
}
