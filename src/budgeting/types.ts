import type { Kobo } from './money.ts';

export type LocalDate = string; // YYYY-MM-DD in the user's planning timezone.
export type RolloverPolicy = 'carry_forward' | 'release_to_general_pool';
export type JarKind = 'savings' | 'standard';

export interface IncomeEntry {
  amountKobo: Kobo;
  status: 'expected' | 'received';
}

export interface JarBalanceInput {
  id: string;
  balanceKobo: Kobo;
  eligibleForDailyGuidance: boolean;
}

export interface DailyGuidanceEntry {
  date: LocalDate;
  amountKobo: Kobo;
}

export interface WeeklyGuidanceEntry {
  weekStart: LocalDate; // Monday
  weekEnd: LocalDate; // Sunday, or the final period day
  amountKobo: Kobo;
  days: number;
}
