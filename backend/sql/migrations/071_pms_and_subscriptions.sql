-- PMS Packages
CREATE TABLE IF NOT EXISTS pms_packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  mileage_interval INT,
  months_interval INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  package_id INT NOT NULL,
  status VARCHAR(255) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expiring Soon', 'Expired', 'Cancelled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES pms_packages(id) ON DELETE RESTRICT
);

-- PMS Service Tracking
CREATE TABLE IF NOT EXISTS pms_service_tracking (
  id SERIAL PRIMARY KEY,
  subscription_id INT NOT NULL,
  status VARCHAR(255) NOT NULL DEFAULT 'Due' CHECK (status IN ('Due', 'In Progress', 'Completed')),
  due_date DATE NOT NULL,
  completed_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);
