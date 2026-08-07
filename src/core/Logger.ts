/**
 * Minimal leveled logger shared across the extension. Kept dependency-free
 * so it works identically inside the UXP panel context and in plain Node
 * (e.g. for the standalone test scripts).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  constructor(
    private readonly scope: string,
    private minLevel: LogLevel = "info"
  ) {}

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log("debug", message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log("info", message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log("warn", message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log("error", message, args);
  }

  child(subScope: string): Logger {
    return new Logger(`${this.scope}:${subScope}`, this.minLevel);
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return;
    }
    const prefix = `[AI Documentary Editor][${this.scope}][${level.toUpperCase()}]`;
    const consoleMethod =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleMethod(prefix, message, ...args);
  }
}
