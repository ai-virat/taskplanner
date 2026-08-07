/**
 * Pure timing/value math for the "reveal" animation shape shared by every
 * asset-type motion preset (Headline/Tweet/Document/Article/Map/Graph/
 * Statistics/Comparison/Browser/Photo Reveal -- see presets.ts):
 *
 *   fade in  ->  ease scale/position/rotation to target (optional bounce)  ->  hold  ->  fade out
 *
 * Each named preset only supplies different RevealPresetConfig values
 * (durations, slide offset, tilt, bounce, start scale); this module is the
 * one place that turns those numbers into concrete, item-duration-aware
 * keyframes. It has zero Premiere dependency, so it's fully unit tested.
 */

import type { KeyframeOp } from "../host/PremiereTypes.js";
import type { RevealPresetConfig } from "./types.js";
import { secondsToTicks, ticksToSeconds } from "../core/TimecodeUtils.js";

function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export interface RevealTargets {
  startTicks: bigint;
  endTicks: bigint;
  targetScale: number;
  targetPositionX: number;
  targetPositionY: number;
  config: RevealPresetConfig;
  /** Global animation speed multiplier from ExtensionOptions (1.0 = authored default). */
  animationSpeed: number;
}

/**
 * Computes the full keyframe set for one asset clip's reveal animation.
 * Durations are scaled by `animationSpeed` and then clamped so
 * fade-in + move-in + fade-out never exceeds the item's own on-screen
 * duration (always leaving a small hold, even on very short items).
 */
export function computeRevealKeyframes(targets: RevealTargets): KeyframeOp[] {
  const { startTicks, endTicks, targetScale, targetPositionX, targetPositionY, config, animationSpeed } =
    targets;

  if (endTicks <= startTicks) {
    throw new RangeError("computeRevealKeyframes: endTicks must be after startTicks");
  }

  const speed = animationSpeed > 0 ? animationSpeed : 1;
  const totalSeconds = ticksToSeconds(endTicks - startTicks);

  const rawFadeIn = config.fadeInSeconds / speed;
  const rawMoveIn = config.moveInSeconds / speed;
  const rawFadeOut = config.fadeOutSeconds / speed;
  const requestedTotal = rawFadeIn + rawMoveIn + rawFadeOut;

  // Leave at least a 10% hold in the middle, even if authored durations would otherwise eat the whole clip.
  const budget = totalSeconds * 0.9;
  const scaleFactor = requestedTotal > budget && requestedTotal > 0 ? budget / requestedTotal : 1;

  const fadeInSeconds = rawFadeIn * scaleFactor;
  const moveInSeconds = rawMoveIn * scaleFactor;
  const fadeOutSeconds = rawFadeOut * scaleFactor;

  const tFadeInEnd = startTicks + secondsToTicks(fadeInSeconds);
  const tMoveEnd = tFadeInEnd + secondsToTicks(moveInSeconds);
  const tFadeOutStart = bigintMax(endTicks - secondsToTicks(fadeOutSeconds), tMoveEnd);

  const keyframes: KeyframeOp[] = [];

  // Opacity: fade in (skipped if fadeInSeconds is 0 -- starts fully visible instead of a
  // same-tick 0/100 conflict), hold, fade out (skipped the same way for quick_cut items).
  if (fadeInSeconds > 0) {
    keyframes.push(
      { property: "opacity", timeTicks: startTicks, value: 0, easing: "ease_out" },
      { property: "opacity", timeTicks: tFadeInEnd, value: 100, easing: "ease_out" }
    );
  } else {
    keyframes.push({ property: "opacity", timeTicks: startTicks, value: 100, easing: "ease_out" });
  }
  if (fadeOutSeconds > 0) {
    keyframes.push(
      { property: "opacity", timeTicks: tFadeOutStart, value: 100, easing: "ease_in" },
      { property: "opacity", timeTicks: endTicks, value: 0, easing: "ease_in" }
    );
  }

  // Scale: start at config.startScale, ease to targetScale (with an optional bounce overshoot).
  keyframes.push({ property: "scale", timeTicks: startTicks, value: config.startScale, easing: "ease_out" });
  if (config.bounce) {
    const overshoot = targetScale + (targetScale - config.startScale) * 0.08;
    const bounceTicks = tFadeInEnd + (tMoveEnd - tFadeInEnd) / 2n;
    keyframes.push({ property: "scale", timeTicks: bounceTicks, value: overshoot, easing: "ease_out" });
  }
  keyframes.push({ property: "scale", timeTicks: tMoveEnd, value: targetScale, easing: "ease_in_out" });

  // Position: optional slide-in from an offset below (positive px) to the target X/Y.
  const startPositionY = targetPositionY + config.slideOffsetPx;
  keyframes.push(
    { property: "positionX", timeTicks: startTicks, value: targetPositionX, easing: "ease_out" },
    { property: "positionX", timeTicks: tMoveEnd, value: targetPositionX, easing: "ease_in_out" },
    { property: "positionY", timeTicks: startTicks, value: startPositionY, easing: "ease_out" },
    { property: "positionY", timeTicks: tMoveEnd, value: targetPositionY, easing: "ease_in_out" }
  );

  // Rotation ("tilt"): ease from +/-tiltDegrees back to level.
  if (config.tiltDegrees !== 0) {
    keyframes.push(
      { property: "rotation", timeTicks: startTicks, value: config.tiltDegrees, easing: "ease_out" },
      { property: "rotation", timeTicks: tMoveEnd, value: 0, easing: "ease_in_out" }
    );
  }

  return keyframes;
}
