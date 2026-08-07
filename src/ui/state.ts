/**
 * Persists ExtensionOptions across panel sessions via localStorage (present
 * in the UXP panel's Chromium-based webview). Falls back to in-memory-only
 * defaults if storage is unavailable for any reason -- persistence is a
 * convenience, never a hard requirement for the panel to function.
 */

import { DEFAULT_EXTENSION_OPTIONS } from "../types/config.types.js";
import type { ExtensionOptions } from "../types/config.types.js";

const STORAGE_KEY = "ai-documentary-editor:options";

export class OptionsStore {
  private options: ExtensionOptions;

  constructor() {
    this.options = this.load();
  }

  get(): ExtensionOptions {
    return this.options;
  }

  update(patch: Partial<ExtensionOptions>): ExtensionOptions {
    this.options = { ...this.options, ...patch };
    this.save();
    return this.options;
  }

  reset(): ExtensionOptions {
    this.options = { ...DEFAULT_EXTENSION_OPTIONS };
    this.save();
    return this.options;
  }

  private load(): ExtensionOptions {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_EXTENSION_OPTIONS };
      return { ...DEFAULT_EXTENSION_OPTIONS, ...(JSON.parse(raw) as Partial<ExtensionOptions>) };
    } catch {
      return { ...DEFAULT_EXTENSION_OPTIONS };
    }
  }

  private save(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.options));
    } catch {
      // Best-effort persistence only; the in-memory copy remains authoritative for this session.
    }
  }
}
