INSERT INTO roles (name)
VALUES ('SuperAdmin'), ('Admin')
ON CONFLICT (name) DO NOTHING;

-- Keep only supported roles and ensure users always retain a valid role.
WITH admin_role AS (
	SELECT id
	FROM roles
	WHERE LOWER(name) = 'admin'
	LIMIT 1
)
UPDATE users u
SET role_id = (SELECT id FROM admin_role)
WHERE u.role_id IN (
	SELECT r.id
	FROM roles r
	WHERE LOWER(r.name) NOT IN ('superadmin', 'admin')
)
AND EXISTS (SELECT 1 FROM admin_role);

DELETE FROM roles
WHERE LOWER(name) NOT IN ('superadmin', 'admin');

INSERT INTO users (role_id, full_name, email, password_hash)
SELECT r.id, 'System SuperAdmin', 'superadmin@masterauto.com', crypt('superadmin123', gen_salt('bf'))
FROM roles r
WHERE r.name = 'SuperAdmin'
ON CONFLICT (email) DO NOTHING;

