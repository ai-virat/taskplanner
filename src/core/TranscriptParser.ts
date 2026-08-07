/**
 * Parses the "Import Transcript" input (.srt / .vtt / .txt). Per the
 * spec's data flow, the transcript is what an upstream process uses to
 * *author* the Timeline JSON -- this extension doesn't re-derive editing
 * decisions from it. Parsing it here is for the panel's reference/preview
 * pane (and any future tooling built on top), not for driving the build.
 */

import { parseTimecodeToSeconds } from "./TimecodeUtils.js";

export interface TranscriptCue {
  text: string;
  /** Present for .srt/.vtt; absent for plain .txt (no timing information). */
  startSeconds?: number;
  endSeconds?: number;
}

export type TranscriptFormat = "srt" | "vtt" | "txt";

/** Picks a format from a filename's extension; throws on anything else. */
export function detectTranscriptFormat(fileName: string): TranscriptFormat {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "srt" || ext === "vtt" || ext === "txt") {
    return ext;
  }
  throw new Error(`Unsupported transcript file extension: "${fileName}" (expected .srt, .vtt, or .txt)`);
}

export function parseTranscript(content: string, format: TranscriptFormat): TranscriptCue[] {
  switch (format) {
    case "srt":
      return parseSrt(content);
    case "vtt":
      return parseVtt(content);
    case "txt":
      return parseTxt(content);
  }
}

function parseSrt(content: string): TranscriptCue[] {
  const blocks = splitBlocks(content);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex === -1) continue;

    const [startRaw, endRaw] = lines[timingIndex]!.split("-->").map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .trim();
    if (!text) continue;

    cues.push({
      text,
      startSeconds: parseTimecodeToSeconds(startRaw.replace(",", ".")),
      endSeconds: parseTimecodeToSeconds(endRaw.replace(",", ".")),
    });
  }
  return cues;
}

function parseVtt(content: string): TranscriptCue[] {
  const withoutHeader = content.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n?/, "");
  const blocks = splitBlocks(withoutHeader);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex === -1) continue;

    const parts = lines[timingIndex]!.split(" ").filter(Boolean);
    const startRaw = parts[0];
    const endRaw = parts[2];
    if (!startRaw || !endRaw) continue;

    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .trim();
    if (!text) continue;

    cues.push({
      text,
      startSeconds: parseTimecodeToSeconds(startRaw),
      endSeconds: parseTimecodeToSeconds(endRaw),
    });
  }
  return cues;
}

function parseTxt(content: string): TranscriptCue[] {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function splitBlocks(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}
