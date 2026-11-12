CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_events_prevent_row_mutation
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TRIGGER audit_events_prevent_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_audit_event_mutation();
