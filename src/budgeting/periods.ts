import type { LocalDate } from './types.ts';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toUtcDate = (date: LocalDate): Date => {
  if (!DATE_PATTERN.test(date)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }

  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));

  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error('Date is not a valid calendar date.');
  }

  return result;
};

const formatUtcDate = (date: Date): LocalDate =>
  date.toISOString().slice(0, 10);

export const addCalendarDays = (date: LocalDate, days: number): LocalDate => {
  if (!Number.isInteger(days)) {
    throw new Error('Days must be an integer.');
  }

  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return formatUtcDate(result);
};

/** Count both the start and end dates. */
export const countCalendarDaysInclusive = (start: LocalDate, end: LocalDate): number => {
  const startDate = toUtcDate(start);
  const endDate = toUtcDate(end);
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

  if (days <= 0) {
    throw new Error('Period end must be on or after period start.');
  }

  return days;
};

export const getMondayWeekStart = (date: LocalDate): LocalDate => {
  const parsed = toUtcDate(date);
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  return formatUtcDate(parsed);
};
