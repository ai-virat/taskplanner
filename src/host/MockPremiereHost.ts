/**
 * In-memory IPremiereHost used by tests (and by any future "dry run"
 * preview mode in the panel). Records every call it receives so tests can
 * assert on exactly what the orchestration layer would have done to a real
 * Premiere sequence, without Premiere installed.
 */

import type { IPremiereHost } from "./IPremiereHost.js";
import type { ClipRef, KeyframeOp, MarkerInfo, ProjectItemRef } from "./PremiereTypes.js";

export interface RecordedClip {
  clip: ClipRef;
  trackIndex: number;
  projectItem: ProjectItemRef;
  sourceInTicks: bigint;
  sourceOutTicks: bigint;
  sequenceStartTicks: bigint;
  sequenceEndTicks: bigint;
  removed: boolean;
  keyframes: KeyframeOp[];
}

export class MockPremiereHost implements IPremiereHost {
  readonly clips: RecordedClip[] = [];
  readonly importedAssets: string[] = [];
  readonly createdSequences: string[] = [];
  private nextClipId = 1;

  constructor(
    private readonly markers: MarkerInfo[] = [],
    private readonly frameRate = 25,
    private readonly frameSize: { width: number; height: number } = { width: 1920, height: 1080 },
    private readonly assetDimensions: Map<string, { width: number; height: number }> = new Map()
  ) {}

  async createSequence(name: string): Promise<void> {
    this.createdSequences.push(name);
    // Clips placed before/after belong to different sequences in real Premiere; the mock
    // doesn't model multiple sequences, but BatchProcessor tests only assert on call order/count.
  }

  async importAssets(absolutePaths: string[]): Promise<Map<string, ProjectItemRef>> {
    const result = new Map<string, ProjectItemRef>();
    for (const path of absolutePaths) {
      this.importedAssets.push(path);
      result.set(path, { id: `projectItem:${path}`, name: path.split("/").pop() ?? path });
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
    const clip: ClipRef = { id: `clip:${this.nextClipId++}`, trackIndex };
    this.clips.push({
      clip,
      trackIndex,
      projectItem,
      sourceInTicks,
      sourceOutTicks,
      sequenceStartTicks,
      sequenceEndTicks: sequenceStartTicks + (sourceOutTicks - sourceInTicks),
      removed: false,
      keyframes: [],
    });
    return clip;
  }

  async setClipSequenceEnd(clip: ClipRef, newSequenceEndTicks: bigint): Promise<void> {
    this.findRecord(clip).sequenceEndTicks = newSequenceEndTicks;
  }

  async removeClip(clip: ClipRef): Promise<void> {
    this.findRecord(clip).removed = true;
  }

  async applyKeyframes(clip: ClipRef, keyframes: KeyframeOp[]): Promise<void> {
    this.findRecord(clip).keyframes.push(...keyframes);
  }

  async getSequenceMarkers(): Promise<MarkerInfo[]> {
    return this.markers;
  }

  async getSequenceFrameRate(): Promise<number> {
    return this.frameRate;
  }

  async getSequenceFrameSize(): Promise<{ width: number; height: number }> {
    return this.frameSize;
  }

  async getAssetDimensions(projectItem: ProjectItemRef): Promise<{ width: number; height: number }> {
    return this.assetDimensions.get(projectItem.id) ?? { width: 1920, height: 1080 };
  }

  /** Test helper: active (non-removed) clips, sorted by sequence start time. */
  activeClips(): RecordedClip[] {
    return this.clips
      .filter((c) => !c.removed)
      .sort((a, b) =>
        a.sequenceStartTicks < b.sequenceStartTicks ? -1 : a.sequenceStartTicks > b.sequenceStartTicks ? 1 : 0
      );
  }

  private findRecord(clip: ClipRef): RecordedClip {
    const record = this.clips.find((c) => c.clip.id === clip.id);
    if (!record) {
      throw new Error(`MockPremiereHost: unknown clip id "${clip.id}"`);
    }
    return record;
  }
}
