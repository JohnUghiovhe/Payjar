import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toIsoTimestamp,
  toJsonParameter,
  type Queryable,
} from './repository.js';
import type { AuditEvent, RecordAuditEventInput } from './types.js';

type AuditEventRow = {
  id: string;
  user_id: string;
  actor_type: AuditEvent['actorType'];
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state: unknown | null;
  after_state: unknown | null;
  reason: string | null;
  request_id: string | null;
  occurred_at: Date | string;
};

const mapAuditEvent = (row: AuditEventRow): AuditEvent => ({
  id: row.id,
  userId: row.user_id,
  actorType: row.actor_type,
  actorId: row.actor_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  action: row.action,
  beforeState: row.before_state,
  afterState: row.after_state,
  reason: row.reason,
  requestId: row.request_id,
  occurredAt: toIsoTimestamp(row.occurred_at),
});

export const recordAuditEvent = async (
  db: Queryable,
  input: RecordAuditEventInput,
): Promise<AuditEvent> => {
  const rows = await runQuery<AuditEventRow>(
    db,
    'recordAuditEvent',
    `INSERT INTO audit_events (
       id, user_id, actor_type, actor_id, entity_type, entity_id, action,
       before_state, after_state, reason, request_id, occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.actorType,
      input.actorId ?? null,
      input.entityType,
      input.entityId,
      input.action,
      toJsonParameter(input.beforeState),
      toJsonParameter(input.afterState),
      input.reason ?? null,
      input.requestId ?? null,
      input.occurredAt ?? new Date().toISOString(),
    ],
  );

  return mapAuditEvent(requireRow(rows, 'Audit event'));
};

export const getAuditEvent = async (
  db: Queryable,
  auditEventId: string,
): Promise<AuditEvent> => {
  const rows = await runQuery<AuditEventRow>(
    db,
    'getAuditEvent',
    'SELECT * FROM audit_events WHERE id = $1',
    [auditEventId],
  );

  return mapAuditEvent(requireRow(rows, 'Audit event'));
};

export const listAuditEventsForEntity = async (
  db: Queryable,
  entityType: string,
  entityId: string,
): Promise<AuditEvent[]> => {
  const rows = await runQuery<AuditEventRow>(
    db,
    'listAuditEventsForEntity',
    `SELECT * FROM audit_events
     WHERE entity_type = $1 AND entity_id = $2
    ORDER BY occurred_at DESC, id DESC`,
    [entityType, entityId],
  );

  return rows.map(mapAuditEvent);
};

export const listAuditHistoryForUser = async (
  db: Queryable,
  userId: string,
): Promise<AuditEvent[]> => {
  const rows = await runQuery<AuditEventRow>(
    db,
    'listAuditHistoryForUser',
    `SELECT * FROM audit_events
     WHERE user_id = $1
    ORDER BY occurred_at DESC, id DESC`,
    [userId],
  );

  return rows.map(mapAuditEvent);
};
