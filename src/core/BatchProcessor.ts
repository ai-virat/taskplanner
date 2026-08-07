/**
 * Bonus feature: batch processing across multiple videos in one run, for
 * editors producing 5-20 documentary videos/week. Each job gets its own
 * sequence (via IPremiereHost.createSequence) and one job failing doesn't
 * abort the rest of the batch -- its error is captured and processing
 * continues.
 */

import type { ExtensionOptions } from "../types/config.types.js";
import type { ParsedTimeline } from "./TimelineParser.js";
import type { TimelineBuildResult } from "../host/TimelineBuilder.js";
import type { TimelineBuilder } from "../host/TimelineBuilder.js";
import type { IPremiereHost } from "../host/IPremiereHost.js";
import { Logger } from "./Logger.js";

export interface BatchJob {
  name: string;
  parsed: ParsedTimeline;
  talkingHeadVideoAbsolutePath: string;
  assetFolderAbsolutePath: string;
}

export interface BatchJobResult {
  name: string;
  success: boolean;
  result?: TimelineBuildResult;
  error?: string;
}

export class BatchProcessor {
  constructor(
    private readonly host: IPremiereHost,
    private readonly builder: TimelineBuilder,
    private readonly logger: Logger = new Logger("BatchProcessor")
  ) {}

  async run(jobs: BatchJob[], options: ExtensionOptions): Promise<BatchJobResult[]> {
    const results: BatchJobResult[] = [];

    for (const job of jobs) {
      this.logger.info(`Starting batch job "${job.name}" (${results.length + 1}/${jobs.length})`);
      try {
        await this.host.createSequence(job.name);
        const result = await this.builder.build({
          parsed: job.parsed,
          talkingHeadVideoAbsolutePath: job.talkingHeadVideoAbsolutePath,
          assetFolderAbsolutePath: job.assetFolderAbsolutePath,
          options,
        });
        this.logger.info(`Finished batch job "${job.name}"`);
        results.push({ name: job.name, success: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Batch job "${job.name}" failed: ${message}`);
        results.push({ name: job.name, success: false, error: message });
      }
    }

    return results;
  }
}
