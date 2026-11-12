import {
  runQuery,
  type Queryable,
} from './repository.js';

export interface IdempotencyClaim {
  claimed: boolean;
  requestHashMatches: boolean;
  response: unknown;
}

export const claimIdempotencyKey = async (
  db: Queryable,
  input: { scope: string; key: string; requestHash: string },
): Promise<IdempotencyClaim> => {
  const existingRows = await runQuery<{
    request_hash: string;
    response: unknown;
  }>(
    db,
    'getIdempotencyResponse',
    `SELECT request_hash, response
     FROM idempotency_keys
     WHERE scope = $1 AND key = $2`,
    [input.scope, input.key],
  );
  const existing = existingRows[0];

  if (existing) {
    return {
      claimed: false,
      requestHashMatches: existing.request_hash === input.requestHash,
      response:
        existing.request_hash === input.requestHash ? existing.response : null,
    };
  }

  const claimed = await runQuery<{ scope: string }>(
    db,
    'claimIdempotencyKey',
    `INSERT INTO idempotency_keys (scope, key, request_hash, response)
     VALUES ($1, $2, $3, '{}'::jsonb)
     ON CONFLICT (scope, key) DO NOTHING
     RETURNING scope`,
    [input.scope, input.key, input.requestHash],
  );

  if (claimed.length > 0) {
    return { claimed: true, requestHashMatches: true, response: null };
  }

  const rows = await runQuery<{
    request_hash: string;
    response: unknown;
  }>(
    db,
    'getIdempotencyResponse',
    `SELECT request_hash, response
     FROM idempotency_keys
     WHERE scope = $1 AND key = $2`,
    [input.scope, input.key],
  );

  const concurrentExisting = rows[0];
  if (!concurrentExisting) {
    throw new Error('Idempotency key conflict could not be resolved.');
  }

  return {
    claimed: false,
    requestHashMatches: concurrentExisting.request_hash === input.requestHash,
    response:
      concurrentExisting.request_hash === input.requestHash
        ? concurrentExisting.response
        : null,
  };
};

export const completeIdempotencyKey = async (
  db: Queryable,
  input: { scope: string; key: string; requestHash: string; response: unknown },
): Promise<void> => {
  const rows = await runQuery<{ scope: string }>(
    db,
    'completeIdempotencyKey',
    `UPDATE idempotency_keys
     SET response = $4::jsonb
     WHERE scope = $1 AND key = $2 AND request_hash = $3
     RETURNING scope`,
    [
      input.scope,
      input.key,
      input.requestHash,
      JSON.stringify(input.response, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ],
  );

  if (rows.length === 0) {
    throw new Error('Idempotency response could not be stored.');
  }
};
