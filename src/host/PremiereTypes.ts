/**
 * Host-agnostic reference types.
 *
 * The rest of the extension (TimelineBuilder, animation presets, UI) never
 * touches Premiere's own objects directly -- it only holds opaque handles
 * returned by IPremiereHost. This is what makes the orchestration logic
 * (JumpCutEngine, TimelineBuilder, animation preset resolution) unit
 * testable with MockPremiereHost, with no Premiere instance required.
 */

import type { EasingPreset } from "../types/timeline.types.js";

/** Opaque handle to an imported source clip/image in the Premiere project bin. */
export interface ProjectItemRef {
  readonly id: string;
  readonly name: string;
}

/** Opaque handle to a clip placed on a sequence track. */
export interface ClipRef {
  readonly id: string;
  readonly trackIndex: number;
}

/** A single animatable property this project touches. */
export type AnimatableProperty =
  | "scale"
  | "positionX"
  | "positionY"
  | "opacity"
  | "rotation";

/** One keyframe to write onto a clip's property. */
export interface KeyframeOp {
  property: AnimatableProperty;
  timeTicks: bigint;
  value: number;
  easing: EasingPreset;
}

export interface MarkerInfo {
  name: string;
  comment: string;
  startTicks: bigint;
  endTicks: bigint;
}
