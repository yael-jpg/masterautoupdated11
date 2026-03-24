INSERT INTO roles (name)
VALUES ('SuperAdmin'), ('Admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (role_id, full_name, email, password_hash)
SELECT r.id, 'System SuperAdmin', 'superadmin@masterauto.com', crypt('admin123', gen_salt('bf'))
FROM roles r
WHERE r.name = 'SuperAdmin'
ON CONFLICT (email) DO NOTHING;

INSERT INTO customers (full_name, mobile, email, address, preferred_contact_method, customer_type, lead_source)
VALUES
  ('Juan Dela Cruz', '09171234567', 'juan@email.com', 'Makati City', 'Call', 'Retail', 'Facebook'),
  ('MegaFleet Corp', '09179876543', 'ops@megafleet.ph', 'Taguig City', 'Email', 'Corporate', 'Referral'),
  ('Maria Santos', '09181112222', 'maria@email.com', 'Quezon City', 'WhatsApp', 'VIP', 'Walk-in')
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (customer_id, plate_number, conduction_sticker, vin_chassis, make, model, year, variant, color, odometer)
VALUES
  ((SELECT id FROM customers WHERE email = 'juan@email.com'        LIMIT 1), 'NQW-9021', 'AB12345', 'VIN12345AA', 'Lotus', 'Emira', 2024, 'V6',        'Black', 14220),
  ((SELECT id FROM customers WHERE email = 'ops@megafleet.ph'      LIMIT 1), 'NBS-4312', 'CD98211', 'VIN22345BB', 'BMW',   'X5',    2023, 'xDrive40i', 'Gray',  30890),
  ((SELECT id FROM customers WHERE email = 'maria@email.com'       LIMIT 1), 'NVA-8843', 'EF22351', 'VIN32345CC', 'Toyota','Supra',  2022, 'GR',        'White', 18331)
ON CONFLICT (plate_number) DO NOTHING;

INSERT INTO services (code, name, category, base_price, description)
VALUES
  ('PPF-FULL', 'PPF Full Body', 'PPF', 95000, 'Complete body paint protection film'),
  ('CER-ELITE', 'Ceramic Elite', 'Ceramic Coating', 32000, 'Premium ceramic coating package'),
  ('DTL-TINT', 'Detail + Tint', 'Detailing', 18000, 'Exterior detailing with tint service')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sales (reference_no, doc_type, customer_id, vehicle_id, service_package, add_ons, discount_amount, total_amount, workflow_status, created_by)
VALUES
  (
    'INV-2026-1588',
    'Invoice',
    (SELECT id FROM customers WHERE email = 'maria@email.com' LIMIT 1),
    (SELECT id FROM vehicles  WHERE plate_number = 'NVA-8843'   LIMIT 1),
    'PPF Premium',
    '["Hydrophobic topcoat"]',
    5000,
    95000,
    'Partially Paid',
    (SELECT id FROM users WHERE email = 'superadmin@masterauto.com' LIMIT 1)
  ),
  (
    'JO-2026-0891',
    'JobOrder',
    (SELECT id FROM customers WHERE email = 'ops@megafleet.ph' LIMIT 1),
    (SELECT id FROM vehicles  WHERE plate_number = 'NBS-4312'   LIMIT 1),
    'Fleet Detailing',
    '["Interior sanitation"]',
    0,
    84500,
    'In Progress',
    (SELECT id FROM users WHERE email = 'superadmin@masterauto.com' LIMIT 1)
  ),
  (
    'Q-2026-1045',
    'Quotation',
    (SELECT id FROM customers WHERE email = 'juan@email.com' LIMIT 1),
    (SELECT id FROM vehicles  WHERE plate_number = 'NQW-9021'   LIMIT 1),
    'Ceramic Pro Max',
    '["Wheel coating"]',
    2000,
    32000,
    'For Job Order',
    (SELECT id FROM users WHERE email = 'superadmin@masterauto.com' LIMIT 1)
  )
ON CONFLICT (reference_no) DO NOTHING;

INSERT INTO payments (sale_id, amount, payment_type, reference_no, is_deposit, received_by)
VALUES
  ((SELECT id FROM sales WHERE reference_no = 'INV-2026-1588' LIMIT 1), 65000, 'Split: Card + GCash', 'GC432998 / SLP-1101', TRUE,  (SELECT id FROM users WHERE email = 'superadmin@masterauto.com' LIMIT 1)),
  ((SELECT id FROM sales WHERE reference_no = 'JO-2026-0891'   LIMIT 1), 24500, 'Cash',               'OR-55712',           FALSE, (SELECT id FROM users WHERE email = 'superadmin@masterauto.com' LIMIT 1))
ON CONFLICT DO NOTHING;

INSERT INTO appointments (
  customer_id, vehicle_id, service_id, schedule_start, schedule_end, bay, installer_team, estimated_duration_minutes, status, notification_channel
)
VALUES
  (
    (SELECT id FROM customers WHERE email = 'juan@email.com' LIMIT 1),
    (SELECT id FROM vehicles  WHERE plate_number = 'NQW-9021' LIMIT 1),
    (SELECT id FROM services WHERE code = 'CER-ELITE' LIMIT 1),
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '1 day 4 hours',
    'Bay 2',
    'Team A',
    240,
    'Scheduled',
    'SMS'
  ),
  (
    (SELECT id FROM customers WHERE email = 'ops@megafleet.ph' LIMIT 1),
    (SELECT id FROM vehicles  WHERE plate_number = 'NBS-4312'  LIMIT 1),
    (SELECT id FROM services WHERE code = 'PPF-FULL' LIMIT 1),
    NOW() + INTERVAL '2 day',
    NOW() + INTERVAL '2 day 6 hours',
    'Bay 4',
    'Team B',
    360,
    'Scheduled',
    'Email'
  )
ON CONFLICT DO NOTHING;

INSERT INTO payment_methods (method_name)
VALUES ('Cash'), ('Credit Card'), ('GCash/Maya'), ('Bank Transfer')
ON CONFLICT (method_name) DO NOTHING;

INSERT INTO discount_rules (rule_name, discount_type, value, requires_approval)
VALUES
  ('VIP Loyalty', 'percent', 10, FALSE),
  ('Corporate Fleet', 'percent', 8, TRUE),
  ('Promo Voucher', 'fixed', 2000, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO staff_commissions (staff_name, service_category, commission_percent)
VALUES
  ('Team A', 'Ceramic Coating', 5),
  ('Team B', 'PPF', 7),
  ('Team C', 'Detailing', 4)
ON CONFLICT DO NOTHING;

INSERT INTO notification_templates (channel, template_name, message_template)
VALUES
  ('SMS', 'Appointment Reminder', 'Hi {{name}}, reminder: your {{service}} is scheduled on {{date}}.'),
  ('Email', 'Vehicle Ready', 'Your vehicle is ready for pickup. Ref: {{referenceNo}}.'),
  ('WhatsApp', 'Post Service Follow-up', 'Thank you for choosing MasterAuto. How was your experience?')
ON CONFLICT DO NOTHING;
