"""Append-only enforcement on audit_auditevent.

Belt-and-suspenders:
  (a) BEFORE UPDATE OR DELETE trigger raises an exception. Catches all
      connections, including direct psql shells.
  (b) REVOKE UPDATE, DELETE on the app role. Adds role-level defense in depth.

The trigger function is a plain plpgsql RAISE EXCEPTION — explicit, no
fancy bypass mechanism. If a future migration legitimately needs to mutate
audit rows (e.g., schema evolution), it must `DROP TRIGGER`, do the work,
and `CREATE TRIGGER` again as the last step.

The trigger is exercised in tests; the REVOKE half is not. Test DB roles are
typically superusers (which bypass REVOKE), so the trigger does all the work
in CI. The REVOKE is meaningful in production where Django runs as a
non-superuser app role — both guards are then active. If the trigger is ever
dropped in production by accident, the REVOKE catches direct UPDATE/DELETE
attempts from the app role; that gap is small enough that we accept the
asymmetric test coverage.
"""

from __future__ import annotations

from django.db import migrations

FORWARD_SQL = """
CREATE OR REPLACE FUNCTION audit_prevent_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_auditevent is append-only (TG_OP=%)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_auditevent_append_only ON audit_auditevent;
CREATE TRIGGER audit_auditevent_append_only
    BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION audit_prevent_mutation();

-- Role-level defense in depth. Find the current user (the role Django runs
-- as) and revoke UPDATE/DELETE on this table for it. SELECT/INSERT remain.
DO $$
DECLARE
    app_role text := current_user;
BEGIN
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE audit_auditevent FROM %I', app_role);
EXCEPTION WHEN OTHERS THEN
    -- Role might not have the grants yet (fresh DB) — that's fine.
    NULL;
END $$;
"""

# NOTE: Reverse SQL grants UPDATE, DELETE back to current_user unconditionally.
# This is asymmetric with the forward, which only REVOKEs if grants existed.
# Acceptable trade-off: audit migrations are write-once in practice; running
# reverse on a fresh DB simply ensures the role can mutate audit_auditevent
# (which the trigger still blocks anyway).
REVERSE_SQL = """
DROP TRIGGER IF EXISTS audit_auditevent_append_only ON audit_auditevent;
DROP FUNCTION IF EXISTS audit_prevent_mutation();

DO $$
DECLARE
    app_role text := current_user;
BEGIN
    EXECUTE format('GRANT UPDATE, DELETE ON TABLE audit_auditevent TO %I', app_role);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunSQL(FORWARD_SQL, reverse_sql=REVERSE_SQL)]
