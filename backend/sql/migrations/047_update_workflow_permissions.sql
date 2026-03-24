-- Migration 047: Update workflow_role_permissions view for new two-role model
-- SuperAdmin and Admin replace all previous roles (Manager, Cashier, Technician, QA, Reception)

BEGIN;

CREATE OR REPLACE VIEW workflow_role_permissions AS
SELECT 'appointment'::TEXT AS entity_type,
       t.stage,
       t.allowed_roles
FROM (VALUES
  ('Checked-In',         ARRAY['Admin','SuperAdmin']),
  ('In Progress',        ARRAY['Admin','SuperAdmin']),
  ('For QA',             ARRAY['Admin','SuperAdmin']),
  ('Ready for Release',  ARRAY['Admin','SuperAdmin']),
  ('Paid',               ARRAY['Admin','SuperAdmin']),
  ('Released',           ARRAY['Admin','SuperAdmin']),
  ('Completed',          ARRAY['Admin','SuperAdmin']),
  ('Cancelled',          ARRAY['Admin','SuperAdmin'])
) AS t(stage, allowed_roles)

UNION ALL

SELECT 'job_order'::TEXT,
       t.stage,
       t.allowed_roles
FROM (VALUES
  ('In Progress', ARRAY['Admin','SuperAdmin']),
  ('For QA',      ARRAY['Admin','SuperAdmin']),
  ('Completed',   ARRAY['Admin','SuperAdmin']),
  ('Released',    ARRAY['Admin','SuperAdmin']),
  ('Complete',    ARRAY['Admin','SuperAdmin']),
  ('Cancelled',   ARRAY['Admin','SuperAdmin'])
) AS t(stage, allowed_roles);

COMMIT;
