/**
 * TimelineBuilder
 * ---------------
 * The top-level orchestrator: turns a ParsedTimeline into real Premiere
 * clips/keyframes via IPremiereHost, delegating jump-cut/pause-removal math
 * to JumpCutEngine and B-roll animation math to AnimationEngine. This is
 * what the panel's "Generate Timeline" / "Generate Animations" buttons
 * ultimately call (see src/ui/panel.ts).
 */

import type { AssetTimelineItem, TalkingHeadItem } from "../types/timeline.types.js";
import type { ExtensionOptions } from "../types/config.types.js";
import type { NormalizedTimelineItem, ParsedTimeline } from "../core/TimelineParser.js";
import type { IPremiereHost } from "./IPremiereHost.js";
import { AnimationEngine } from "../animations/AnimationEngine.js";
import { computePunchInKeyframes } from "../animations/TalkingHeadAnimations.js";
import { JumpCutEngine } from "./JumpCutEngine.js";
import { MissingAssetError } from "../core/errors.js";
import { Logger } from "../core/Logger.js";
import { ticksToSeconds } from "../core/TimecodeUtils.js";

export const TALKING_HEAD_TRACK = 0;
export const ASSET_TRACK = 1;
export const ANNOTATION_TRACK = 2;

export interface TimelineBuildInputs {
  parsed: ParsedTimeline;
  talkingHeadVideoAbsolutePath: string;
  assetFolderAbsolutePath: string;
  options: ExtensionOptions;
}

export interface TimelineBuildResult {
  placedTalkingHeadClips: number;
  placedAssetClips: number;
  placedAnnotationClips: number;
  skippedAnnotations: number;
  pausesRemoved: number;
  warnings: string[];
}

export class TimelineBuilder {
  constructor(
    private readonly host: IPremiereHost,
    private readonly animationEngine: AnimationEngine = new AnimationEngine(),
    private readonly jumpCutEngine: JumpCutEngine = new JumpCutEngine(),
    private readonly logger: Logger = new Logger("TimelineBuilder")
  ) {}

  async build(inputs: TimelineBuildInputs): Promise<TimelineBuildResult> {
    const { parsed, talkingHeadVideoAbsolutePath, assetFolderAbsolutePath, options } = inputs;
    const warnings: string[] = [];

    const assetPaths = Array.from(
      new Set(parsed.assetItems.map((n) => joinPath(assetFolderAbsolutePath, n.item.asset)))
    );
    const templatePaths = Object.values(options.graphicsTemplates).filter(
      (p): p is string => typeof p === "string" && p.length > 0
    );
    const importPaths = Array.from(
      new Set([talkingHeadVideoAbsolutePath, ...assetPaths, ...templatePaths])
    );

    this.logger.info(`Importing ${importPaths.length} file(s)`);
    const imported = await this.host.importAssets(importPaths);

    const talkingHeadProjectItem = imported.get(talkingHeadVideoAbsolutePath);
    if (!talkingHeadProjectItem) {
      throw new Error(`Failed to import talking-head video: ${talkingHeadVideoAbsolutePath}`);
    }

    const frameDimensionsPx = await this.host.getSequenceFrameSize();

    const pausesRemoved = await this.placeTalkingHead(parsed, talkingHeadProjectItem, options, warnings);

    const { placedAssetClips, placedAnnotationClips, skippedAnnotations } = await this.placeAssets(
      parsed,
      imported,
      assetFolderAbsolutePath,
      frameDimensionsPx,
      options,
      warnings
    );

    return {
      placedTalkingHeadClips: parsed.talkingHeadItems.length,
      placedAssetClips,
      placedAnnotationClips,
      skippedAnnotations,
      pausesRemoved,
      warnings,
    };
  }

