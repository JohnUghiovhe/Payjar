import { describe, expect, test } from '@jest/globals';
import { addCalendarDays, countCalendarDaysInclusive, getMondayWeekStart } from '../../src/budgeting/periods';

describe('period helpers', () => {
  test('counts both period boundary days', () => {
    expect(countCalendarDaysInclusive('2026-11-01', '2026-11-30')).toBe(30);
  });

  test('counts leap day and crosses month/year boundaries', () => {
    expect(countCalendarDaysInclusive('2024-02-28', '2024-03-01')).toBe(3);
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('rejects invalid dates and reversed periods', () => {
    expect(() => countCalendarDaysInclusive('2026-02-30', '2026-03-01')).toThrow();
    expect(() => countCalendarDaysInclusive('2026-03-02', '2026-03-01')).toThrow();
  });

  test('uses Monday as the start of the week', () => {
    expect(getMondayWeekStart('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(getMondayWeekStart('2026-11-02')).toBe('2026-11-02'); // Monday
  });
});
