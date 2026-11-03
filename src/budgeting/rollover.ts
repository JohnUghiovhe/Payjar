import type { JarKind, RolloverPolicy } from './types';
import type { Kobo } from './money';

export const getDefaultRolloverPolicy = (jarKind: JarKind): RolloverPolicy =>
  jarKind === 'savings' ? 'carry_forward' : 'release_to_general_pool';

export interface RolloverResult {
  nextJarBalanceKobo: Kobo;
  releasedToGeneralPoolKobo: Kobo;
}

/**
 * Positive unused money follows the jar's policy.
 * A negative balance is retained as a jar shortfall; it is never silently
 * written off or transferred to another jar.
 */
export const applyJarRollover = (
  closingBalanceKobo: Kobo,
  policy: RolloverPolicy,
): RolloverResult => {
  if (policy === 'carry_forward') {
    return {
      nextJarBalanceKobo: closingBalanceKobo,
      releasedToGeneralPoolKobo: 0n,
    };
  }

  if (closingBalanceKobo < 0n) {
    return {
      nextJarBalanceKobo: closingBalanceKobo,
      releasedToGeneralPoolKobo: 0n,
    };
  }

  return {
    nextJarBalanceKobo: 0n,
    releasedToGeneralPoolKobo: closingBalanceKobo,
  };
};
