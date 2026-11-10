import { describe, expect, test } from '@jest/globals';
import { applyJarRollover, getDefaultRolloverPolicy } from '../../src/budgeting/rollover.js';

describe('jar rollover', () => {
  test('new savings jars carry forward by default', () => {
    expect(getDefaultRolloverPolicy('savings')).toBe('carry_forward');
  });

  test('new standard jars release unused money to the general pool by default', () => {
    expect(getDefaultRolloverPolicy('standard')).toBe('release_to_general_pool');
  });

  test('carry-forward policy keeps the full closing balance', () => {
    expect(applyJarRollover(12500n, 'carry_forward')).toEqual({
      nextJarBalanceKobo: 12500n,
      releasedToGeneralPoolKobo: 0n,
    });
  });

  test('release policy returns unused positive money to the general pool', () => {
    expect(applyJarRollover(12500n, 'release_to_general_pool')).toEqual({
      nextJarBalanceKobo: 0n,
      releasedToGeneralPoolKobo: 12500n,
    });
  });

  test('release policy does not erase a negative overspent balance', () => {
    expect(applyJarRollover(-2500n, 'release_to_general_pool')).toEqual({
      nextJarBalanceKobo: -2500n,
      releasedToGeneralPoolKobo: 0n,
    });
  });
});
