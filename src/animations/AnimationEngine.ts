/**
 * AnimationEngine
 * ---------------
 * Resolves one asset timeline item into a full AnimationPlan: the base
 * reveal keyframes (scale/position/opacity/rotation on the asset's own
 * clip) plus any arrow/circle/highlight-bar annotations.
 *
 * Host-agnostic and pure other than the (optional) asset/frame pixel
 * dimensions passed in by the caller -- TimelineBuilder fetches those once
 * via IPremiereHost and threads them through, so this class itself never
 * touches Premiere and stays fully unit testable.
 */

import type { AssetTimelineItem } from "../types/timeline.types.js";
import type { ExtensionOptions } from "../types/config.types.js";
import type { NormalizedTimelineItem } from "../core/TimelineParser.js";
import type { AnimationPlan, AnnotationPlan } from "./types.js";
import { computeRevealKeyframes } from "./RevealAnimation.js";
import { computeArrowAnnotation, computeCircleAnnotation, computeHighlightBarAnnotation } from "./AnnotationAnimations.js";
import { resolvePreset } from "./presets.js";
import { computeSafeZoom } from "./SafeZoom.js";

export interface DimensionsPx {
  width: number;
  height: number;
}

export interface AnimationEngineContext {
  /** Pixel dimensions of this specific item's asset, if known (enables safe-zoom clamping). */
  assetDimensionsPx?: DimensionsPx;
  /** Pixel dimensions of the active sequence frame, if known (enables safe-zoom clamping). */
  frameDimensionsPx?: DimensionsPx;
}

export interface AnimationResolution {
  plan: AnimationPlan;
  presetName: string;
  warnings: string[];
}

export class AnimationEngine {
  resolve(
    item: NormalizedTimelineItem<AssetTimelineItem>,
    options: ExtensionOptions,
    context: AnimationEngineContext = {}
  ): AnimationResolution {
    const warnings: string[] = [];

    const { config: presetConfig, resolvedName, usedFallback } = resolvePreset(
      item.item.type,
      item.item.preset
    );
    if (usedFallback && item.item.preset) {
      warnings.push(
        `Item #${item.index}: unknown preset "${item.item.preset}", used "${resolvedName}" instead`
      );
    }

    // "quick_cut" return transitions skip the trailing fade -- everything else about the
    // preset (entrance, hold, scale/position) is unaffected.
    const returnTransition = item.item.returnTransition ?? options.transitionStyle;
    const effectiveConfig =
      returnTransition === "quick_cut" ? { ...presetConfig, fadeOutSeconds: 0 } : presetConfig;

    const { scale: targetScale, positionX: targetPositionX, positionY: targetPositionY } =
      this.resolveTarget(item, options, context, warnings);

    const baseKeyframes = computeRevealKeyframes({
      startTicks: item.startTicks,
      endTicks: item.endTicks,
      targetScale,
      targetPositionX,
      targetPositionY,
      config: effectiveConfig,
      animationSpeed: options.animationSpeed,
    });

    const annotations = this.resolveAnnotations(item, options, warnings);

    return { plan: { baseKeyframes, annotations }, presetName: resolvedName, warnings };
  }

  private resolveTarget(
    item: NormalizedTimelineItem<AssetTimelineItem>,
    options: ExtensionOptions,
    context: AnimationEngineContext,
    warnings: string[]
  ): { scale: number; positionX: number; positionY: number } {
    const zoomTarget = item.item.zoomTarget;
    if (!zoomTarget) {
      return { scale: options.defaultZoom, positionX: 0, positionY: 0 };
    }

    if (context.assetDimensionsPx && context.frameDimensionsPx) {
      const safe = computeSafeZoom({
        assetWidthPx: context.assetDimensionsPx.width,
        assetHeightPx: context.assetDimensionsPx.height,
        frameWidthPx: context.frameDimensionsPx.width,
        frameHeightPx: context.frameDimensionsPx.height,
        target: zoomTarget,
        safeMargins: options.safeMargins,
      });
      if (safe.clamped) {
        warnings.push(
          `Item #${item.index}: zoomTarget adjusted to stay within the asset/safe area ` +
            `(requested scale ${zoomTarget.scale}%, used ${safe.scale.toFixed(1)}%)`
        );
      }
      return { scale: safe.scale, positionX: safe.positionX, positionY: safe.positionY };
    }

    warnings.push(
      `Item #${item.index}: zoomTarget applied without asset/frame pixel dimensions -- safe-zoom clamping skipped`
    );
    return { scale: zoomTarget.scale, positionX: zoomTarget.x, positionY: zoomTarget.y };
  }

  private resolveAnnotations(
    item: NormalizedTimelineItem<AssetTimelineItem>,
    options: ExtensionOptions,
    warnings: string[]
  ): AnnotationPlan[] {
    const annotations: AnnotationPlan[] = [];

    for (const arrow of item.item.arrows ?? []) {
      annotations.push(computeArrowAnnotation(item.startTicks, item.endTicks, arrow, options.animationSpeed));
    }

    for (const circle of item.item.circles ?? []) {
      annotations.push(computeCircleAnnotation(item.startTicks, item.endTicks, circle, options.animationSpeed));
    }

    const highlight = item.item.highlight;
    if (highlight && typeof highlight === "object") {
      if (highlight.coordinates) {
        annotations.push(
          computeHighlightBarAnnotation(item.startTicks, item.endTicks, highlight, options.animationSpeed)
        );
      } else {
        warnings.push(
          `Item #${item.index}: highlight has no coordinates, skipping the highlight-bar animation (text-only reference)`
        );
      }
    }

    return annotations;
  }
}
