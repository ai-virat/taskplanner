/**
 * Timecode <-> seconds <-> Premiere "ticks" conversions.
 *
 * Premiere Pro's scripting APIs (both legacy ExtendScript and the newer UXP
 * host bridge) express positions on a sequence as "ticks": a fixed-rate
 * integer clock independent of frame rate, used so edits stay frame-accurate
 * regardless of the project's timebase.
 */

/** Adobe's fixed tick rate: ticks per second of real time, for every Premiere sequence. */
export const PREMIERE_TICKS_PER_SECOND = 254_016_000_000n;

const TIMECODE_HMS = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const TIMECODE_HMSF = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{1,3})$/;

export class TimecodeParseError extends Error {
  constructor(public readonly rawValue: string, reason: string) {
    super(`Invalid timecode "${rawValue}": ${reason}`);
    this.name = "TimecodeParseError";
  }
}

/**
 * Parses a timecode string into total seconds (as a float).
 *
 * Supports:
 *   "HH:MM:SS"        (whole seconds)
 *   "HH:MM:SS.mmm"    (fractional seconds)
 *   "HH:MM:SS:FF"     (frame count; requires `frameRate`)
 */
export function parseTimecodeToSeconds(
  timecode: string,
  frameRate?: number
): number {
  const trimmed = timecode.trim();

  const hmsMatch = TIMECODE_HMS.exec(trimmed);
  if (hmsMatch) {
    const [, hh, mm, ss, ms] = hmsMatch;
    const hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ss);
    const millis = ms ? Number(ms.padEnd(3, "0")) : 0;
    validateClockFields(trimmed, hours, minutes, seconds);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  const hmsfMatch = TIMECODE_HMSF.exec(trimmed);
  if (hmsfMatch) {
    if (!frameRate || frameRate <= 0) {
      throw new TimecodeParseError(
        trimmed,
        "frame-based timecode (HH:MM:SS:FF) requires a positive frameRate"
      );
    }
    const [, hh, mm, ss, ff] = hmsfMatch;
    const hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ss);
    const frames = Number(ff);
    validateClockFields(trimmed, hours, minutes, seconds);
    if (frames >= frameRate) {
      throw new TimecodeParseError(
        trimmed,
        `frame value ${frames} is out of range for frameRate ${frameRate}`
      );
    }
    return hours * 3600 + minutes * 60 + seconds + frames / frameRate;
  }

  throw new TimecodeParseError(
    trimmed,
    'expected "HH:MM:SS", "HH:MM:SS.mmm", or "HH:MM:SS:FF"'
  );
}

function validateClockFields(
  raw: string,
  hours: number,
  minutes: number,
  seconds: number
): void {
  if (minutes >= 60) {
    throw new TimecodeParseError(raw, `minutes ${minutes} must be < 60`);
  }
  if (seconds >= 60) {
    throw new TimecodeParseError(raw, `seconds ${seconds} must be < 60`);
  }
  if (hours < 0 || minutes < 0 || seconds < 0) {
    throw new TimecodeParseError(raw, "components must be non-negative");
  }
}

/** Converts a duration in seconds to Premiere ticks (rounded to the nearest tick). */
export function secondsToTicks(seconds: number): bigint {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(`seconds must be finite, got ${seconds}`);
  }
  return BigInt(Math.round(seconds * Number(PREMIERE_TICKS_PER_SECOND)));
}

/** Converts Premiere ticks back to seconds. */
export function ticksToSeconds(ticks: bigint): number {
  return Number(ticks) / Number(PREMIERE_TICKS_PER_SECOND);
}

/** Formats a duration in seconds back into "HH:MM:SS.mmm" for logging/UI. */
export function formatSecondsToTimecode(totalSeconds: number): string {
  if (totalSeconds < 0) {
    throw new RangeError(`totalSeconds must be non-negative, got ${totalSeconds}`);
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}
