/**
 * Keyframe math specific to the talking-head layer: the optional punch-in
 * (a slight scale push-in for emphasis, per the spec's "Optional punch-in
 * (110-120%)"). Pure and host-agnostic like the rest of animations/*.
 */

import type { KeyframeOp } from "../host/PremiereTypes.js";
import { secondsToTicks, ticksToSeconds } from "../core/TimecodeUtils.js";

const DEFAULT_EASE_SECONDS = 0.6;

/**
 * Eases scale from 100% to `targetScalePercent` shortly after the segment
 * starts, then holds -- there's no exit animation, since the talking head
 * is cut away rather than faded.
 */
export function computePunchInKeyframes(
  startTicks: bigint,
  endTicks: bigint,
  targetScalePercent: number,
  animationSpeed: number
): KeyframeOp[] {
  if (endTicks <= startTicks) {
    throw new RangeError("computePunchInKeyframes: endTicks must be after startTicks");
  }
  const speed = animationSpeed > 0 ? animationSpeed : 1;
  const totalSeconds = ticksToSeconds(endTicks - startTicks);
  const easeSeconds = Math.min(DEFAULT_EASE_SECONDS / speed, totalSeconds * 0.5);
  const easeEndTicks = startTicks + secondsToTicks(easeSeconds);

  return [
    { property: "scale", timeTicks: startTicks, value: 100, easing: "ease_in_out" },
    { property: "scale", timeTicks: easeEndTicks, value: targetScalePercent, easing: "ease_in_out" },
  ];
}
