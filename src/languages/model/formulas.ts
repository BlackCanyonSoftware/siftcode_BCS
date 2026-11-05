import type { CodeMetrics, HalsteadCounts, HalsteadMetrics } from './types.js';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Halstead volume, N * log2(n), before rounding; 0 for code with no tokens. */
function exactVolume(counts: HalsteadCounts): number {
  const vocabulary = counts.distinctOperators + counts.distinctOperands;
  const length = counts.totalOperators + counts.totalOperands;
  return vocabulary > 0 && length > 0 ? length * Math.log2(vocabulary) : 0;
}

/** Halstead's measures from raw counts (Halstead, Elements of Software Science, 1977). */
export function halstead(counts: HalsteadCounts): HalsteadMetrics {
  const vocabulary = counts.distinctOperators + counts.distinctOperands;
  const length = counts.totalOperators + counts.totalOperands;
  const volume = exactVolume(counts);
  const difficulty =
    counts.distinctOperands > 0
      ? (counts.distinctOperators / 2) * (counts.totalOperands / counts.distinctOperands)
      : 0;
  return {
    ...counts,
    vocabulary,
    length,
    volume: round2(volume),
    difficulty: round2(difficulty),
    effort: round2(difficulty * volume),
  };
}

/**
 * Maintainability Index in the 0 to 100 form used by Visual Studio:
 * `max(0, (171 - 5.2 ln(V) - 0.23 G - 16.2 ln(LOC)) * 100 / 171)`, where V is Halstead volume,
 * G is cyclomatic complexity, and LOC is lines of code. Code with no tokens scores 100.
 */
export function maintainabilityIndex(
  volume: number,
  cyclomatic: number,
  codeLines: number,
): number {
  if (volume <= 0 || codeLines <= 0) {
    return 100;
  }
  const raw = 171 - 5.2 * Math.log(volume) - 0.23 * cyclomatic - 16.2 * Math.log(codeLines);
  return round2(Math.min(100, Math.max(0, (raw * 100) / 171)));
}

export interface RawMeasure {
  readonly cyclomatic: number;
  readonly codeLines: number;
  readonly halstead: HalsteadCounts;
}

/** Turns raw counts into the full set of measures, including the Maintainability Index. */
export function buildMetrics(raw: RawMeasure): CodeMetrics {
  const measures = halstead(raw.halstead);
  return {
    codeLines: raw.codeLines,
    cyclomatic: raw.cyclomatic,
    halstead: measures,
    // Use the unrounded volume so the index does not depend on the rounding of what is displayed.
    maintainabilityIndex: maintainabilityIndex(
      exactVolume(raw.halstead),
      raw.cyclomatic,
      raw.codeLines,
    ),
  };
}
