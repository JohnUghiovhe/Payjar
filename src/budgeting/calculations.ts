import type { Kobo } from './money.ts';
import { sumKobo } from './money.js';
import { addCalendarDays, countCalendarDaysInclusive, getMondayWeekStart } from './periods.js';
import type {
  DailyGuidanceEntry,
  IncomeEntry,
  JarBalanceInput,
  LocalDate,
  WeeklyGuidanceEntry,
} from './types.ts';

export const sumReceivedIncome = (income: readonly IncomeEntry[]): Kobo =>
  sumKobo(income.filter(entry => entry.status === 'received').map(entry => entry.amountKobo));


export interface FlexiblePoolInput {
  startingAvailableKobo: Kobo;
  receivedIncomeKobo: Kobo;
  periodExpensesKobo: Kobo;
  unpaidCommitmentsKobo: Kobo;
  protectedSavingsKobo: Kobo;
  otherReservationsKobo: Kobo;
}

export interface FlexiblePoolResult {
  flexiblePoolKobo: Kobo;
  isInShortfall: boolean;
  shortfallKobo: Kobo;
}

/**
 * Calculates the amount available for flexible spending.
 * Callers must ensure expenses and reservations are not counted twice
 * (for example, jar spending must not also be included in periodExpenses).
 */
export const calculateFlexiblePool = (input: FlexiblePoolInput): FlexiblePoolResult => {
  const flexiblePoolKobo =
    input.startingAvailableKobo +
    input.receivedIncomeKobo -
    input.periodExpensesKobo -
    input.unpaidCommitmentsKobo -
    input.protectedSavingsKobo -
    input.otherReservationsKobo;

  return {
    flexiblePoolKobo,
    isInShortfall: flexiblePoolKobo < 0n,
    shortfallKobo: flexiblePoolKobo < 0n ? -flexiblePoolKobo : 0n,
  };
};

export interface AllocationFundingResult {
  availableFundsKobo: Kobo;
  allocatedKobo: Kobo;
  unallocatedFundsKobo: Kobo;
  unfundedAmountKobo: Kobo;
  hasUnfundedAllocationWarning: boolean;
}

/** Draft allocations may exceed available funds; this function reports the shortfall but does not reject them. */
export const calculateAllocationFunding = (
  availableFundsKobo: Kobo,
  allocationsKobo: readonly Kobo[],
): AllocationFundingResult => {
  const allocatedKobo = sumKobo(allocationsKobo);
  const unallocatedFundsKobo = availableFundsKobo - allocatedKobo;
  const unfundedAmountKobo = unallocatedFundsKobo < 0n ? -unallocatedFundsKobo : 0n;

  return {
    availableFundsKobo,
    allocatedKobo,
    unallocatedFundsKobo,
    unfundedAmountKobo,
    hasUnfundedAllocationWarning: unfundedAmountKobo > 0n,
  };
};

export interface JarBalanceResult {
  balanceKobo: Kobo;
  isOverspent: boolean;
  overspentByKobo: Kobo;
}

/** Spending can take a jar below zero. The engine reports the shortfall and makes no compensating transfer. */
export const calculateJarBalance = (
  openingBalanceKobo: Kobo,
  allocationsKobo: readonly Kobo[],
  spendingKobo: readonly Kobo[],
): JarBalanceResult => {
  const balanceKobo = openingBalanceKobo + sumKobo(allocationsKobo) - sumKobo(spendingKobo);
  const overspentByKobo = balanceKobo < 0n ? -balanceKobo : 0n;

  return {
    balanceKobo,
    isOverspent: balanceKobo < 0n,
    overspentByKobo,
  };
};

/** Flexible capacity is unallocated money plus balances in jars eligible for flexible spending. */
export const calculateFlexibleCapacity = (
  unallocatedFundsKobo: Kobo,
  jars: readonly JarBalanceInput[],
): Kobo =>
  unallocatedFundsKobo +
  sumKobo(jars.filter(jar => jar.eligibleForDailyGuidance).map(jar => jar.balanceKobo));

export interface DailyGuidanceResult {
  status: 'active' | 'period_not_started' | 'period_complete' | 'shortfall';
  flexibleCapacityKobo: Kobo;
  remainingDays: number;
  dailyEntries: DailyGuidanceEntry[];
  unallocatedRemainderKobo: Kobo;
}

/**
 * Splits the remaining flexible capacity across every remaining calendar day,
 * including weekends. Any indivisible kobo are assigned one at a time to the
 * earliest days, so the daily entries always add up to the exact pool.
 */
export const calculateDailyGuidance = (
  periodStart: LocalDate,
  periodEnd: LocalDate,
  currentDate: LocalDate,
  flexibleCapacityKobo: Kobo,
): DailyGuidanceResult => {
  const periodDays = countCalendarDaysInclusive(periodStart, periodEnd);

  if (currentDate < periodStart) {
    return {
      status: 'period_not_started',
      flexibleCapacityKobo,
      remainingDays: periodDays,
      dailyEntries: [],
      unallocatedRemainderKobo: flexibleCapacityKobo > 0n ? flexibleCapacityKobo : 0n,
    };
  }

  if (currentDate > periodEnd) {
    return {
      status: 'period_complete',
      flexibleCapacityKobo,
      remainingDays: 0,
      dailyEntries: [],
      unallocatedRemainderKobo: flexibleCapacityKobo > 0n ? flexibleCapacityKobo : 0n,
    };
  }

  const remainingDays = countCalendarDaysInclusive(currentDate, periodEnd);

  if (flexibleCapacityKobo < 0n) {
    return {
      status: 'shortfall',
      flexibleCapacityKobo,
      remainingDays,
      dailyEntries: Array.from({ length: remainingDays }, (_, index) => ({
        date: addCalendarDays(currentDate, index),
        amountKobo: 0n,
      })),
      unallocatedRemainderKobo: 0n,
    };
  }

  const baseDailyAmount = flexibleCapacityKobo / BigInt(remainingDays);
  const remainder = flexibleCapacityKobo % BigInt(remainingDays);
  const remainderDays = Number(remainder);

  const dailyEntries = Array.from({ length: remainingDays }, (_, index) => ({
    date: addCalendarDays(currentDate, index),
    amountKobo: baseDailyAmount + (index < remainderDays ? 1n : 0n),
  }));

  return {
    status: 'active',
    flexibleCapacityKobo,
    remainingDays,
    dailyEntries,
    unallocatedRemainderKobo: 0n,
  };
};

/** Weekly guidance is a sum of daily entries, grouped Monday through Sunday. */
export const deriveWeeklyGuidance = (
  dailyEntries: readonly DailyGuidanceEntry[],
): WeeklyGuidanceEntry[] => {
  const weeks = new Map<LocalDate, WeeklyGuidanceEntry>();

  for (const entry of dailyEntries) {
    const weekStart = getMondayWeekStart(entry.date);
    const existing = weeks.get(weekStart);

    if (existing) {
      existing.amountKobo += entry.amountKobo;
      existing.days += 1;
      if (entry.date > existing.weekEnd) existing.weekEnd = entry.date;
      continue;
    }

    weeks.set(weekStart, {
      weekStart,
      weekEnd: entry.date,
      amountKobo: entry.amountKobo,
      days: 1,
    });
  }

  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
};
