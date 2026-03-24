-- Migration 046: Consolidate to two roles — SuperAdmin and Admin
-- Removes Cashier, Sales, Installer, Manager roles.
-- Existing admin user (admin@masterauto.com) is upgraded to SuperAdmin.
-- Other users with deprecated roles are re-assigned to Admin.
-- Run this on an existing database to update the roles table.

BEGIN;

-- 1. Insert the two new roles (idempotent)
INSERT INTO roles (name)
VALUES ('SuperAdmin'), ('Admin')
ON CONFLICT (name) DO NOTHING;

-- 2. Upgrade the original admin@masterauto.com to SuperAdmin
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
WHERE email = 'admin@masterauto.com';

-- 3. Re-assign any users with deprecated roles to Admin
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'Admin')
WHERE role_id IN (
  SELECT id FROM roles WHERE name IN ('Cashier', 'Sales', 'Installer', 'Manager')
);

-- 4. Remove deprecated roles (safe — no users reference them anymore)
DELETE FROM roles WHERE name IN ('Cashier', 'Sales', 'Installer', 'Manager');

-- 5. Update configuration roles_definition to reflect two roles
UPDATE configuration_settings
SET value = '[
  {"role":"SuperAdmin","permissions":["all","add_services","delete_pricing","change_prices","change_discounts","manage_users","view_config","edit_config"]},
  {"role":"Admin","permissions":["input_data","view_config","view_reports","manage_bookings","manage_customers","manage_vehicles"]}
]',
    updated_at = NOW()
WHERE category = 'roles' AND key = 'roles_definition';

COMMIT;
