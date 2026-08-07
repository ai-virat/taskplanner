/**
 * Shared types for the animation preset engine.
 */

import type { ArrowConfig, CircleConfig, HighlightConfig } from "../types/timeline.types.js";
import type { KeyframeOp } from "../host/PremiereTypes.js";

/** Tunable timing/shape parameters behind a named reveal preset (e.g. "Headline Reveal"). */
export interface RevealPresetConfig {
  /** Human-readable name shown in the Options UI, e.g. "Headline Reveal". */
  name: string;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  /** How long the scale/position "move" ease takes, from entrance to settled. */
  moveInSeconds: number;
  /** Overshoot the target scale slightly before settling (a "pop"), used by Tweet/Circle-style reveals. */
  bounce: boolean;
  /** Starting scale percentage before easing to the item's target scale (or options.defaultZoom). */
  startScale: number;
  /** Vertical slide-in offset in px; 0 disables the slide (Headline/Document don't slide, Tweet does). */
  slideOffsetPx: number;
  /** Slight rotation ("tilt") in degrees applied on entry and eased back to 0; used by Document Reveal. */
  tiltDegrees: number;
}

/** One fully-resolved annotation (arrow / circle / highlight bar) ready to hand to the host. */
export interface AnnotationPlan {
  kind: "arrow" | "circle" | "highlightBar";
  startTicks: bigint;
  endTicks: bigint;
  keyframes: KeyframeOp[];
  source: ArrowConfig | CircleConfig | HighlightConfig;
}

/** Everything needed to fully animate one asset timeline item. */
export interface AnimationPlan {
  /** Keyframes applied directly to the asset's own clip (scale/position/opacity/rotation). */
  baseKeyframes: KeyframeOp[];
  /** Zero or more annotation overlays (arrows/circles/highlight bars) layered on top. */
  annotations: AnnotationPlan[];
}
