import { describe, expect, it } from 'vitest';
import {
  buildMetrics,
  halstead,
  maintainabilityIndex,
  round2,
} from '../../src/languages/model/formulas.js';

describe('Halstead measures (US-011)', () => {
  it('derives vocabulary, length, volume, difficulty, and effort from the counts', () => {
    // 3 distinct operators used 3 times, 3 distinct operands used 5 times
    const result = halstead({
      distinctOperators: 3,
      distinctOperands: 3,
      totalOperators: 3,
      totalOperands: 5,
    });

    expect(result.vocabulary).toBe(6);
    expect(result.length).toBe(8);
    expect(result.volume).toBe(20.68); // 8 * log2(6)
    expect(result.difficulty).toBe(2.5); // (3 / 2) * (5 / 3)
    expect(result.effort).toBe(51.7); // 2.5 * 20.6797
  });

  it('is all zeros for code with no tokens, without dividing by zero', () => {
    const result = halstead({
      distinctOperators: 0,
      distinctOperands: 0,
      totalOperators: 0,
      totalOperands: 0,
    });

    expect(result).toMatchObject({ vocabulary: 0, length: 0, volume: 0, difficulty: 0, effort: 0 });
  });

  it('has zero difficulty when there are no operands', () => {
    const result = halstead({
      distinctOperators: 2,
      distinctOperands: 0,
      totalOperators: 4,
      totalOperands: 0,
    });

    expect(result.difficulty).toBe(0);
  });
});

describe('Maintainability Index (US-011)', () => {
  it('follows the Visual Studio formula on a hand-calculated case', () => {
    // 171 - 5.2 ln(20.68) - 0.23 * 1 - 16.2 ln(2) = 143.79; * 100 / 171 = 84.09
    expect(maintainabilityIndex(8 * Math.log2(6), 1, 2)).toBe(84.09);
  });

  it('falls as size, complexity, and volume grow', () => {
    const small = maintainabilityIndex(100, 2, 10);

    expect(maintainabilityIndex(100, 2, 100)).toBeLessThan(small);
    expect(maintainabilityIndex(100, 20, 10)).toBeLessThan(small);
    expect(maintainabilityIndex(10_000, 2, 10)).toBeLessThan(small);
  });

  it('is clamped to the range 0 to 100', () => {
    expect(maintainabilityIndex(0.5, 1, 1)).toBe(100); // the formula gives 101.97
    expect(maintainabilityIndex(1e12, 500, 100_000)).toBe(0);
    expect(maintainabilityIndex(1, 1, 1)).toBe(99.87); // just under the cap, not clamped
  });

  it('is 100 for code with no tokens or no lines', () => {
    expect(maintainabilityIndex(0, 1, 0)).toBe(100);
    expect(maintainabilityIndex(50, 1, 0)).toBe(100);
  });
});

describe('buildMetrics', () => {
  it('assembles all measures and uses the unrounded volume for the index', () => {
    const metrics = buildMetrics({
      cyclomatic: 1,
      codeLines: 2,
      halstead: { distinctOperators: 3, distinctOperands: 3, totalOperators: 3, totalOperands: 5 },
    });

    expect(metrics.codeLines).toBe(2);
    expect(metrics.cyclomatic).toBe(1);
    expect(metrics.halstead.volume).toBe(20.68);
    expect(metrics.maintainabilityIndex).toBe(84.09);
  });

  it('rounds to two decimals', () => {
    expect(round2(1.005 + 1e-9)).toBe(1.01);
    expect(round2(2.5)).toBe(2.5);
  });
});
