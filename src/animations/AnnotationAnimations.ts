/**
 * Keyframe math for the three reusable annotation primitives: highlight
 * bars/underlines, arrows, and circles. Each annotation is meant to be
 * placed on its OWN clip (typically an editor-authored Motion Graphics
 * Template / Essential Graphics asset -- see AnimationEngine.ts and
 * IPremiereHost.placeGraphicClip for why), positioned/timed by
 * TimelineBuilder, then driven by the keyframes this module computes.
 *
 * LIMITATION (documented, not hidden): our AnimatableProperty set is a
 * uniform scale + X/Y position + opacity + rotation -- it does not model a
 * template's own custom params (e.g. a dedicated "Tail Point"/"Head Point"
 * pair on an arrow graphic, or a non-uniform width-only "grow" on a
 * highlight bar). The math below approximates every "grows"/"draws on"
 * animation as a scale ramp anchored at the annotation's fixed pivot point
 * (the bar's left edge, the arrow's tail, the circle's center), which reads
 * correctly for a symmetric/centered template but is an approximation for
 * a template with independent per-axis controls. If your MOGRT exposes
 * those controls directly, drive them instead for pixel-accurate growth.
 */

import type { ArrowConfig, CircleConfig, HighlightConfig } from "../types/timeline.types.js";
import type { KeyframeOp } from "../host/PremiereTypes.js";
import type { AnnotationPlan, RevealPresetConfig } from "./types.js";
import { computeRevealKeyframes } from "./RevealAnimation.js";
import { secondsToTicks } from "../core/TimecodeUtils.js";

const CIRCLE_ANNOTATION_PRESET: RevealPresetConfig = {
  name: "Circle Annotation",
  fadeInSeconds: 0.15,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.35,
  bounce: true,
  startScale: 0,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

const ARROW_ANNOTATION_PRESET: RevealPresetConfig = {
  name: "Arrow Annotation",
  fadeInSeconds: 0.1,
  fadeOutSeconds: 0.25,
  moveInSeconds: 0.3,
  bounce: false,
  startScale: 0,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export function computeCircleAnnotation(
  startTicks: bigint,
  endTicks: bigint,
  circle: CircleConfig,
  animationSpeed: number
): AnnotationPlan {
  const keyframes = computeRevealKeyframes({
    startTicks,
    endTicks,
    targetScale: 100,
    targetPositionX: circle.x,
    targetPositionY: circle.y,
    config: { ...CIRCLE_ANNOTATION_PRESET, bounce: circle.bounce ?? CIRCLE_ANNOTATION_PRESET.bounce },
    animationSpeed,
  });
  return { kind: "circle", startTicks, endTicks, keyframes, source: circle };
}

export function computeArrowAnnotation(
  startTicks: bigint,
  endTicks: bigint,
  arrow: ArrowConfig,
  animationSpeed: number
): AnnotationPlan {
  const keyframes = computeRevealKeyframes({
    startTicks,
    endTicks,
    targetScale: 100,
    targetPositionX: arrow.from.x,
    targetPositionY: arrow.from.y,
    config: ARROW_ANNOTATION_PRESET,
    animationSpeed,
  });
  return { kind: "arrow", startTicks, endTicks, keyframes, source: arrow };
}

/**
 * Highlight bar: grows (scale 0 -> 100, anchored at the rectangle's left
 * edge), holds at full opacity, then fades away. `underline` mode uses the
 * same timing shape; TimelineBuilder is expected to place a thin-underline
 * variant of the graphic template for that mode rather than the filled bar.
 */
export function computeHighlightBarAnnotation(
  startTicks: bigint,
  endTicks: bigint,
  highlight: HighlightConfig,
  animationSpeed: number
): AnnotationPlan {
  if (!highlight.coordinates) {
    throw new RangeError(
      "computeHighlightBarAnnotation requires highlight.coordinates (x/y/width/height) to position the bar"
    );
  }
  const speed = animationSpeed > 0 ? animationSpeed : 1;
  const growSeconds = 0.3 / speed;
  const fadeOutSeconds = 0.25 / speed;

  const growEndTicks = startTicks + secondsToTicks(growSeconds);
  const fadeStartTicks = endTicks - secondsToTicks(fadeOutSeconds);
  const anchorX = highlight.coordinates.x;
  const anchorY = highlight.coordinates.y + highlight.coordinates.height / 2;

  const keyframes: KeyframeOp[] = [
    { property: "opacity", timeTicks: startTicks, value: 0, easing: "ease_out" },
    { property: "opacity", timeTicks: startTicks, value: 100, easing: "ease_out" },
    { property: "opacity", timeTicks: fadeStartTicks > growEndTicks ? fadeStartTicks : growEndTicks, value: 100, easing: "ease_in" },
    { property: "opacity", timeTicks: endTicks, value: 0, easing: "ease_in" },
    { property: "scale", timeTicks: startTicks, value: 0, easing: "ease_out" },
    { property: "scale", timeTicks: growEndTicks, value: 100, easing: "ease_out" },
    { property: "positionX", timeTicks: startTicks, value: anchorX, easing: "linear" },
    { property: "positionY", timeTicks: startTicks, value: anchorY, easing: "linear" },
  ];

  return { kind: "highlightBar", startTicks, endTicks, keyframes, source: highlight };
}
