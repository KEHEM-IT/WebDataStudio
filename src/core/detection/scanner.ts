import type { DetectionCandidate, DetectionScanOptions } from '@dtypes/detection';
import { detectTables } from './native-table-detector';
import { detectRepeatedPatterns } from './pattern-detector';

const DEFAULT_OPTIONS: DetectionScanOptions = {
  includeShadowDom: false,
  includeSameOriginIframes: false,
  minItemCount: 3,
  maxCandidates: 25
};

/** Orchestrates every detector, dedupes overlapping candidates (an element
 *  already claimed by the table detector shouldn't also surface as a
 *  generic pattern), and returns results ranked by confidence. */
export function scanPage(options: Partial<DetectionScanOptions> = {}): DetectionCandidate[] {
  const opts: DetectionScanOptions = { ...DEFAULT_OPTIONS, ...options };

  const tableCandidates = detectTables(opts.minItemCount);
  const claimedSelectors = new Set(tableCandidates.map((c) => c.element.cssSelector));

  const patternCandidates = detectRepeatedPatterns(opts.minItemCount, opts.maxCandidates)
    .filter((c) => !claimedSelectors.has(c.element.cssSelector));

  const all = [...tableCandidates, ...patternCandidates]
    .sort((a, b) => b.confidence - a.confidence || b.approxItemCount - a.approxItemCount)
    .slice(0, opts.maxCandidates);

  return all;
}
