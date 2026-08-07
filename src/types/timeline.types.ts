/**
 * Timeline JSON schema types.
 *
 * These types define the contract between the human-authored "edit plan"
 * (Timeline JSON, produced upstream from the transcript + asset folder) and
 * the Premiere extension. The extension never invents structure that isn't
 * described here -- it only executes what the JSON specifies.
 */

/** Every asset/segment kind the editor can place on the timeline. */
export type TimelineItemType =
  | "talking_head"
  | "headline"
  | "tweet"
  | "document"
  | "screenshot"
  | "map"
  | "graph"
  | "photo"
  | "statistics"
  | "comparison"
  | "browser"
  | "article";

/** How a B-roll segment hands control back to the talking-head clip. */
export type ReturnTransition = "fade" | "quick_cut";

/** Named easing curves available to any animation preset. */
export type EasingPreset =
  | "linear"
  | "ease_in"
  | "ease_out"
  | "ease_in_out"
  | "bounce";

/**
 * A timestamp as authored in the JSON. Accepted formats:
 *   "HH:MM:SS"          -> whole seconds
 *   "HH:MM:SS.mmm"       -> fractional seconds
 *   "HH:MM:SS:FF"        -> frames (requires the project frame rate to resolve)
 */
export type TimecodeString = string;

/** Pixel-space target used to drive a zoom/pan (Ken Burns) animation. */
export interface ZoomTarget {
  /** X coordinate (px) of the point of interest, in source-asset space. */
  x: number;
  /** Y coordinate (px) of the point of interest, in source-asset space. */
  y: number;
  /** Target scale, expressed as a percentage (e.g. 165 = 165%). */
  scale: number;
}

/** Configuration for an animated highlight bar / underline over text. */
export interface HighlightConfig {
  /** Literal text this highlight is meant to draw attention to (for reference/OCR-assist). */
  text?: string;
  /** Explicit pixel rectangle to highlight, if known ahead of time. */
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** CSS-style color, e.g. "#FFD400" or "rgba(255,212,0,0.85)". Defaults to the global option. */
  color?: string;
  /** Corner radius in px. 0 = sharp rectangle. */
  cornerRadius?: number;
  /** "bar" draws a filled rounded rectangle behind/over the text; "underline" draws a thin line beneath it. */
  mode?: "bar" | "underline";
}

/** Configuration for a single reusable arrow annotation. */
export interface ArrowConfig {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  /** Stroke width in px. */
  width?: number;
  /** Curvature amount; 0 = straight line, positive = bows outward. */
  curvature?: number;
  easing?: EasingPreset;
}

/** Configuration for a single reusable circle annotation (face/logo/number callout). */
export interface CircleConfig {
  x: number;
  y: number;
  radius: number;
  color?: string;
  strokeWidth?: number;
  /** Whether the reveal overshoots slightly before settling ("pop"). */
  bounce?: boolean;
}

/** Fields shared by every timeline item, regardless of type. */
export interface BaseTimelineItem {
  type: TimelineItemType;
  start: TimecodeString;
  end: TimecodeString;
  /** How this item transitions back to the talking head when it ends. Defaults to the global option. */
  returnTransition?: ReturnTransition;
}

/** The always-present talking-head base layer. */
export interface TalkingHeadItem extends BaseTimelineItem {
  type: "talking_head";
  /** Optional slight push-in for emphasis, e.g. { enabled: true, scale: 115 }. Scale is 100-200. */
  punchIn?: {
    enabled: boolean;
    scale: number;
  };
  /** Cut the shot short and jump straight to the next marker/segment. */
  jumpCut?: boolean;
}

/** Any non-talking-head asset placed over/alongside the talking head. */
export interface AssetTimelineItem extends BaseTimelineItem {
  type: Exclude<TimelineItemType, "talking_head">;
  /** Filename inside the imported asset folder, e.g. "headline_01.png". */
  asset: string;
  /** Free-text description of what to emphasize (used by headline/document/article presets). */
  highlight?: string | HighlightConfig;
  /** Ken-Burns style zoom/pan target. */
  zoomTarget?: ZoomTarget;
  /** Zero or more arrow annotations to draw during this segment. */
  arrows?: ArrowConfig[];
  /** Zero or more circle annotations to draw during this segment. */
  circles?: CircleConfig[];
  /** Name of the motion preset to use; defaults to a type-based default (see presets registry). */
  preset?: string;
}

export type TimelineItem = TalkingHeadItem | AssetTimelineItem;

/** The root Timeline JSON document. */
export interface TimelineDocument {
  timeline: TimelineItem[];
}

/** Type guard: is this item the talking-head base layer? */
export function isTalkingHeadItem(item: TimelineItem): item is TalkingHeadItem {
  return item.type === "talking_head";
}

/** Type guard: is this item a placeable asset (i.e. not talking-head)? */
export function isAssetItem(item: TimelineItem): item is AssetTimelineItem {
  return item.type !== "talking_head";
}
