/**
 * Wires the panel's DOM (index.html) to the core engine, animation engine,
 * and Premiere host bridge. This is the only file that touches `document`.
 *
 * NOTE on "Generate Timeline" vs "Generate Animations" vs "Update Timeline":
 * all three currently run the same full TimelineBuilder.build() pass
 * (import -> place clips -> apply animations -> place annotations). This is
 * a deliberate, documented simplification rather than a half-built
 * incremental-update feature: Premiere's overwriteClip semantics make
 * re-running a build safe (it re-lays the same clips at the same
 * positions), so "regenerate animations after changing an Option" and
 * "re-run after editing the JSON" both just mean "build again." A true
 * incremental mode (touching only the clips that changed) is a reasonable
 * follow-up once this is validated on-host.
 */

import { TimelineParser } from "../core/TimelineParser.js";
import type { ParsedTimeline } from "../core/TimelineParser.js";
import { detectTranscriptFormat, parseTranscript } from "../core/TranscriptParser.js";
import { TimelineBuilder } from "../host/TimelineBuilder.js";
import { PremiereHost } from "../host/PremiereHost.js";
import type { ExtensionOptions } from "../types/config.types.js";
import { OptionsStore } from "./state.js";

interface AppState {
  talkingHeadVideoPath?: string;
  assetFolderPath?: string;
  assetFileNames: string[];
  parsedTimeline?: ParsedTimeline;
}

const state: AppState = { assetFileNames: [] };
const optionsStore = new OptionsStore();

function log(message: string): void {
  const logEl = document.getElementById("log");
  if (!logEl) {
    console.log(message);
    return;
  }
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  logEl.prepend(line);
}

interface PickedFile {
  path: string;
  name: string;
  read: () => Promise<string>;
}

function getUxpStorage(): typeof import("uxp")["storage"] {
  try {
    const uxp = require("uxp") as typeof import("uxp");
    return uxp.storage;
  } catch {
    throw new Error("this action requires running inside the Premiere Pro UXP panel host");
  }
}

async function pickFile(types?: string[]): Promise<PickedFile | undefined> {
  const storage = getUxpStorage();
  const entry = await storage.localFileSystem.getFileForOpening({ types });
  if (!entry || Array.isArray(entry)) return undefined;
  return {
    path: entry.nativePath,
    name: entry.name,
    read: async () => (await entry.read?.({ format: "utf8" })) ?? "",
  };
}

async function pickFolder(): Promise<{ path: string; entries: string[] } | undefined> {
  const storage = getUxpStorage();
  const folder = await storage.localFileSystem.getFolder();
  if (!folder) return undefined;
  const entries = (await folder.getEntries?.()) ?? [];
  return { path: folder.nativePath, entries: entries.filter((e) => e.isFile).map((e) => e.name) };
}

async function onImportVideo(): Promise<void> {
  try {
    const file = await pickFile(["mp4", "mov", "mxf"]);
    if (!file) return;
    state.talkingHeadVideoPath = file.path;
    log(`Talking-head video: ${file.name}`);
  } catch (err) {
    log(`Import Video failed: ${(err as Error).message}`);
  }
}

async function onImportTranscript(): Promise<void> {
  try {
    const file = await pickFile(["srt", "vtt", "txt"]);
    if (!file) return;
    const format = detectTranscriptFormat(file.name);
    const content = await file.read();
    const cues = parseTranscript(content, format);
    log(`Transcript "${file.name}": ${cues.length} cue(s) parsed (reference only -- does not drive the build)`);
  } catch (err) {
    log(`Import Transcript failed: ${(err as Error).message}`);
  }
}

async function onImportAssets(): Promise<void> {
  try {
    const folder = await pickFolder();
    if (!folder) return;
    state.assetFolderPath = folder.path;
    state.assetFileNames = folder.entries;
    log(`Asset folder: ${folder.path} (${folder.entries.length} file(s))`);
  } catch (err) {
    log(`Import Assets failed: ${(err as Error).message}`);
  }
}

async function onImportJson(): Promise<void> {
  try {
    const file = await pickFile(["json"]);
    if (!file) return;
    const content = await file.read();
    const raw = JSON.parse(content);
    const parser = new TimelineParser({ availableAssets: state.assetFileNames });
    state.parsedTimeline = parser.parse(raw);
    log(
      `Timeline JSON "${file.name}": ${state.parsedTimeline.items.length} item(s) ` +
        `(${state.parsedTimeline.talkingHeadItems.length} talking-head, ${state.parsedTimeline.assetItems.length} asset), ` +
        `${state.parsedTimeline.durationSeconds.toFixed(1)}s total`
    );
  } catch (err) {
    log(`Import JSON failed: ${(err as Error).message}`);
  }
}

