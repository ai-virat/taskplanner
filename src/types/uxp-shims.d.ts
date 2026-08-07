/**
 * Ambient type declarations for the host modules Premiere Pro's UXP runtime
 * injects at panel load time ("premierepro" and "uxp"). These are not real
 * npm packages -- they only exist inside a running Premiere Pro UXP host --
 * so they can't be `npm install`ed or type-checked against Adobe's own
 * definitions from this sandbox (no Premiere instance is available here).
 *
 * This file types ONLY the subset of the surface `src/host/PremiereHost.ts`
 * actually calls, modeled on Adobe's published Premiere Pro UXP Scripting
 * Guide. Treat it as a best-effort contract: reconcile it against the real
 * `premierepro` module (and Adobe's official `.d.ts`, if you install one)
 * the first time this runs inside actual Premiere Pro. Every other module
 * in this project (host/TimelineBuilder, animations/*, core/*) is written
 * against `IPremiereHost` (src/host/IPremiereHost.ts), not against this
 * file directly, so a signature mismatch here is an isolated, one-file fix.
 */

declare module "premierepro" {
  export interface TickTime {
    ticks: string;
    seconds: number;
  }

  export const TickTime: {
    createWithSeconds(seconds: number): TickTime;
    createWithTicks(ticks: string): TickTime;
  };

  export interface Marker {
    name: string;
    comments: string;
    start: TickTime;
    end: TickTime;
    type: string;
  }

  export interface Markers {
    createMarker(time: TickTime): Promise<Marker>;
    getMarkers(): Promise<Marker[]>;
    deleteMarker(marker: Marker): Promise<boolean>;
  }

  export interface ComponentParam {
    displayName: string;
    isTimeVarying(): Promise<boolean>;
    setTimeVarying(value: boolean): Promise<boolean>;
    addKey(time: TickTime): Promise<boolean>;
    setValueAtKey(time: TickTime, value: number | number[], updateUI: boolean): Promise<boolean>;
    getValue(): Promise<number | number[]>;
  }

  export interface Component {
    displayName: string;
    getParam(index: number): Promise<ComponentParam>;
    getParamCount(): Promise<number>;
    findParamByDisplayName?(name: string): Promise<ComponentParam | undefined>;
  }

  export interface ComponentChain {
    getComponentCount(): Promise<number>;
    getComponentAtIndex(index: number): Promise<Component>;
  }

  export interface ProjectItem {
    name: string;
    nodeId: string;
    getProjectItemType(): Promise<string>;
  }

  export interface TrackItem {
    name: string;
    start: TickTime;
    end: TickTime;
    getComponentChain(): Promise<ComponentChain>;
    getInPoint?(): Promise<TickTime>;
    setInPoint?(time: TickTime): Promise<boolean>;
    getOutPoint?(): Promise<TickTime>;
    setOutPoint?(time: TickTime): Promise<boolean>;
  }

  export interface Track {
    name: string;
    getTrackItems(mediaType: number, includeEmptyTrackItems: boolean): Promise<TrackItem[]>;
    insertClip(projectItem: ProjectItem, time: TickTime): Promise<TrackItem>;
    overwriteClip(projectItem: ProjectItem, time: TickTime): Promise<TrackItem>;
  }

  export interface Sequence {
    name: string;
    getVideoTrackCount(): Promise<number>;
    getVideoTrack(index: number): Promise<Track>;
    getMarkers(): Promise<Markers>;
    getFrameRate?(): Promise<TickTime>;
  }

  export interface ProjectBin {
    name: string;
  }

  export interface Project {
    name: string;
    getActiveSequence(): Promise<Sequence | undefined>;
    importFiles(
      filePaths: string[],
      suppressUI?: boolean,
      targetBin?: ProjectBin,
      importAsNumberedStills?: boolean
    ): Promise<boolean>;
    getInsertionBin(): Promise<ProjectBin>;
    getProjectItems?(): Promise<ProjectItem[]>;
    lockedAccess<T>(callback: () => T | Promise<T>): Promise<T>;
    executeTransaction(
      callback: (compoundAction: unknown) => void,
      description?: string
    ): Promise<void>;
  }

  export const Project: {
    getActiveProject(): Promise<Project | undefined>;
  };

  export const Constants: {
    TrackType: { VIDEO: number; AUDIO: number };
    MarkerType: { Comment: string };
  };
}

declare module "uxp" {
  export interface UxpFileEntry {
    name: string;
    nativePath: string;
    isFile: boolean;
    isFolder: boolean;
    getEntries?(): Promise<UxpFileEntry[]>;
    read?(options?: { format?: string }): Promise<string>;
  }

  export const storage: {
    localFileSystem: {
      getFileForOpening(options?: {
        allowMultiple?: boolean;
        types?: string[];
      }): Promise<UxpFileEntry | UxpFileEntry[] | undefined>;
      getFolder(): Promise<UxpFileEntry | undefined>;
    };
  };
}

/** Provided by the UXP CommonJS host runtime; not a global in plain Node/browser code. */
declare function require(id: string): unknown;
