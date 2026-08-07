/**
 * Global extension options, editable from the panel's "Options" section.
 * These act as defaults; any per-item field in the Timeline JSON overrides
 * the corresponding option for that item only.
 */
import type { EasingPreset, ReturnTransition } from "./timeline.types.js";

export interface SafeMargins {
  /** Percentage of frame width/height kept clear on each edge (title-safe style). */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ExtensionOptions {
  /** Global animation speed multiplier. 1.0 = authored default duration. */
  animationSpeed: number;
  /** Default color for highlight bars/underlines when an item doesn't specify one. */
  highlightColor: string;
  /** Default arrow visual style. */
  arrowStyle: {
    color: string;
    width: number;
    curvature: number;
    easing: EasingPreset;
  };
  /** Default transition used to return to the talking head. */
  transitionStyle: ReturnTransition;
  /** Default Ken-Burns scale (%) applied when an item has no explicit zoomTarget. */
  defaultZoom: number;
  safeMargins: SafeMargins;
  /** Whether motion blur is baked into generated animation keyframes. */
  motionBlur: boolean;
  /**
   * Absolute paths to editor-authored graphic templates (e.g. .mogrt files)
   * used to render arrow/circle/highlight-bar annotations. An annotation
   * whose template isn't configured here is skipped with a warning rather
   * than silently guessed at -- see docs/ARCHITECTURE.md.
   */
  graphicsTemplates: {
    arrow?: string;
    circle?: string;
    highlightBar?: string;
  };
}

export const DEFAULT_EXTENSION_OPTIONS: ExtensionOptions = {
  animationSpeed: 1.0,
  highlightColor: "#FFD400",
  arrowStyle: {
    color: "#FF3B30",
    width: 10,
    curvature: 0,
    easing: "ease_out",
  },
  transitionStyle: "fade",
  defaultZoom: 115,
  safeMargins: { top: 5, bottom: 5, left: 5, right: 5 },
  motionBlur: true,
  graphicsTemplates: {},
};