async function runBuild(label: string): Promise<void> {
  if (!state.parsedTimeline) {
    log(`${label} failed: import a Timeline JSON first.`);
    return;
  }
  if (!state.talkingHeadVideoPath) {
    log(`${label} failed: import the talking-head video first.`);
    return;
  }
  if (!state.assetFolderPath) {
    log(`${label} failed: import the asset folder first.`);
    return;
  }

  try {
    const host = new PremiereHost();
    const builder = new TimelineBuilder(host);
    const result = await builder.build({
      parsed: state.parsedTimeline,
      talkingHeadVideoAbsolutePath: state.talkingHeadVideoPath,
      assetFolderAbsolutePath: state.assetFolderPath,
      options: optionsStore.get(),
    });
    log(
      `${label}: placed ${result.placedTalkingHeadClips} talking-head + ${result.placedAssetClips} asset clip(s), ` +
        `${result.placedAnnotationClips} annotation(s) (${result.skippedAnnotations} skipped), ` +
        `${result.pausesRemoved} pause(s) removed`
    );
    for (const warning of result.warnings) {
      log(`  warning: ${warning}`);
    }
  } catch (err) {
    log(`${label} failed: ${(err as Error).message}`);
  }
}

function setFieldValue(form: HTMLFormElement, name: string, value: string | number): void {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    el.value = String(value);
  }
}

function setFieldChecked(form: HTMLFormElement, name: string, checked: boolean): void {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement) {
    el.checked = checked;
  }
}

function bindOptionsForm(): void {
  const form = document.getElementById("options-form");
  if (!(form instanceof HTMLFormElement)) return;

  const render = (options: ExtensionOptions) => {
    setFieldValue(form, "animationSpeed", options.animationSpeed);
    setFieldValue(form, "highlightColor", options.highlightColor);
    setFieldValue(form, "arrowColor", options.arrowStyle.color);
    setFieldValue(form, "arrowWidth", options.arrowStyle.width);
    setFieldValue(form, "transitionStyle", options.transitionStyle);
    setFieldValue(form, "defaultZoom", options.defaultZoom);
    setFieldValue(form, "safeMarginTop", options.safeMargins.top);
    setFieldValue(form, "safeMarginBottom", options.safeMargins.bottom);
    setFieldValue(form, "safeMarginLeft", options.safeMargins.left);
    setFieldValue(form, "safeMarginRight", options.safeMargins.right);
    setFieldChecked(form, "motionBlur", options.motionBlur);
  };

  render(optionsStore.get());

  form.addEventListener("change", () => {
    const data = new FormData(form);
    const current = optionsStore.get();
    const updated = optionsStore.update({
      animationSpeed: Number(data.get("animationSpeed")) || current.animationSpeed,
      highlightColor: String(data.get("highlightColor") ?? current.highlightColor),
      transitionStyle: (data.get("transitionStyle") as ExtensionOptions["transitionStyle"]) ?? current.transitionStyle,
      defaultZoom: Number(data.get("defaultZoom")) || current.defaultZoom,
      motionBlur: data.get("motionBlur") === "on",
      arrowStyle: {
        ...current.arrowStyle,
        color: String(data.get("arrowColor") ?? current.arrowStyle.color),
        width: Number(data.get("arrowWidth")) || current.arrowStyle.width,
      },
      safeMargins: {
        top: Number(data.get("safeMarginTop")) || 0,
        bottom: Number(data.get("safeMarginBottom")) || 0,
        left: Number(data.get("safeMarginLeft")) || 0,
        right: Number(data.get("safeMarginRight")) || 0,
      },
    });
    render(updated);
    log("Options updated.");
  });
}

function bindButtons(): void {
  document.getElementById("btn-import-video")?.addEventListener("click", () => void onImportVideo());
  document.getElementById("btn-import-transcript")?.addEventListener("click", () => void onImportTranscript());
  document.getElementById("btn-import-assets")?.addEventListener("click", () => void onImportAssets());
  document.getElementById("btn-import-json")?.addEventListener("click", () => void onImportJson());
  document
    .getElementById("btn-generate-timeline")
    ?.addEventListener("click", () => void runBuild("Generate Timeline"));
  document
    .getElementById("btn-generate-animations")
    ?.addEventListener("click", () => void runBuild("Generate Animations"));
  document
    .getElementById("btn-update-timeline")
    ?.addEventListener("click", () => void runBuild("Update Timeline"));
}

function init(): void {
  bindButtons();
  bindOptionsForm();
  log("AI Documentary Editor ready.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
