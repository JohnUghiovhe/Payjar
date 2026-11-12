import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';

import {
  calculateAllocationFunding,
  calculateDailyGuidance,
  calculateFlexiblePool,
  calculateJarBalance,
  deriveWeeklyGuidance,
  sumReceivedIncome,
  type AllocationFundingResult,
  type DailyGuidanceResult,
  type FlexiblePoolResult,
} from '../budgeting/calculations.js';
import type { Kobo } from '../budgeting/money.js';
import type {
  IncomeEntry as CalculationIncomeEntry,
  LocalDate,
  WeeklyGuidanceEntry,
} from '../budgeting/types.js';
import { AppError } from '../errors.js';
import {
  createBudget as createBudgetRecord,
  createBudgetPeriod as createBudgetPeriodRecord,
  claimIdempotencyKey,
  completeIdempotencyKey,
  getActiveBudgetPeriod,
  getBudget as getBudgetRecord,
  getBudgetForUpdate,
  getBudgetPeriod,
  getBudgetPeriodForUpdate,
  getCategory,
  getExpense,
  getIncomeSource,
  getJar,
  getUserActiveBudget,
  listCommitments,
  listExpenses,
  listIncomeEntries,
  listJarAllocations,
  listJarCarryForwards,
  listJars,
  recordExpense as recordExpenseRecord,
  recordIncomeEntry,
  RepositoryError,
  saveJarAllocation,
  updateBudget as updateBudgetRecord,
  type Budget,
  type BudgetPeriod,
  type BudgetPeriodType,
  type Expense,
  type IncomeEntry,
  type Jar,
  type JarAllocation,
} from '../repositories/budgeting/index.js';

export type BudgetingPool = Pick<Pool, 'connect' | 'query'>;

export interface CreateBudgetPeriodCommand {
  startsOn: LocalDate;
  endsOn: LocalDate;
  name?: string | null;
  openingUnallocatedKobo?: Kobo;
}

export interface CreateBudgetCommand {
  userId: string;
  idempotencyKey: string;
  name: string;
  periodType: BudgetPeriodType;
  timezone: string;
  currency?: 'NGN';
  initialPeriod?: CreateBudgetPeriodCommand;
}

export interface UpdateBudgetCommand {
  userId: string;
  budgetId: string;
  expectedVersion: number;
  name?: string;
  periodType?: BudgetPeriodType;
  timezone?: string;
  status?: Budget['status'];
}

export interface GetBudgetStateCommand {
  userId: string;
  budgetId?: string;
  periodId?: string;
  currentDate?: LocalDate;
}

export interface JarAllocationCommand {
  jarId: string;
  amountKobo: Kobo;
  note?: string | null;
  /** 0 requires the allocation not to exist; positive values must match its stored version. */
  expectedVersion: number;
}

export interface SaveJarAllocationsCommand {
  userId: string;
  budgetId: string;
  periodId: string;
  allocations: readonly JarAllocationCommand[];
}

export interface RecordIncomeCommand {
  userId: string;
  idempotencyKey: string;
  periodId: string;
  incomeSourceId?: string | null;
  amountKobo: Kobo;
  status: IncomeEntry['status'];
  expectedOn?: LocalDate | null;
  receivedAt?: string | null;
  note?: string | null;
}

export interface RecordExpenseCommand {
  userId: string;
  idempotencyKey: string;
  periodId: string;
  categoryId: string;
  jarId?: string | null;
  entryType?: Expense['entryType'];
  adjustsExpenseId?: string | null;
  amountKobo: Kobo;
  merchant?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  occurredAt: string;
  source?: Expense['source'];
}

export interface JarState {
  jar: Jar;
  openingBalanceKobo: Kobo;
  allocatedKobo: Kobo;
  spentKobo: Kobo;
  balanceKobo: Kobo;
  isOverspent: boolean;
  overspentByKobo: Kobo;
}