  private async placeTalkingHead(
    parsed: ParsedTimeline,
    talkingHeadProjectItem: { id: string; name: string },
    options: ExtensionOptions,
    warnings: string[]
  ): Promise<number> {
    const markers = await this.host.getSequenceMarkers();
    let pausesRemoved = 0;

    for (const entry of parsed.talkingHeadItems) {
      const item: TalkingHeadItem = entry.item;
      const pauses = this.jumpCutEngine.findPauseRanges(markers, entry.startTicks, entry.endTicks);
      const segments = this.jumpCutEngine.computeKeepSegments(entry.startTicks, entry.endTicks, pauses);
      pausesRemoved += pauses.length;

      for (const segment of segments) {
        const clip = await this.host.placeClip(
          TALKING_HEAD_TRACK,
          talkingHeadProjectItem,
          segment.sourceInTicks,
          segment.sourceOutTicks,
          segment.sequenceStartTicks
        );

        if (item.punchIn?.enabled) {
          const keyframes = computePunchInKeyframes(
            segment.sequenceStartTicks,
            segment.sequenceEndTicks,
            item.punchIn.scale,
            options.animationSpeed
          );
          await this.host.applyKeyframes(clip, keyframes);
        }
      }

      if (segments.length > 0 && pauses.length > 0) {
        const lastSegmentEnd = segments[segments.length - 1]!.sequenceEndTicks;
        if (lastSegmentEnd < entry.endTicks) {
          const shortfallSeconds = ticksToSeconds(entry.endTicks - lastSegmentEnd);
          warnings.push(
            `Talking-head item at ${item.start} ends ${shortfallSeconds.toFixed(2)}s early after removing ${pauses.length} pause(s)`
          );
        }
      }
    }

    return pausesRemoved;
  }

  private async placeAssets(
    parsed: ParsedTimeline,
    imported: Map<string, { id: string; name: string }>,
    assetFolderAbsolutePath: string,
    frameDimensionsPx: { width: number; height: number },
    options: ExtensionOptions,
    warnings: string[]
  ): Promise<{ placedAssetClips: number; placedAnnotationClips: number; skippedAnnotations: number }> {
    let placedAssetClips = 0;
    let placedAnnotationClips = 0;
    let skippedAnnotations = 0;

    for (const entry of parsed.assetItems as NormalizedTimelineItem<AssetTimelineItem>[]) {
      const path = joinPath(assetFolderAbsolutePath, entry.item.asset);
      const projectItem = imported.get(path);
      if (!projectItem) {
        throw new MissingAssetError(entry.item.asset, entry.index);
      }

      const assetDimensionsPx = await this.host.getAssetDimensions(projectItem);
      const { plan, presetName, warnings: itemWarnings } = this.animationEngine.resolve(entry, options, {
        assetDimensionsPx,
        frameDimensionsPx,
      });
      warnings.push(...itemWarnings);
      this.logger.info(`Item #${entry.index} (${entry.item.type}) -> preset "${presetName}"`);

      const clip = await this.host.placeClip(
        ASSET_TRACK,
        projectItem,
        0n,
        entry.endTicks - entry.startTicks,
        entry.startTicks
      );
      await this.host.applyKeyframes(clip, plan.baseKeyframes);
      placedAssetClips++;

      for (const annotation of plan.annotations) {
        const templatePath = options.graphicsTemplates[annotation.kind];
        if (!templatePath) {
          skippedAnnotations++;
          warnings.push(
            `Item #${entry.index}: skipped ${annotation.kind} annotation -- no graphicsTemplates.${annotation.kind} configured in Options`
          );
          continue;
        }
        const templateProjectItem = imported.get(templatePath);
        if (!templateProjectItem) {
          skippedAnnotations++;
          warnings.push(`Item #${entry.index}: ${annotation.kind} template "${templatePath}" failed to import`);
          continue;
        }
        const annotationClip = await this.host.placeClip(
          ANNOTATION_TRACK,
          templateProjectItem,
          0n,
          annotation.endTicks - annotation.startTicks,
          annotation.startTicks
        );
        await this.host.applyKeyframes(annotationClip, annotation.keyframes);
        placedAnnotationClips++;
      }
    }

    return { placedAssetClips, placedAnnotationClips, skippedAnnotations };
  }
}

function joinPath(folder: string, file: string): string {
  return `${folder.replace(/[\\/]+$/, "")}/${file}`;
}
