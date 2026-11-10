import { describe, expect, test } from '@jest/globals';
import {
  calculateAllocationFunding,
  calculateDailyGuidance,
  calculateFlexiblePool,
  calculateFlexibleCapacity,
  calculateJarBalance,
  deriveWeeklyGuidance,
  sumReceivedIncome,
} from '../../src/budgeting/calculations.js';

describe('budget calculations', () => {
  test('calculates flexible pool from confirmed funds and outstanding reservations', () => {
    expect(calculateFlexiblePool({
      startingAvailableKobo: 500000n,
      receivedIncomeKobo: 100000n,
      periodExpensesKobo: 75000n,
      unpaidCommitmentsKobo: 125000n,
      protectedSavingsKobo: 50000n,
      otherReservationsKobo: 25000n,
    })).toEqual({
      flexiblePoolKobo: 325000n,
      isInShortfall: false,
      shortfallKobo: 0n,
    });
  });

  test('reports a negative flexible pool as a shortfall, not a negative daily allowance', () => {
    expect(calculateFlexiblePool({
      startingAvailableKobo: 10000n,
      receivedIncomeKobo: 0n,
      periodExpensesKobo: 15000n,
      unpaidCommitmentsKobo: 5000n,
      protectedSavingsKobo: 0n,
      otherReservationsKobo: 0n,
    })).toEqual({
      flexiblePoolKobo: -10000n,
      isInShortfall: true,
      shortfallKobo: 10000n,
    });
  });

  test('counts received income but excludes expected income', () => {
    expect(sumReceivedIncome([
      { amountKobo: 250000n, status: 'received' },
      { amountKobo: 50000n, status: 'expected' },
      { amountKobo: 10000n, status: 'received' },
    ])).toBe(260000n);
  });

  test('allows over-allocation in a draft and reports the unfunded amount', () => {
    const result = calculateAllocationFunding(100000n, [70000n, 50000n]);

    expect(result.allocatedKobo).toBe(120000n);
    expect(result.unallocatedFundsKobo).toBe(-20000n);
    expect(result.unfundedAmountKobo).toBe(20000n);
    expect(result.hasUnfundedAllocationWarning).toBe(true);
  });

  test('calculates jar overspending without moving money from another jar', () => {
    expect(calculateJarBalance(10000n, [5000n], [18000n])).toEqual({
      balanceKobo: -3000n,
      isOverspent: true,
      overspentByKobo: 3000n,
    });
  });

  test('flexible capacity includes only eligible jar balances', () => {
    expect(calculateFlexibleCapacity(2000n, [
      { id: 'daily', balanceKobo: 3000n, eligibleForDailyGuidance: true },
      { id: 'savings', balanceKobo: 9000n, eligibleForDailyGuidance: false },
      { id: 'overspent-flex', balanceKobo: -500n, eligibleForDailyGuidance: true },
    ])).toBe(4500n);
  });

  test('includes weekends and spreads indivisible kobo without losing value', () => {
    const result = calculateDailyGuidance('2026-11-06', '2026-11-08', '2026-11-06', 100n);

    expect(result.remainingDays).toBe(3);
    expect(result.dailyEntries).toEqual([
      { date: '2026-11-06', amountKobo: 34n },
      { date: '2026-11-07', amountKobo: 33n },
      { date: '2026-11-08', amountKobo: 33n },
    ]);
    expect(result.dailyEntries.reduce((sum, day) => sum + day.amountKobo, 0n)).toBe(100n);
  });

  test('returns zero guidance and a shortfall state for a negative flexible pool', () => {
    const result = calculateDailyGuidance('2026-11-01', '2026-11-03', '2026-11-02', -500n);

    expect(result.status).toBe('shortfall');
    expect(result.dailyEntries.map(day => day.amountKobo)).toEqual([0n, 0n]);
  });

  test('returns a completed state instead of dividing by zero', () => {
    const result = calculateDailyGuidance('2026-11-01', '2026-11-03', '2026-11-04', 500n);

    expect(result.status).toBe('period_complete');
    expect(result.remainingDays).toBe(0);
    expect(result.dailyEntries).toHaveLength(0);
  });

  test('derives weekly totals from daily entries using Monday to Sunday', () => {
    const daily = calculateDailyGuidance('2026-11-01', '2026-11-10', '2026-11-01', 1000n).dailyEntries;
    const weekly = deriveWeeklyGuidance(daily);

    expect(weekly.map(week => week.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(weekly.reduce((sum, week) => sum + week.amountKobo, 0n)).toBe(1000n);
    expect(weekly.map(week => week.days)).toEqual([1, 7, 2]);
  });
});