export interface BudgetState {
  budget: Budget;
  period: BudgetPeriod;
  asOfDate: LocalDate;
  jars: JarState[];
  allocations: JarAllocation[];
  inputs: {
    startingAvailableKobo: Kobo;
    receivedIncomeKobo: Kobo;
    periodExpensesKobo: Kobo;
    unpaidCommitmentsKobo: Kobo;
    protectedSavingsKobo: Kobo;
    otherReservationsKobo: Kobo;
  };
  flexiblePool: FlexiblePoolResult;
  allocationFunding: AllocationFundingResult;
  flexibleCapacityKobo: Kobo;
  dailyGuidance: DailyGuidanceResult;
  weeklyGuidance: WeeklyGuidanceEntry[];
}

export interface SaveJarAllocationsResult {
  allocations: JarAllocation[];
  funding: AllocationFundingResult;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const canonicalize = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

const hashRequest = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

const requireStoredResponse = <Result>(
  response: unknown,
  operation: string,
): Result => {
  if (response === null || typeof response !== 'object') {
    throw new RepositoryError(
      operation,
      `${operation} idempotency response is invalid.`,
    );
  }

  return response as Result;
};

const claimIdempotentRequest = async (
  client: PoolClient,
  input: { scope: string; key: string; requestHash: string },
  operation: string,
): Promise<{ isReplay: boolean; response: unknown }> => {
  const claim = await claimIdempotencyKey(client, input);

  if (claim.claimed) {
    return { isReplay: false, response: null };
  }

  if (!claim.requestHashMatches) {
    throw new AppError(
      409,
      'Idempotency key reuse detected with a different payload.',
    );
  }

  if (claim.response === null) {
    throw new RepositoryError(
      operation,
      `${operation} idempotency response is missing.`,
    );
  }

  return { isReplay: true, response: claim.response };
};

const restoreKoboResponse = <Result extends { amountKobo: Kobo }>(
  response: unknown,
  operation: string,
): Result => {
  const stored = requireStoredResponse<Record<string, unknown>>(
    response,
    operation,
  );
  const amountKobo = stored.amountKobo;

  if (typeof amountKobo !== 'string' || !/^-?\d+$/.test(amountKobo)) {
    throw new RepositoryError(
      operation,
      `${operation} idempotency response has an invalid amount.`,
    );
  }

  return { ...stored, amountKobo: BigInt(amountKobo) } as Result;
};

const requireNonEmpty = (value: string | null | undefined, field: string): void => {
  if (!value || !value.trim()) {
    throw new AppError(400, `${field} is required.`);
  }
};

const requirePositiveKobo = (value: Kobo, field: string): void => {
  if (value <= 0n) {
    throw new AppError(400, `${field} must be greater than zero.`);
  }
};

const requireNonNegativeKobo = (value: Kobo, field: string): void => {
  if (value < 0n) {
    throw new AppError(400, `${field} must not be negative.`);
  }
};

const requireExpectedVersion = (
  value: number,
  field = 'expectedVersion',
): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(400, `${field} must be a positive integer.`);
  }
};

const requireValidTimeZone = (value: string): void => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    throw new AppError(400, 'timezone must be a recognised IANA timezone.');
  }
};

const requireOptionalTimestamp = (
  value: string | null | undefined,
  field: string,
): void => {
  if (value !== null && value !== undefined && Number.isNaN(Date.parse(value))) {
    throw new AppError(400, `${field} must be a valid ISO timestamp.`);
  }
};

const isUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof RepositoryError)) return false;

  const cause = error.cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code?: unknown }).code === '23505'
  );
};

const isActiveBudgetConflict = (error: unknown): boolean =>
  isUniqueViolation(error) &&
  error instanceof RepositoryError &&
  /budgets_one_active_per_user/i.test(describeError(error.cause));

const localDateInTimeZone = (timeZone: string, now: Date): LocalDate => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const part = (type: string): string | undefined =>
      parts.find(item => item.type === type)?.value;

    const year = part('year');
    const month = part('month');
    const day = part('day');

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    throw new AppError(
      500,
      `Could not calculate the local date for timezone ${timeZone}: ${describeError(error)}`,
    );
  }

  throw new AppError(500, `Could not calculate the local date for timezone ${timeZone}.`);
};

