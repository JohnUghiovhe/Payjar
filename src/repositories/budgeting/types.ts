import type { Kobo } from '../../budgeting/money.js';
import type { JarKind, LocalDate, RolloverPolicy } from '../../budgeting/types.js';

export type CurrencyCode = 'NGN';
export type BudgetPeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type BudgetStatus = 'active' | 'archived';
export type BudgetPeriodStatus = 'draft' | 'active' | 'closed';
export type IncomeSourceType = 'salary' | 'business' | 'freelance' | 'gift' | 'other';
export type IncomeStatus = 'expected' | 'received' | 'cancelled';
export type ExpenseEntryType = 'expense' | 'refund';
export type ExpenseSource = 'manual' | 'imported';
export type CommitmentStatus = 'planned' | 'paid' | 'cancelled';
export type RolloverScope = 'jar' | 'general_pool';
export type AuditActorType = 'user' | 'system';

export interface User {
  id: string;
  authSubject: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  currency: CurrencyCode;
  timezone: string;
  weekStartsOn: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Budget {
  id: string;
  userId: string;
  name: string;
  periodType: BudgetPeriodType;
  currency: CurrencyCode;
  timezone: string;
  status: BudgetStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BudgetPeriod {
  id: string;
  budgetId: string;
  userId: string;
  sequence: number;
  name: string | null;
  startsOn: LocalDate;
  endsOn: LocalDate;
  timezone: string;
  currency: CurrencyCode;
  status: BudgetPeriodStatus;
  openingUnallocatedKobo: Kobo;
  closingUnallocatedKobo: Kobo | null;
  totalIncomeKobo: Kobo | null;
  totalExpenseKobo: Kobo | null;
  totalAllocatedKobo: Kobo | null;
  totalReleasedKobo: Kobo | null;
  totalCarriedKobo: Kobo | null;
  totalShortfallKobo: Kobo | null;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  userId: string | null;
  name: string;
  iconKey: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Jar {
  id: string;
  budgetId: string;
  userId: string;
  name: string;
  kind: JarKind;
  rolloverPolicy: RolloverPolicy;
  categoryId: string | null;
  targetKobo: Kobo | null;
  currency: CurrencyCode;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JarAllocation {
  id: string;
  userId: string;
  budgetId: string;
  periodId: string;
  jarId: string;
  amountKobo: Kobo;
  currency: CurrencyCode;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeSource {
  id: string;
  userId: string;
  name: string;
  sourceType: IncomeSourceType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface IncomeEntry {
  id: string;
  userId: string;
  budgetPeriodId: string;
  incomeSourceId: string | null;
  amountKobo: Kobo;
  currency: CurrencyCode;
  status: IncomeStatus;
  expectedOn: LocalDate | null;
  receivedAt: string | null;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Expense {
  id: string;
  userId: string;
  budgetPeriodId: string;
  categoryId: string;
  jarId: string | null;
  entryType: ExpenseEntryType;
  adjustsExpenseId: string | null;
  amountKobo: Kobo;
  currency: CurrencyCode;
  merchant: string | null;
  note: string | null;
  paymentMethod: string | null;
  occurredAt: string;
  source: ExpenseSource;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Commitment {
  id: string;
  userId: string;
  budgetPeriodId: string;
  name: string;
  amountKobo: Kobo;
  currency: CurrencyCode;
  dueOn: LocalDate;
  status: CommitmentStatus;
  recurrenceRule: string | null;
  paidAt: string | null;
  settledExpenseId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PeriodJarSummary {
  id: string;
  userId: string;
  budgetId: string;
  periodId: string;
  jarId: string;
  currency: CurrencyCode;
  revision: number;
  openingBalanceKobo: Kobo;
  allocatedKobo: Kobo;
  spentKobo: Kobo;
  closingBalanceKobo: Kobo;
  rolloverPolicy: RolloverPolicy;
  carriedForwardKobo: Kobo;
  releasedToGeneralPoolKobo: Kobo;
  shortfallKobo: Kobo;
  computedAt: string;
  supersededAt: string | null;
  supersededById: string | null;
}

export interface RolloverRecord {
  id: string;
  userId: string;
  budgetId: string;
  periodId: string;
  jarId: string | null;
  scope: RolloverScope;
  currency: CurrencyCode;
  revision: number;
  policy: RolloverPolicy | null;
  closingBalanceKobo: Kobo;
  carriedForwardKobo: Kobo;
  releasedToGeneralPoolKobo: Kobo;
  shortfallKobo: Kobo;
  nextPeriodId: string | null;
  supersededAt: string | null;
  supersededById: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AuditEvent {
  id: string;
  userId: string;
  actorType: AuditActorType;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeState: unknown | null;
  afterState: unknown | null;
  reason: string | null;
  requestId: string | null;
  occurredAt: string;
}

export interface CreateUserInput {
  id?: string;
  authSubject: string;
  email?: string | null;
  phone?: string | null;
  displayName: string;
  currency?: CurrencyCode;
  timezone?: string;
  weekStartsOn?: number;
}

export interface CreateBudgetInput {
  id?: string;
  userId: string;
  name: string;
  periodType: BudgetPeriodType;
  currency?: CurrencyCode;
  timezone: string;
}

export interface CreateBudgetPeriodInput {
  id?: string;
  budgetId: string;
  userId: string;
  sequence: number;
  name?: string | null;
  startsOn: LocalDate;
  endsOn: LocalDate;
  timezone: string;
  currency?: CurrencyCode;
  status?: Exclude<BudgetPeriodStatus, 'closed'>;
  openingUnallocatedKobo?: Kobo;
}

export interface CreateCategoryInput {
  id?: string;
  userId?: string | null;
  name: string;
  iconKey?: string | null;
}

export interface CreateJarInput {
  id?: string;
  budgetId: string;
  userId: string;
  name: string;
  kind: JarKind;
  rolloverPolicy: RolloverPolicy;
  categoryId?: string | null;
  targetKobo?: Kobo | null;
  currency?: CurrencyCode;
  sortOrder?: number;
}

export interface SaveJarAllocationInput {
  id?: string;
  userId: string;
  budgetId: string;
  periodId: string;
  jarId: string;
  amountKobo: Kobo;
  currency?: CurrencyCode;
  note?: string | null;
}

export interface CreateIncomeSourceInput {
  id?: string;
  userId: string;
  name: string;
  sourceType: IncomeSourceType;
  active?: boolean;
}

export interface RecordIncomeInput {
  id?: string;
  userId: string;
  budgetPeriodId: string;
  incomeSourceId?: string | null;
  amountKobo: Kobo;
  currency?: CurrencyCode;
  status: IncomeStatus;
  expectedOn?: LocalDate | null;
  receivedAt?: string | null;
  note?: string | null;
}

export interface RecordExpenseInput {
  id?: string;
  userId: string;
  budgetPeriodId: string;
  categoryId: string;
  jarId?: string | null;
  entryType?: ExpenseEntryType;
  adjustsExpenseId?: string | null;
  amountKobo: Kobo;
  currency?: CurrencyCode;
  merchant?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  occurredAt: string;
  source?: ExpenseSource;
}

export interface CreateCommitmentInput {
  id?: string;
  userId: string;
  budgetPeriodId: string;
  name: string;
  amountKobo: Kobo;
  currency?: CurrencyCode;
  dueOn: LocalDate;
  status?: CommitmentStatus;
  recurrenceRule?: string | null;
  paidAt?: string | null;
}

export interface RecordAuditEventInput {
  id?: string;
  userId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: unknown | null;
  afterState?: unknown | null;
  reason?: string | null;
  requestId?: string | null;
  occurredAt?: string;
}

export interface ListOptions {
  includeDeleted?: boolean;
}

export interface RevisionListOptions {
  includeSuperseded?: boolean;
}
