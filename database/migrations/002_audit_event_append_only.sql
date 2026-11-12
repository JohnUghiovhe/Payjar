CREATE INDEX IF NOT EXISTS idx_audit_events_user_occurred_id
  ON audit_events (user_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity_occurred_id
  ON audit_events (entity_type, entity_id, occurred_at DESC, id DESC);
