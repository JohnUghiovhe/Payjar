import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  type Queryable,
} from './repository.js';
import type { Category, CreateCategoryInput } from './types.js';

type CategoryRow = {
  id: string;
  user_id: string | null;
  name: string;
  icon_key: string | null;
  is_system: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  iconKey: row.icon_key,
  isSystem: row.is_system,
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createCategory = async (
  db: Queryable,
  input: CreateCategoryInput,
): Promise<Category> => {
  const userId = input.userId ?? null;
  const rows = await runQuery<CategoryRow>(
    db,
    'createCategory',
    `INSERT INTO categories (id, user_id, name, icon_key, is_system)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      userId,
      input.name,
      input.iconKey ?? null,
      userId === null,
    ],
  );

  return mapCategory(requireRow(rows, 'Category'));
};

export const getCategory = async (
  db: Queryable,
  categoryId: string,
): Promise<Category> => {
  const rows = await runQuery<CategoryRow>(
    db,
    'getCategory',
    'SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL',
    [categoryId],
  );

  return mapCategory(requireRow(rows, 'Category'));
};

export const listCategoriesForUser = async (
  db: Queryable,
  userId: string,
): Promise<Category[]> => {
  const rows = await runQuery<CategoryRow>(
    db,
    'listCategoriesForUser',
    `SELECT * FROM categories
     WHERE (user_id = $1 OR user_id IS NULL) AND deleted_at IS NULL
     ORDER BY name ASC`,
    [userId],
  );

  return rows.map(mapCategory);
};
