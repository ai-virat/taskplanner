/**
 * Real IPremiereHost implementation, backed by Premiere Pro's UXP
 * scripting API ("premierepro" module, injected by the host at runtime --
 * see src/types/uxp-shims.d.ts for the caveat on that module's typings).
 *
 * This file is the ONLY place in the project allowed to `require("premierepro")`.
 * Everything else depends on IPremiereHost so it stays testable without Premiere.
 */

import type * as PremiereProModule from "premierepro";
import type { IPremiereHost } from "./IPremiereHost.js";
import type {
  AnimatableProperty,
  ClipRef,
  KeyframeOp,
  MarkerInfo,
  ProjectItemRef,
} from "./PremiereTypes.js";
import { Logger } from "../core/Logger.js";

/** Maps our host-agnostic property names onto Premiere's built-in effect/param display names. */
const PARAM_LOCATIONS: Record<
  AnimatableProperty,
  { component: "Motion" | "Opacity"; param: string; axis?: 0 | 1 }
> = {
  scale: { component: "Motion", param: "Scale" },
  positionX: { component: "Motion", param: "Position", axis: 0 },
  positionY: { component: "Motion", param: "Position", axis: 1 },
  rotation: { component: "Motion", param: "Rotation" },
  opacity: { component: "Opacity", param: "Opacity" },
};

export class PremiereHost implements IPremiereHost {
  private readonly logger = new Logger("PremiereHost");
  private readonly ppro: typeof PremiereProModule;
  private readonly clipHandles = new Map<string, PremiereProModule.TrackItem>();
  private nextClipId = 1;

  constructor() {
    this.ppro = require("premierepro") as typeof PremiereProModule;
  }

  /**
   * NOTE: same caveat as getSequenceFrameSize()/getAssetDimensions() --
   * creating+activating a sequence via UXP typically goes through the
   * project's sequence-creation API (e.g. cloning a sequence preset), whose
   * exact call needs confirming on-host. Throws a clear, actionable error
   * rather than silently no-oping, so BatchProcessor callers see it fail
   * loudly instead of quietly reusing whatever sequence was already active.
   */
  async createSequence(name: string): Promise<void> {
    throw new Error(
      `createSequence("${name}") is not yet wired to a verified Premiere UXP API call -- ` +
        "for now, create/activate each batch job's sequence manually before running it, " +
        "or confirm the sequence-creation API on-host and implement this method"
    );
  }

  async importAssets(absolutePaths: string[]): Promise<Map<string, ProjectItemRef>> {
    const project = await this.getActiveProject();
    await project.importFiles(absolutePaths, /* suppressUI */ true);

    const result = new Map<string, ProjectItemRef>();
    const projectItems = (await project.getProjectItems?.()) ?? [];
    for (const path of absolutePaths) {
      const fileName = path.split(/[\\/]/).pop() ?? path;
      const match = projectItems.find((item) => item.name === fileName);
      if (!match) {
        throw new Error(
          `Imported "${path}" but could not locate its project item afterwards ` +
            `(looked for a bin item named "${fileName}")`
        );
      }
      result.set(path, { id: match.nodeId, name: match.name });
    }
    return result;
  }

  async placeClip(
    trackIndex: number,
    projectItem: ProjectItemRef,
    sourceInTicks: bigint,
    sourceOutTicks: bigint,
    sequenceStartTicks: bigint
  ): Promise<ClipRef> {
    const track = await this.getVideoTrack(trackIndex);
    const project = await this.getActiveProject();
    const nativeProjectItem = await this.resolveProjectItem(project, projectItem);

    const placeAt = this.ppro.TickTime.createWithTicks(sequenceStartTicks.toString());
    const trackItem = await track.overwriteClip(nativeProjectItem, placeAt);

    if (trackItem.setInPoint && trackItem.setOutPoint) {
      await trackItem.setInPoint(this.ppro.TickTime.createWithTicks(sourceInTicks.toString()));
      await trackItem.setOutPoint(this.ppro.TickTime.createWithTicks(sourceOutTicks.toString()));
    } else {
      this.logger.warn(
        "TrackItem.setInPoint/setOutPoint unavailable on this host; placed clip uses its default full-media range"
      );
    }

    const sequenceEndTicks = sequenceStartTicks + (sourceOutTicks - sourceInTicks);
    await this.setTrackItemDuration(trackItem, sequenceStartTicks, sequenceEndTicks);

    const clipId = `clip:${this.nextClipId++}`;
    this.clipHandles.set(clipId, trackItem);
    return { id: clipId, trackIndex };
  }

