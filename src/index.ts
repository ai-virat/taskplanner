/**
 * Library entry point (re-exports the core engine).
 *
 * The UXP panel bootstrap (module 4) and the Premiere host bridge
 * (module 2) both import from here. This file intentionally has no
 * side effects so it can be imported from a plain Node test script too.
 */

export * from "./types/timeline.types.js";
export * from "./types/config.types.js";
export * from "./core/TimecodeUtils.js";
export * from "./core/TimelineParser.js";
export * from "./core/Logger.js";
export * from "./core/errors.js";
export * from "./core/TranscriptParser.js";
export * from "./core/BatchProcessor.js";

export * from "./host/PremiereTypes.js";
export * from "./host/IPremiereHost.js";
export * from "./host/MockPremiereHost.js";
export * from "./host/JumpCutEngine.js";
export * from "./host/TimelineBuilder.js";

export * from "./animations/types.js";
export * from "./animations/RevealAnimation.js";
export * from "./animations/AnnotationAnimations.js";
export * from "./animations/TalkingHeadAnimations.js";
export * from "./animations/SafeZoom.js";
export * from "./animations/presets.js";
export * from "./animations/AnimationEngine.js";
