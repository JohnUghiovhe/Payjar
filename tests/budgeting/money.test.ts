import { describe, expect, test } from '@jest/globals';
import { formatKoboAsNaira, parseNairaToKobo, sumKobo } from '../../src/budgeting/money.js';

describe('money helpers', () => {
  test('converts decimal naira strings to exact integer kobo', () => {
    expect(parseNairaToKobo('1250.50')).toBe(125050n);
    expect(parseNairaToKobo('8')).toBe(800n);
    expect(parseNairaToKobo('0.05')).toBe(5n);
  });

  test('formats positive and negative kobo without floating point', () => {
    expect(formatKoboAsNaira(125050n)).toBe('1250.50');
    expect(formatKoboAsNaira(-5n)).toBe('-0.05');
  });

  test('rejects floating point-like, malformed and over-precise input', () => {
    for (const value of ['1.234', '-1.00', '1e3', '1,000.00', 'abc', '']) {
      expect(() => parseNairaToKobo(value)).toThrow();
    }
  });

  test('sums large values exactly', () => {
    expect(sumKobo([9007199254740993n, 7n])).toBe(9007199254741000n);
  });
});