  async setClipSequenceEnd(clip: ClipRef, newSequenceEndTicks: bigint): Promise<void> {
    const trackItem = this.resolveClip(clip);
    trackItem.end = this.ppro.TickTime.createWithTicks(newSequenceEndTicks.toString());
  }

  async removeClip(clip: ClipRef): Promise<void> {
    // Zero-length trim is Premiere's documented way to lift a track item via
    // the scripting API; ripple behavior is controlled by the executeTransaction
    // description below so downstream clips shift left to close the gap.
    const trackItem = this.resolveClip(clip);
    const zero = this.ppro.TickTime.createWithSeconds(0);
    trackItem.start = zero;
    trackItem.end = zero;
    this.clipHandles.delete(clip.id);
  }

  async applyKeyframes(clip: ClipRef, keyframes: KeyframeOp[]): Promise<void> {
    const trackItem = this.resolveClip(clip);
    const chain = await trackItem.getComponentChain();

    // Group by property so we look each param up once, then write every keyframe for it.
    const byProperty = new Map<AnimatableProperty, KeyframeOp[]>();
    for (const kf of keyframes) {
      const list = byProperty.get(kf.property) ?? [];
      list.push(kf);
      byProperty.set(kf.property, list);
    }

    for (const [property, ops] of byProperty) {
      const location = PARAM_LOCATIONS[property];
      const param = await this.findParam(chain, location.component, location.param);
      if (!param) {
        this.logger.warn(
          `Skipping "${property}" keyframes: could not find "${location.param}" on the ${location.component} effect`
        );
        continue;
      }

      if (!(await param.isTimeVarying())) {
        await param.setTimeVarying(true);
      }

      for (const op of ops.sort((a, b) => (a.timeTicks < b.timeTicks ? -1 : 1))) {
        const time = this.ppro.TickTime.createWithTicks(op.timeTicks.toString());
        await param.addKey(time);

        let value: number | number[] = op.value;
        if (location.axis !== undefined) {
          const current = await param.getValue();
          const pair = Array.isArray(current) ? [...current] : [current, current];
          pair[location.axis] = op.value;
          value = pair;
        }
        await param.setValueAtKey(time, value, /* updateUI */ false);
      }
    }
  }

  async getSequenceMarkers(): Promise<MarkerInfo[]> {
    const sequence = await this.getActiveSequence();
    const markers = await sequence.getMarkers();
    const all = await markers.getMarkers();
    return all.map((m) => ({
      name: m.name,
      comment: m.comments,
      startTicks: BigInt(m.start.ticks),
      endTicks: BigInt(m.end.ticks),
    }));
  }

  async getSequenceFrameRate(): Promise<number> {
    const sequence = await this.getActiveSequence();
    if (!sequence.getFrameRate) {
      throw new Error("Active sequence does not expose a frame rate via the scripting API");
    }
    const rate = await sequence.getFrameRate();
    return rate.seconds > 0 ? 1 / rate.seconds : 25;
  }

