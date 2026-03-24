-- Migration 048: Seed initial inventory items (car care / detailing chemicals)
-- Only inserts if the item SKU does not already exist.

INSERT INTO inventory_items (sku, name, category, description, unit, cost_price, sell_price, qty_on_hand, qty_minimum, supplier_ref)
SELECT * FROM (VALUES
  ('CHM-001', 'Car Shampoo',    'Chemicals', 'General-purpose car shampoo for foam washing',        'bottle', 80,  150, 20, 5, NULL),
  ('CHM-002', 'Car Soap',       'Chemicals', 'Hand wash car soap, gentle on paint',                 'bottle', 60,  120, 20, 5, NULL),
  ('CHM-003', 'Tire Cleaner',   'Chemicals', 'Heavy-duty tire and sidewall cleaner',                'bottle', 90,  180, 15, 3, NULL),
  ('CHM-004', 'Wheel Cleaner',  'Chemicals', 'Alloy and steel wheel cleaner, iron fallout remover', 'bottle', 110, 220, 15, 3, NULL),
  ('CHM-005', 'Glass Cleaner',  'Chemicals', 'Streak-free glass and window cleaning solution',      'bottle', 70,  140, 20, 5, NULL),
  ('CHM-006', 'Interior Cleaner','Chemicals','All-surface interior plastic and fabric cleaner',     'bottle', 95,  190, 10, 3, NULL),
  ('CHM-007', 'Degreaser',      'Chemicals', 'Engine bay and undercarriage degreaser',              'bottle', 85,  170, 10, 3, NULL),
  ('CHM-008', 'Foam Wash',      'Chemicals', 'Snow foam for touchless pre-wash',                   'bottle', 100, 200, 15, 3, NULL),
  ('CHM-009', 'Clay Bar',       'Chemicals', 'Paint decontamination clay bar kit',                 'piece',  150, 300, 10, 2, NULL),
  ('CHM-010', 'Wax',            'Chemicals', 'Carnauba paste wax for paint protection and shine',  'tin',    200, 400, 10, 2, NULL)
) AS v(sku, name, category, description, unit, cost_price, sell_price, qty_on_hand, qty_minimum, supplier_ref)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items i WHERE i.sku = v.sku
);