const withTransaction = async <Result>(
  pool: BudgetingPool,
  operation: string,
  callback: (client: PoolClient) => Promise<Result>,
): Promise<Result> => {
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    throw new AppError(
      503,
      `Could not connect to the database for ${operation}: ${describeError(error)}`,
    );
  }

  let clientReleased = false;

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    let rollbackError: unknown;
    try {
      await client.query('ROLLBACK');
    } catch (failure) {
      rollbackError = failure;
    }

    if (rollbackError !== undefined) {
      const failure =
        rollbackError instanceof Error
          ? rollbackError
          : new Error(describeError(rollbackError));
      client.release(failure);
      clientReleased = true;
      throw new RepositoryError(
        operation,
        `${operation} failed: ${describeError(error)}; rollback failed: ${describeError(rollbackError)}`,
        error,
      );
    }

    if (error instanceof AppError || error instanceof RepositoryError) {
      throw error;
    }

    throw new RepositoryError(
      operation,
      `${operation} failed: ${describeError(error)}`,
      error,
    );
  } finally {
    if (!clientReleased) client.release();
  }
};

const signedExpenseKobo = (expense: Expense): Kobo =>
  expense.entryType === 'refund' ? -expense.amountKobo : expense.amountKobo;

export class BudgetingService {
  constructor(
    private readonly pool: BudgetingPool,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Creates an active budget and, optionally, its first active period. The
   * active-budget check and the writes share one transaction; PostgreSQL's
   * partial unique index is the final guard against concurrent creates.
   */
  async createBudget(command: CreateBudgetCommand): Promise<Budget> {
    requireNonEmpty(command.userId, 'userId');
    requireNonEmpty(command.idempotencyKey, 'idempotencyKey');
    requireNonEmpty(command.name, 'name');
    requireNonEmpty(command.timezone, 'timezone');
    requireValidTimeZone(command.timezone);

    if (command.initialPeriod) {
      requireNonEmpty(command.initialPeriod.startsOn, 'initialPeriod.startsOn');
      requireNonEmpty(command.initialPeriod.endsOn, 'initialPeriod.endsOn');
    }

    try {
      return await withTransaction(this.pool, 'createBudget', async client => {
        const requestHash = hashRequest(command);
        const idempotency = await claimIdempotentRequest(
          client,
          {
            scope: `budgeting:budget:${command.userId}`,
            key: command.idempotencyKey,
            requestHash,
          },
          'createBudget',
        );

        if (idempotency.isReplay) {
          return requireStoredResponse<Budget>(
            idempotency.response,
            'createBudget',
          );
        }

        const existing = await getUserActiveBudget(client, command.userId);

        if (existing) {
          throw new AppError(409, 'User already has an active budget.');
        }

        const budget = await createBudgetRecord(client, {
          userId: command.userId,
          name: command.name,
          periodType: command.periodType,
          timezone: command.timezone,
          currency: command.currency,
        });

        if (command.initialPeriod) {
          await createBudgetPeriodRecord(client, {
            budgetId: budget.id,
            userId: command.userId,
            sequence: 1,
            name: command.initialPeriod.name ?? null,
            startsOn: command.initialPeriod.startsOn,
            endsOn: command.initialPeriod.endsOn,
            timezone: command.timezone,
            currency: budget.currency,
            status: 'active',
            openingUnallocatedKobo:
              command.initialPeriod.openingUnallocatedKobo ?? 0n,
          });
        }

        await completeIdempotencyKey(client, {
          scope: `budgeting:budget:${command.userId}`,
          key: command.idempotencyKey,
          requestHash,
          response: budget,
        });

        return budget;
      });
    } catch (error) {
      if (isActiveBudgetConflict(error)) {
        throw new AppError(409, 'User already has an active budget.');
      }

      throw error;
    }
  }

  /**
   * Updates mutable budget configuration using optimistic version checking.
   */
  async updateBudget(command: UpdateBudgetCommand): Promise<Budget> {
    requireNonEmpty(command.userId, 'userId');
    requireNonEmpty(command.budgetId, 'budgetId');
    requireExpectedVersion(command.expectedVersion);
    if (command.timezone !== undefined) requireValidTimeZone(command.timezone);

    try {
      return await withTransaction(this.pool, 'updateBudget', async client => {
        const existing = await getBudgetForUpdate(client, command.budgetId);

        if (!existing || existing.userId !== command.userId) {
          throw new AppError(404, 'Budget not found.');
        }

        const updated = await updateBudgetRecord(client, {
          budgetId: command.budgetId,
          expectedVersion: command.expectedVersion,
          name: command.name,
          periodType: command.periodType,
          timezone: command.timezone,
          status: command.status,
        });

        if (!updated) {
          throw new AppError(
            409,
            'Budget was modified by another request. Reload and try again.',
          );
        }

        return updated;
      });
    } catch (error) {
      if (isActiveBudgetConflict(error)) {
        throw new AppError(409, 'User already has an active budget.');
      }

      throw error;
    }
  }

  /**
   * Builds the current budget view from stored records and the pure
   * calculation engine. No calculation formula is duplicated here.
   */
  async getBudgetState(command: GetBudgetStateCommand): Promise<BudgetState> {
    requireNonEmpty(command.userId, 'userId');

    const budget = command.budgetId
      ? await getBudgetRecord(this.pool, command.budgetId)
      : await getUserActiveBudget(this.pool, command.userId);

    if (!budget || budget.userId !== command.userId) {
      throw new AppError(404, 'Budget not found.');
    }

    const period = command.periodId
      ? await getBudgetPeriod(this.pool, command.periodId)
      : await getActiveBudgetPeriod(this.pool, budget.id);

    if (
      !period ||
      period.userId !== command.userId ||
      period.budgetId !== budget.id
    ) {
      throw new AppError(404, 'Budget period not found.');
    }

    const [jars, allocations, incomes, expenses, commitments, carryForwards] =
      await Promise.all([
        listJars(this.pool, budget.id, { includeDeleted: true }),
        listJarAllocations(this.pool, period.id),
        listIncomeEntries(this.pool, period.id),
        listExpenses(this.pool, period.id),
        listCommitments(this.pool, period.id),
        listJarCarryForwards(this.pool, budget.id, period.sequence),
      ]);

    const allocationsByJar = new Map(
      allocations.map(allocation => [allocation.jarId, allocation]),
    );
    const carryByJar = new Map(
      carryForwards.map(item => [item.jarId, item.carriedForwardKobo]),
    );
    const jarsById = new Map(jars.map(jar => [jar.id, jar]));
    const spendingByJar = new Map<string, Kobo>();

    let receivedIncomeKobo = 0n;
    let periodExpensesKobo = 0n;
    let protectedSavingsKobo = 0n;

    const incomeForCalculation: CalculationIncomeEntry[] = incomes.map(
      entry => ({
        amountKobo: entry.amountKobo,
        status: entry.status === 'received' ? 'received' : 'expected',
      }),
    );
    receivedIncomeKobo = sumReceivedIncome(incomeForCalculation);

    for (const allocation of allocations) {
      const jar = jarsById.get(allocation.jarId);
      if (jar?.kind === 'savings') {
        protectedSavingsKobo += allocation.amountKobo;
      }
    }

    for (const expense of expenses) {
      const signedAmount = signedExpenseKobo(expense);

      if (expense.jarId === null) {
        periodExpensesKobo += signedAmount;
        continue;
      }

      const jar = jarsById.get(expense.jarId);

      if (!jar) {
        periodExpensesKobo += signedAmount;
        continue;
      }

      spendingByJar.set(
        jar.id,
        (spendingByJar.get(jar.id) ?? 0n) + signedAmount,
      );

      if (jar.kind === 'standard') {
        periodExpensesKobo += signedAmount;
      }
    }

    let startingAvailableKobo = period.openingUnallocatedKobo;

    const jarStates: JarState[] = jars.map(jar => {
      const openingBalanceKobo = carryByJar.get(jar.id) ?? 0n;
      const allocatedKobo = allocationsByJar.get(jar.id)?.amountKobo ?? 0n;
      const spentKobo = spendingByJar.get(jar.id) ?? 0n;
      const balance = calculateJarBalance(
        openingBalanceKobo,
        [allocatedKobo],
        [spentKobo],
      );

      if (jar.kind === 'standard') {
        startingAvailableKobo += openingBalanceKobo;
      }

      return {
        jar,
        openingBalanceKobo,
        allocatedKobo,
        spentKobo,
        balanceKobo: balance.balanceKobo,
        isOverspent: balance.isOverspent,
        overspentByKobo: balance.overspentByKobo,
      };
    });

    const unpaidCommitmentsKobo = commitments
      .filter(commitment => commitment.status === 'planned')
      .reduce((total, commitment) => total + commitment.amountKobo, 0n);

    const flexiblePool = calculateFlexiblePool({
      startingAvailableKobo,
      receivedIncomeKobo,
      periodExpensesKobo,
      unpaidCommitmentsKobo,
      protectedSavingsKobo,
      otherReservationsKobo: 0n,
    });

    const allocationFunding = calculateAllocationFunding(
      startingAvailableKobo + receivedIncomeKobo,
      allocations.map(allocation => allocation.amountKobo),
    );

    const asOfDate =
      command.currentDate ??
      localDateInTimeZone(budget.timezone, this.clock());
    const dailyGuidance = calculateDailyGuidance(
      period.startsOn,
      period.endsOn,
      asOfDate,
      flexiblePool.flexiblePoolKobo,
    );

    return {
      budget,
      period,
      asOfDate,
      jars: jarStates,
      allocations,
      inputs: {
        startingAvailableKobo,
        receivedIncomeKobo,
        periodExpensesKobo,
        unpaidCommitmentsKobo,
        protectedSavingsKobo,
        otherReservationsKobo: 0n,
      },
      flexiblePool,
      allocationFunding,
      flexibleCapacityKobo: flexiblePool.flexiblePoolKobo,
      dailyGuidance,
      weeklyGuidance: deriveWeeklyGuidance(dailyGuidance.dailyEntries),
    };
  }

  /**
   * Replaces the supplied jar allocations in one transaction. The funding
   * warning is calculated from the complete post-change allocation set, and
   * expectedVersion values prevent stale writes from overwriting newer ones.
   */
  async saveJarAllocations(
    command: SaveJarAllocationsCommand,
  ): Promise<SaveJarAllocationsResult> {
    requireNonEmpty(command.userId, 'userId');
    requireNonEmpty(command.budgetId, 'budgetId');
    requireNonEmpty(command.periodId, 'periodId');

    if (command.allocations.length === 0) {
      throw new AppError(400, 'At least one allocation is required.');
    }

    const seenJars = new Set<string>();

    for (const allocation of command.allocations) {
      requireNonEmpty(allocation.jarId, 'allocations[].jarId');
      requireNonNegativeKobo(allocation.amountKobo, 'allocations[].amountKobo');

      if (allocation.expectedVersion !== undefined) {
        if (
          !Number.isInteger(allocation.expectedVersion) ||
          allocation.expectedVersion < 0
        ) {
          throw new AppError(
            400,
            'allocations[].expectedVersion must be zero or a positive integer.',
          );
        }
      } else {
        throw new AppError(
          400,
          'allocations[].expectedVersion is required to prevent stale updates.',
        );
      }

      if (seenJars.has(allocation.jarId)) {
        throw new AppError(
          400,
          `Duplicate allocation for jar ${allocation.jarId}.`,
        );
      }

      seenJars.add(allocation.jarId);
    }

    return withTransaction(
      this.pool,
      'saveJarAllocations',
      async client => {
        const budget = await getBudgetForUpdate(client, command.budgetId);

        if (!budget || budget.userId !== command.userId) {
          throw new AppError(404, 'Budget not found.');
        }

        if (budget.status !== 'active') {
          throw new AppError(
            409,
            'Archived budgets cannot be modified.',
          );
        }

        const period = await getBudgetPeriodForUpdate(client, command.periodId);

        if (
          !period ||
          period.userId !== command.userId ||
          period.budgetId !== budget.id
        ) {
          throw new AppError(404, 'Budget period not found.');
        }

        if (period.status === 'closed') {
          throw new AppError(
            409,
            'Closed budget periods must be reopened before allocations can change.',
          );
        }

        const jars = await listJars(client, budget.id);
        const jarsById = new Map(jars.map(jar => [jar.id, jar]));

        for (const allocation of command.allocations) {
          if (!jarsById.has(allocation.jarId)) {
            throw new AppError(404, `Jar ${allocation.jarId} not found.`);
          }
        }

        const existing = await listJarAllocations(client, period.id);
        const existingByJar = new Map(
          existing.map(allocation => [allocation.jarId, allocation]),
        );

        for (const allocation of command.allocations) {
          const current = existingByJar.get(allocation.jarId);

          if (allocation.expectedVersion === 0 && current) {
            throw new AppError(
              409,
              `Allocation for jar ${allocation.jarId} already exists.`,
            );
          }

          if (
            allocation.expectedVersion > 0 &&
            (!current || current.version !== allocation.expectedVersion)
          ) {
            throw new AppError(
              409,
              `Allocation for jar ${allocation.jarId} was modified by another request. Reload and try again.`,
            );
          }
        }

        const amountsByJar = new Map(
          existing.map(allocation => [allocation.jarId, allocation.amountKobo]),
        );

        for (const allocation of command.allocations) {
          amountsByJar.set(allocation.jarId, allocation.amountKobo);
        }

        const incomes = await listIncomeEntries(client, period.id);
        const receivedIncomeKobo = sumReceivedIncome(
          incomes.map(
            (entry): CalculationIncomeEntry => ({
              amountKobo: entry.amountKobo,
              status: entry.status === 'received' ? 'received' : 'expected',
            }),
          ),
        );

        const funding = calculateAllocationFunding(
          period.openingUnallocatedKobo + receivedIncomeKobo,
          [...amountsByJar.values()],
        );

        const saved: JarAllocation[] = [];

        const ordered = [...command.allocations].sort((left, right) =>
          left.jarId.localeCompare(right.jarId),
        );

        for (const allocation of ordered) {
          saved.push(
            await saveJarAllocation(client, {
              userId: command.userId,
              budgetId: budget.id,
              periodId: period.id,
              jarId: allocation.jarId,
              amountKobo: allocation.amountKobo,
              currency: period.currency,
              note: allocation.note ?? null,
            }),
          );
        }

        return { allocations: saved, funding };
      },
    );
  }

  async recordIncome(command: RecordIncomeCommand): Promise<IncomeEntry> {
    requireNonEmpty(command.userId, 'userId');
    requireNonEmpty(command.idempotencyKey, 'idempotencyKey');
    requireNonEmpty(command.periodId, 'periodId');
    requirePositiveKobo(command.amountKobo, 'amountKobo');
    requireOptionalTimestamp(command.receivedAt, 'receivedAt');

    if (command.status === 'received' && !command.receivedAt) {
      throw new AppError(
        400,
        'receivedAt is required when income status is received.',
      );
    }

    return withTransaction(this.pool, 'recordIncome', async client => {
      const requestHash = hashRequest(command);
      const scope = `budgeting:income:${command.userId}`;
      const idempotency = await claimIdempotentRequest(
        client,
        { scope, key: command.idempotencyKey, requestHash },
        'recordIncome',
      );

      if (idempotency.isReplay) {
        return restoreKoboResponse<IncomeEntry>(
          idempotency.response,
          'recordIncome',
        );
      }

      const periodReference = await getBudgetPeriod(client, command.periodId);

      if (periodReference.userId !== command.userId) {
        throw new AppError(404, 'Budget period not found.');
      }

      const budget = await getBudgetForUpdate(client, periodReference.budgetId);
      if (!budget || budget.userId !== command.userId) {
        throw new AppError(404, 'Budget not found.');
      }
      if (budget.status !== 'active') {
        throw new AppError(409, 'Archived budgets cannot be modified.');
      }

      const period = await getBudgetPeriodForUpdate(client, command.periodId);
      if (!period || period.budgetId !== budget.id || period.userId !== command.userId) {
        throw new AppError(404, 'Budget period not found.');
      }

      if (period.status === 'closed') {
        throw new AppError(
          409,
          'Closed budget periods must be reopened before income can be recorded.',
        );
      }

      if (command.incomeSourceId) {
        const source = await getIncomeSource(client, command.incomeSourceId);

        if (source.userId !== command.userId) {
          throw new AppError(404, 'Income source not found.');
        }
      }

      const entry = await recordIncomeEntry(client, {
        userId: command.userId,
        budgetPeriodId: period.id,
        incomeSourceId: command.incomeSourceId ?? null,
        amountKobo: command.amountKobo,
        currency: period.currency,
        status: command.status,
        expectedOn: command.expectedOn ?? null,
        receivedAt: command.receivedAt ?? null,
        note: command.note ?? null,
      });

      await completeIdempotencyKey(client, {
        scope,
        key: command.idempotencyKey,
        requestHash,
        response: entry,
      });

      return entry;
    });
  }

  async recordExpense(command: RecordExpenseCommand): Promise<Expense> {
    requireNonEmpty(command.userId, 'userId');
    requireNonEmpty(command.idempotencyKey, 'idempotencyKey');
    requireNonEmpty(command.periodId, 'periodId');
    requireNonEmpty(command.categoryId, 'categoryId');
    requirePositiveKobo(command.amountKobo, 'amountKobo');

    if (Number.isNaN(Date.parse(command.occurredAt))) {
      throw new AppError(400, 'occurredAt must be a valid ISO timestamp.');
    }

    const entryType = command.entryType ?? 'expense';

    if (entryType === 'refund' && !command.adjustsExpenseId) {
      throw new AppError(400, 'A refund must reference the original expense.');
    }

    if (entryType === 'expense' && command.adjustsExpenseId) {
      throw new AppError(
        400,
        'Only a refund entry can reference another expense.',
      );
    }

    return withTransaction(this.pool, 'recordExpense', async client => {
      const requestHash = hashRequest(command);
      const scope = `budgeting:expense:${command.userId}`;
      const idempotency = await claimIdempotentRequest(
        client,
        { scope, key: command.idempotencyKey, requestHash },
        'recordExpense',
      );

      if (idempotency.isReplay) {
        return restoreKoboResponse<Expense>(
          idempotency.response,
          'recordExpense',
        );
      }

      const periodReference = await getBudgetPeriod(client, command.periodId);

      if (periodReference.userId !== command.userId) {
        throw new AppError(404, 'Budget period not found.');
      }

      const budget = await getBudgetForUpdate(client, periodReference.budgetId);
      if (!budget || budget.userId !== command.userId) {
        throw new AppError(404, 'Budget not found.');
      }
      if (budget.status !== 'active') {
        throw new AppError(409, 'Archived budgets cannot be modified.');
      }

      const period = await getBudgetPeriodForUpdate(client, command.periodId);
      if (!period || period.budgetId !== budget.id || period.userId !== command.userId) {
        throw new AppError(404, 'Budget period not found.');
      }

      if (period.status === 'closed') {
        throw new AppError(
          409,
          'Closed budget periods must be reopened before expenses can be recorded.',
        );
      }

      const category = await getCategory(client, command.categoryId);

      if (category.userId !== null && category.userId !== command.userId) {
        throw new AppError(404, 'Category not found.');
      }

      if (command.jarId) {
        const jar = await getJar(client, command.jarId);

        if (
          jar.userId !== command.userId ||
          jar.budgetId !== period.budgetId
        ) {
          throw new AppError(404, 'Jar not found.');
        }
      }

      if (command.adjustsExpenseId) {
        const original = await getExpense(client, command.adjustsExpenseId);

        if (original.userId !== command.userId) {
          throw new AppError(404, 'Original expense not found.');
        }
      }

      const expense = await recordExpenseRecord(client, {
        userId: command.userId,
        budgetPeriodId: period.id,
        categoryId: category.id,
        jarId: command.jarId ?? null,
        entryType,
        adjustsExpenseId: command.adjustsExpenseId ?? null,
        amountKobo: command.amountKobo,
        currency: period.currency,
        merchant: command.merchant ?? null,
        note: command.note ?? null,
        paymentMethod: command.paymentMethod ?? null,
        occurredAt: command.occurredAt,
        source: command.source ?? 'manual',
      });

      await completeIdempotencyKey(client, {
        scope,
        key: command.idempotencyKey,
        requestHash,
        response: expense,
      });

      return expense;
    });
  }
}