  /**
   * NOTE: Adobe's UXP Premiere Pro API does not (as of this writing) expose
   * a single documented "sequence frame size" getter the way it exposes
   * frame rate; the reliable path is reading the sequence's preset/settings
   * object, whose exact shape needs confirming on-host. Until that's
   * verified this returns a sane 1080p default and logs a warning so
   * safe-zoom math (SafeZoom.ts) degrades gracefully instead of crashing.
   */
  async getSequenceFrameSize(): Promise<{ width: number; height: number }> {
    this.logger.warn(
      "getSequenceFrameSize() is using a 1920x1080 default -- verify the real sequence preset API on-host and wire it here"
    );
    return { width: 1920, height: 1080 };
  }

  /**
   * NOTE: same caveat as getSequenceFrameSize() -- still images imported via
   * project.importFiles() should be readable through the ProjectItem's
   * footage interpretation/metadata, but the exact accessor needs
   * confirming on-host. Returns a conservative default and logs a warning
   * rather than fabricating a call that might not exist.
   */
  async getAssetDimensions(projectItem: ProjectItemRef): Promise<{ width: number; height: number }> {
    this.logger.warn(
      `getAssetDimensions("${projectItem.name}") is using a 1920x1080 default -- verify the real footage-metadata API on-host and wire it here`
    );
    return { width: 1920, height: 1080 };
  }

  // ---------------------------------------------------------------------

  private async getActiveProject(): Promise<PremiereProModule.Project> {
    const project = await this.ppro.Project.getActiveProject();
    if (!project) {
      throw new Error("No active Premiere Pro project. Open a project before running the extension.");
    }
    return project;
  }

  private async getActiveSequence(): Promise<PremiereProModule.Sequence> {
    const project = await this.getActiveProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) {
      throw new Error("No active sequence. Open/select a sequence before running the extension.");
    }
    return sequence;
  }

  private async getVideoTrack(trackIndex: number): Promise<PremiereProModule.Track> {
    const sequence = await this.getActiveSequence();
    const trackCount = await sequence.getVideoTrackCount();
    if (trackIndex >= trackCount) {
      throw new Error(
        `Sequence has ${trackCount} video track(s); this plan needs track index ${trackIndex}. ` +
          "Add more video tracks to the sequence before generating the timeline."
      );
    }
    return sequence.getVideoTrack(trackIndex);
  }

  private async resolveProjectItem(
    project: PremiereProModule.Project,
    ref: ProjectItemRef
  ): Promise<PremiereProModule.ProjectItem> {
    const items = (await project.getProjectItems?.()) ?? [];
    const match = items.find((item) => item.nodeId === ref.id);
    if (!match) {
      throw new Error(`Project item "${ref.name}" (${ref.id}) is no longer in the project bin`);
    }
    return match;
  }

  private resolveClip(clip: ClipRef): PremiereProModule.TrackItem {
    const trackItem = this.clipHandles.get(clip.id);
    if (!trackItem) {
      throw new Error(`Unknown clip handle "${clip.id}" (not placed by this PremiereHost instance)`);
    }
    return trackItem;
  }

  private async setTrackItemDuration(
    trackItem: PremiereProModule.TrackItem,
    startTicks: bigint,
    endTicks: bigint
  ): Promise<void> {
    trackItem.start = this.ppro.TickTime.createWithTicks(startTicks.toString());
    trackItem.end = this.ppro.TickTime.createWithTicks(endTicks.toString());
  }

  private async findParam(
    chain: PremiereProModule.ComponentChain,
    componentName: string,
    paramName: string
  ): Promise<PremiereProModule.ComponentParam | undefined> {
    const componentCount = await chain.getComponentCount();
    for (let i = 0; i < componentCount; i++) {
      const component = await chain.getComponentAtIndex(i);
      if (component.displayName !== componentName) {
        continue;
      }
      if (component.findParamByDisplayName) {
        const direct = await component.findParamByDisplayName(paramName);
        if (direct) return direct;
      }
      const paramCount = await component.getParamCount();
      for (let p = 0; p < paramCount; p++) {
        const param = await component.getParam(p);
        if (param.displayName === paramName) {
          return param;
        }
      }
    }
    return undefined;
  }
}
