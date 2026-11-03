export type Kobo = bigint;

/**
 * Parse a user/API decimal amount into integer kobo.
 * Accepts strings only so binary floating-point values never enter money logic.
 */
export const parseNairaToKobo = (amount: string): Kobo => {
  const value = amount.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    throw new Error('Amount must be a non-negative decimal with at most two decimal places.');
  }

  const naira = BigInt(match[1]);
  const kobo = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return naira * 100n + kobo;
};

export const formatKoboAsNaira = (amount: Kobo): string => {
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const naira = absolute / 100n;
  const kobo = (absolute % 100n).toString().padStart(2, '0');
  return `${sign}${naira}.${kobo}`;
};

export const sumKobo = (amounts: readonly Kobo[]): Kobo =>
  amounts.reduce((total, amount) => total + amount, 0n);
