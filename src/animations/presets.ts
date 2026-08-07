/**
 * The named, reusable motion presets from the spec's "Motion Presets"
 * section. Each is just a data object (RevealPresetConfig) fed into the
 * shared computeRevealKeyframes() math in RevealAnimation.ts -- so every
 * preset is independently editable (mutate the object, or register a
 * replacement) without touching the animation math itself.
 */

import type { TimelineItemType } from "../types/timeline.types.js";
import type { RevealPresetConfig } from "./types.js";

export const HEADLINE_REVEAL: RevealPresetConfig = {
  name: "Headline Reveal",
  fadeInSeconds: 0.35,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.6,
  bounce: false,
  startScale: 100,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export const TWEET_REVEAL: RevealPresetConfig = {
  name: "Tweet Reveal",
  fadeInSeconds: 0.2,
  fadeOutSeconds: 0.25,
  moveInSeconds: 0.45,
  bounce: true,
  startScale: 85,
  slideOffsetPx: 60,
  tiltDegrees: 0,
};

export const DOCUMENT_REVEAL: RevealPresetConfig = {
  name: "Document Reveal",
  fadeInSeconds: 0.3,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.55,
  bounce: false,
  startScale: 92,
  slideOffsetPx: 40,
  tiltDegrees: -3,
};

export const ARTICLE_REVEAL: RevealPresetConfig = {
  name: "Article Reveal",
  fadeInSeconds: 0.3,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.5,
  bounce: false,
  startScale: 95,
  slideOffsetPx: 25,
  tiltDegrees: 0,
};

export const MAP_REVEAL: RevealPresetConfig = {
  name: "Map Reveal",
  fadeInSeconds: 0.4,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.8,
  bounce: false,
  startScale: 105,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export const GRAPH_REVEAL: RevealPresetConfig = {
  name: "Graph Reveal",
  fadeInSeconds: 0.3,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.6,
  bounce: false,
  startScale: 90,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export const STATISTICS_REVEAL: RevealPresetConfig = {
  name: "Statistics Reveal",
  fadeInSeconds: 0.25,
  fadeOutSeconds: 0.25,
  moveInSeconds: 0.4,
  bounce: true,
  startScale: 80,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export const COMPARISON_REVEAL: RevealPresetConfig = {
  name: "Comparison Reveal",
  fadeInSeconds: 0.3,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.5,
  bounce: false,
  startScale: 95,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

export const BROWSER_REVEAL: RevealPresetConfig = {
  name: "Browser Reveal",
  fadeInSeconds: 0.3,
  fadeOutSeconds: 0.3,
  moveInSeconds: 0.55,
  bounce: false,
  startScale: 93,
  slideOffsetPx: 20,
  tiltDegrees: 0,
};

export const PHOTO_REVEAL: RevealPresetConfig = {
  name: "Photo Reveal",
  fadeInSeconds: 0.4,
  fadeOutSeconds: 0.35,
  moveInSeconds: 0.9,
  bounce: false,
  startScale: 100,
  slideOffsetPx: 0,
  tiltDegrees: 0,
};

/** Preset lookup by name (matches the spec's "Motion Presets" list, e.g. for a UI dropdown). */
export const PRESETS_BY_NAME: Record<string, RevealPresetConfig> = {
  headline_reveal: HEADLINE_REVEAL,
  tweet_reveal: TWEET_REVEAL,
  document_reveal: DOCUMENT_REVEAL,
  article_reveal: ARTICLE_REVEAL,
  map_reveal: MAP_REVEAL,
  graph_reveal: GRAPH_REVEAL,
  statistics_reveal: STATISTICS_REVEAL,
  comparison_reveal: COMPARISON_REVEAL,
  browser_reveal: BROWSER_REVEAL,
  photo_reveal: PHOTO_REVEAL,
};

/** Default preset per Timeline JSON item type; overridden per-item via `item.preset`. */
export const DEFAULT_PRESET_BY_TYPE: Partial<Record<TimelineItemType, string>> = {
  headline: "headline_reveal",
  tweet: "tweet_reveal",
  document: "document_reveal",
  article: "article_reveal",
  map: "map_reveal",
  graph: "graph_reveal",
  statistics: "statistics_reveal",
  comparison: "comparison_reveal",
  browser: "browser_reveal",
  photo: "photo_reveal",
  screenshot: "article_reveal",
};

/**
 * Resolves the RevealPresetConfig for an item: its explicit `preset` name if
 * given and registered, otherwise the type's default, otherwise a safe
 * generic fallback. Never throws -- an unknown preset name just falls back,
 * with the caller free to log that (see AnimationEngine).
 */
export function resolvePreset(
  itemType: TimelineItemType,
  explicitPresetName: string | undefined
): { config: RevealPresetConfig; resolvedName: string; usedFallback: boolean } {
  if (explicitPresetName && PRESETS_BY_NAME[explicitPresetName]) {
    return { config: PRESETS_BY_NAME[explicitPresetName]!, resolvedName: explicitPresetName, usedFallback: false };
  }
  const defaultName = DEFAULT_PRESET_BY_TYPE[itemType];
  if (defaultName && PRESETS_BY_NAME[defaultName]) {
    return {
      config: PRESETS_BY_NAME[defaultName]!,
      resolvedName: defaultName,
      usedFallback: explicitPresetName !== undefined,
    };
  }
  return { config: ARTICLE_REVEAL, resolvedName: "article_reveal", usedFallback: true };
}
