/**
 * Bonus feature: "intelligent safe zoom" / auto-centering.
 *
 * Given a zoomTarget point (in source-asset pixel space) and the safe
 * margins from ExtensionOptions, computes the pan/scale that:
 *   1. Centers the target point in frame.
 *   2. Never zooms out far enough to reveal outside the asset's edges.
 *   3. Zooms in at least enough that the target sits inside the safe
 *      (margin-excluded) viewing area rather than right at the frame edge.
 *
 * Pure numeric function -- no host dependency, fully unit tested.
 */

import type { SafeMargins } from "../types/config.types.js";

export interface SafeZoomInput {
  assetWidthPx: number;
  assetHeightPx: number;
  frameWidthPx: number;
  frameHeightPx: number;
  target: { x: number; y: number; scale: number };
  safeMargins: SafeMargins;
}

export interface SafeZoomResult {
  /** Final scale percentage to apply (>= target.scale; only ever increased to satisfy constraints 2/3). */
  scale: number;
  /** Position offset in source px from the asset's center (Premiere "Position" convention). */
  positionX: number;
  positionY: number;
  /** True if the requested target.scale had to be adjusted to satisfy the constraints above. */
  clamped: boolean;
}

export function computeSafeZoom(input: SafeZoomInput): SafeZoomResult {
  const { assetWidthPx, assetHeightPx, frameWidthPx, frameHeightPx, target, safeMargins } = input;

  if (assetWidthPx <= 0 || assetHeightPx <= 0) {
    throw new RangeError("computeSafeZoom: assetWidthPx/assetHeightPx must be positive");
  }
  if (frameWidthPx <= 0 || frameHeightPx <= 0) {
    throw new RangeError("computeSafeZoom: frameWidthPx/frameHeightPx must be positive");
  }
  if (target.scale <= 0) {
    throw new RangeError("computeSafeZoom: target.scale must be positive");
  }

  const marginFractionX = (safeMargins.left + safeMargins.right) / 100;
  const marginFractionY = (safeMargins.top + safeMargins.bottom) / 100;
  const effectiveFrameWidth = frameWidthPx * Math.max(0, 1 - marginFractionX);
  const effectiveFrameHeight = frameHeightPx * Math.max(0, 1 - marginFractionY);

  // Minimum scale so the *safe* (margin-excluded) area is fully covered by the asset -- no letterboxing.
  const minScaleToFillFrame = Math.max(
    (frameWidthPx / assetWidthPx) * 100,
    (frameHeightPx / assetHeightPx) * 100
  );
  // Minimum scale so the target point, once centered, sits inside the safe area rather than at the raw edge.
  const minScaleForSafeMargins = Math.max(
    (effectiveFrameWidth / assetWidthPx) * 100,
    (effectiveFrameHeight / assetHeightPx) * 100
  );

  let scale = Math.max(target.scale, minScaleToFillFrame, minScaleForSafeMargins);
  let clamped = scale !== target.scale;

  let positionX = assetWidthPx / 2 - target.x;
  let positionY = assetHeightPx / 2 - target.y;

  const visibleWidth = (frameWidthPx / scale) * 100;
  const visibleHeight = (frameHeightPx / scale) * 100;
  const maxOffsetX = Math.max(0, (assetWidthPx - visibleWidth) / 2);
  const maxOffsetY = Math.max(0, (assetHeightPx - visibleHeight) / 2);

  if (Math.abs(positionX) > maxOffsetX) {
    positionX = Math.sign(positionX) * maxOffsetX;
    clamped = true;
  }
  if (Math.abs(positionY) > maxOffsetY) {
    positionY = Math.sign(positionY) * maxOffsetY;
    clamped = true;
  }

  return { scale, positionX, positionY, clamped };
}
