import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toInteger,
  type Queryable,
} from './repository.js';
import type { CreateUserInput, User } from './types.js';

type UserRow = {
  id: string;
  auth_subject: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  currency: 'NGN';
  timezone: string;
  week_starts_on: number | string;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapUser = (row: UserRow): User => ({
  id: row.id,
  authSubject: row.auth_subject,
  email: row.email,
  phone: row.phone,
  displayName: row.display_name,
  currency: row.currency,
  timezone: row.timezone,
  weekStartsOn: toInteger(row.week_starts_on),
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createUser = async (
  db: Queryable,
  input: CreateUserInput,
): Promise<User> => {
  const rows = await runQuery<UserRow>(
    db,
    'createUser',
    `INSERT INTO users (
       id, auth_subject, email, phone, display_name, currency, timezone, week_starts_on
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.authSubject,
      input.email ?? null,
      input.phone ?? null,
      input.displayName,
      input.currency ?? 'NGN',
      input.timezone ?? 'Africa/Lagos',
      input.weekStartsOn ?? 1,
    ],
  );

  return mapUser(requireRow(rows, 'User'));
};

export const getUser = async (db: Queryable, userId: string): Promise<User> => {
  const rows = await runQuery<UserRow>(
    db,
    'getUser',
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );

  return mapUser(requireRow(rows, 'User'));
};
